import { app, shell, BrowserWindow, ipcMain, globalShortcut, session, systemPreferences } from 'electron'
import { join } from 'path'
import * as dotenv from 'dotenv'

// Load .env file
dotenv.config({ path: join(__dirname, '../../.env') })
dotenv.config({ path: join(app.getAppPath(), '.env') })
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { transcribeAudio, startWhisperServer, stopWhisperServer, isWhisperReady, onWhisperStatus } from './whisper/engine'
import { startTTSServer, stopTTSServer, speakText, isTTSReady, onTTSStatus } from './tts'
import { initDb, saveConversation, getConversations } from './db'
import { logger, getRecentLogs, getLogFilePath } from './logger'
import { v4 as uuidv4 } from 'uuid'
import { execSync } from 'child_process'
import * as fs from 'fs'
import { tmpdir } from 'os'

// ─── OpenRouter for Emilio reasoning ─────────────────────────────────────
async function chatWithEmilio(
  message: string,
  history: Array<{ role: string; content: string }>,
  appContext?: string
): Promise<{ reply: string; action?: string; emotion?: string; coderPayload?: any }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set')
  }

  const systemPrompt = buildEmilioSystemPrompt(appContext)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message }
  ]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://onde.surf',
      'X-Title': 'OndeFlow'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3-235b-a22b',  // or whatever model we want
      messages,
      temperature: 0.7,
      max_tokens: 512
    })
  })

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || ''

  // Parse JSON from response
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    return JSON.parse(match[0])
  }

  return {
    reply: raw.trim() || "Hmm, I had a thought but lost it... 🌊",
    emotion: 'thinking'
  }
}

function buildEmilioSystemPrompt(appContext?: string): string {
  let prompt = `You are Emilio, the concierge of Onde-Flow — a creative OS for managing projects and coding.
You help the user plan work, understand requirements, and delegate execution to Coder agents.
You have a warm, enthusiastic personality with "Top G" vibes. 🌊

You can suggest these actions:
- start_coder: when the user wants to start building something
- switch_app: when switching between projects

Reply ONLY with valid JSON:
{"reply":"...","action":null,"emotion":"neutral","coderPayload":null}

Emotions: neutral, excited, thinking, proud, focused, relaxed, happy
Keep replies short (1-3 sentences). Always reply in English.`

  if (appContext) {
    prompt = `=== PROJECT CONTEXT ===\n${appContext}\n=== END ===\n\n` + prompt
  }

  return prompt
}

// ─── Window ─────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let isRecording = false
let fnPollingInterval: ReturnType<typeof setInterval> | null = null
let conversationHistory: Array<{ role: string; content: string }> = []

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    minWidth: 900,
    minHeight: 600,
    show: false,
    alwaysOnTop: true,
    resizable: true,
    title: 'OndeFlow // Creative OS',
    backgroundColor: '#02020c',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.moveTop()
    console.log('[OndeFlow] Window shown')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── Single Instance Lock ───────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  setTimeout(() => process.exit(0), 100)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ─── DB + App Init ──────────────────────────────────────────────────────────
