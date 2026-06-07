<script>
  /**
   * VideoRecorder.svelte — records short video clips for Squawk.
   *
   * Props:
   *   onSendVideo: (blob, duration) => void
   *   maxDuration: seconds (default 15)
   */

  let {
    onSendVideo = (blob, dur) => {},
    maxDuration = 15,
  } = $props()

  let recording = $state(false)
  let mediaRecorder = $state(null)
  let stream = $state(null)
  let videoChunks = $state([])
  let timerInterval = $state(null)
  let elapsed = $state(0)

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 640, facingMode: 'user' },
        audio: true,
      })
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      })
      videoChunks = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) videoChunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(videoChunks, { type: 'video/webm' })
        if (stream) stream.getTracks().forEach(t => t.stop())
        onSendVideo(blob, elapsed)
      }

      mediaRecorder.start(100)
      recording = true
      elapsed = 0
      timerInterval = setInterval(() => {
        elapsed++
        if (elapsed >= maxDuration) stopRecording()
      }, 1000)
    } catch (err) {
      console.error('Failed to start video recording:', err)
      alert('Camera access denied — please allow camera permission')
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    recording = false
    clearInterval(timerInterval)
  }

  function toggle() {
    if (recording) stopRecording()
    else startRecording()
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
</script>

<button
  onclick={toggle}
  class="video-btn"
  class:recording
  aria-label={recording ? 'Stop video recording' : 'Record video clip'}
>
  {#if recording}
    <span class="rec-dot"></span>
    <span class="rec-time">{formatTime(elapsed)}</span>
  {:else}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  {/if}
</button>

{#if recording && stream}
  <div class="video-preview">
    <video autoplay muted playsinline srcObject={stream}></video>
  </div>
{/if}

<style>
  .video-btn {
    display: flex; align-items: center; gap: 6px;
    width: 36px; height: 36px; border-radius: 50%;
    border: none; cursor: pointer; flex-shrink: 0;
    background: var(--bg-elevated); color: var(--text-muted);
    transition: all 0.15s; justify-content: center;
  }
  .video-btn:hover { color: var(--gold); }
  .video-btn.recording {
    background: #ef4444; color: white; width: auto; padding: 0 12px;
    border-radius: 20px;
    animation: recPulse 1s ease-in-out infinite;
  }
  @keyframes recPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .rec-dot {
    width: 10px; height: 10px; border-radius: 50%; background: white;
  }
  .rec-time {
    font-family: var(--font-mono); font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .video-preview {
    position: fixed; bottom: 100px; right: 20px; z-index: 200;
    width: 140px; height: 200px; border-radius: 12px; overflow: hidden;
    border: 2px solid var(--gold); box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    background: #000;
  }
  .video-preview video {
    width: 100%; height: 100%; object-fit: cover;
  }
</style>
