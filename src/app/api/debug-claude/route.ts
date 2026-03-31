export const dynamic = 'force-dynamic'
import { execFileSync } from 'child_process'

export async function GET(): Promise<Response> {
  try {
    // Build clean env for claude CLI — remove ANTHROPIC_API_KEY to avoid interference
    const { ANTHROPIC_API_KEY: _removed, ...cleanEnv } = process.env
    const raw = execFileSync('/Users/mattiapetrucciani/.local/bin/claude', ['-p', 'Reply with JSON: {"reply":"hi","action":null,"emotion":"neutral","coderPayload":null,"switchApp":null,"gameDescription":null}'], {
      encoding: 'utf8',
      timeout: 20000,
      env: { ...cleanEnv, PATH: `/Users/mattiapetrucciani/.local/bin:/opt/homebrew/bin:${process.env.PATH ?? ''}` }
    })
    return Response.json({ ok: true, raw: raw.substring(0, 300) })
  } catch (e: unknown) {
    const err = e as Error & { stderr?: string; status?: number }
    return Response.json({ ok: false, error: err.message?.substring(0, 200), stderr: err.stderr, status: err.status })
  }
}
