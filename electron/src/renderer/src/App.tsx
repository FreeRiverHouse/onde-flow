import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import SpeechBubble from './components/SpeechBubble'
import ChatPanel from './components/ChatPanel'

// Lazy load OceanCanvas to avoid blocking main thread
const OceanCanvas = lazy(() => import('./OceanCanvas'))

type Message = {
  role: 'user' | 'emilio' | 'system'
  content: string
  emotion?: string
  timestamp: number
}

type EmilioBackend = 'qwen-36-plus' | 'qwen-omni' | 'sonnet'
type OndeFlowMode = 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE'

export default function EmilioPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'emilio', content: "Hey! I'm Emilio, your OndeFlow concierge. What are we building today? 🌊", emotion: 'excited', timestamp: Date.now() }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastEmotion, setLastEmotion] = useState('excited')
  const [isRecording, setIsRecording] = useState(false)
  const [whisperReady, setWhisperReady] = useState(false)
  const [ondeFlowMode, setOndeFlowMode] = useState<OndeFlowMode>('IDLE')
  const [activeApp, setActiveApp] = useState<string | null>(null)

  // Audio recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Load API key from env
  const [hasApiKey, setHasApiKey] = useState(false)
  useEffect(() => {
    // In Electron, API key comes from main process via IPC
    // For now, we check if it's configured
    const checkApiKey = async () => {
      try {
        if (window.api) {
          // Try to verify by sending a ping
          const testRes = await window.api.emilioChat('ping', undefined)
          setHasApiKey(true)
          return
        }
      } catch {
        // Key not configured yet
      }
      setHasApiKey(false)
    }
    checkApiKey()
  }, [])

  // Check whisper status
  useEffect(() => {
    if (window.api?.isWhisperReady) {
      window.api.isWhisperReady().then(setWhisperReady).catch(() => setWhisperReady(false))
    }
    if (window.api?.onWhisperStatus) {
      window.api.onWhisperStatus((status) => {
        setWhisperReady(status === 'ready')
      })
    }
  }, [])

  // Send message to Emilio (OpenRouter)
  const sendToEmilio = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }])
    setIsLoading(true)

    try {
      const response = await window.api.emilioChat(userMsg, activeApp ? `Active app: ${activeApp}` : undefined)
      setMessages(prev => [...prev, {
        role: 'emilio',
        content: response.reply,
        emotion: response.emotion,
        timestamp: Date.now()
      }])
      setLastEmotion(response.emotion || 'neutral')

      // Handle actions
      if (response.action === 'start_coder') {
        setOndeFlowMode('CODER_ACTIVE')
        setMessages(prev => [...prev, {
          role: 'system',
          content: '⚡ Coder started — working on your task...',
          timestamp: Date.now()
        }])
      } else if (response.action === 'switch_app') {
        setActiveApp(response.switchApp || null)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `⚠️ Error connecting to Emilio: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      }])
    }
    setIsLoading(false)
  }, [isLoading, activeApp])

  // Submit form
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
        content: "Reset! Conversation cleared. What are we working on? 🌊",
        emotion: 'excited',
        timestamp: Date.now()
      }])
      setLastEmotion('excited')
    } catch {
      setMessages(prev => [...prev, {
        role: 'system',
        content: '⚠️ Error resetting conversation',
        timestamp: Date.now()
      }])
    }
  }, [])

  // Toggle voice recording
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      stopRecording()
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        })
        audioChunksRef.current = []
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const arrayBuffer = await audioBlob.arrayBuffer()
          try {
            const text = await window.api.sendAudioToMain(arrayBuffer)
            if (text.trim()) {
              void sendToEmilio(text)
            }
          } catch (err) {
            setMessages(prev => [...prev, {
              role: 'system',
              content: `⚠️ STT error: ${err instanceof Error ? err.message : 'Unknown'}`,
              timestamp: Date.now()
            }])
          }
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop())
        }
        mediaRecorderRef.current = mediaRecorder
        mediaRecorder.start()
        setIsRecording(true)
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: '⚠️ Microphone access denied',
          timestamp: Date.now()
        }])
      }
    }
  }, [isRecording, sendToEmilio])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  return (
    <main style={{
      display: 'flex',
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: '#02020c'
    }}>
      {/* 60% 3D Ocean Canvas */}
      <div style={{ position: 'relative', width: '60%', height: '100%' }}>
        <OceanCanvas emotion={lastEmotion} />
        <SpeechBubble
          message={messages[messages.length - 1]?.role === 'emilio' ? messages[messages.length - 1].content : ''}
          emotion={lastEmotion}
          isLoading={isLoading}
        />

        {/* Recording button */}
        <button
          onClick={toggleRecording}
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            background: isRecording ? 'rgba(255,0,0,0.3)' : 'rgba(0,0,0,0.5)',
            border: `1px solid ${isRecording ? '#ff4444' : 'rgba(0,212,255,0.3)'}`,
            color: isRecording ? '#ff4444' : '#666',
            borderRadius: '50%',
            width: 56,
            height: 56,
            fontSize: 24,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? '⏹' : '🎙'}
        </button>

        {/* Status indicators */}
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 8,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#666',
          zIndex: 50
        }}>
          {whisperReady && <span style={{ color: '#00d4ff' }}>🎙 STT Ready</span>}
          {hasApiKey && <span style={{ color: '#00ff00' }}>🔑 API Key</span>}
          {ondeFlowMode !== 'IDLE' && (
            <span style={{
              color: ondeFlowMode === 'CODER_ACTIVE' ? '#ffaa00' : '#00ff00'
            }}>
              {ondeFlowMode === 'CODER_ACTIVE' ? '⚡ CODER ACTIVE' : '🟢 EMILIO ACTIVE'}
            </span>
          )}
        </div>
      </div>

      {/* 40% Chat Panel */}
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
