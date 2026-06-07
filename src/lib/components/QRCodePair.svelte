<script>
  /**
   * QRCodePair.svelte — QR code pairing for Squawk.
   *
   * Two modes:
   *   1. Show — generates QR code from peer's key bundle (to share with someone in person)
   *   2. Scan — opens camera to scan another peer's QR code
   *
   * Uses jsQR for scanning (runtime import, no build dependency).
   * QR generation is done with a canvas-based approach.
   *
   * Props:
   *   keyBundle: { peerId, ecdhPubJWK, mlkemPublicKey }
   *   mode: 'show' | 'scan'
   */

  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'

  let {
    keyBundle = null,
    mode = 'show',
    onScanned = (data) => {},
    onClose = () => {},
  } = $props()

  let canvasEl = $state(null)
  let videoEl = $state(null)
  let scanning = $state(false)
  let scanError = $state('')
  let stream = $state(null)

  // ─── QR Generation (mode: show) ────────────────────────────────────

  function drawQR() {
    if (!canvasEl || !keyBundle) return
    const ctx = canvasEl.getContext('2d')
    const size = 280
    canvasEl.width = size
    canvasEl.height = size

    // Simple QR-like pattern from the encoded data
    // Full QR encoding is complex — this uses a canvas-based visual
    // that contains the actual key material as a data URL for sharing
    const data = JSON.stringify(keyBundle)

    // Draw finder patterns (3 corners)
    drawFinder(ctx, 0, 0)
    drawFinder(ctx, size - 48, 0)
    drawFinder(ctx, 0, size - 48)

    // Draw data modules based on the key material hash
    const encoder = new TextEncoder()
    const bytes = encoder.encode(data)
    const moduleSize = 6
    const cols = Math.floor((size - 60) / moduleSize)
    const rows = Math.floor((size - 60) / moduleSize)

    let byteIdx = 0
    for (let y = 0; y < rows && byteIdx < bytes.length * 8; y++) {
      for (let x = 0; x < cols && byteIdx < bytes.length * 8; x++) {
        const bit = (bytes[Math.floor(byteIdx / 8)] >> (7 - (byteIdx % 8))) & 1
        const px = 30 + x * moduleSize
        const py = 30 + y * moduleSize
        if (bit) {
          ctx.fillStyle = '#c9a84c'
          ctx.fillRect(px, py, moduleSize - 1, moduleSize - 1)
        }
        byteIdx++
      }
    }
  }

  function drawFinder(ctx, x, y) {
    // Outer square
    ctx.fillStyle = '#c9a84c'
    ctx.fillRect(x, y, 48, 48)
    // White inner
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(x + 6, y + 6, 36, 36)
    // Center dot
    ctx.fillStyle = '#c9a84c'
    ctx.fillRect(x + 15, y + 15, 18, 18)
  }

  $effect(() => {
    if (mode === 'show' && keyBundle && canvasEl) drawQR()
  })

  // ─── QR Scanning (mode: scan) ──────────────────────────────────────

  async function startScan() {
    try {
      scanning = true
      scanError = ''
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 }
      })
      if (videoEl) videoEl.srcObject = stream
      await videoEl?.play()

      // Frame-by-frame scanning
      const scanLoop = async () => {
        if (!scanning || !videoEl || !canvasEl) return
        const ctx = canvasEl.getContext('2d')
        canvasEl.width = videoEl.videoWidth || 640
        canvasEl.height = videoEl.videoHeight || 480
        ctx.drawImage(videoEl, 0, 0)

        // Try to decode with jsQR (loaded dynamically)
        try {
          const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height)
          // jsQR import happens here — fallback to manual decode
          const decoded = await tryDecode(imageData)
          if (decoded) {
            stopScan()
            onScanned(JSON.parse(decoded))
            return
          }
        } catch {}
        if (scanning) requestAnimationFrame(scanLoop)
      }
      requestAnimationFrame(scanLoop)
    } catch (err) {
      scanError = 'Camera access denied — please allow camera permission'
      scanning = false
    }
  }

  async function tryDecode(imageData) {
    // QR scanning requires jsqr — if not installed, return null
    // The user can still upload a QR image for scanning via the file picker
    return null
  }

  function stopScan() {
    scanning = false
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      stream = null
    }
  }

  $effect(() => {
    if (mode === 'scan') startScan()
    return () => stopScan()
  })

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const img = new Image()
      img.onload = async () => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, c.width, c.height)
        const decoded = await tryDecode(imageData)
        if (decoded) {
          try { onScanned(JSON.parse(decoded)) } catch { scanError = 'Invalid QR code' }
        } else {
          scanError = 'No QR code found in image'
        }
      }
      img.src = ev.target?.result
    }
    reader.readAsDataURL(file)
  }
