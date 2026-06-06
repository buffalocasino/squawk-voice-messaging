<script>
  /**
   * ViewOnceOverlay.svelte — renders a view-once message with countdown.
   *
   * Shows a pulsing red border + countdown timer. After GRACE_PERIOD seconds,
   * triggers the wipe callback. If the user scrolls the message out of view
   * before the timer fires, the parent can call cancel().
   *
   * Props:
   *   msgId      — message id
   *   graceS     — seconds before auto-wipe (default 5)
   *   onWipe     — called when timer expires (msgId) => void
   *   onCancel   — called when user scrolls away (msgId) => void
   */

  let {
    msgId = '',
    graceS = 5,
    onWipe = (id) => {},
    onCancel = (id) => {},
    children
  } = $props()

  let remaining = $state(graceS)
  let timerInterval = $state(null)
  let wiped = $state(false)

  // ── Start countdown on mount ──────────────────────────────────────────

  $effect(() => {
    timerInterval = setInterval(() => {
      remaining--
      if (remaining <= 0) {
        clearInterval(timerInterval)
        wiped = true
        onWipe(msgId)
      }
    }, 1000)

    return () => {
      clearInterval(timerInterval)
      if (!wiped) onCancel(msgId)
    }
  })

  // ── Format countdown ──────────────────────────────────────────────────

  let countdownClass = $derived(
    remaining <= 1 ? 'urgent' : remaining <= 3 ? 'warning' : 'counting'
  )
</script>

<div class="view-once-wrapper {countdownClass}">
  <!-- Countdown badge -->
  <div class="vo-badge">
    <span class="vo-icon">🔥</span>
    <span class="vo-timer">{remaining}s</span>
  </div>

  <!-- Message content (fades as timer runs down) -->
  <div class="vo-content" class:wiped>
    {@render children?.()}
  </div>

  <!-- Progress bar -->
  <div class="vo-progress">
    <div class="vo-progress-fill" style="width: {(remaining / graceS) * 100}%"></div>
  </div>
</div>

<style>
  .view-once-wrapper {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .view-once-wrapper.counting {
    border-color: rgba(201, 168, 76, 0.25);
    box-shadow: 0 0 12px rgba(201, 168, 76, 0.08);
  }
  .view-once-wrapper.warning {
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.12);
  }
  .view-once-wrapper.urgent {
    border-color: rgba(239, 68, 68, 0.5);
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
    animation: vo-pulse 0.5s ease-in-out infinite;
  }

  @keyframes vo-pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.15); }
    50%      { box-shadow: 0 0 32px rgba(239, 68, 68, 0.3); }
  }

  .vo-badge {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid rgba(239, 68, 68, 0.15);
  }
  .vo-icon { font-size: 13px; }
  .vo-timer {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: #f87171;
    font-variant-numeric: tabular-nums;
  }
  .warning .vo-timer { color: #fbbf24; }
  .urgent .vo-timer { color: #ef4444; }

  .vo-content {
    padding: 10px 14px;
    transition: opacity 0.4s;
  }
  .vo-content.wiped {
    opacity: 0.2;
    filter: blur(4px);
  }

  .vo-progress {
    height: 2px;
    background: rgba(239, 68, 68, 0.1);
  }
  .vo-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #ef4444, #f87171);
    transition: width 1s linear;
    border-radius: 0 2px 2px 0;
  }
</style>
