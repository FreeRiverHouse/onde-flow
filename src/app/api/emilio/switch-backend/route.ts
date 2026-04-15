import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Backend is now always Ollama (gemma4-reap).
// This route exists for UI compatibility — it's a no-op.

export function GET(): NextResponse {
  return NextResponse.json({ backend: 'ollama', model: 'gemma4-reap' })
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, backend: 'ollama', model: 'gemma4-reap' })
}
