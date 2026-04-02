import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { safeStorage } from 'electron'
import * as fs from 'fs'

export let db: Database.Database

// ─── Helpers: App-Level Encryption (safeStorage) ───────────────────────────
function encryptStr(text: string): string {
  if (!text) return text
  try {
    return safeStorage.isEncryptionAvailable()
      ? 'enc:' + safeStorage.encryptString(text).toString('base64')
      : text
  } catch { return text }
}

function decryptStr(val: string): string {
  if (!val || typeof val !== 'string' || !val.startsWith('enc:')) return val
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(val.replace('enc:', ''), 'base64'))
      : val
  } catch { return val }
}

export function isEncrypted(val: string): boolean {
  return typeof val === 'string' && val.startsWith('enc:')
}

// ─── DB Backup (Data Loss Prevention) ──────────────────────────────────────
function backupDatabase(dbPath: string) {
  try {
    if (!fs.existsSync(dbPath)) return
    const backupDir = join(app.getPath('userData'), 'backups')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)

    // Keep max 3 daily backups
    const d = new Date().toISOString().slice(0, 10)
    const backupPath = join(backupDir, `ondevibe_${d}.db`)

    // Only backup once per day
    if (!fs.existsSync(backupPath)) {
      // Force checkpoint WAL before copy
      db.pragma('wal_checkpoint(TRUNCATE)')
      fs.copyFileSync(dbPath, backupPath)

      // Cleanup old
      const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('ondevibe_')).sort()
      while (backups.length > 3) {
        fs.unlinkSync(join(backupDir, backups.shift()!))
      }
    }
  } catch (e) {
    console.error('Failed to backup database:', e)
  }
}

