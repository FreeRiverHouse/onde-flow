'use client'

// === FILE: src/app/emilio/components/ChatPanel.tsx ===
// Holographic dark cyberpunk-chill chat interface

import { useRef, useEffect } from 'react'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:           '#00000a',
  bgPanel:      'rgba(0,0,10,0.92)',
  borderCyan:   'rgba(0,245,255,0.15)',
  borderPurple: 'rgba(124,58,237,0.3)',
  cyan:         '#00f5ff',
  purple:       '#7c3aed',
  amber:        '#f59e0b',
  textPrimary:  '#e2e8f0',
  textDim:      'rgba(0,245,255,0.45)',
  red:          '#ff3b3b',
  green:        '#00ff9f',
  font:         "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
} as const

// ─── Injected global styles (scanline + glitch + pulse keyframes) ──────────────
const GLOBAL_STYLES = `
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes micPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,59,0.6); }
    50%       { box-shadow: 0 0 0 8px rgba(255,59,59,0); }
  }
  @keyframes cyanPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,245,255,0.4); }
    50%       { box-shadow: 0 0 0 6px rgba(0,245,255,0); }
  }
  @keyframes borderGlow {
    0%, 100% { border-color: rgba(0,245,255,0.15); }
    50%       { border-color: rgba(0,245,255,0.4); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`

// ─── Types ─────────────────────────────────────────────────────────────────────
type EmilioBackend = 'opus-distill' | 'sonnet' | 'coder'

