/**
 * Onde-Flow Coder — LangGraph-style agent loop for Electron
 * 
 * Emilio delegates tasks to Coder when action=start_coder.
 * Coder uses Qwen3-Coder via local MLX or OpenRouter fallback.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { log } from './logger'

const execFileAsync = promisify(execFile)

// ─── State machine ──────────────────────────────────────────────────────────

type CoderState = 'IDLE' | 'PLANNING' | 'CODING' | 'REVIEWING' | 'DONE' | 'ERROR'

let state: CoderState = 'IDLE'
let currentTask: string | null = null
let currentApp: string | null = null
let iteration = 0
let maxIterations = 5
let abortSignal = false

type ProgressListener = (event: CoderEvent) => void

export interface CoderEvent {
  type: 'state' | 'progress' | 'code_change' | 'error' | 'done'
  state?: CoderState
  message?: string
  file?: string
  diff?: string
}

const listeners = new Set<ProgressListener>()

export function onCoderEvent(cb: ProgressListener) { listeners.add(cb) }
export function offCoderEvent(cb: ProgressListener) { listeners.delete(cb) }

function emit(event: CoderEvent) {
  for (const cb of listeners) {
    try { cb(event) } catch { /* ignore */ }
  }
}

function setState(s: CoderState) {
  state = s
  emit({ type: 'state', state: s })
  log('INFO', 'coder', `State → ${s}`)
}

export function getCoderState() {
  return { state, currentTask, currentApp, iteration }
}

export function stopCoder() {
  abortSignal = true
  setState('IDLE')
}

// ─── Main coder loop ────────────────────────────────────────────────────────

export async function startCoder(task: string, appName: string, apiKey: string): Promise<void> {
  if (state !== 'IDLE') {
    log('WARN', 'coder', 'Already running, ignoring start request')
    return
  }

  currentTask = task
  currentApp = appName
  iteration = 0
  abortSignal = false

  try {
    setState('PLANNING')
    emit({ type: 'progress', message: `🧠 Planning: ${task}` })

    // 1. Generate plan
    const plan = await generatePlan(task, appName, apiKey)
    emit({ type: 'progress', message: `📋 Plan ready:\n${plan}` })

    // 2. Execute iterations
    while (iteration < maxIterations && !abortSignal) {
      iteration++
      setState('CODING')
      emit({ type: 'progress', message: `⚡ Iteration ${iteration}/${maxIterations}` })

      // Generate code changes
      const changes = await generateCodeChanges(task, plan, iteration, appName, apiKey)
      
      if (!changes || changes.length === 0) {
        emit({ type: 'progress', message: '✅ No more changes needed!' })
        break
      }

      // Apply changes
      for (const change of changes) {
        await applyChange(change, appName)
        emit({
          type: 'code_change',
          file: change.file,
          message: change.description,
          diff: change.content.slice(0, 200)
        })
      }

      // Review iteration
      setState('REVIEWING')
      const shouldContinue = await reviewProgress(task, changes, iteration, apiKey)
      
      if (!shouldContinue) {
        emit({ type: 'progress', message: '🎯 Task complete!' })
        break
      }

      await new Promise(r => setTimeout(r, 1000)) // brief pause between iterations
    }

    setState('DONE')
    emit({ type: 'done', message: `✅ Completed "${task}" in ${iteration} iterations` })
    
    // Reset after short delay
    setTimeout(() => setState('IDLE'), 3000)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log('ERROR', 'coder', msg)
    setState('ERROR')
    emit({ type: 'error', message: `❌ Coder error: ${msg}` })
    setTimeout(() => setState('IDLE'), 5000)
  }
}

// ─── OpenRouter helpers ─────────────────────────────────────────────────────

async function callOpenRouter(messages: Array<{role: string; content: string}>, apiKey: string, model = 'qwen/qwen3-235b-a22b'): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://onde.surf',
      'X-Title': 'OndeFlow Coder'
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2000 })
  })
  const data = await res.json() as any
  return data.choices?.[0]?.message?.content || ''
}

