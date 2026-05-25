<script>
  import { isRecording, recordingDuration } from '../stores.js'
  import { longPress } from '../lib/touch.js'

  let mediaRecorder = $state(null)
  let audioChunks = $state([])
  let timerInterval = $state(null)
  let analyser = $state(null)
  let dataArray = $state(null)
  let canvasEl = $state()
  let animationId = $state(null)
  let audioContext = $state(null)
  let recordedBlob = $state(null)
  let audioUrl = $state(null)

  let { onSendAudio = (blob, duration) => {} } = $props()

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      dataArray = new Uint8Array(analyser.frequencyBinCount)

      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunks = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        recordedBlob = blob

        // Create a temporary URL for playback preview
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        audioUrl = URL.createObjectURL(blob)

        stream.getTracks().forEach(t => t.stop())
        if (audioContext) { audioContext.close(); audioContext = null }

        // Hand off to parent for encryption + sending
        await onSendAudio(blob, $recordingDuration)
      }

      mediaRecorder.start(100) // chunk every 100ms for smoother recording
      isRecording.set(true)
      recordingDuration.set(0)
      timerInterval = setInterval(() => {
        recordingDuration.update(d => d + 1)
      }, 1000)
      drawWaveform()
    } catch (err) {
      console.error('Failed to start recording:', err)
      alert('Microphone access required to send voice messages')
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    isRecording.set(false)
    clearInterval(timerInterval)
    cancelAnimationFrame(animationId)
  }

  function drawWaveform() {
    if (!canvasEl || !analyser) return
    const ctx = canvasEl.getContext('2d')
    const w = canvasEl.width
    const h = canvasEl.height

    function render() {
      animationId = requestAnimationFrame(render)
      analyser.getByteFrequencyData(dataArray)

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#8b5cf6'

      const barWidth = (w / dataArray.length) * 2.5
      let x = 0

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * h * 0.8
        const radius = barWidth / 2
        ctx.beginPath()
        ctx.roundRect(x, h / 2 - barHeight / 2, barWidth - 1, barHeight, radius)
        ctx.fill()
        x += barWidth
      }
    }
    render()
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
</script>

<div class="flex flex-col items-center gap-3">
  <!-- Waveform canvas -->
  <div class="w-full h-16 relative">
    <canvas bind:this={canvasEl} width="300" height="64" class="w-full h-full rounded-xl"></canvas>
    {#if !$isRecording}
      <div class="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
        Hold to record
      </div>
    {/if}
  </div>

  <!-- Prominent duration + progress bar -->
  <div class="w-full flex flex-col items-center gap-1">
    {#if $isRecording}
      <!-- Red dot + duration -->
      <div class="flex items-center gap-2">
        <div class="w-2.5 h-2.5 rounded-full bg-red-500 animate-rec"></div>
        <span class="text-red-400 font-mono font-bold text-lg tabular-nums">
          {formatTime($recordingDuration)}
        </span>
      </div>
      <!-- Progress bar (max 30s) -->
      <div class="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-red-500 rounded-full transition-all duration-1000"
          style="width: {Math.min(100, ($recordingDuration / 30) * 100)}%"
        ></div>
      </div>
    {:else}
      <div class="h-6"></div>
    {/if}
  </div>

  <!-- Record button -->
  <button
    class="relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 select-none"
    style="touch-action: none;"
    class:bg-red-500={$isRecording}
    class:bg-brand-600={!$isRecording}
    class:scale-90={$isRecording}
    use:longPress={{ duration: 200, onPressStart: startRecording, onPressEnd: stopRecording }}
    aria-label="Hold to record voice message"
  >
    {#if $isRecording}
      <div class="absolute inset-0 rounded-full bg-red-500 animate-pulse-ring"></div>
      <svg class="w-8 h-8 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
    {:else}
      <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
    {/if}
  </button>

  <p class="text-gray-500 text-xs text-center">
    {$isRecording ? 'Release to send' : 'Hold to record, release to squawk'}
  </p>
</div>