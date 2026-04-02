interface EmilioResponse {
  reply: string
  action?: 'start_coder' | 'switch_app' | null
  emotion?: 'neutral' | 'excited' | 'thinking' | 'proud' | 'focused' | 'relaxed' | 'happy'
  coderPayload?: { app: string; tasks: string[]; plan: string }
}

interface OndeFlowAPI {
  // ─── STT (Speech to Text) ────────────────────────────────────────────────────
  sendAudioToMain: (buffer: ArrayBuffer) => Promise<string>
  isWhisperReady: () => Promise<boolean>
  onWhisperStatus: (cb: (status: string) => void) => void
  removeWhisperStatus: () => void

  // ─── Recording ────────────────────────────────────────────────────────────────
  onToggleRecording: (cb: (isRecording: boolean) => void) => void
  removeToggleRecording: () => void
  startRecording: () => Promise<{ ok: boolean }>
  stopRecording: () => Promise<{ ok: boolean }>

  // ─── EMILIO CHAT (OpenRouter) ─────────────────────────────────
  emilioChat: (message: string, appContext?: string) => Promise<EmilioResponse>
  emilioReset: () => Promise<{ ok: boolean }>
  emilioHistory: () => Promise<Array<{ role: string; content: string }>>

  // ─── APP CONTEXT ─────────────────────────────────────────────────────────────
  getAppContext: (appName: string) => Promise<string | null>

  // ─── LOGS ─────────────────────────────────────────────────────────────────────
  getLogs: (n?: number) => Promise<string[]>
  onLog: (cb: (line: string) => void) => void

  // ─── EXTERNAL LINKS ──────────────────────────────────────────────────────────
  openExternal: (url: string) => Promise<void>

  // ─── PING ─────────────────────────────────────────────────────────────────────
  ping: () => Promise<void>
}

declare global {
  interface Window {
    api: OndeFlowAPI
  }
}
