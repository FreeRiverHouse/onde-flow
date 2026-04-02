import { contextBridge, ipcRenderer } from "electron"

const api = {
  // ─── STT (Speech to Text) ────────────────────────────────────────────────────
  sendAudioToMain: (buffer: ArrayBuffer) => ipcRenderer.invoke("process-audio", buffer),
  isWhisperReady: () => ipcRenderer.invoke("whisper-ready"),
  onWhisperStatus: (cb: (status: string) => void) => {
    ipcRenderer.on("whisper-status", (_e, v) => cb(v))
  },
  removeWhisperStatus: () => ipcRenderer.removeAllListeners("whisper-status"),

  // ─── Recording ────────────────────────────────────────────────────────────────
  onToggleRecording: (cb: (isRecording: boolean) => void) => {
    ipcRenderer.on("toggle-recording", (_e, v) => cb(v))
  },
  removeToggleRecording: () => ipcRenderer.removeAllListeners("toggle-recording"),
  startRecording: () => ipcRenderer.invoke("start-recording"),
  stopRecording: () => ipcRenderer.invoke("stop-recording"),

  // ─── EMILIO CHAT (OpenRouter) ─────────────────────────────────
  emilioChat: (message: string, appContext?: string) =>
    ipcRenderer.invoke("emilio-chat", { message, appContext }),
  emilioReset: () => ipcRenderer.invoke("emilio-reset"),
  emilioHistory: () => ipcRenderer.invoke("emilio-history"),

  // ─── APP CONTEXT ─────────────────────────────────────────────────────────────
  getAppContext: (appName: string) => ipcRenderer.invoke("get-app-context", appName),

  // ─── LOGS ─────────────────────────────────────────────────────────────────────
  getLogs: (n?: number) => ipcRenderer.invoke("get-logs", n),
  onLog: (cb: (line: string) => void) => {
    ipcRenderer.on("log-line", (_e, v) => cb(v))
  },

  // ─── EXTERNAL LINKS ──────────────────────────────────────────────────────────
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

  // ─── TTS (Text to Speech - VibeVoice) ────────────────────────────────────────
  ttsReady: () => ipcRenderer.invoke("tts-ready"),
  ttsSpeak: (text: string, emotion?: string) => ipcRenderer.invoke("tts-speak", { text, emotion }),
  onTTSStatus: (cb: (status: string) => void) => {
    ipcRenderer.on("tts-status", (_e, v) => cb(v))
  },
  removeTTSStatus: () => ipcRenderer.removeAllListeners("tts-status"),

  // ─── PING ─────────────────────────────────────────────────────────────────────
  ping: () => ipcRenderer.invoke("ping"),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.api = api
}
