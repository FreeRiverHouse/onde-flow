# Onde-Flow — Piano di Implementazione

## Context

Il progetto `game-wizard` evolve in **Onde-Flow**: un creative OS dove Emilio (Claude via CLI) fa da _concierge dei repo_, coordina la visione di ogni progetto, e delega l'esecuzione a Coder (Qwen3 via LM Studio). L'utente parla con Emilio in una scena oceanica immersiva 2D (React Three Fiber), Emilio produce piani strutturati, Coder li esegue in background.

**Repo:** `/Users/mattiapetrucciani/game-wizard`
**Stack attuale:** Next.js 16, React 19, TypeScript, Tailwind v4, LangGraph, SQLite
**Nessuna libreria 3D installata** — va aggiunta in Phase 0
**Emilio** = `execFileSync('claude', ['-p', prompt])` → API remota, zero RAM locale
**Coder** = Qwen3-30B via LM Studio su :1234 → ~16GB RAM

> Emilio e Coder **possono** girare in parallelo tecnicamente (uno remoto, uno locale), ma il flusso UX è deliberatamente sequenziale: Emilio pianifica → Coder esegue → Emilio rivede.

---

## Architettura target

```
ONDE-FLOW
├── Emilio (concierge)
│   ├── Legge VISION.md + TASKS.md di ogni sub-app
│   ├── Mantiene conversazione + storia sessione
│   ├── Produce action: start_coder | switch_app | create_game
│   └── Riceve briefing da Coder al rientro
│
├── Coder (esecutore)
│   ├── Riceve task precisi da Emilio
│   ├── Gira via LangGraph → runIteration()
│   ├── Aggiorna STATE.json dopo ogni iter
│   └── Si ferma quando utente parla con Emilio
│
└── Sub-apps
    ├── game-studio/  (VISION.md, TASKS.md, STATE.json)
    └── book-wizard/  (VISION.md, TASKS.md, STATE.json)
```

**State machine:**
```
IDLE ──► EMILIO_ACTIVE ──► CODER_ACTIVE
              ▲                  │
              └──── (utente scrive a Emilio, auto-stop Coder)
```

---

## Phase 0 — Fondamenta (nessuna UI)

### 0.1 Installa dipendenze 3D
**Chi:** Claude direttamente
```bash
cd /Users/mattiapetrucciani/game-wizard
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three
```
Verifica: `npx tsc --noEmit` pulito.

### 0.2 Crea struttura apps/
**Chi:** Claude direttamente — file semplici, nessuna logica

```
apps/
  game-studio/
    VISION.md   ← "Game studio AI-driven: PGR self-improvement loop..."
    TASKS.md    ← backlog PGR (builder system, tester bot, multi-game...)
    STATE.json  ← { lastIter:0, buildOk:null, lastChange:null, coderStopped:false, timestamp:null }
  book-wizard/
    VISION.md   ← "Book wizard: pipeline EPUB→edit→PDF..."
    TASKS.md    ← backlog book (chapter editor, export, translate...)
    STATE.json  ← (stesso schema)
```

