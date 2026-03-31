import { NextResponse } from 'next/server'
import { runBuild } from '@/services/shell'

export async function POST() {
  try {
    const result = await runBuild()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
