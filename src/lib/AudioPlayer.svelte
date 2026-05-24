<script>
  /** Inline audio player for base64-encoded squawk voice messages */
  let { src = '', duration = 0 } = $props()

  let audioEl = $state(null)
  let playing = $state(false)
  let currentTime = $state(0)

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function toggle() {
    if (!audioEl) return
    if (playing) {
      audioEl.pause()
    } else {
      audioEl.play()
    }
  }

  function onTimeUpdate() {
    currentTime = audioEl?.currentTime || 0
  }

  function onEnded() {
    playing = false
    currentTime = 0
  }
</script>

<div class="flex items-center gap-2 py-1">
  <button
    onclick={toggle}
    class="w-8 h-8 rounded-full bg-brand-700/60 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
    aria-label={playing ? 'Pause' : 'Play'}
  >
    {#if playing}
      <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
    {:else}
      <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    {/if}
  </button>

  <!-- Waveform placeholder bars -->
  <div class="flex-1 flex items-center gap-0.5 h-6">
    {#each Array(20) as _, i}
      {@const h = Math.abs(Math.sin(i * 0.8 + (duration % 5))) * 100}
      <div
        class="flex-1 rounded-full bg-brand-400/60 transition-all"
        style="height: {Math.max(15, h * 0.6)}%; opacity: {0.4 + (i / 20) * 0.6}"
      ></div>
    {/each}
  </div>

  <span class="text-xs text-gray-400 font-mono tabular-nums w-10 text-right">
    {formatTime(currentTime)}
  </span>

  <audio
        bind:this={audioEl}
        src={src ? `data:audio/webm;base64,${src}` : undefined}
        onplay={() => { playing = true }}
        onpause={() => { playing = false }}
        ontimeupdate={onTimeUpdate}
        onended={onEnded}
      ></audio>
</div>