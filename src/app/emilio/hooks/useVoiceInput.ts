'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

// === FILE: src/app/emilio/hooks/useVoiceInput.ts ===
// Voice input using Web Speech API.
// Must be started via startListening() inside a user gesture (click handler).
// Auto-restarts after each utterance unless paused or stopListening() was called.

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

interface UseVoiceInputOptions {
  autoRestart?: boolean
  paused?: boolean
  lang?: string
}

export function useVoiceInput(
  onTranscript: (text: string) => void,
  options?: UseVoiceInputOptions
) {
  const { autoRestart = true, paused = false, lang = '' } = options ?? {}

  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const unmountedRef = useRef(false)
  const pausedRef = useRef(paused)
  const hasStartedRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  // Keep refs in sync with latest values
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const createAndStart = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition()
    if (!SpeechRecognitionCtor) {
      console.warn('[useVoiceInput] Web Speech API not available')
      return
    }
    if (unmountedRef.current || !hasStartedRef.current) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = true   // stay alive — no restart needed
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const transcript = result[0].transcript.trim()
          if (transcript) {
            onTranscriptRef.current(transcript)
            setInterimText('')
          }
        } else {
          interim += result[0].transcript
        }
      }
      if (interim) setInterimText(interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        // Silently restart — no speech detected in this segment
        return
      }
      console.error('[useVoiceInput] SpeechRecognition error:', event.error, event.message)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimText('')
      recognitionRef.current = null

      if (unmountedRef.current) return
      if (!hasStartedRef.current) return
      if (pausedRef.current) return
      if (!autoRestart) return

      // Auto-restart after 300ms
      restartTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current && hasStartedRef.current && !pausedRef.current) {
          createAndStart()
        }
      }, 300)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch (e) {
      console.error('[useVoiceInput] Failed to start SpeechRecognition:', e)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, autoRestart])

  // Handle paused changes: abort when paused, restart when unpaused (if hasStarted)
  useEffect(() => {
    if (paused) {
      // Cancel any pending restart
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
        recognitionRef.current = null
      }
      setIsListening(false)
      setInterimText('')
    } else {
      // Resume: restart only if hasStarted
      if (hasStartedRef.current && !unmountedRef.current) {
        createAndStart()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  // Cleanup on unmount
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
        recognitionRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // startListening: must be called inside a user gesture (click handler)
  const startListening = useCallback(() => {
    hasStartedRef.current = true
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
    createAndStart()
  }, [createAndStart])

  // stopListening: permanently stops until startListening() is called again
  const stopListening = useCallback(() => {
    hasStartedRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimText('')
  }, [])

  // toggleRecording: compatibility alias
  const toggleRecording = useCallback(() => {
    if (isListening || hasStartedRef.current) stopListening()
    else startListening()
  }, [isListening, stopListening, startListening])

  return {
    isListening,
    interimText,
    isProcessing: false,  // always false — compatibility
    startListening,
    stopListening,
    // Compatibility aliases for ChatPanel
    isRecording: isListening,
    toggleRecording,
  }
}