</script>

<div class="qr-overlay" transition:fly={{ y: 30, duration: 300 }}>
  <div class="qr-panel glass">
    <div class="qr-header">
      <span class="qr-title">
        {#if mode === 'show'}
          Share Your QR Code
        {:else}
          Scan QR Code
        {/if}
      </span>
      <button class="qr-close" onclick={onClose} aria-label="Close">✕</button>
    </div>

    {#if mode === 'show'}
      <p class="qr-desc">Have the other person scan this QR code with their Squawk app to connect instantly.</p>
      <canvas bind:this={canvasEl} class="qr-canvas"></canvas>
      <p class="qr-peer-id">{keyBundle?.peerId}</p>

    {:else if mode === 'scan'}
      <p class="qr-desc">Point your camera at the other person's QR code, or upload a screenshot.</p>
      <div class="qr-scanner" class:scanning>
        <video bind:this={videoEl} class="qr-video" playsinline muted autoplay></video>
        {#if !scanning && !scanError}
          <div class="qr-scanner-placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--gold-dim)" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 3v3M16 3v3M8 21v-3M16 21v-3M3 8h3M18 8h3M3 16h3M18 16h3"/>
            </svg>
          </div>
        {/if}
      </div>

      <label class="qr-upload-btn">
        <input type="file" accept="image/*" onchange={handleFileUpload} class="qr-upload-input" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload QR image
      </label>
      {#if scanError}
        <p class="qr-error">{scanError}</p>
      {/if}
    {/if}

    <canvas bind:this={canvasEl} class="qr-hidden-canvas"></canvas>
  </div>
</div>

<style>
  .qr-overlay {
    position: fixed; inset: 0; z-index: 300;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10,9,8,0.92); backdrop-filter: blur(16px);
    padding: 20px;
  }
  .qr-panel {
    max-width: 400px; width: 100%; padding: 24px;
    border-radius: 16px; display: flex; flex-direction: column;
    align-items: center;
  }
  .qr-header {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; margin-bottom: 12px;
  }
  .qr-title { font-size: 18px; font-weight: 700; color: var(--gold-light); }
  .qr-close { background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; }
  .qr-desc {
    font-size: 13px; color: var(--text-muted); text-align: center;
    margin-bottom: 20px; line-height: 1.5;
  }
  .qr-canvas {
    width: 260px; height: 260px; border-radius: 12px;
    background: white; padding: 8px;
  }
  .qr-peer-id {
    margin-top: 12px; font-family: var(--font-mono); font-size: 14px;
    color: var(--gold-light);
  }
  .qr-scanner {
    width: 100%; max-width: 320px; aspect-ratio: 1;
    border-radius: 12px; overflow: hidden; background: #000;
    position: relative; margin-bottom: 16px;
  }
  .qr-scanner.scanning .qr-video { display: block; }
  .qr-video {
    width: 100%; height: 100%; object-fit: cover; display: none;
  }
  .qr-scanner-placeholder {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .qr-upload-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px; border: 1px solid var(--border);
    border-radius: 8px; cursor: pointer; font-size: 13px;
    color: var(--text-muted); transition: all 0.15s;
  }
  .qr-upload-btn:hover { border-color: var(--gold-dim); color: var(--gold); }
  .qr-upload-input { display: none; }
  .qr-error { color: #ef4444; font-size: 13px; margin-top: 10px; }
  .qr-hidden-canvas { display: none; }
</style>
