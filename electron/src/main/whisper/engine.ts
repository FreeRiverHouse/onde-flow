import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import * as http from 'http'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { log } from '../logger'

// ─── Whisper warm server ─────────────────────────────────────────────────────
// Model loaded ONCE on startup. Each transcription = HTTP POST, no reload.
// Uses medium model (1.5GB) for best quality at 200WPM Italian/English.

const SERVER_PORT = 8178

let serverProcess: ChildProcess | null = null
let serverReady = false

function getAvailableMemoryMB(): number {
  try {
    const out = execSync('vm_stat', { timeout: 1000 }).toString()
    const free = parseInt(out.match(/Pages free:\s+(\d+)/)?.[1] || '0')
    const inactive = parseInt(out.match(/Pages inactive:\s+(\d+)/)?.[1] || '0')
    // inactive pages are reclaimable
    return Math.round((free + inactive * 0.7) * 16384 / 1024 / 1024)
  } catch { return 4096 } // assume 4GB if check fails
}

function getModelPath(): string {
  // Priority: large-v3-turbo > large-v3 > medium > small (user data) > small (bundled)
  const userDataModels = join(app.getPath('userData'), 'models')
  const resourcesModels = app.isPackaged
    ? join(process.resourcesPath, 'resources/whisper/models')
    : join(__dirname, '../../resources/whisper/models')

  const candidates: Array<[string, string]> = [
    [join(userDataModels, 'ggml-large-v3-turbo.bin'), 'large-v3-turbo'],
    [join(userDataModels, 'ggml-large-v3.bin'), 'large-v3'],
    [join(userDataModels, 'ggml-medium.bin'), 'medium'],
    [join(resourcesModels, 'ggml-medium.bin'), 'medium (bundled)'],
    [join(userDataModels, 'ggml-small.bin'), 'small'],
    [join(resourcesModels, 'ggml-small.bin'), 'small (bundled)'],
  ]

  for (const [p, label] of candidates) {
    if (fs.existsSync(p)) {
      log('INFO', 'whisper', `Using model: ${label} (${p})`)
      return p
    }
  }

  // fallback — will fail gracefully at server start
  log('WARN', 'whisper', 'No model found — server will fail to start')
  return candidates[candidates.length - 1][0]
}

function getServerBin(): string {
  // In production: binary is at {resourcesPath}/resources/whisper/whisper-server
  // In dev: binary is at resources/whisper/build/bin/whisper-server
  return app.isPackaged
    ? join(process.resourcesPath, 'resources/whisper/whisper-server')
    : join(__dirname, '../../resources/whisper/build/bin/whisper-server')
}

export async function startWhisperServer(): Promise<void> {
  if (serverProcess) return

  // ── GUARDRAIL: check available RAM before loading model ──────────────────
  const availMB = getAvailableMemoryMB()
  const modelPath = getModelPath()
  const requiredMB = modelPath.includes('large-v3-turbo') ? 3200
    : modelPath.includes('large-v3') ? 4500
      : modelPath.includes('medium') ? 2800
        : 800

  log('INFO', 'whisper', `Available RAM: ${availMB}MB, required: ${requiredMB}MB`)

  if (availMB < requiredMB) {
    log('WARN', 'whisper', `Low RAM (${availMB}MB < ${requiredMB}MB), waiting 8s before loading model...`)
    await new Promise(r => setTimeout(r, 8000))
    const availAfter = getAvailableMemoryMB()
    log('INFO', 'whisper', `RAM after wait: ${availAfter}MB`)
  }

  // ── Start server ────────────────────────────────────────────────────────
  const serverBin = getServerBin()
  log('INFO', 'whisper', `Starting whisper-server: bin=${serverBin}, model=${modelPath}`)

  return new Promise((resolve, reject) => {
    serverProcess = spawn(serverBin, [
      '-m', modelPath,
      '-l', 'auto',
      '-t', '6',
      '-nt',
      '--host', '127.0.0.1',
      '--port', String(SERVER_PORT),
    ])

    // Poll HTTP until ready (max 60s for medium model)
    let elapsed = 0
    const poll = setInterval(async () => {
      elapsed += 1000
      try {
        await pingServer()
        clearInterval(poll)
        serverReady = true
        emitStatus('ready')
        log('INFO', 'whisper', `Server ready on port ${SERVER_PORT} after ${elapsed}ms`)
        resolve()
      } catch {
        if (elapsed >= 60000) {
          clearInterval(poll)
          reject(new Error('whisper-server timeout after 60s'))
        }
      }
    }, 1000)

    serverProcess.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) log('DEBUG', 'whisper-srv', msg)
    })

    serverProcess.on('error', (err) => {
      clearInterval(poll)
      emitStatus('error')
      log('ERROR', 'whisper', `Server process error: ${err.message}`)
      reject(err)
    })

    serverProcess.on('close', (code) => {
      log('INFO', 'whisper', `Server exited with code ${code}`)
      serverProcess = null
      serverReady = false
    })
  })
}

export function stopWhisperServer(): void {
  if (serverProcess) {
    log('INFO', 'whisper', 'Stopping server')
    serverProcess.kill()
    serverProcess = null
    serverReady = false
  }
}

export function isWhisperReady(): boolean { return serverReady }

let _statusCb: ((status: string) => void) | null = null
export function onWhisperStatus(cb: (status: string) => void): void { _statusCb = cb }
function emitStatus(s: string): void { _statusCb?.(s) }

function pingServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${SERVER_PORT}/`, (res) => {
      res.resume(); resolve()
    })
    req.on('error', reject)
    req.setTimeout(800, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ─── CLI fallback when whisper-server is unavailable ────────────────────────
async function transcribeWithCLI(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outDir = '/tmp/onde-whisper'
    fs.mkdirSync(outDir, { recursive: true })
    const child = spawn('/opt/homebrew/bin/whisper', [
      audioPath,
      '--model', 'medium',
      '--language', 'auto',
      '--output_format', 'txt',
      '--output_dir', outDir,
      '--fp16', 'False'
    ], { env: { ...process.env } })

    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`whisper CLI exited with ${code}`)); return }
      const base = audioPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'audio'
      const txtPath = `${outDir}/${base}.txt`
      try {
        const text = fs.readFileSync(txtPath, 'utf-8').trim()
        fs.unlinkSync(txtPath)
        resolve(text)
      } catch { reject(new Error('whisper CLI output not found')) }
    })
    child.on('error', reject)
  })
}

export async function transcribeAudio(audioPath: string): Promise<string> {
  // Use CLI fallback if server not ready (e.g. dev mode without compiled server)
  if (!serverReady) {
    log('INFO', 'whisper', 'Server not ready, falling back to CLI')
    return transcribeWithCLI(audioPath)
  }

  const fileData = await fs.promises.readFile(audioPath)
  const boundary = '----OVBoundary' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port: SERVER_PORT,
        path: '/inference', method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve((parsed.text || '').trim())
          } catch {
            resolve(data.trim())
          }
        })
      }
    )
    req.on('error', (e) => {
      log('ERROR', 'whisper', `Transcription request failed: ${e.message}`)
      reject(e)
    })
    req.write(body)
    req.end()
  })
}
