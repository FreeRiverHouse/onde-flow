import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

const LOG_DIR = path.join(app.getPath('logs'), 'VibeTalk')
const LOG_FILE = path.join(LOG_DIR, 'frf.log')
const MAX_LOG_SIZE = 5 * 1024 * 1024
const IN_MEMORY_LIMIT = 500

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

export interface LogEntry {
  ts: string
  level: LogLevel
  category: string
  msg: string
}

const inMemoryLog: LogEntry[] = []
let fileStream: fs.WriteStream | null = null

function ensureStream(): void {
  if (fileStream) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    if (fs.existsSync(LOG_FILE)) {
      if (fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
        fs.renameSync(LOG_FILE, LOG_FILE + '.old')
      }
    }
    fileStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })
  } catch (e) {
    console.error('[logger] cannot open log file', e)
  }
}

export function log(level: LogLevel, category: string, msg: string): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] [${category}] ${msg}`
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
  ensureStream()
  fileStream?.write(line + '\n')
  const entry: LogEntry = { ts, level, category, msg }
  inMemoryLog.push(entry)
  if (inMemoryLog.length > IN_MEMORY_LIMIT) inMemoryLog.shift()
}

export const logger = {
  info: (cat: string, msg: string) => log('INFO', cat, msg),
  warn: (cat: string, msg: string) => log('WARN', cat, msg),
  error: (cat: string, msg: string) => log('ERROR', cat, msg),
  debug: (cat: string, msg: string) => log('DEBUG', cat, msg),
}

export function getRecentLogs(n = 200): LogEntry[] {
  return inMemoryLog.slice(-n)
}

export function getLogFilePath(): string { return LOG_FILE }
