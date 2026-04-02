'use client'

import { useRef, useEffect } from 'react'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:           '#00000a',
  bgPanel:      'rgba(0,0,10,0.95)',
  borderCyan:   'rgba(0,245,255,0.15)',
  cyan:         '#00f5ff',
  purple:       '#7c3aed',
  amber:        '#f59e0b',
  textPrimary:  '#e2e8f0',
  textDim:      'rgba(0,245,255,0.45)',
  red:          '#ff3b3b',
  green:        '#00ff9f',
  font:         "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
}

const GLOBAL_STYLES = `
  @keyframes micPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,59,0.6); }
    50%       { box-shadow: 0 0 0 8px rgba(255,59,59,0); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
`

type Message = {
  role: 'user' | 'emilio' | 'system'
  content: string
  emotion?: string
  timestamp: number
}

interface ChatPanelProps {
  messages: Message[]
  isLoading: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onReset: () => void
  isRecording?: boolean
  onToggleRecording?: () => void
  activeApp?: string | null
  ondeFlowMode?: 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE'
}

export default function ChatPanel({
  messages,
  isLoading,
  inputValue,
  onInputChange,
  onSubmit,
  onReset,
  isRecording = false,
  onToggleRecording,
  activeApp,
  ondeFlowMode = 'IDLE',
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const emotionEmoji: Record<string, string> = {
    excited: '✨', thinking: '💭', proud: '🎯',
    focused: '🔍', relaxed: '🌊', happy: '😄', neutral: ''
  }

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{
        width: '40%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.bgPanel,
        borderLeft: `1px solid ${C.borderCyan}`,
        fontFamily: C.font,
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${C.borderCyan}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ color: C.cyan, fontSize: 12, letterSpacing: 2 }}>
              ONDE-FLOW // EMILIO
            </div>
            <div style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>
              {ondeFlowMode === 'CODER_ACTIVE' ? '⚡ CODER ACTIVE' :
               ondeFlowMode === 'EMILIO_ACTIVE' ? '🟢 LISTENING' : '○ IDLE'}
              {activeApp && ` · 📂 ${activeApp.toUpperCase()}`}
            </div>
          </div>
          <button
            onClick={onReset}
            style={{
              background: 'transparent', border: `1px solid ${C.borderCyan}`,
              color: C.textDim, borderRadius: 4, padding: '3px 8px',
              fontSize: 10, cursor: 'pointer', letterSpacing: 1
            }}
          >
            RESET
          </button>
        </div>

        {/* ── Coder Active Banner ── */}
        {ondeFlowMode === 'CODER_ACTIVE' && (
          <div style={{
            padding: '8px 16px',
            background: 'rgba(245,158,11,0.08)',
            borderBottom: `1px solid rgba(245,158,11,0.3)`,
            color: C.amber, fontSize: 11, letterSpacing: 1,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <div style={{ animation: 'spin 2s linear infinite', display: 'inline-block' }}>⚡</div>
            CODER ACTIVE — speak to interrupt
          </div>
        )}

        {/* ── Messages ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                <div key={i} style={{
                  color: 'rgba(255,255,255,0.35)', fontSize: 10,
                  textAlign: 'center', letterSpacing: 1, padding: '4px 0',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {msg.content}
                </div>
              )
            }

            const isUser = msg.role === 'user'
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '88%',
                  background: isUser
                    ? 'rgba(0,245,255,0.08)'
                    : 'rgba(124,58,237,0.1)',
                  border: `1px solid ${isUser ? 'rgba(0,245,255,0.2)' : 'rgba(124,58,237,0.25)'}`,
                  borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '8px 12px',
                  color: C.textPrimary,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}>
                  {msg.content}
                </div>
                {msg.emotion && !isUser && (
                  <span style={{ fontSize: 10, color: C.textDim, marginTop: 2, paddingLeft: 4 }}>
                    {emotionEmoji[msg.emotion] || ''} {msg.emotion}
                  </span>
                )}
              </div>
            )
          })}

          {/* Loading dots */}
          {isLoading && (
            <div style={{
              display: 'flex', gap: 4, padding: '8px 4px'
            }}>
              {[0, 1, 2].map(d => (
                <div key={d} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.purple,
                  animation: `blink 1.2s ease-in-out ${d * 0.2}s infinite`
                }} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <form onSubmit={onSubmit} style={{
          padding: '10px 12px',
          borderTop: `1px solid ${C.borderCyan}`,
          display: 'flex', gap: 8, alignItems: 'center',
          flexShrink: 0,
        }}>
          {/* Mic button */}
          {onToggleRecording && (
            <button
              type="button"
              onClick={onToggleRecording}
              style={{
                background: isRecording ? 'rgba(255,50,50,0.2)' : 'transparent',
                border: `1px solid ${isRecording ? C.red : C.borderCyan}`,
                color: isRecording ? C.red : C.textDim,
                borderRadius: 6, width: 36, height: 36, fontSize: 16,
                cursor: 'pointer', flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                animation: isRecording ? 'micPulse 1s infinite' : 'none'
              }}
            >
              {isRecording ? '⏹' : '🎙'}
            </button>
          )}

          <input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type or use 🎙 to speak..."
            disabled={isLoading}
            style={{
              flex: 1, background: 'rgba(0,245,255,0.04)',
              border: `1px solid ${C.borderCyan}`,
              borderRadius: 6, padding: '8px 12px',
              color: C.textPrimary, fontSize: 13,
              fontFamily: C.font, outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit(e as any)
              }
            }}
          />

          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            style={{
              background: isLoading ? 'transparent' : 'rgba(0,245,255,0.1)',
              border: `1px solid ${C.borderCyan}`,
              color: C.cyan, borderRadius: 6, padding: '8px 14px',
              fontSize: 13, cursor: isLoading ? 'not-allowed' : 'pointer',
              letterSpacing: 1, flexShrink: 0,
              opacity: (!inputValue.trim() || isLoading) ? 0.4 : 1
            }}
          >
            {isLoading ? '...' : 'SEND'}
          </button>
        </form>

      </div>
    </>
  )
}
