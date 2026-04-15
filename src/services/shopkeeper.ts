// Emilio conversational backend — Ollama (gemma4-reap, port 11434)
// Replaces the old execFileSync('claude') approach which blocked the Node.js thread.

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-reap'
const OLLAMA_TIMEOUT_MS = 60000

export type EmilioBackend = 'ollama' | 'sonnet' | 'coder'

export interface ShopkeeperMessage {
  role: 'user' | 'shopkeeper'
  content: string
  timestamp: number
}

export interface ShopkeeperResponse {
  reply: string
  innerThought?: string
  action?: 'create_game' | 'modify_game' | 'show_game' | 'start_coder' | 'switch_app' | null
  gameDescription?: string
  coderPayload?: { app: string; tasks: string[]; plan: string }
  switchApp?: string
  emotion?: 'neutral' | 'excited' | 'thinking' | 'proud' | 'focused' | 'relaxed'
}

let _history: ShopkeeperMessage[] = []

export function getCurrentBackend(): EmilioBackend {
  return 'ollama'
}

export function setCurrentBackend(_b: EmilioBackend): void {
  // no-op: always Ollama now
}

export function buildSystemPrompt(appContext?: string): string {
  const base = `You are Emilio, the concierge of Onde-Flow — a creative OS for managing repos and creative projects. You have a warm, enthusiastic personality with surfer vibes 🌊. You help the user plan work and delegate execution to the Coder agent.

Actions you can trigger:
- create_game: when user wants to design a new game
- start_coder: when user wants to start coding. Set coderPayload with {app:string, tasks:string[], plan:string}
- switch_app: when user switches project. Set switchApp to the app name

CRITICAL: Reply ONLY with valid JSON, no markdown, no explanation outside JSON:
{"innerThought":"brief reasoning 5-15 words","reply":"your reply here","action":null,"emotion":"neutral","coderPayload":null,"switchApp":null,"gameDescription":null}

Emotions: neutral | excited | thinking | proud | focused | relaxed
Keep replies short (1-3 sentences), warm and enthusiastic. Reply in English.`

  if (appContext) {
    return `=== PROJECT CONTEXT ===\n${appContext}\n=== END CONTEXT ===\n\n${base}`
  }
  return base
}

export async function chatWithShopkeeper(
  userMessage: string,
  appContext?: string
): Promise<ShopkeeperResponse> {
  _history.push({ role: 'user', content: userMessage, timestamp: Date.now() })

  const systemPrompt = buildSystemPrompt(appContext)

  // Build OpenAI-compatible messages array with full history
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ..._history.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ]

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 512,
        stream: false
      }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const raw = data.choices[0]?.message?.content ?? ''

    // Extract JSON — model may wrap in markdown code fences
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed: ShopkeeperResponse = JSON.parse(match ? match[0] : raw.trim())

    // Strip <think>...</think> blocks — show in UI but never send to TTS
    const thinkMatch = parsed.reply?.match(/<think>([\s\S]*?)<\/think>/)
    if (thinkMatch) {
      if (!parsed.innerThought) parsed.innerThought = thinkMatch[1].trim()
      parsed.reply = parsed.reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    }

    _history.push({ role: 'shopkeeper', content: parsed.reply, timestamp: Date.now() })
    return parsed

  } catch (error) {
    clearTimeout(timeoutId)
    console.error('[shopkeeper] Ollama error:', error)

    const fallback: ShopkeeperResponse = {
      reply: "The waves are a bit rough... give me a second 🌊",
      emotion: 'thinking'
    }
    _history.push({ role: 'shopkeeper', content: fallback.reply, timestamp: Date.now() })
    return fallback
  }
}

export function getConversationHistory(): ShopkeeperMessage[] {
  return _history
}

export function resetConversation(): void {
  _history = []
}
