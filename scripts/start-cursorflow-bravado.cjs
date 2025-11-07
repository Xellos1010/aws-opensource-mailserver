#!/usr/bin/env node
/* eslint-disable no-console */
const http = require('http')
const { spawn, execSync } = require('child_process')

const PORT = Number(process.env.CURSOR_FLOW_PORT || 4488)
const READY_PATH = '/'
const MAX_ATTEMPTS = Number(process.env.CURSOR_FLOW_ATTEMPTS || 40)
const INTERVAL_MS = Number(process.env.CURSOR_FLOW_INTERVAL_MS || 500)

let bridgeProc = null
let appProc = null

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function waitUntilReady() {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const isReady = await new Promise(resolve => {
      const req = http.get({ host: 'localhost', port: PORT, path: READY_PATH, timeout: 1000 }, res => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        try { req.destroy() } catch {}
        resolve(false)
      })
    })
    if (isReady) return true
    await sleep(INTERVAL_MS)
  }
  return false
}

function cleanup() {
  if (appProc && !appProc.killed) {
    try { process.kill(appProc.pid) } catch {}
  }
  if (bridgeProc && !bridgeProc.killed) {
    try { process.kill(bridgeProc.pid) } catch {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })
process.on('exit', () => { cleanup() })

;(async () => {
  console.log(`🌉 Starting Cursor Flow bridge on http://localhost:${PORT} ...`)
  bridgeProc = spawn(process.execPath, ['tools/cursor/feature-bridge.cjs'], {
    env: { ...process.env, CURSOR_FLOW_PORT: String(PORT), CURSOR_FLOW_APP: 'bravado' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  bridgeProc.stdout.on('data', d => process.stdout.write(`[bridge] ${d}`))
  bridgeProc.stderr.on('data', d => process.stderr.write(`[bridge] ${d}`))

  const ready = await waitUntilReady()
  if (!ready) {
    console.error(`❌ Cursor Flow bridge did not become ready on port ${PORT}`)
    process.exit(1)
  }
  console.log('✅ Cursor Flow bridge is ready')

  console.log('🔍 Quick verification before starting Bravado...')

  // Run verification before starting the app
  try {
    const verificationResult = execSync('node verify-cursor-flow-fix.cjs', {
      encoding: 'utf8',
      stdio: 'pipe'
    })

    if (verificationResult.includes('🎉 Verification complete!')) {
      console.log('✅ Pre-flight checks passed!')
    } else {
      console.log('⚠️  Some pre-flight checks failed, but continuing...')
    }
  } catch (error) {
    console.log('⚠️  Pre-flight verification failed, but continuing with startup...')
    console.log('Error:', error.message)
  }

  console.log('🏥 Starting Bravado with Cursor Flow enabled...')
  appProc = spawn('pnpm', ['exec', 'nx', 'run', 'bravado:serve'], {
    env: { ...process.env, CURSOR_FLOW: 'true' },
    stdio: 'inherit',
  })

  // Wait a bit for the app to initialize, then run verification
  setTimeout(async () => {
    try {
      console.log('\n🔍 Running Cursor Flow integration verification...')

      // Run the verification script
      const verificationResult = execSync('node verify-cursor-flow-fix.cjs', {
        encoding: 'utf8',
        stdio: 'pipe'
      })

      console.log(verificationResult)

      // Check if verification passed
      if (verificationResult.includes('🎉 Verification complete!')) {
        console.log('✅ Cursor Flow integration verified successfully!')
      } else {
        console.log('⚠️  Some verification checks failed, but continuing...')
      }
    } catch (error) {
      console.log('⚠️  Verification script failed, but continuing with startup...')
      console.log('Error:', error.message)
    }
  }, 3000) // Wait 3 seconds for app to initialize

  appProc.on('exit', code => {
    console.log(`Bravado exited with code ${code}`)
    cleanup()
    process.exit(code ?? 0)
  })
})().catch(err => {
  console.error('Fatal error in start-cursorflow-bravado', err)
  cleanup()
  process.exit(1)
})