async function generatePlan(task: string, appName: string, apiKey: string): Promise<string> {
  const appContext = getAppContext(appName)
  const messages = [
    {
      role: 'system',
      content: `You are the Coder for OndeFlow — a creative OS. Create concise implementation plans for coding tasks.
Reply with a numbered list of specific code changes needed. Keep it under 5 steps.`
    },
    {
      role: 'user',
      content: `App: ${appName}\nTask: ${task}\n\nContext:\n${appContext}\n\nCreate an implementation plan.`
    }
  ]
  return callOpenRouter(messages, apiKey)
}

async function generateCodeChanges(
  task: string,
  plan: string,
  iteration: number,
  appName: string,
  apiKey: string
): Promise<Array<{file: string; content: string; description: string}>> {
  
  const appPath = getAppPath(appName)
  const existingFiles = fs.existsSync(appPath)
    ? fs.readdirSync(appPath).filter(f => !f.startsWith('.')).join(', ')
    : 'none'

  const messages = [
    {
      role: 'system',
      content: `You are the Coder for OndeFlow. Generate specific code changes.
Return a JSON array of changes:
[{"file": "relative/path.ts", "content": "full file content", "description": "what changed"}]
Only return valid JSON, no markdown.`
    },
    {
      role: 'user',
      content: `App: ${appName} (at ${appPath})
Task: ${task}
Plan: ${plan}
Iteration: ${iteration}
Existing files: ${existingFiles}

Generate the code changes for iteration ${iteration}.`
    }
  ]

  const response = await callOpenRouter(messages, apiKey, 'qwen/qwen3-235b-a22b')
  
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    log('WARN', 'coder', 'Could not parse changes JSON, no changes this iteration')
  }
  
  return []
}

async function reviewProgress(
  task: string,
  changes: Array<{file: string; description: string}>,
  iteration: number,
  apiKey: string
): Promise<boolean> {
  
  if (iteration >= maxIterations) return false

  const messages = [
    {
      role: 'system',
      content: 'You review code progress. Reply with CONTINUE if more work needed, or DONE if task is complete.'
    },
    {
      role: 'user',
      content: `Task: ${task}\nIteration: ${iteration}\nChanges made: ${changes.map(c => c.description).join(', ')}\n\nContinue or Done?`
    }
  ]

  const response = await callOpenRouter(messages, apiKey)
  return response.toLowerCase().includes('continue')
}

// ─── File system helpers ─────────────────────────────────────────────────────

function getAppPath(appName: string): string {
  // Apps live in {project}/apps/{appName}/
  return path.join('/Volumes/SSD-FRH-1/Free-River-House/onde-flow/apps', appName)
}

function getAppContext(appName: string): string {
  const appPath = getAppPath(appName)
  let context = ''
  
  const visionPath = path.join(appPath, 'VISION.md')
  const tasksPath = path.join(appPath, 'TASKS.md')
  const statePath = path.join(appPath, 'STATE.json')

  if (fs.existsSync(visionPath)) context += `VISION:\n${fs.readFileSync(visionPath, 'utf-8').slice(0, 500)}\n\n`
  if (fs.existsSync(tasksPath)) context += `TASKS:\n${fs.readFileSync(tasksPath, 'utf-8').slice(0, 500)}\n\n`
  if (fs.existsSync(statePath)) context += `STATE:\n${fs.readFileSync(statePath, 'utf-8').slice(0, 300)}\n\n`
  
  return context || `No context found for ${appName}`
}

async function applyChange(
  change: {file: string; content: string; description: string},
  appName: string
): Promise<void> {
  const appPath = getAppPath(appName)
  const filePath = path.join(appPath, change.file)
  const dir = path.dirname(filePath)
  
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, change.content, 'utf-8')
  
  log('INFO', 'coder', `Applied: ${change.file} — ${change.description}`)
}
