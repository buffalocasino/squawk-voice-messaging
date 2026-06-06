<script>
  /**
   * EphemeralSettings.svelte — controls for the ephemeral timer engine.
   *
   * Exposes: 24h expiry toggle, dynamic timers, view-once default,
   * active timer stats, force sweep, TTL override.
   */

  import { onMount } from 'svelte'
  import {
    ephemeralConfig, getStats, forceSweep,
    stopSweep, startSweep, formatExpiry
  } from '../ephemeral/timerEngine.js'

  let stats = $state(getStats())
  let customTtlInput = $state('')
  let sweepResult = $state(null)

  // ── Poll stats every 2s ────────────────────────────────────────────────
  let pollInterval = $state(null)
  onMount(() => {
    pollInterval = setInterval(() => { stats = getStats() }, 2000)
    return () => clearInterval(pollInterval)
  })

  // ── Toggle handlers ────────────────────────────────────────────────────
  function toggleExpiry() { ephemeralConfig.expiry24h = !ephemeralConfig.expiry24h }
  function toggleDynamic() { ephemeralConfig.dynamicTimers = !ephemeralConfig.dynamicTimers }
  function toggleViewOnce() { ephemeralConfig.viewOnceDefault = !ephemeralConfig.viewOnceDefault }

  function applyCustomTtl() {
    const val = parseInt(customTtlInput)
    if (val > 0) {
      ephemeralConfig.customTtlMs = val * 1000
    } else {
      ephemeralConfig.customTtlMs = 0
      customTtlInput = ''
    }
  }

  async function handleForceSweep() {
    const count = await forceSweep()
    sweepResult = count > 0 ? `Wiped ${count} expired` : 'Nothing to sweep'
    stats = getStats()
    setTimeout(() => { sweepResult = null }, 3000)
  }

  function formatMs(ms) {
    if (!ms || ms <= 0) return 'default (24h)'
    if (ms < 60000) return `${ms / 1000}s`
    if (ms < 3600000) return `${ms / 60000}m`
    return `${ms / 3600000}h`
  }

  let nextExpiryLabel = $derived(
    stats.nextExpiry ? formatExpiry(Math.ceil((stats.nextExpiry - Date.now()) / 1000)) : '—'
  )
</script>

