import { useState, useCallback, useRef, useEffect } from 'react'

export function useTTS() {
  const [ttsReady, setTtsReady] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Check TTS status
    if (window.api?.ttsReady) {
      window.api.ttsReady().then(setTtsReady).catch(() => setTtsReady(false))
    }
    if (window.api?.onTTSStatus) {
      window.api.onTTSStatus((status) => {
        setTtsReady(status === 'ready')
      })
    }
    return () => {
      window.api?.removeTTSStatus?.()
    }
  }, [])

  const speak = useCallback(async (text: string, emotion?: string): Promise<void> => {
    if (!text.trim()) return

    // Stop current speech
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(true)

    try {
      if (ttsReady && window.api?.ttsSpeak) {
        // Use VibeVoice TTS (high quality, local)
        const audioBuffer: ArrayBuffer = await window.api.ttsSpeak(text, emotion)
        const blob = new Blob([audioBuffer], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(url)
            resolve()
          }
          audio.onerror = reject
          audio.play().catch(reject)
        })
      } else {
        // Fallback: speechSynthesis (browser TTS)
        await speakWithBrowserTTS(text, emotion)
      }
    } catch (err) {
      console.error('[TTS] Error:', err)
      // Last resort fallback
      try {
        await speakWithBrowserTTS(text, emotion)
      } catch {
        // silently ignore
      }
    } finally {
      setIsSpeaking(false)
      audioRef.current = null
    }
  }, [ttsReady])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  return { ttsReady, isSpeaking, speak, stop }
}

async function speakWithBrowserTTS(text: string, emotion?: string): Promise<void> {
  if (!window.speechSynthesis) return

  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)

    // Emotion-based voice tuning
    switch (emotion) {
      case 'excited':
      case 'happy':
        utterance.rate = 1.2
        utterance.pitch = 1.2
        break
      case 'thinking':
        utterance.rate = 0.9
        utterance.pitch = 0.9
        break
      case 'proud':
        utterance.rate = 0.95
        utterance.pitch = 1.05
        break
      case 'focused':
        utterance.rate = 1.0
        utterance.pitch = 1.0
        break
      case 'relaxed':
        utterance.rate = 0.85
        utterance.pitch = 0.9
        break
      default:
        utterance.rate = 1.0
        utterance.pitch = 1.0
    }

    utterance.volume = 0.9
    utterance.lang = 'en-US'
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}
