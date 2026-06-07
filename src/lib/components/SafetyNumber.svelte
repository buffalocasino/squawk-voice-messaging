<script>
  /**
   * SafetyNumber.svelte — displays the cryptographic safety number
   * for manual verification between two peers (MITM detection).
   *
   * Props:
   *   myPubJwk: object — our ECDH public JWK
   *   theirPubJwk: object — peer's ECDH public JWK
   *   peerName: string
   */

  import { computeSafetyNumber } from '../crypto/hybridCrypto.js'
  import { onMount } from 'svelte'

  let { myPubJwk, theirPubJwk, peerName = 'Peer' } = $props()

  let safetyNumber = $state('')
  let verified = $state(false)
  let showing = $state(false)

  onMount(async () => {
    if (myPubJwk && theirPubJwk) {
      try {
        safetyNumber = await computeSafetyNumber(myPubJwk, theirPubJwk)
      } catch (e) {
        safetyNumber = 'Unable to compute'
      }
    }
  })

  function toggleShow() {
    showing = !showing
  }

  function confirmMatch() {
    verified = true
  }

  function reset() {
    verified = false
  }
</script>

<button class="safety-toggle" onclick={toggleShow} aria-label="Show safety number">
  {#if verified}
    <span class="safety-dot verified"></span>
    <span class="safety-label">Verified with {peerName}</span>
  {:else}
    <span class="safety-dot"></span>
    <span class="safety-label">Verify Safety Number</span>
  {/if}
</button>

{#if showing}
  <div class="safety-panel glass" transition:fade>
    <div class="safety-header">
      <span class="safety-title">Safety Number</span>
      <button class="safety-close" onclick={toggleShow} aria-label="Close">✕</button>
    </div>
    <p class="safety-desc">
      To verify that no one is intercepting your messages, compare this number with <strong>{peerName}</strong> — in person or via another secure channel.
    </p>
    <pre class="safety-number">{safetyNumber}</pre>

    {#if !verified}
      <div class="safety-actions">
        <button class="safety-btn confirm" onclick={confirmMatch}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
          Yes, they match
        </button>
        <button class="safety-btn deny" onclick={toggleShow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          No, they don't match
        </button>
      </div>
    {:else}
      <div class="safety-verified">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
        Safety number verified — {peerName}
        <button class="safety-reset" onclick={reset}>Reset</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .safety-toggle {
    display: flex; align-items: center; gap: 8px;
    background: none; border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
    font-size: 12px; color: var(--text-muted);
    transition: all 0.15s;
  }
  .safety-toggle:hover { border-color: var(--gold-dim); color: var(--gold); }
  .safety-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-muted);
  }
  .safety-dot.verified { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.4); }
  .safety-label { font-size: 12px; }

  .safety-panel {
    position: fixed; inset: 0; z-index: 300;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 32px 20px;
    background: rgba(17,16,9,0.95); backdrop-filter: blur(20px);
  }
  .safety-header {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; max-width: 400px; margin-bottom: 16px;
  }
  .safety-title { font-size: 20px; font-weight: 700; color: var(--gold-light); }
  .safety-close {
    background: none; border: none; color: var(--text-muted);
    font-size: 20px; cursor: pointer;
  }
  .safety-desc {
    text-align: center; font-size: 13px; color: var(--text-muted);
    max-width: 360px; line-height: 1.5; margin-bottom: 24px;
  }
  .safety-number {
    font-family: var(--font-mono); font-size: 18px;
    color: var(--gold-light); text-align: center;
    line-height: 1.8; letter-spacing: 0.05em;
    background: var(--bg-elevated); border-radius: 12px;
    padding: 20px 28px; margin-bottom: 24px;
    user-select: all;
  }
  .safety-actions {
    display: flex; gap: 12px;
  }
  .safety-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 20px; border-radius: 8px; border: none;
    font-size: 14px; cursor: pointer; transition: all 0.15s;
  }
  .safety-btn.confirm {
    background: rgba(74,222,128,0.1); color: #4ade80;
    border: 1px solid rgba(74,222,128,0.25);
  }
  .safety-btn.confirm:hover { background: rgba(74,222,128,0.2); }
  .safety-btn.deny {
    background: rgba(239,68,68,0.1); color: #ef4444;
    border: 1px solid rgba(239,68,68,0.25);
  }
  .safety-btn.deny:hover { background: rgba(239,68,68,0.2); }
  .safety-verified {
    display: flex; align-items: center; gap: 8px;
    color: #4ade80; font-size: 14px;
  }
  .safety-reset {
    background: none; border: none; color: var(--text-muted);
    font-size: 12px; cursor: pointer; margin-left: 8px;
    text-decoration: underline;
  }
</style>
