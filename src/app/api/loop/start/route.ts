import { NextResponse } from 'next/server'

// DISABLED in Onde-Flow — game loop belongs to game-studio repo, not here
export async function POST() {
  return NextResponse.json({ error: 'Game loop disabled in Onde-Flow' }, { status: 403 })
}
