/**
 * Squawk Motion — pre-built animation primitives using Svelte 5 runes.
 * Drop-in replacements for static UI elements.
 */

import { Spring, Tween } from 'svelte/motion'
import { cubicOut, elasticOut, backOut } from 'svelte/easing'

// ─── Magnetic hover ────────────────────────────────────────────────────

export function magnetic(node, { strength = 0.3 } = {}) {
  const springX = new Spring(0, { stiffness: 0.1, damping: 0.6 })
  const springY = new Spring(0, { stiffness: 0.1, damping: 0.6 })

  function handleMove(e) {
    const rect = node.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    springX.target = (e.clientX - cx) * strength
    springY.target = (e.clientY - cy) * strength
  }

  function handleLeave() {
    springX.target = 0
    springY.target = 0
  }

  node.addEventListener('mousemove', handleMove)
  node.addEventListener('mouseleave', handleLeave)

  $effect(() => {
    node.style.transform = `translate(${springX.current}px, ${springY.current}px)`
  })

  return {
    destroy() {
      node.removeEventListener('mousemove', handleMove)
      node.removeEventListener('mouseleave', handleLeave)
    }
  }
}

// ─── Ripple click ──────────────────────────────────────────────────────

export function ripple(node, { color = 'rgba(201,168,76,0.3)' } = {}) {
  function handleClick(e) {
    const rect = node.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ripple = document.createElement('span')
    ripple.className = 'squawk-ripple'
    ripple.style.cssText = `
      position: absolute;
      left: ${x}px; top: ${y}px;
      width: 0; height: 0;
      border-radius: 50%;
      background: ${color};
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: squawk-ripple-anim 0.6s ${cubicOut} forwards;
    `
    node.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
  }

  node.style.position = 'relative'
  node.style.overflow = 'hidden'
  node.addEventListener('click', handleClick)

  return {
    destroy() {
      node.removeEventListener('click', handleClick)
    }
  }
}

// ─── Spring scale on hover ─────────────────────────────────────────────

export function springScale(node, { amount = 1.04 } = {}) {
  const scale = new Spring(1, { stiffness: 0.2, damping: 0.7 })

  function enter() { scale.target = amount }
  function leave() { scale.target = 1 }

  node.addEventListener('mouseenter', enter)
  node.addEventListener('mouseleave', leave)

  $effect(() => {
    node.style.transform = `scale(${scale.current})`
  })

  return {
    destroy() {
      node.removeEventListener('mouseenter', enter)
      node.removeEventListener('mouseleave', leave)
    }
  }
}

// ─── Staggered list reveal ─────────────────────────────────────────────

export function staggerList(node) {
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    children[i].style.opacity = '0'
    children[i].style.transform = 'translateY(12px)'
    children[i].style.animation = `squawk-fade-up 0.35s ${cubicOut} ${i * 0.05}s forwards`
  }
}

// ─── Page transition (view switch) ─────────────────────────────────────

export function pageSlide(node, { direction = 'right' } = {}) {
  const x = direction === 'right' ? 30 : -30
  return {
    duration: 300,
    css: (t) => {
      const eased = cubicOut(t)
      return `opacity: ${eased}; transform: translateX(${(1 - eased) * x}px)`
    }
  }
}

// ─── Bubble pop-in (for new messages) ──────────────────────────────────

export function bubblePop(node, { delay = 0 } = {}) {
  return {
    delay,
    duration: 400,
    easing: backOut,
    css: (t) => {
      const scale = 0.5 + t * 0.5
      return `opacity: ${t}; transform: scale(${scale})`
    }
  }
}

// ─── CSS keyframes (injected once) ─────────────────────────────────────

const injected = typeof document !== 'undefined' && document.getElementById('squawk-motion-styles')
if (!injected && typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.id = 'squawk-motion-styles'
  style.textContent = `
    @keyframes squawk-ripple-anim {
      to { width: 300px; height: 300px; opacity: 0; }
    }
    @keyframes squawk-fade-up {
      to { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
}
