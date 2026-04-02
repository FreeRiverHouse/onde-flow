# Onde-Flow

Creative OS with Emilio the concierge. Voice-powered vibe coding.

## Architecture

- **Emilio** (concierge): Claude via CLI or OpenRouter API
- **Coder** (executor): Qwen3 via LM Studio / MLX
- **3D Scene**: React Three Fiber ocean scene
- **Voice**: Whisper STT + TTS

## Desktop App (Electron)

```bash
cd electron
npm install
npm run dev
```

## Web App (Next.js)

```bash
npm install
npm run dev
```

## Electron Build (macOS)

```bash
npm run build:mac
```

## Structure

```
onde-flow/
├── electron/          # Electron desktop app (Vibe Talk code reuse)
│   ├── src/main/      # Main process: STT, Emilio, recording
│   ├── src/preload/   # IPC bridge
│   └── package.json   # Electron dependencies
├── src/               # Next.js web app
│   ├── app/emilio/    # R3F ocean scene + chat
│   └── services/      # shopkeeper, loop, etc.
├── apps/              # Sub-apps (game-studio, book-wizard)
└── packages/          # Shared types
```
