import { spawn, ChildProcess } from 'child_process'
import * as http from 'http'
import { join } from 'path'

const TTS_PORT = 5001
let ttsProcess: ChildProcess | null = null
let ttsReady = false

export function onTTSStatus(cb: (status: string) => void): void {
  _statusCb = cb
}

let _statusCb: ((s: string) => void) = () => {}

export async function startTTSServer(): Promise<void> {
  const scriptPath = '/Volumes/SSD-FRH-1/Free-River-House/onde-flow/scripts/vibevoice_server.py'
  const modelPath = '/Volumes/SSD-FRH-1/Free-River-House/LOCAL-LLM/microsoft/VibeVoice-Realtime-0.5B'

  ttsProcess = spawn('python3', [scriptPath], {
    env: {
      ...process.env,
      VIBEVOICE_MODEL_PATH: modelPath
    }
  })

  ttsProcess.stdout?.on('data', (d) => {
    const msg = d.toString()
    if (msg.includes('TTS server ready')) {
      ttsReady = true
      _statusCb('ready')
    }
  })

  ttsProcess.stderr?.on('data', (d) => {
    console.error('[TTS]', d.toString())
  })

  ttsProcess.on('exit', (code) => {
    ttsReady = false
    _statusCb('stopped')
    console.log('[TTS] Server exited with code', code)
  })

  // Wait for server to be ready (max 30s)
  let retries = 0
  while (!ttsReady && retries < 60) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const healthy = await checkHealth()
      if (healthy) { ttsReady = true; _statusCb('ready'); break }
    } catch { /* not ready yet */ }
    retries++
  }
}

export function stopTTSServer(): void {
  ttsProcess?.kill()
  ttsReady = false
}

export function isTTSReady(): boolean {
  return ttsReady
}

async function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${TTS_PORT}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

export async function speakText(text: string, emotion?: string): Promise<Buffer> {
  if (!ttsReady) {
    throw new Error('TTS server not ready')
  }

  // Pick voice based on emotion
  const voice = emotionToVoice(emotion)

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text, voice })
    const options = {
      hostname: 'localhost',
      port: TTS_PORT,
      path: '/tts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks))
        } else {
          reject(new Error(`TTS error: ${res.statusCode}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('TTS timeout')) })
    req.write(body)
    req.end()
  })
}

function emotionToVoice(emotion?: string): string | undefined {
  // Map emotions to VibeVoice voice keys if available
  const emotionMap: Record<string, string> = {
    excited: 'energetic',
    happy: 'cheerful',
    thinking: 'calm',
    focused: 'neutral',
    proud: 'confident',
    relaxed: 'soft',
    neutral: 'neutral'
  }
  return emotion ? emotionMap[emotion] : undefined
}
