<script>
  import { isRecording, recordingDuration } from '../stores.js'

  let mediaRecorder = $state(null)
  let audioChunks = $state([])
  let timerInterval = $state(null)

  let { onSendAudio = (blob, duration) => {} } = $props()

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunks = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        await onSendAudio(blob, $recordingDuration)
      }

      mediaRecorder.start(100)
      isRecording.set(true)
      recordingDuration.set(0)
      timerInterval = setInterval(() => {
        recordingDuration.update(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    isRecording.set(false)
    clearInterval(timerInterval)
  }

  function toggle() {
    if ($isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
</script>

<button
  onclick={toggle}
  class="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 flex-shrink-0"
  class:bg-phantom-500={!$isRecording}
  class:bg-red-500={$isRecording}
  class:animate-rec={$isRecording}
  aria-label={$isRecording ? 'Stop recording' : 'Start recording'}
>
  {#if $isRecording}
    <div class="flex items-center gap-1.5">
      <span class="text-xs text-white font-mono tabular-nums">{formatTime($recordingDuration)}</span>
      <div class="w-2 h-2 rounded-full bg-white"></div>
    </div>
  {:else}
    <svg class="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
  {/if}
</button>
