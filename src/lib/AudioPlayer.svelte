<script>
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

<div class="flex items-center gap-2 py-0.5">
  <button
    onclick={toggle}
    class="w-7 h-7 rounded-lg bg-phantom-500/15 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0 hover:bg-phantom-500/25"
    aria-label={playing ? 'Pause' : 'Play'}
  >
    {#if playing}
      <svg class="w-3.5 h-3.5 text-phantom-300" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
    {:else}
      <svg class="w-3.5 h-3.5 text-phantom-300 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    {/if}
  </button>

  <!-- Waveform -->
  <div class="flex-1 flex items-center gap-[2px] h-5" class:wf-playing={playing}>
    {#each Array(16) as _, i}
      {@const h = Math.abs(Math.sin(i * 0.9 + (duration % 5))) * 100}
      <div
        class="flex-1 rounded-full transition-all {playing ? 'bg-phantom-300/70' : 'bg-phantom-400/50'}"
        style="height: {Math.max(12, h * 0.5)}%; opacity: {0.3 + (i / 16) * 0.5}"
      ></div>
    {/each}
  </div>

  <span class="text-[11px] text-gray-600 font-mono tabular-nums w-10 text-right">
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
