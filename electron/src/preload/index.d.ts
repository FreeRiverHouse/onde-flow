interface VibeTalkAPI {
  // Recording
  sendAudioToMain: (buffer: ArrayBuffer) => Promise<string>
  onToggleRecording: (cb: (isRecording: boolean) => void) => void
  removeToggleRecording: () => void

  // Whisper
  whisperReady: () => Promise<boolean>
  isWhisperReady: () => Promise<boolean>
  onWhisperStatus: (cb: (status: string) => void) => void
  removeWhisperStatus: () => void

  // Dashboard
  onDashboardUpdated: (cb: (report: any) => void) => void
  removeDashboardUpdated: () => void
  getDashboard: () => Promise<any>
  generateDashboard: () => Promise<any>
  getProjects: () => Promise<any[]>

  // History
  getDictations: (limit?: number) => Promise<any[]>

  // Logs
  getLogs: (n?: number) => Promise<any[]>
  onLog: (cb: (line: string) => void) => void

  // Settings
  getSettings: () => Promise<any>
  saveSettings: (patch: any) => Promise<any>
  setApiKey: (provider: string, key: string) => Promise<void>
  getApiKeySet: () => Promise<{ provider: string; hasKey: boolean }>

  // System
  getRam: () => Promise<{ availMB: number } | null>

  // Accessibility
  getAccessibility: () => Promise<boolean>
  openAccessibilitySettings: () => Promise<void>

  // External links
  openExternal: (url: string) => Promise<void>

  // Auth
  authGetUser: () => Promise<any>
  authLoginGoogle: () => Promise<{ ok: boolean; user?: any; error?: string }>
  authLogout: () => Promise<{ ok: boolean }>
  authSyncNow: () => Promise<{ ok: boolean; error?: string }>
  onAuthChanged: (cb: (user: any) => void) => void
  removeAuthChanged: () => void
}

declare global {
  interface Window {
    api: VibeTalkAPI
  }
}
