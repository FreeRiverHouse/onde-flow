'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import ChatPanel from './components/ChatPanel';
import SpeechBubble from './components/SpeechBubble';
import { useOceanAudio } from './hooks/useOceanAudio';
import { useVoiceInput } from './hooks/useVoiceInput';

const OceanCanvas = dynamic(() => import('./OceanCanvas'), { ssr: false });

type Message = {
  role: 'user' | 'shopkeeper' | 'system' | 'bot';
  content: string;
  emotion?: string
};
type OndeFlowMode = 'EMILIO_ACTIVE' | 'CODER_ACTIVE' | 'IDLE';
type EmilioBackend = 'opus-distill' | 'sonnet' | 'coder';

const GP_SCRIPT = [
  'Hey Emilio! What projects do we have going on right now?',
  "Give me the status of game-studio — where are we at?",
  'I want to add an achievements system to the game',
  "What about book-wizard? How's the EPUB pipeline coming along?",
  "Ok, let's focus on game-studio for now",
  "Perfect Emilio, send the Coder to work on game-studio with the tasks you have in mind"
];

export default function EmilioPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role:'shopkeeper', content:"Hey! I'm Emilio, your Onde-Flow concierge. What are we working on today?", emotion:'excited' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [ondeFlowMode, setOndeFlowMode] = useState<OndeFlowMode>('IDLE');
  const [lastEmotion, setLastEmotion] = useState('excited');

  const [currentBackend, setCurrentBackend] = useState<EmilioBackend>('sonnet');
  const [isSwitchingBackend, setIsSwitchingBackend] = useState(false);
  const [isGPRunning, setIsGPRunning] = useState(false);
  const [gpStep, setGPStep] = useState(0);
  const gpAbortRef = useRef(false);
  const currentAudioRef = useRef<AudioBufferSourceNode | null>(null);
  const currentAudioCtxRef = useRef<AudioContext | null>(null);
  const [startMode, setStartMode] = useState<'user' | 'bot' | null>('user');

  useEffect(() => {
    if (startMode === 'bot') {
      const timer = setTimeout(() => runGPTest(), 1500);
      return () => clearTimeout(timer);
    }
  }, [startMode]);

  const { enabled, toggle: toggleAudio } = useOceanAudio();

  const { isListening, interimText, isRecording: isVoiceRecording, isProcessing: isVoiceProcessing, startListening, stopListening } = useVoiceInput(
    (text) => { void sendToEmilio(text) },
    { paused: isLoading }
  );

  const speakFallback = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US'; utt.rate = 1.05; utt.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang === 'en-US' && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')));
      if (preferred) utt.voice = preferred;
      utt.onend = () => resolve(); utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    });
  }

  const stopCurrentAudio = () => {
    try { currentAudioRef.current?.stop(); } catch {}
    try { currentAudioCtxRef.current?.close(); } catch {}
    currentAudioRef.current = null;
    currentAudioCtxRef.current = null;
    window.speechSynthesis?.cancel();
  }

  const playTTS = async (text: string): Promise<void> => {
    stopCurrentAudio();
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { await speakFallback(text); return; }
      const audioData = await res.arrayBuffer()
      const audioCtx = new AudioContext()
      const audioBuffer = await audioCtx.decodeAudioData(audioData)
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtx.destination)
      currentAudioRef.current = source;
      currentAudioCtxRef.current = audioCtx;
      await new Promise<void>((resolve) => {
        source.onended = () => { audioCtx.close(); currentAudioRef.current = null; resolve(); }
        source.start()
      })
    } catch {
      await speakFallback(text);
    }
  }

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/onde-flow/state');
        const data = await res.json();
        setActiveApp(data.activeApp);
        setOndeFlowMode(data.mode);
      } catch (error) {
        console.error('Failed to fetch state:', error);
      }
    };
    fetchState();
  }, []);

  async function handleSwitchBackend(b: EmilioBackend) {
    setIsSwitchingBackend(true);
    try {
      await fetch('/api/emilio/switch-backend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: b })
      });
      setCurrentBackend(b);
    } catch { /* ignora */ }
    setIsSwitchingBackend(false);
  }

  async function runGPTest() {
    gpAbortRef.current = false;
    setIsGPRunning(true);
    setGPStep(0);
    await fetch('/api/shop/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '__reset__' })
    });
    setMessages([{ role: 'system', content: '🐹 Guinea Pig started — ' + GP_SCRIPT.length + ' messages queued' }]);
    for (let i = 0; i < GP_SCRIPT.length; i++) {
      if (gpAbortRef.current) break;
      setGPStep(i + 1);
      let botMsg: string
      let fromLocal = false
      try {
        const history = messages
          .filter(m => m.role === 'bot' || m.role === 'shopkeeper')
          .map(m => m.content)
          .slice(-6)
        const gpRes = await fetch('/api/emilio/gp-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: i + 1,
            totalSteps: GP_SCRIPT.length,
            history,
            context: 'User testing Onde-Flow creative OS with Emilio the concierge'
          })
        })
        const gpData = await gpRes.json() as { message: string; fromLocal: boolean }
        botMsg = gpData.message
        fromLocal = gpData.fromLocal
      } catch {
        botMsg = GP_SCRIPT[i]
      }
      const prefix = fromLocal ? '🤖 ' : '🐹 '
      setMessages(prev => [...prev, { role: 'bot', content: prefix + botMsg }])
      void playTTS(botMsg);
      if (gpAbortRef.current) break;
      setIsLoading(true);
      try {
        const res = await fetch('/api/shop/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: botMsg, clientAudio: true })
        });
        const data = await res.json();
        const emilioReply: string = data.reply || '...';
        setMessages(prev => [...prev, { role: 'shopkeeper', content: emilioReply, emotion: data.emotion }]);
        setLastEmotion(data.emotion || 'neutral');
        void playTTS(emilioReply);
        if (data.action === 'start_coder' && data.coderPayload) {
          await fetch('/api/onde-flow/state', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startCoder: data.coderPayload })
          });
          setOndeFlowMode('CODER_ACTIVE');
          setMessages(prev => [...prev, { role: 'system', content: '⚡ Coder started by GP test' }]);
        }
      } catch {
        setMessages(prev => [...prev, { role: 'system', content: 'Error step ' + (i + 1) }]);
      }
      setIsLoading(false);
      await new Promise(r => setTimeout(r, 500));
    }
    setIsGPRunning(false);
    setMessages(prev => [...prev, { role: 'system', content: '🐹 GP Test complete!' }]);
  }

  function stopGPTest() { gpAbortRef.current = true; stopCurrentAudio(); }

  const sendToEmilio = async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return;
    setMessages(prev => [...prev, { role:'user', content:userMsg }]);
    setIsLoading(true);
    try {
      if (ondeFlowMode === 'CODER_ACTIVE') {
        await fetch('/api/onde-flow/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ mode:'EMILIO_ACTIVE' }) });
        await fetch('/api/loop/stop', { method:'POST' });
        setOndeFlowMode('EMILIO_ACTIVE');
      }
      const res = await fetch('/api/shop/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:userMsg, clientAudio:true }) });
      const data = await res.json();
      const emilioReply: string = data.reply || '...';
      setMessages(prev => [...prev, { role:'shopkeeper', content:emilioReply, emotion:data.emotion }]);
      setLastEmotion(data.emotion || 'neutral');
      void playTTS(emilioReply);
      if (data.action === 'start_coder' && data.coderPayload) {
        await fetch('/api/onde-flow/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ startCoder: data.coderPayload }) });
        setOndeFlowMode('CODER_ACTIVE');
        setMessages(prev => [...prev, { role:'system', content:'⚡ Coder started — working...' }]);
      } else if (data.action === 'switch_app' && data.switchApp) {
        await fetch('/api/onde-flow/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ activeApp: data.switchApp }) });
        setActiveApp(data.switchApp);
      }
    } catch {
      setMessages(prev => [...prev, { role:'system', content:'Errore connessione Emilio' }]);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = inputValue.trim();
    if (!msg) return;
    setInputValue('');
    await sendToEmilio(msg);
  };

  const handleReset = async () => {
    try {
      await fetch('/api/shop/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ message:'__reset__' })
      });
      setMessages([{ role:'shopkeeper', content:'Conversation reset. Ready!', emotion:'neutral' }]);
    } catch {
      setMessages(prev => [...prev, { role:'system', content:'Errore durante il reset' }]);
    }
  };

  if (startMode === null) {
    // Generate star field deterministically to avoid SSR hydration mismatch
    const STARS = Array.from({ length: 80 }, (_, i) => ({
      left: ((i * 137.5) % 100).toFixed(2) + '%',
      top:  ((i * 97.3)  % 100).toFixed(2) + '%',
      size: (0.5 + (i % 4) * 0.4).toFixed(1) + 'px',
      opacity: (0.2 + (i % 5) * 0.12).toFixed(2),
    }));

    return (
      <>
        <style>{`
          @keyframes glitch {
            0%,100% { text-shadow: 0 0 8px #00f5ff, 0 0 20px #00f5ff; transform: none; }
            20%      { text-shadow: -2px 0 #ff00aa, 2px 0 #00f5ff; transform: skewX(-1deg); }
            40%      { text-shadow: 2px 0 #7c3aed, -2px 0 #00f5ff; transform: skewX(1deg); }
            60%      { text-shadow: 0 0 8px #00f5ff, 0 0 20px #00f5ff; transform: none; }
          }
          @keyframes borderSpin {
            0%   { border-color: rgba(0,245,255,0.2); box-shadow: 0 0 0 rgba(0,245,255,0); }
            50%  { border-color: rgba(0,245,255,0.6); box-shadow: 0 0 18px rgba(0,245,255,0.2); }
            100% { border-color: rgba(0,245,255,0.2); box-shadow: 0 0 0 rgba(0,245,255,0); }
          }
          @keyframes borderSpinPurple {
            0%   { border-color: rgba(124,58,237,0.2); box-shadow: 0 0 0 rgba(124,58,237,0); }
            50%  { border-color: rgba(124,58,237,0.6); box-shadow: 0 0 18px rgba(124,58,237,0.2); }
            100% { border-color: rgba(124,58,237,0.2); box-shadow: 0 0 0 rgba(124,58,237,0); }
          }
          @keyframes blink {
            0%,100% { opacity:1; } 50% { opacity:0; }
          }
          .boot-card-cyan:hover {
            background: rgba(0,245,255,0.09) !important;
            transform: translateY(-2px);
          }
          .boot-card-purple:hover {
            background: rgba(124,58,237,0.09) !important;
            transform: translateY(-2px);
          }
        `}</style>

        <main style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh',
          background: '#000008',
          fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Star field */}
          {STARS.map((s, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: s.left, top: s.top,
              width: s.size, height: s.size,
              borderRadius: '50%',
              background: '#ffffff',
              opacity: Number(s.opacity),
              pointerEvents: 'none',
            }} />
          ))}

          {/* Title block */}
          <div style={{ textAlign: 'center', marginBottom: 56, position: 'relative', zIndex: 1 }}>
            <div style={{
              color: '#00f5ff',
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: 12,
              animation: 'glitch 5s ease-in-out infinite',
              lineHeight: 1,
              marginBottom: 12,
            }}>
              ONDE-FLOW
            </div>
            <div style={{ color: 'rgba(0,245,255,0.45)', fontSize: 10, letterSpacing: 5, marginBottom: 4 }}>
              AI FACTORY SYSTEM v3.0
            </div>
            <div style={{ color: 'rgba(0,245,255,0.3)', fontSize: 10, letterSpacing: 4 }}>
              INITIALIZING
              <span style={{ animation: 'blink 1s step-start infinite' }}>_</span>
            </div>
          </div>

          {/* Mode cards */}
          <div style={{ display: 'flex', gap: 28, position: 'relative', zIndex: 1 }}>
            {/* Card 1: Talk to Emilio — cyan */}
            <button
              onClick={() => {
                setStartMode('user')     // navigate immediately
                void startListening()    // mic request — user gesture still valid
              }}
              className="boot-card-cyan"
              style={{
                background: 'rgba(0,245,255,0.04)',
                border: '1px solid rgba(0,245,255,0.3)',
                borderRadius: 6,
                padding: '32px 44px',
                cursor: 'pointer',
                color: '#00f5ff',
                fontFamily: 'inherit',
                textAlign: 'center',
                animation: 'borderSpin 3s ease-in-out infinite',
                transition: 'background 0.2s, transform 0.2s',
                outline: 'none',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 14, letterSpacing: 2 }}>⬡</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>TALK TO EMILIO</div>
              <div style={{ fontSize: 9, color: 'rgba(0,245,255,0.45)', letterSpacing: 2 }}>DIRECT INTERFACE</div>
            </button>

            {/* Card 2: Watch the Bot — purple */}
            <button
              onClick={() => setStartMode('bot')}
              className="boot-card-purple"
              style={{
                background: 'rgba(124,58,237,0.04)',
                border: '1px solid rgba(124,58,237,0.3)',
                borderRadius: 6,
                padding: '32px 44px',
                cursor: 'pointer',
                color: '#7c3aed',
                fontFamily: 'inherit',
                textAlign: 'center',
                animation: 'borderSpinPurple 3s ease-in-out infinite 1.5s',
                transition: 'background 0.2s, transform 0.2s',
                outline: 'none',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 14, letterSpacing: 2 }}>◈</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>WATCH THE BOT</div>
              <div style={{ fontSize: 9, color: 'rgba(124,58,237,0.45)', letterSpacing: 2 }}>AUTONOMOUS MODE</div>
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <main style={{ display:'flex', width:'100%', height:'100vh', overflow:'hidden', background:'#02020c' }}>
      <div style={{ position:'relative', width:'60%', height:'100%' }}>
        <OceanCanvas emotion={lastEmotion} />
        <SpeechBubble
          message={messages[messages.length-1]?.role==='shopkeeper' ? messages[messages.length-1].content : ''}
          emotion={lastEmotion}
          isLoading={isLoading}
        />
        <button
          onClick={toggleAudio}
          style={{
            position:'absolute', top:12, right:12,
            background:'rgba(0,0,0,0.5)', border:'1px solid rgba(0,212,255,0.3)',
            color:enabled?'#00d4ff':'#666', borderRadius:6,
            padding:'6px 10px', fontSize:11, cursor:'pointer', fontFamily:'monospace'
          }}
        >
          {enabled ? '🔊' : '🔇'}
        </button>
      </div>
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
        onReset={handleReset}
        activeApp={activeApp}
        ondeFlowMode={ondeFlowMode}
        currentBackend={currentBackend}
        onSwitchBackend={handleSwitchBackend}
        isSwitchingBackend={isSwitchingBackend}
        isGPRunning={isGPRunning}
        gpStep={gpStep}
        gpTotal={GP_SCRIPT.length}
        onRunGP={runGPTest}
        onStopGP={stopGPTest}
        isVoiceRecording={isVoiceRecording}
        isVoiceProcessing={isVoiceProcessing}
        onToggleVoice={() => isListening ? stopListening() : startListening()}
        isListening={isListening}
        interimText={interimText}
      />
    </main>
  );
}
