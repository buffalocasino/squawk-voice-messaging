/**
 * SoundEngine — lightweight Web Audio API sound effects for Squawk.
 * No dependencies. Generates tones/sweeps procedurally.
 *
 * Usage:
 *   import { playSend, playReceive, playConnect, playDisconnect, playViewOnce, playWipe } from './SoundEngine.js'
 */

let audioCtx = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// ─── Tone generators ─────────────────────────────────────────────────────

function tone(freq, duration, type = 'sine', vol = 0.08) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

function sweep(startFreq, endFreq, duration, vol = 0.06) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
  osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration)
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

function chord(freqs, duration, vol = 0.04) {
  for (const f of freqs) tone(f, duration, 'sine', vol)
}

// ─── Public sound effects ─────────────────────────────────────────────────

/** Message sent — quick ascending beep */
export function playSend() {
  sweep(600, 1200, 0.08, 0.06)
}

/** Message received — soft descending chime */
export function playReceive() {
  sweep(900, 500, 0.12, 0.05)
}

/** Peer connected — pleasant two-tone */
export function playConnect() {
  const ctx = getCtx()
  const now = ctx.currentTime
  tone(523, 0.15, 'sine', 0.07) // C5
  setTimeout(() => tone(659, 0.2, 'sine', 0.07), 120) // E5
}

/** Peer disconnected — low despondent tone */
export function playDisconnect() {
  sweep(400, 200, 0.25, 0.05)
}

/** View-once message appearing — urgent countdown beep */
export function playViewOnce() {
  const ctx = getCtx()
  tone(800, 0.06, 'square', 0.04)
  setTimeout(() => tone(800, 0.06, 'square', 0.04), 200)
  setTimeout(() => tone(800, 0.06, 'square', 0.04), 400)
}

/** View-once wiping — descending sweep */
export function playViewOnceWipe() {
  sweep(600, 100, 0.3, 0.05)
}

/** End Chat / wipe — dramatic low sweep */
export function playWipe() {
  sweep(300, 40, 0.5, 0.08)
}

/** Voice recording start — subtle click */
export function playRecordStart() {
  tone(1000, 0.03, 'sine', 0.05)
}

/** Voice recording stop — double click */
export function playRecordStop() {
  tone(800, 0.03, 'sine', 0.05)
  setTimeout(() => tone(800, 0.03, 'sine', 0.05), 100)
}

/** Message expired — soft tick */
export function playExpire() {
  tone(300, 0.08, 'triangle', 0.04)
}

/** Error — harsh buzz */
export function playError() {
  tone(150, 0.2, 'sawtooth', 0.06)
}
