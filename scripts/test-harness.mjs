#!/usr/bin/env node
/**
 * Squawk Test Harness — Gemma powered.
 * Usage: node scripts/test-harness.mjs [--scenario=crypto|p2p|ephemeral|full]
 */

import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const REPORT_PATH = resolve(ROOT, 'test-report.json')

const SCENARIOS = {
  crypto: `Generate 5 critical security tests for a P2P encrypted messaging app called Squawk. Focus on E2EE key exchange, AES-GCM encryption/decryption, and session management. Output ONLY a JSON array. No thinking. No markdown. No extra text.`,

  p2p: `Generate 5 WebRTC P2P connectivity test scenarios for Squawk covering signaling handshake, offer/answer exchange, ICE relay, data channel, and reconnection. Output ONLY a JSON array.`,

  ephemeral: `Generate 5 test scenarios for Squawk's ephemeral timer system covering 24h expiry, view-once, dynamic timers, End Chat, and panic wipe. Output ONLY a JSON array.`,

  full: `You are testing Squawk — a P2P encrypted messaging app. Generate 10 test scenarios covering: sending encrypted messages, P2P connection, voice recording/playback, view-once messages, End Chat, 24h auto-expiry, copy peer ID, bottom nav. Each test: name, steps (array), expectedResult, failure, severity. Output ONLY a JSON array. No thinking. No markdown.`,
}

async function ollama(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ollama', ['run', 'gemma4:e2b'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    proc.stdout.on('data', d => { output += d.toString() })
    proc.stderr.on('data', d => process.stderr.write(d))
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ollama exited ${code}`))
      // Extract JSON: strip thinking, extract array
      let cleaned = output
        .replace(/Thinking[\s\S]*?done thinking\.?/gi, '')
        .replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/, '$1')
        .trim()
      resolve(cleaned)
    })
    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function main() {
  const args = process.argv.slice(2)
  const scenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1] || 'full'

  console.log(`\n🧪 Squawk Test Harness\n   Scenario: ${scenario} | Model: gemma4:e2b\n`)

  const prompt = SCENARIOS[scenario]
  if (!prompt) {
    console.error(`Unknown: ${scenario}. Use: ${Object.keys(SCENARIOS).join(', ')}`)
    process.exit(1)
  }

  console.log('🤖 Generating...')
  console.log('──────────────────────────────────')

  let raw
  try {
    raw = await ollama(prompt)
  } catch (err) {
    console.error('❌ Ollama failed:', err.message)
    process.exit(1)
  }

  console.log(raw)
  console.log('──────────────────────────────────')

  // Sanitize: replace all control characters, collapse whitespace
  const sanitized = raw
    .replace(/[\x00-\x1F]/g, ' ')  // all control chars → space
    .replace(/\s{2,}/g, ' ')        // collapse whitespace
    .trim()
  try {
    const tests = JSON.parse(sanitized)
    const report = {
      generated: new Date().toISOString(),
      model: 'gemma4:e2b',
      scenario,
      totalTests: Array.isArray(tests) ? tests.length : 0,
      tests: Array.isArray(tests) ? tests : [tests],
      passed: 0, failed: 0, skipped: Array.isArray(tests) ? tests.length : 1,
    }
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
    console.log(`\n✅ Report: ${REPORT_PATH} (${report.totalTests} tests)`)
  } catch (parseErr) {
    console.log(`\n⚠️  Parse failed: ${parseErr.message.slice(0, 150)}`)
    console.log(`   Saving raw to ${REPORT_PATH.replace('.json', '.txt')}`)
    writeFileSync(REPORT_PATH.replace('.json', '.txt'), raw)
  }
}

main()
