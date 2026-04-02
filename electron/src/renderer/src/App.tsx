import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import SpeechBubble from './components/SpeechBubble'
import ChatPanel from './components/ChatPanel'
import { useTTS } from './hooks/useTTS'
import { useVoiceInput } from './hooks/useVoiceInput'

// Lazy load OceanCanvas (heavy Three.js scene)
const OceanCanvas = lazy(() => import('./OceanCanvas'))

type Message = {
  role: 'user' | 'emilio' | 'system'
  content: string
  emotion?: string
  timestamp: number
}

type OndeFlowMode = 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'emilio',
      content: "Hey! I'm Emilio, your OndeFlow concierge. What are we building today? 🌊",
      emotion: 'excited',
      timestamp: Date.now()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastEmotion, setLastEmotion] = useState('excited')
  const [whisperReady, setWhisperReady] = useState(false)
  const [ondeFlowMode, setOndeFlowMode] = useState<OndeFlowMode>('IDLE')
  const [activeApp, setActiveApp] = useState<string | null>(null)

  // TTS hook
  const { ttsReady, isSpeaking, speak: ttsSpeak } = useTTS()

  // Voice input hook — when transcribed, send to Emilio
  const { isRecording, isProcessing, interimText, toggleRecording } = useVoiceInput(
    useCallback((text: string) => { void sendToEmilio(text) }, [])
  )

  // Check Whisper status
  useEffect(() => {
    window.api?.isWhisperReady?.().then(setWhisperReady).catch(() => {})
    window.api?.onWhisperStatus?.((s) => setWhisperReady(s === 'ready'))
  }, [])

  // Send message to Emilio via OpenRouter
  const sendToEmilio = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return
    setIsLoading(true)

    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }])

    try {
      const response = await window.api.emilioChat(userMsg, activeApp ?? undefined)

      setMessages(prev => [...prev, {
        role: 'emilio',
        content: response.reply,
        emotion: response.emotion,
        timestamp: Date.now()
      }])

      const emotion = response.emotion || 'neutral'
      setLastEmotion(emotion)

      // Emilio speaks! 🗣
      void ttsSpeak(response.reply, emotion)

      // Handle actions
      if (response.action === 'start_coder') {
        setOndeFlowMode('CODER_ACTIVE')
        setMessages(prev => [...prev, {
          role: 'system',
          content: '⚡ Coder started — I\'m on it!',
          timestamp: Date.now()
        }])
      } else if (response.action === 'switch_app') {
        const newApp = (response as any).switchApp || null
        setActiveApp(newApp)
        if (newApp) {
          setMessages(prev => [...prev, {
            role: 'system',
            content: `📂 Switched to: ${newApp}`,
            timestamp: Date.now()
          }])
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `⚠️ ${err instanceof Error ? err.message : 'Connection error'}`,
        timestamp: Date.now()
      }])
    }

    setIsLoading(false)
  }, [isLoading, activeApp, ttsSpeak])

  // Form submit
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const msg = inputValue.trim()
    if (!msg) return
    setInputValue('')
    void sendToEmilio(msg)
  }, [inputValue, sendToEmilio])

  // Reset conversation
  const handleReset = useCallback(async () => {
    try {
      await window.api.emilioReset()
      setMessages([{
        role: 'emilio',
        content: "Fresh start! What are we building? 🌊",
        emotion: 'excited',
        timestamp: Date.now()
      }])
      setLastEmotion('excited')
      setOndeFlowMode('IDLE')
    } catch { /* ignore */ }
  }, [])

  const lastEmilioMsg = [...messages].reverse().find(m => m.role === 'emilio')

  return (
    <main style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: '#02020c' }}>

      {/* ── 60% Ocean + Emilio ── */}
      <div style={{ position: 'relative', width: '60%', height: '100%' }}>

        <Suspense fallback={
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d4ff', fontFamily: 'monospace' }}>
            Loading scene...
          </div>
        }>
          <OceanCanvas emotion={lastEmotion} />
        </Suspense>

        {/* Speech Bubble */}
        <SpeechBubble
          message={lastEmilioMsg?.content || ''}
          emotion={lastEmotion}
          isLoading={isLoading}
        />

        {/* Voice button */}
        <button
          onClick={toggleRecording}
          style={{
            position: 'absolute', bottom: 24, left: 24,
            background: isRecording ? 'rgba(255,50,50,0.25)' : 'rgba(0,0,0,0.5)',
            border: `1.5px solid ${isRecording ? '#ff4444' : 'rgba(0,212,255,0.3)'}`,
            color: isRecording ? '#ff4444' : '#00d4ff',
            borderRadius: '50%', width: 56, height: 56, fontSize: 24,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: isRecording ? '0 0 20px rgba(255,50,50,0.4)' : 'none'
          }}
          title={isRecording ? 'Stop (or release Fn)' : 'Start recording (or hold Fn)'}
        >
          {isRecording ? '⏹' : '🎙'}
        </button>

        {/* Interim / processing text */}
        {(interimText || isProcessing) && (
          <div style={{
            position: 'absolute', bottom: 90, left: 16, right: 16,
            textAlign: 'center', color: '#00d4ff', fontFamily: 'monospace',
            fontSize: 13, opacity: 0.8
          }}>
            {interimText}
          </div>
        )}

        {/* Status bar */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          display: 'flex', gap: 8, fontSize: 11,
          fontFamily: 'monospace', color: '#555'
        }}>
          {whisperReady && <span style={{ color: '#00d4ff' }}>🎙 STT</span>}
          {ttsReady && <span style={{ color: '#a855f7' }}>🔊 TTS</span>}
          {isSpeaking && <span style={{ color: '#ffaa00' }}>🗣 Speaking</span>}
          {ondeFlowMode !== 'IDLE' && (
            <span style={{ color: ondeFlowMode === 'CODER_ACTIVE' ? '#ffaa00' : '#00ff9f' }}>
              {ondeFlowMode === 'CODER_ACTIVE' ? '⚡ CODER' : '🟢 EMILIO'}
            </span>
          )}
          {activeApp && <span style={{ color: '#f59e0b' }}>📂 {activeApp}</span>}
        </div>
      </div>

      {/* ── 40% Chat Panel ── */}
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
        onReset={handleReset}
        isRecording={isRecording}
        onToggleRecording={toggleRecording}
        activeApp={activeApp}
        ondeFlowMode={ondeFlowMode}
      />
    </main>
  )
}
