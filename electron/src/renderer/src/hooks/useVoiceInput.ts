import { useRef, useState, useCallback, useEffect } from 'react'

// WAV encoder (PCM 16-bit, mono)
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

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [interimText, setInterimText] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Fn key listener from main process
  useEffect(() => {
    if (window.api?.onToggleRecording) {
      window.api.onToggleRecording((active) => {
        if (active) void startListening()
        else stopListening()
      })
    }
    return () => {
      window.api?.removeToggleRecording?.()
    }
  }, [])

  const startListening = useCallback(async () => {
    if (isRecording || isProcessing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
      streamRef.current = stream

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setIsRecording(false)
        setIsProcessing(true)
        setInterimText('⏳ Transcribing...')

        try {
          const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
          const arrayBuf = await blob.arrayBuffer()
          const audioCtx = new AudioContext()
          const decoded = await audioCtx.decodeAudioData(arrayBuf)
          audioCtx.close()
          const wav = encodeWAV(decoded)

          // Use Electron IPC to send to Whisper (not Next.js API)
          if (window.api?.sendAudioToMain) {
            const text = await window.api.sendAudioToMain(wav)
            if (text?.trim()) {
              setInterimText('')
              onTranscript(text.trim())
            } else {
              setInterimText('')
            }
          }
        } catch (e) {
          console.error('[voice] STT failed:', e)
          setInterimText('⚠️ STT error')
          setTimeout(() => setInterimText(''), 3000)
        }
        setIsProcessing(false)
      }

      mr.start(100)
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setInterimText('🎙 Listening...')
    } catch (e) {
      console.error('[voice] mic access failed:', e)
    }
  }, [isRecording, isProcessing, onTranscript])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) stopListening()
    else void startListening()
  }, [isRecording, startListening, stopListening])

  return {
    isRecording,
    isListening: isRecording,
    isProcessing,
    interimText,
    startListening,
    stopListening,
    toggleRecording,
  }
}
