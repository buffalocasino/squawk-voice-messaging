<script>
  /**
   * VideoPlayer.svelte — inline video playback for Squawk messages.
   *
   * Props:
   *   src: string — base64 video/webm data URL
   *   duration: number — seconds
   */

  let {
    src = '',
    duration = 0,
  } = $props()

  let playing = $state(false)
  let videoEl = $state(null)

  function toggle() {
    if (!videoEl) return
    if (playing) videoEl.pause()
    else videoEl.play()
  }

  function onEnded() { playing = false }
  function onPlay() { playing = true }
  function onPause() { playing = false }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
</script>

<div class="video-player">
  <video
    bind:this={videoEl}
    src={src ? `data:video/webm;base64,${src}` : undefined}
    onplay={onPlay} onpause={onPause} onended={onEnded}
    playsinline loop={false}
    class="video-el"
    poster="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><rect fill='%231c1a16' width='320' height='240'/><polygon points='140,100 140,140 170,120' fill='%23c9a84c' opacity='0.6'/></svg>"
  ></video>

  {#if !playing}
    <button class="play-overlay" onclick={toggle} aria-label="Play video">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="white" opacity="0.9">
        <polygon points="8,5 19,12 8,19"/>
      </svg>
    </button>
  {/if}

  <div class="video-bar">
    <button class="bar-btn" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
      {#if playing}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
      {/if}
    </button>
    <span class="bar-dur">{formatTime(duration)}</span>
  </div>
</div>

<style>
  .video-player {
    position: relative; border-radius: 10px; overflow: hidden;
    background: #000; max-width: 320px; margin: 4px 0;
  }
  .video-el {
    width: 100%; display: block; max-height: 240px;
    object-fit: contain;
  }
  .play-overlay {
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center;
    background: rgba(0,0,0,0.3); border: none; cursor: pointer;
  }
  .video-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; background: rgba(0,0,0,0.6);
  }
  .bar-btn { background: none; border: none; color: white; cursor: pointer; padding: 2px; }
  .bar-dur { font-size: 11px; color: rgba(255,255,255,0.6); font-family: var(--font-mono); }
</style>
