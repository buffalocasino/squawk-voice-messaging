export function swipe(node, { threshold = 50, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }) {
  let startX = 0, startY = 0, startTime = 0

  function handlePointerDown(e) {
    startX = e.clientX
    startY = e.clientY
    startTime = Date.now()
    node.setPointerCapture(e.pointerId)
  }

  function handlePointerUp(e) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const dt = Date.now() - startTime
    if (dt > 800) return
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      dx > 0 ? onSwipeRight?.(e) : onSwipeLeft?.(e)
    } else if (Math.abs(dy) > threshold) {
      dy > 0 ? onSwipeDown?.(e) : onSwipeUp?.(e)
    }
  }

  node.addEventListener('pointerdown', handlePointerDown)
  node.addEventListener('pointerup', handlePointerUp)
  return { destroy() { node.removeEventListener('pointerdown', handlePointerDown); node.removeEventListener('pointerup', handlePointerUp) } }
}

export function longPress(node, { duration = 500, onLongPress, onPressStart, onPressEnd, moveThreshold = 16 }) {
  let timer = null
  let startX = 0
  let startY = 0

  function handlePointerDown(e) {
    startX = e.clientX
    startY = e.clientY
    onPressStart?.(e)
    timer = setTimeout(() => { timer = null; onLongPress?.(e) }, duration)
  }

  function handlePointerUp(e) {
    onPressEnd?.(e)
    if (timer) { clearTimeout(timer); timer = null }
  }

  function handlePointerMove(e) {
    if (!timer) return
    const dx = Math.abs(e.clientX - startX)
    const dy = Math.abs(e.clientY - startY)
    if (dx > moveThreshold || dy > moveThreshold) {
      clearTimeout(timer)
      timer = null
    }
  }

  node.addEventListener('pointerdown', handlePointerDown)
  node.addEventListener('pointerup', handlePointerUp)
  node.addEventListener('pointermove', handlePointerMove)
  node.addEventListener('pointerleave', handlePointerUp)
  return { destroy() { node.removeEventListener('pointerdown', handlePointerDown); node.removeEventListener('pointerup', handlePointerUp); node.removeEventListener('pointermove', handlePointerMove); node.removeEventListener('pointerleave', handlePointerUp) } }
}