export function initDb() {
  const dbPath = join(app.getPath('userData'), 'ondevibe.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  backupDatabase(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS dictations (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'local',
      device_id TEXT DEFAULT 'local',
      project_id TEXT,
      raw_transcript TEXT NOT NULL,
      processed_text TEXT NOT NULL,
      language TEXT DEFAULT 'auto',
      app_name TEXT,
      app_bundle_id TEXT,
      window_title TEXT,
      input_mode TEXT DEFAULT 'push',
      started_at DATETIME NOT NULL,
      ended_at DATETIME NOT NULL,
      duration_ms INTEGER NOT NULL,
      word_count INTEGER DEFAULT 0,
      char_count INTEGER DEFAULT 0,
      wpm REAL DEFAULT 0,
      whisper_model TEXT DEFAULT 'small',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id INTEGER PRIMARY KEY,
      user_id TEXT DEFAULT 'local',
      generated_at DATETIME NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'local',
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      description TEXT,
      platform TEXT,
      last_mention DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS project_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      next_steps TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export function saveDictation(record: {
  id: string
  user_id: string
  device_id: string
  raw_transcript: string
  processed_text: string
  started_at: string
  ended_at: string
  duration_ms: number
  word_count: number
  app_name?: string
  synced_at?: string
}, isAlreadyEncrypted = false) {
  const payload = isAlreadyEncrypted ? record : {
    ...record,
    raw_transcript: encryptStr(record.raw_transcript),
    processed_text: encryptStr(record.processed_text)
  }

  db.prepare(`
    INSERT INTO dictations (id, user_id, device_id, raw_transcript, processed_text,
      started_at, ended_at, duration_ms, word_count, app_name, synced_at)
    VALUES (@id, @user_id, @device_id, @raw_transcript, @processed_text,
      @started_at, @ended_at, @duration_ms, @word_count, @app_name, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      raw_transcript = excluded.raw_transcript,
      processed_text = excluded.processed_text,
      app_name = excluded.app_name,
      synced_at = excluded.synced_at
  `).run(payload)
}

export function getDictations(limit = 100, userId = 'local'): any[] {
  const rows = db.prepare(
    "SELECT * FROM dictations WHERE user_id = ? AND is_deleted = 0 ORDER BY started_at DESC LIMIT ?"
  ).all(userId, limit) as any[]

  return rows.map(r => ({ ...r, raw_transcript: decryptStr(r.raw_transcript), processed_text: decryptStr(r.processed_text) }))
}

export const getAllDictations = getDictations

// Returns ALL non-deleted dictations regardless of user_id.
// Used by the dashboard: in a single-user app, user_id may vary across sessions
// (e.g. 'local' before login, Google user ID after login), so filtering by user_id
// would miss dictations from other sessions.
export function getDictationsAll(limit = 500): any[] {
  const rows = db.prepare(
    "SELECT * FROM dictations WHERE is_deleted = 0 ORDER BY started_at DESC LIMIT ?"
  ).all(limit) as any[]
  return rows.map(r => ({ ...r, raw_transcript: decryptStr(r.raw_transcript), processed_text: decryptStr(r.processed_text) }))
}

// ─── Dashboard & Projects ───

export function saveDashboardSnapshot(userId: string, generatedAt: string, data: any) {
  db.prepare(
    "INSERT INTO dashboard_snapshots (user_id, generated_at, data) VALUES (?, ?, ?)"
  ).run(userId, generatedAt, JSON.stringify(data))
}

export function getLatestDashboardSnapshot(userId = 'local'): any | null {
  const row = db.prepare(
    "SELECT data FROM dashboard_snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1"
  ).get(userId) as { data: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.data)
  } catch {
    return null
  }
}

export function saveProject(userId: string, project: {
  name: string
  status: string
  description: string
  platform?: string
  lastMention: string
  nextSteps: string[]
}) {
  const existing = db.prepare("SELECT id FROM projects WHERE user_id = ? AND name = ? COLLATE NOCASE").get(userId, project.name) as { id: string } | undefined
  let projectId = existing?.id

  if (projectId) {
    db.prepare(`
      UPDATE projects SET status = ?, description = ?, platform = ?, last_mention = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(project.status, project.description, project.platform || null, project.lastMention, projectId)
  } else {
    projectId = uuidv4()
    db.prepare(`
      INSERT INTO projects (id, user_id, name, status, description, platform, last_mention)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, userId, encryptStr(project.name), project.status, encryptStr(project.description), project.platform || null, project.lastMention)
  }

  if (project.nextSteps && project.nextSteps.length > 0) {
    db.prepare("INSERT INTO project_updates (project_id, next_steps) VALUES (?, ?)").run(
      projectId, encryptStr(JSON.stringify(project.nextSteps))
    )
  }
}

export function getProjects(): any[] {
  const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all()
  return projects.map((p: any) => {
    const update = db.prepare("SELECT next_steps FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(p.id) as { next_steps: string } | undefined
    return {
      ...p,
      name: decryptStr(p.name),
      description: decryptStr(p.description),
      nextSteps: update ? JSON.parse(decryptStr(update.next_steps)) : []
    }
  })
}

// ─── Test Data Seeder (dev/testing only) ────────────────────────────────────
export function seedTestDictations(): number {
  const notes = [
    // Pizza Runner — iOS game
    { text: 'Working on Pizza Runner game for iOS. The main character can now run and jump. I need to add power-ups like double jump and speed boost. Physics feel solid.', app: 'Xcode', minsAgo: 30 },
    { text: 'Pizza Runner level editor is done. Finished designing 5 levels with increasing difficulty. Next step: add enemies, a scoring system, and high-score persistence.', app: 'Xcode', minsAgo: 90 },
    { text: 'Fixed a clipping bug in Pizza Runner where the character went through platforms. Added particle effects when collecting pizza slices. Need to implement the boss level.', app: 'Xcode', minsAgo: 180 },
    { text: 'Pizza Runner is blocked on Apple in-app purchase sandbox not working. IAP integration failing in test mode. Waiting for Apple support to respond.', app: 'Xcode', minsAgo: 270 },
    { text: 'Pizza Runner sound design done. Background music and SFX added. Working on App Store screenshots and description. Planning to submit for review next week.', app: 'Xcode', minsAgo: 360 },
    // FocusFlow — productivity app
    { text: 'Starting FocusFlow, a pomodoro and focus tracker app. Implemented the core timer with 25-minute work sessions and 5-minute breaks. Need to add notification sounds.', app: 'VS Code', minsAgo: 440 },
    { text: 'FocusFlow statistics dashboard is done. Shows daily and weekly focus time with Chart.js graphs. Next: export to CSV, add a calendar heatmap view.', app: 'VS Code', minsAgo: 530 },
    { text: 'FocusFlow settings screen complete. Users can customize work duration, break time, and sounds. Added iCloud sync for settings across devices.', app: 'VS Code', minsAgo: 620 },
    { text: 'FocusFlow is almost ready for launch. Landing page is live, App Store screenshots done. Still need to finalize the privacy policy before submitting.', app: 'VS Code', minsAgo: 710 },
    { text: 'Submitted FocusFlow to App Store review. Status: waiting for review, estimated 2-3 days. Preparing Product Hunt launch post and marketing materials.', app: 'VS Code', minsAgo: 800 },
  ]

  const now = Date.now()
  let inserted = 0
  for (const note of notes) {
    const start = new Date(now - note.minsAgo * 60 * 1000)
    const end = new Date(start.getTime() + 30000)
    try {
      saveDictation({
        id: uuidv4(),
        user_id: 'local',
        device_id: 'local',
        raw_transcript: note.text,
        processed_text: note.text,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        duration_ms: 30000,
        word_count: note.text.split(' ').length,
        app_name: note.app,
        synced_at: undefined,
      })
      inserted++
    } catch {
      // ignore duplicates
    }
  }
  return inserted
}

