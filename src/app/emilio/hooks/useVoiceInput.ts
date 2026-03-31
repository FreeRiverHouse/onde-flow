'use client'

import { useRef, useState, useCallback } from 'react'

// === FILE: src/app/emilio/hooks/useVoiceInput.ts ===
// Primary: Web Speech API (SpeechRecognition / webkitSpeechRecognition)
// Fallback: Whisper via /api/stt — only on localhost (getUserMedia blocked on LAN non-HTTPS)

// WAV encoder — kept as optional fallback for localhost
function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const left = audioBuffer.getChannelData(0)
  let channelData = left
  if (audioBuffer.numberOfChannels > 1) {
    const right = audioBuffer.getChannelData(1)
    channelData = new Float32Array(left.length)
    for (let i = 0; i < left.length; i++) channelData[i] = (left[i] + right[i]) / 2
  }
  const length = channelData.length * 2
  const buffer = new ArrayBuffer(44 + length)
  const view = new DataView(buffer)
  const ws = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
  ws(0, 'RIFF'); view.setUint32(4, 36 + length, true)
  ws(8, 'WAVE'); ws(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true)
  ws(36, 'data'); view.setUint32(40, length, true)
  let offset = 44
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : never

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message: string
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  if ('SpeechRecognition' in window) return window.SpeechRecognition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ('webkitSpeechRecognition' in window) return (window as any).webkitSpeechRecognition
  return null
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // --- Whisper fallback (localhost only) ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'

  // --- PRIMARY: Web Speech API ---
  const startWithWebSpeech = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition()
    if (!SpeechRecognitionCtor) {
      console.warn('[useVoiceInput] Web Speech API not available in this browser')
      return false
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'it-IT'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsRecording(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim()
          if (transcript) {
            onTranscript(transcript)
          }
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[useVoiceInput] SpeechRecognition error:', event.error, event.message)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
      recognitionRef.current = null
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      return true
    } catch (e) {
      console.error('[useVoiceInput] Failed to start SpeechRecognition:', e)
      return false
    }
  }, [onTranscript])

  // --- FALLBACK: Whisper via MediaRecorder (localhost only) ---
  const startWithWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        setIsProcessing(true)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const arrayBuf = await blob.arrayBuffer()
          const audioCtx = new AudioContext()
          const decoded = await audioCtx.decodeAudioData(arrayBuf)
          audioCtx.close()
          const wav = encodeWAV(decoded)
          const formData = new FormData()
          formData.append('audio', new Blob([wav], { type: 'audio/wav' }), 'recording.wav')
          const res = await fetch('/api/stt', { method: 'POST', body: formData })
          if (res.ok) {
            const data = await res.json() as { text: string }
            if (data.text?.trim()) onTranscript(data.text.trim())
          }
        } catch (e) {
          console.error('[useVoiceInput] Whisper STT failed:', e)
        }
        setIsProcessing(false)
      }
      mr.start(100)
      mediaRecorderRef.current = mr
      setIsRecording(true)
    } catch (e) {
      console.error('[useVoiceInput] mic access failed (Whisper fallback):', e)
    }
  }, [onTranscript])

  const startRecording = useCallback(async () => {
    // Try Web Speech API first (works on LAN without HTTPS)
    const webSpeechStarted = startWithWebSpeech()
    if (webSpeechStarted) return

    // Fallback: Whisper only on localhost (getUserMedia blocked on LAN non-HTTPS)
    if (isLocalhost) {
      await startWithWhisper()
    } else {
      console.warn('[useVoiceInput] No speech input available: Web Speech API unsupported and not on localhost for Whisper fallback')
    }
  }, [startWithWebSpeech, startWithWhisper, isLocalhost])

  const stopRecording = useCallback(() => {
    // Stop Web Speech
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    // Stop Whisper fallback
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setIsRecording(false)
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording()
    else void startRecording()
  }, [isRecording, startRecording, stopRecording])

  return { isRecording, isProcessing, startRecording, stopRecording, toggleRecording }
}