initDb()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ondeflow.app')

  // Permissions
  const allowedPermissions = ['media', 'mediaKeySystem', 'notifications']
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowedPermissions.includes(permission)
  )
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(allowedPermissions.includes(permission))
  )

  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      logger.info('perms', 'requesting microphone access...')
      await systemPreferences.askForMediaAccess('microphone')
    }
    logger.info('perms', `mic: ${systemPreferences.getMediaAccessStatus('microphone')}`)
  }

  // Start Whisper server for STT
  startWhisperServer().catch(err => logger.error('whisper', 'failed to start: ' + err))

  // Start TTS server (VibeVoice)
  onTTSStatus((status) => {
    logger.info('tts', 'status: ' + status)
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('tts-status', status))
  })
  startTTSServer().catch(err => logger.error('tts', 'failed to start: ' + err))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ─── IPC Handlers ─────────────────────────────────────────────────────────

  // Ping
  ipcMain.on('ping', () => logger.debug('ipc', 'pong'))

  // Audio processing (STT)
  ipcMain.handle('process-audio', async (_event, buffer: ArrayBuffer) => {
    if (!(buffer instanceof ArrayBuffer) && !Buffer.isBuffer(buffer)) {
      throw new Error('Invalid audio buffer')
    }

    if (buffer.byteLength === 0) {
      throw new RangeError('Audio buffer is empty')
    }

    const audioPath = join(tmpdir(), `ondeflow-${Date.now()}.wav`)
    await fs.promises.writeFile(audioPath, Buffer.from(buffer))

    try {
      const start = Date.now()
      const text = await transcribeAudio(audioPath)
      const elapsed = Date.now() - start
      logger.info('stt', `"${text.slice(0, 60)}" (${elapsed}ms)`)

      fs.unlinkSync(audioPath)
      return text
    } catch (e) {
      logger.error('process-audio', String(e))
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
      throw e
    }
  })

  // Chat with Emilio (OpenRouter)
  ipcMain.handle('emilio-chat', async (_event, { message, appContext }: { message: string; appContext?: string }) => {
    try {
      const response = await chatWithEmilio(message, conversationHistory, appContext)

      // Update history
      conversationHistory.push({ role: 'user', content: message })
      conversationHistory.push({ role: 'assistant', content: response.reply })

      // Keep memory to last 20 messages to avoid context bloat
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20)
      }

      // Persist to DB
      saveConversation({
        id: uuidv4(),
        user_message: message,
        emilio_reply: response.reply,
        action: response.action,
        emotion: response.emotion,
        timestamp: new Date().toISOString()
      })

      return response
    } catch (e) {
      logger.error('emilio-chat', String(e))
      return {
        reply: "Had a little hiccup connecting to my brain... but I'm still here! 🌊",
        emotion: 'thinking'
      }
    }
  })

  // Reset conversation
  ipcMain.handle('emilio-reset', () => {
    conversationHistory = []
    return { ok: true }
  })

  // Get conversation history
  ipcMain.handle('emilio-history', () => {
    return conversationHistory
  })

  // Whisper status
  ipcMain.handle('whisper-ready', () => isWhisperReady())

  // TTS
  ipcMain.handle('tts-ready', () => isTTSReady())
  ipcMain.handle('tts-speak', async (_event, { text, emotion }: { text: string; emotion?: string }) => {
    try {
      const audioBuffer = await speakText(text, emotion)
      return audioBuffer  // WAV audio as Buffer → renderer plays it
    } catch (e) {
      logger.error('tts', String(e))
      throw e
    }
  })

  // Recording toggle
  ipcMain.handle('start-recording', () => {
    isRecording = true
    mainWindow?.webContents.send('toggle-recording', true)
    return { ok: true }
  })

  ipcMain.handle('stop-recording', () => {
    isRecording = false
    mainWindow?.webContents.send('toggle-recording', false)
    return { ok: true }
  })

  // Logs
  ipcMain.handle('get-logs', (_e, n = 200) => getRecentLogs(n))
  ipcMain.handle('get-log-file-path', () => getLogFilePath())

  // External links (safe)
  ipcMain.handle('open-external', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  // Get app context for sub-apps
  ipcMain.handle('get-app-context', async (_e, appName: string) => {
    try {
      const basePath = app.isPackaged
        ? join(process.resourcesPath, 'apps')
        : join(app.getAppPath(), '..', 'apps')

      const visionPath = join(basePath, appName, 'VISION.md')
      const tasksPath = join(basePath, appName, 'TASKS.md')

      let context = ''
      if (fs.existsSync(visionPath)) {
        context += `## VISION\n${fs.readFileSync(visionPath, 'utf-8')}\n\n`
      }
      if (fs.existsSync(tasksPath)) {
        context += `## TASKS\n${fs.readFileSync(tasksPath, 'utf-8')}\n\n`
      }

      return context || null
    } catch {
      return null
    }
  })

  // ─── Fn Key Polling (macOS) ───────────────────────────────────────────────
  if (process.platform === 'darwin') {
    try {
      const koffi = require('koffi')
      const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
      const CGEventSourceKeyState = CG.func('bool CGEventSourceKeyState(int, uint16)')
      const kCGEventSourceStateHIDSystemState = 1
      const kVK_Function = 63

      let fnWasDown = false

      fnPollingInterval = setInterval(() => {
        const isFnDown = CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, kVK_Function)

        if (isFnDown && !fnWasDown) {
          fnWasDown = true
          isRecording = true
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('toggle-recording', true))
          logger.debug('fn', 'pressed → recording')
        } else if (!isFnDown && fnWasDown) {
          fnWasDown = false
          isRecording = false
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('toggle-recording', false))
          logger.debug('fn', 'released')
        }
      }, 50)

      logger.info('fn', 'polling started')
    } catch (err) {
      logger.error('fn', 'failed: ' + err)
    }
  } else {
    globalShortcut.register('Alt+Space', () => {
      isRecording = !isRecording
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('toggle-recording', isRecording))
    })
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (fnPollingInterval) clearInterval(fnPollingInterval)
  stopWhisperServer()
  stopTTSServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