interface ChatPanelProps {
  messages: Array<{ role: 'user' | 'shopkeeper' | 'system' | 'bot'; content: string; emotion?: string }>
  isLoading: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onReset: () => void
  activeApp: string | null
  ondeFlowMode: 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE'
  currentBackend: EmilioBackend
  onSwitchBackend: (b: EmilioBackend) => void
  isSwitchingBackend: boolean
  isGPRunning: boolean
  gpStep: number
  gpTotal: number
  onRunGP: () => void
  onStopGP: () => void
  isVoiceRecording?: boolean
  isVoiceProcessing?: boolean
  onToggleVoice?: () => void
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function BackendPill({
  label, backend, currentBackend, onSwitchBackend, isSwitchingBackend
}: {
  label: string
  backend: EmilioBackend
  currentBackend: EmilioBackend
  onSwitchBackend: (b: EmilioBackend) => void
  isSwitchingBackend: boolean
}) {
  const isActive = currentBackend === backend
  return (
    <button
      onClick={() => onSwitchBackend(backend)}
      disabled={isSwitchingBackend}
      style={{
        background: isActive ? `rgba(0,245,255,0.12)` : 'transparent',
        border: `1px solid ${isActive ? C.cyan : 'rgba(0,245,255,0.18)'}`,
        color: isActive ? C.cyan : 'rgba(0,245,255,0.35)',
        fontSize: 9,
        padding: '2px 7px',
        borderRadius: 3,
        cursor: isSwitchingBackend ? 'not-allowed' : 'pointer',
        fontFamily: C.font,
        letterSpacing: 1,
        opacity: isSwitchingBackend ? 0.5 : 1,
        transition: 'all 0.2s',
        boxShadow: isActive ? `0 0 6px rgba(0,245,255,0.3)` : 'none',
      }}
    >
      {label}
    </button>
  )
}

function ModeBadge({ mode }: { mode: 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE' }) {
  const color = mode === 'EMILIO_ACTIVE' ? C.green : mode === 'CODER_ACTIVE' ? C.amber : 'rgba(100,116,139,0.8)'
  const label = mode === 'EMILIO_ACTIVE' ? 'EMILIO' : mode === 'CODER_ACTIVE' ? 'CODER' : 'IDLE'
  return (
    <span style={{ color, fontSize: 10, letterSpacing: 2, fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
      {label}
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ChatPanel({
  messages,
  isLoading,
  inputValue,
  onInputChange,
  onSubmit,
  onReset,
  activeApp,
  ondeFlowMode,
  currentBackend,
  onSwitchBackend,
  isSwitchingBackend,
  isGPRunning,
  gpStep,
  gpTotal,
  onRunGP,
  onStopGP,
  isVoiceRecording = false,
  isVoiceProcessing = false,
  onToggleVoice,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <>
      {/* Inject keyframe styles once */}
      <style>{GLOBAL_STYLES}</style>

      <div style={{
        width: '40%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        borderLeft: `1px solid ${C.borderCyan}`,
        fontFamily: C.font,
        overflow: 'hidden',
        position: 'relative',
        backdropFilter: 'blur(8px)',
        boxShadow: `inset -1px 0 0 rgba(0,245,255,0.06)`,
      }}>

        {/* Scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: '2px',
            background: 'linear-gradient(transparent, rgba(0,245,255,0.04), transparent)',
            animation: 'scanline 6s linear infinite',
          }} />
        </div>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 16px 10px',
          borderBottom: `1px solid ${C.borderCyan}`,
          background: 'rgba(0,245,255,0.02)',
          animation: 'borderGlow 4s ease-in-out infinite',
        }}>
          {/* Brand */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: C.cyan, fontSize: 13, letterSpacing: 4, fontWeight: 700 }}>
              ONDE-FLOW // AI FACTORY
            </div>
            <div style={{ color: C.textDim, fontSize: 9, letterSpacing: 3, marginTop: 2 }}>
              DIRECT INTERFACE v3.0 // {ondeFlowMode}
            </div>
          </div>

          {/* Backend switcher row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <BackendPill label="OPUS" backend="opus-distill" currentBackend={currentBackend} onSwitchBackend={onSwitchBackend} isSwitchingBackend={isSwitchingBackend} />
              <BackendPill label="SONNET" backend="sonnet" currentBackend={currentBackend} onSwitchBackend={onSwitchBackend} isSwitchingBackend={isSwitchingBackend} />
              <BackendPill label="CODER" backend="coder" currentBackend={currentBackend} onSwitchBackend={onSwitchBackend} isSwitchingBackend={isSwitchingBackend} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* GP button */}
              <button
                onClick={isGPRunning ? onStopGP : onRunGP}
                style={{
                  background: 'transparent',
                  border: `1px solid ${isGPRunning ? C.red : 'rgba(0,245,255,0.2)'}`,
                  color: isGPRunning ? C.red : 'rgba(0,245,255,0.55)',
                  fontSize: 9,
                  padding: '2px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontFamily: C.font,
                  letterSpacing: 1,
                }}
              >
                {isGPRunning ? `◈ ${gpStep}/${gpTotal}` : '◈ GP'}
              </button>
              <ModeBadge mode={ondeFlowMode} />
            </div>
          </div>

          {/* Active app tag */}
          {activeApp && (
            <div style={{
              display: 'inline-block',
              background: 'rgba(0,245,255,0.06)',
              border: `1px solid rgba(0,245,255,0.25)`,
              borderRadius: 3,
              fontSize: 9,
              padding: '2px 8px',
              marginTop: 6,
              color: C.cyan,
              letterSpacing: 2,
            }}>
              APP // {activeApp.toUpperCase()}
            </div>
          )}
        </div>

        {/* ── Banners ─────────────────────────────────────────────────────────── */}
        {isSwitchingBackend && (
          <div style={{
            background: 'rgba(0,245,255,0.06)',
            color: C.cyan,
            fontSize: 10,
            padding: '7px 16px',
            textAlign: 'center',
            letterSpacing: 2,
            borderBottom: `1px solid ${C.borderCyan}`,
          }}>
            ◈ SWITCHING MODEL...
          </div>
        )}

        {ondeFlowMode === 'CODER_ACTIVE' && (
          <div style={{
            background: 'rgba(245,158,11,0.06)',
            border: 'none',
            borderBottom: `1px solid rgba(245,158,11,0.25)`,
            color: C.amber,
            fontSize: 10,
            padding: '7px 16px',
            textAlign: 'center',
            letterSpacing: 2,
          }}>
            ⬡ CODER ACTIVE — AUTONOMOUS MODE
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,245,255,0.15) transparent',
        }}>
          {messages.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} style={{
                  alignSelf: 'flex-end',
                  background: 'rgba(124,58,237,0.1)',
                  border: '1px solid rgba(124,58,237,0.35)',
                  borderRadius: '10px 10px 2px 10px',
                  padding: '8px 12px',
                  fontSize: 12,
                  color: C.textPrimary,
                  maxWidth: '78%',
                  lineHeight: 1.5,
                  boxShadow: '0 0 8px rgba(124,58,237,0.15)',
                }}>
                  {m.content}
                </div>
              )
            }

            if (m.role === 'shopkeeper') {
              return (
                <div key={i} style={{
                  alignSelf: 'flex-start',
                  background: 'rgba(0,245,255,0.05)',
                  border: `1px solid rgba(0,245,255,0.2)`,
                  borderRadius: '2px 10px 10px 10px',
                  padding: '8px 12px',
                  fontSize: 12,
                  color: C.textPrimary,
                  maxWidth: '83%',
                  lineHeight: 1.5,
                  boxShadow: '0 0 8px rgba(0,245,255,0.08)',
                }}>
                  <span style={{ color: C.cyan, marginRight: 6, fontSize: 11 }}>◈</span>
                  {m.content}
                </div>
              )
            }

            if (m.role === 'bot') {
              return (
                <div key={i} style={{
                  alignSelf: 'flex-end',
                  background: 'rgba(124,58,237,0.06)',
                  border: '1px dashed rgba(124,58,237,0.4)',
                  borderRadius: '10px 10px 2px 10px',
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#c4b5fd',
                  maxWidth: '78%',
                  lineHeight: 1.5,
                }}>
                  {m.content}
                </div>
              )
            }

            // system
            return (
              <div key={i} style={{
                alignSelf: 'center',
                color: 'rgba(0,255,159,0.6)',
                fontSize: 10,
                letterSpacing: 1,
                fontStyle: 'italic',
                padding: '2px 0',
              }}>
                {m.content}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input form ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 14px 12px',
          borderTop: `1px solid ${C.borderCyan}`,
          background: 'rgba(0,245,255,0.015)',
        }}>
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Mic button */}
            {onToggleVoice && (
              <button
                type="button"
                onClick={onToggleVoice}
                title={isVoiceRecording ? 'Stop recording' : 'Start voice input'}
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isVoiceRecording
                    ? 'rgba(255,59,59,0.15)'
                    : isVoiceProcessing
                      ? 'rgba(245,158,11,0.1)'
                      : 'rgba(0,245,255,0.05)',
                  border: `1px solid ${isVoiceRecording ? C.red : isVoiceProcessing ? C.amber : 'rgba(0,245,255,0.25)'}`,
                  color: isVoiceRecording ? C.red : isVoiceProcessing ? C.amber : C.cyan,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isVoiceRecording ? 'micPulse 1s ease-in-out infinite' : isVoiceProcessing ? 'spin 1s linear infinite' : 'none',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              >
                {isVoiceProcessing ? '◌' : isVoiceRecording ? '●' : '⬡'}
              </button>
            )}

            {/* Text input */}
            <input
              type="text"
              value={inputValue}
              onChange={e => onInputChange(e.target.value)}
              placeholder={
                isVoiceRecording
                  ? '● listening...'
                  : isVoiceProcessing
                    ? '◌ processing...'
                    : 'speak or type...'
              }
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'rgba(0,0,10,0.7)',
                border: `1px solid ${isVoiceRecording ? 'rgba(255,59,59,0.4)' : 'rgba(0,245,255,0.2)'}`,
                borderRadius: 4,
                padding: '8px 12px',
                color: C.textPrimary,
                fontSize: 12,
                fontFamily: C.font,
                outline: 'none',
                letterSpacing: 0.5,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = C.cyan
                e.currentTarget.style.boxShadow = `0 0 8px rgba(0,245,255,0.2)`
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = isVoiceRecording ? 'rgba(255,59,59,0.4)' : 'rgba(0,245,255,0.2)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />

            {/* Send */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                flexShrink: 0,
                background: isLoading ? 'rgba(0,245,255,0.05)' : 'rgba(0,245,255,0.12)',
                color: isLoading ? 'rgba(0,245,255,0.35)' : C.cyan,
                border: `1px solid ${isLoading ? 'rgba(0,245,255,0.15)' : 'rgba(0,245,255,0.4)'}`,
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: C.font,
                letterSpacing: 2,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: isLoading ? 'none' : `0 0 8px rgba(0,245,255,0.2)`,
                transition: 'all 0.2s',
              }}
            >
              SEND
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={onReset}
              style={{
                flexShrink: 0,
                background: 'transparent',
                color: 'rgba(0,245,255,0.3)',
                border: '1px solid rgba(0,245,255,0.12)',
                borderRadius: 4,
                padding: '8px 8px',
                fontSize: 10,
                fontFamily: C.font,
                letterSpacing: 1,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.cyan; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,245,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.12)' }}
            >
              RST
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