### 0.3 `src/lib/app-registry.ts` — delegare a Qwen
Tipi: `AppConfig`, `AppState`
Funzioni: `listApps()`, `getAppState(name)`, `updateAppState(name, partial)`, `getAppContext(name)` (legge VISION+TASKS)
Costante `APP_REGISTRY`: game-studio (#00d4ff ⊞) e book-wizard (#a855f7 ◫)

### 0.4 `src/services/onde-flow-state.ts` — delegare a Qwen
Singleton in-memory. Tipi: `OndeFlowMode`, `CoderSession`, `OndeFlowState`
Funzioni: `getOndeFlowState()`, `setMode()`, `setActiveApp()`, `startCoderSession()`, `endCoderSession()`, `buildCoderBriefing(appState)` → stringa italiana per Emilio

### 0.5 `src/app/api/onde-flow/state/route.ts` — delegare a Qwen
GET → stato corrente
POST body: `{ mode?, activeApp?, startCoder?: { app, tasks[] } }`
`export const dynamic = 'force-dynamic'`

---

## Phase 1 — Scena Oceanica (React Three Fiber)

Pagina `/emilio` — layout: **60% canvas ocean** + **40% chat panel**.
Canvas con camera ortografica (zoom 90) → stile 2.5D flat, VR-ready via WebXR.
Tutto dynamically imported (`ssr: false`) per evitare crash Next.js SSR.

### File da creare (tutti delegati a Qwen, uno alla volta):

| File | Descrizione | Righe est. |
|------|-------------|-----------|
| `src/app/emilio/shaders/ocean.ts` | `OCEAN_VERT` + `OCEAN_FRAG` — wave displacement + colori Mediterraneo | ~80 |
| `src/app/emilio/components/OceanMesh.tsx` | Plane con custom shader, `useFrame` anima uTime | ~70 |
| `src/app/emilio/components/SceneEnvironment.tsx` | Sky gradient, sole, nuvole drift, dock in legno | ~120 |
| `src/app/emilio/components/EmilioCharacter.tsx` | Personaggio da primitives (testa, corpo, grembiule, cappello), 4 emotion animations | ~160 |
| `src/app/emilio/components/SpeechBubble.tsx` | Glass morphism div, coda verso il basso, emotion badge, loading dots | ~80 |
| `src/app/emilio/components/ChatPanel.tsx` | 40% width, messaggi user/emilio, input HUD, mode banner CODER_ACTIVE | ~180 |
| `src/app/emilio/hooks/useOceanAudio.ts` | Web Audio API — oscillatori sinusoidali, gain envelope, toggle | ~70 |
| `src/app/emilio/OceanCanvas.tsx` | Canvas R3F wrapper, OrthographicCamera, fog, compone tutte le scene | ~50 |
| `src/app/emilio/page.tsx` | Orchestratore: stato, handleSubmit, fetch API, layout | ~160 |

**Palette ocean:** deepBlue `#072940`, shallowBlue `#1a6b8a`, foam `#a8e0f0`
**Sky:** top `#2d0845` → mid `#FF5733` → horizon `#FFE566` (tramonto mediterraneo)
**Emilio sul dock:** corpo `#CC2200` (camicia rossa), cappello chef bianco, baffi

**Logica `page.tsx`:**
1. Mount → GET `/api/onde-flow/state`
2. Se utente scrive e mode = CODER_ACTIVE → POST `/api/onde-flow/state {mode:'EMILIO_ACTIVE'}` + POST `/api/loop/stop`
3. POST `/api/shop/chat { message }` → aggiorna messages + lastEmotion
4. Se `action === 'start_coder'` → POST `/api/onde-flow/state { startCoder: {app, tasks} }` + POST `/api/graph/run { objective }`
5. Se `action === 'switch_app'` → POST `/api/onde-flow/state { activeApp }` + reload context

---

## Phase 2 — Emilio come Concierge

### 2.1 Estendi `src/services/shopkeeper.ts` — delegare a Qwen

Nuovi campi `ShopkeeperResponse`:
- `action`: aggiungi `'start_coder' | 'switch_app'`
- `coderPayload?: { app: string; tasks: string[]; plan: string }`
- `switchApp?: string`
- `emotion`: aggiungi `'focused' | 'relaxed'`

Nuova funzione `buildSystemPrompt(appContext?: string): string`
Il prompt base descrive Emilio come concierge Onde-Flow (non solo shopkeeper giochi).
`chatWithShopkeeper(userMessage, appContext?)` — acepta contesto opzionale.

### 2.2 Aggiorna `src/app/api/shop/chat/route.ts` — delegare a Qwen

Nel POST handler, prima di chiamare Emilio:
1. `getOndeFlowState()` → se CODER_ACTIVE: `endCoderSession()` + leggi STATE.json + prepend `buildCoderBriefing()`
2. Se `activeApp` presente: `getAppContext(activeApp)` → passato come contesto
3. Chiamata: `chatWithShopkeeper(message, combinedContext)`

---

## Phase 3 — Hook post-iterazione Coder

### 3.1 Aggiorna `src/services/loop.ts` — delegare a Qwen (modifica chirurgica)

Dopo `emit('done', ...)` in `runOneIteration`:
```typescript
try {
  const ofState = getOndeFlowState()
  if (ofState.activeApp) {
    updateAppState(ofState.activeApp, { lastIter: iterNum, buildOk: buildResult.success, lastChange: pmSummary || null, timestamp: new Date().toISOString() })
  }
} catch { /* non-fatal */ }
```

In `stopLoop()` dopo `setState('idle')`:
```typescript
try {
  const ofState = getOndeFlowState()
  if (ofState.activeApp) updateAppState(ofState.activeApp, { coderStopped: true, timestamp: new Date().toISOString() })
} catch { /* non-fatal */ }
```

---

## Phase 4 — UI / Branding Onde-Flow

### 4.1 `src/components/Sidebar.tsx` — Claude applica direttamente
- Logo: `"GAME WIZARD"` → `"ONDE-FLOW"`
- Subtitle: `"CREATIVE OS // v3.0"`
- Aggiungi `{ href: '/emilio', label: 'EMILIO', icon: '~' }` come primo nav item

### 4.2 Sidebar fetch onde-flow state — delegare a Qwen
- Fetch parallelo `/api/onde-flow/state` nel useEffect
- "ACTIVE APP" chip: mostra `activeApp` + dot pulsante amber se CODER_ACTIVE

### 4.3 `src/app/layout.tsx` — Claude direttamente
- `title: 'ONDE-FLOW // CREATIVE OS'`

### 4.4 `src/app/page.tsx` — Claude direttamente
- `redirect('/emilio')`

### 4.5 `src/app/shop/page.tsx` — Claude direttamente
- Converti in server component: `redirect('/emilio')`

---

## Ordine di esecuzione e dipendenze

```
0.1 npm install
  └─ 0.2 apps/ dirs
      └─ 0.3 app-registry.ts
          ├─ 0.4 onde-flow-state.ts → 0.5 API route
          └─ 2.1 shopkeeper.ts ext → 2.2 chat route update

1.1 shaders → 1.2 OceanMesh ──────────────────────────┐
1.3 SceneEnvironment ──────────────────────────────────┤
1.4 EmilioCharacter ───────────────────────────────────┤→ 1.9 OceanCanvas → 1.8 page.tsx
1.5 SpeechBubble ──────────────────────────────────────┤   (dipende da 0.5 + 2.2)
1.6 ChatPanel ─────────────────────────────────────────┤
1.7 useOceanAudio ─────────────────────────────────────┘

3.1 loop.ts hook ← dipende da 0.3 + 0.4

4.x UI branding ← dipende da 0.5 (per sidebar state)
```

---

## Verifica end-to-end

```bash
npx tsc --noEmit                          # zero errori
npm run dev                               # server parte
```

Checklist:
- [ ] `/emilio` carica, canvas 3D visibile, no errori R3F in console
- [ ] `/shop` → redirect a `/emilio`
- [ ] Onde-Flow home → redirect a `/emilio`
- [ ] `GET /api/onde-flow/state` → `{ mode:'IDLE', activeApp:null }`
- [ ] Chat con Emilio → risposta in italiano, emotion cambia personaggio
- [ ] Bubble speech appare sopra Emilio nel canvas
- [ ] `POST /api/onde-flow/state { activeApp:'game-studio' }` → sidebar mostra app
- [ ] Emilio riceve context di game-studio nel system prompt (log visibile)
- [ ] Emilio risponde `action:start_coder` → modo CODER_ACTIVE, Coder parte
- [ ] Scrivi a Emilio durante CODER_ACTIVE → banner sparisce, Coder si ferma, briefing iniettato
- [ ] Dopo 1 iterazione Coder → `apps/game-studio/STATE.json` aggiornato

---

## Note tecniche

- **OrthographicCamera zoom=90**: stile 2D-flat senza distorsione prospettica, migration naturale a Unity 2D
- **GLSL custom** invece di `MeshReflectorMaterial`: controllo totale su palette mediterranea
- **Emilio da primitives** (no GLTF): zero asset esterni, load istantaneo, coherente con stile HUD
- **R3F ssr:false**: `dynamic()` import obbligatorio in Next.js App Router
- **Web Audio oscillators**: no file audio, nessuna dipendenza, wave synthesis procedurale
- **SpeechBubble come HTML div**: glass morphism CSS nativo, più semplice di `<Html>` R3F
- **Coder può girare mentre Emilio risponde**: tecnicamente OK (Emilio = remoto, Coder = locale), ma UX è sequenziale per design