<div class="ephemeral-settings">
  <!-- Header -->
  <div class="settings-header">
    <h2 class="settings-title">Ephemeral Controls</h2>
    <p class="settings-subtitle">Messages self-destruct. Zero footprint.</p>
  </div>

  <!-- Stats bar -->
  <div class="stats-bar">
    <div class="stat">
      <span class="stat-value">{stats.active}</span>
      <span class="stat-label">Active</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.expired}</span>
      <span class="stat-label">Expired</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.viewOnce}</span>
      <span class="stat-label">View-Once</span>
    </div>
    <div class="stat">
      <span class="stat-value">{nextExpiryLabel}</span>
      <span class="stat-label">Next Expiry</span>
    </div>
  </div>

  <!-- Toggles -->
  <div class="settings-section">
    <h3 class="section-title">Auto-Expiry</h3>

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">24-Hour Auto-Expire</span>
        <span class="toggle-desc">All outgoing messages self-destruct after 24 hours</span>
      </div>
      <button class="toggle-switch" class:on={ephemeralConfig.expiry24h} onclick={toggleExpiry} role="switch" aria-checked={ephemeralConfig.expiry24h} aria-label="Toggle 24-hour auto-expire">
        <span class="toggle-knob"></span>
      </button>
    </label>

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">Dynamic Timers</span>
        <span class="toggle-desc">Shorter messages vanish faster after being read</span>
      </div>
      <button class="toggle-switch" class:on={ephemeralConfig.dynamicTimers} onclick={toggleDynamic} role="switch" aria-checked={ephemeralConfig.dynamicTimers} aria-label="Toggle dynamic timers">
        <span class="toggle-knob"></span>
      </button>
    </label>

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">View-Once Default</span>
        <span class="toggle-desc">All media messages self-destruct after first view</span>
      </div>
      <button class="toggle-switch" class:on={ephemeralConfig.viewOnceDefault} onclick={toggleViewOnce} role="switch" aria-checked={ephemeralConfig.viewOnceDefault} aria-label="Toggle view-once default">
        <span class="toggle-knob"></span>
      </button>
    </label>
  </div>

  <!-- Custom TTL -->
  <div class="settings-section">
    <h3 class="section-title">Custom Timer</h3>
    <div class="ttl-row">
      <input
        class="ttl-input"
        type="number"
        bind:value={customTtlInput}
        placeholder="Seconds (0 = default 24h)"
        min="5"
      />
      <button class="ttl-btn" onclick={applyCustomTtl}>Apply</button>
    </div>
    <p class="ttl-current">Current: {formatMs(ephemeralConfig.customTtlMs)}</p>
  </div>

  <!-- Manual sweep -->
  <div class="settings-section">
    <button class="sweep-btn" onclick={handleForceSweep}>
      🔥 Force Sweep Now
    </button>
    {#if sweepResult}
      <p class="sweep-result">{sweepResult}</p>
    {/if}
    <p class="sweep-info">Auto-sweep runs every {stats.sweepIntervalMs / 1000}s — {stats.sweepActive ? 'Active' : 'Paused'}</p>
  </div>

  <!-- Info -->
  <div class="settings-section info-section">
    <h3 class="section-title">How It Works</h3>
    <div class="info-grid">
      <div class="info-card">
        <span class="info-icon">⏳</span>
        <span class="info-text">Messages auto-delete after expiry. A background sweep wipes expired messages from the encrypted vault every 60 seconds.</span>
      </div>
      <div class="info-card">
        <span class="info-icon">🔥</span>
        <span class="info-text">View-once messages show a 5-second countdown. After viewing, they're DOD-wiped from disk — unrecoverable.</span>
      </div>
      <div class="info-card">
        <span class="info-icon">✕</span>
        <span class="info-text">End Chat permanently destroys all messages + the Olm encryption session. No recovery possible.</span>
      </div>
    </div>
  </div>
</div>

<style>
  .ephemeral-settings {
    padding: 16px;
    overflow-y: auto;
    max-height: 100%;
  }

  .settings-header {
    margin-bottom: 16px;
  }
  .settings-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .settings-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  /* ── Stats bar ────────────────────────────────────────────────── */
  .stats-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  .stat {
    flex: 1;
    background: var(--bg-elevated);
    border-radius: 12px;
    padding: 12px 8px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .stat-value {
    display: block;
    font-size: 18px;
    font-weight: 700;
    color: var(--gold-light);
    font-family: var(--font-mono);
  }
  .stat-label {
    display: block;
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ── Sections ─────────────────────────────────────────────────── */
  .settings-section {
    margin-bottom: 20px;
  }
  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 10px;
  }

  /* ── Toggle rows ──────────────────────────────────────────────── */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--bg-elevated);
    border-radius: 12px;
    border: 1px solid var(--border);
    margin-bottom: 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .toggle-row:hover { border-color: var(--border-bright); }
  .toggle-info { flex: 1; min-width: 0; margin-right: 12px; }
  .toggle-label { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
  .toggle-desc { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  .toggle-switch {
    width: 44px; height: 26px; border-radius: 13px;
    border: none; cursor: pointer; position: relative;
    background: var(--bg-surface); flex-shrink: 0;
    transition: background 0.2s; padding: 0;
  }
  .toggle-switch.on { background: var(--gold); }
  .toggle-knob {
    position: absolute; top: 2px; left: 2px;
    width: 22px; height: 22px; border-radius: 50%;
    background: white; transition: transform 0.2s var(--ease-out);
  }
  .toggle-switch.on .toggle-knob { transform: translateX(18px); }

  /* ── TTL input ────────────────────────────────────────────────── */
  .ttl-row { display: flex; gap: 8px; }
  .ttl-input {
    flex: 1; padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--bg-elevated);
    color: var(--text-primary); font-size: 13px; outline: none;
    font-family: var(--font-mono);
  }
  .ttl-input:focus { border-color: var(--gold-dim); }
  .ttl-btn {
    padding: 10px 20px; border-radius: 10px; border: none;
    background: var(--gold-dim); color: var(--bg-base);
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
  }
  .ttl-btn:hover { background: var(--gold); }
  .ttl-current { font-size: 11px; color: var(--text-muted); margin-top: 6px; font-family: var(--font-mono); }

  /* ── Sweep button ─────────────────────────────────────────────── */
  .sweep-btn {
    width: 100%; padding: 12px; border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    background: rgba(239, 68, 68, 0.08);
    color: #f87171; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.15s;
  }
  .sweep-btn:hover { background: rgba(239, 68, 68, 0.15); border-color: #ef4444; }
  .sweep-result { font-size: 12px; color: #4ade80; margin-top: 6px; text-align: center; }
  .sweep-info { font-size: 11px; color: var(--text-muted); margin-top: 6px; text-align: center; }

  /* ── Info cards ───────────────────────────────────────────────── */
  .info-section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .info-grid { display: flex; flex-direction: column; gap: 8px; }
  .info-card {
    display: flex; gap: 10px; padding: 10px 14px;
    background: var(--bg-elevated); border-radius: 10px;
    border: 1px solid var(--border);
  }
  .info-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
  .info-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
</style>
