<p align="center">
  <img src="docs/assets/hero.png" alt="clvoice-mcp" width="640">
</p>

<h1 align="center">clvoice-mcp</h1>

<p align="center">
  <b>Voice input for Claude Code — speak Vietnamese or English.</b><br>
  Hold a hotkey, speak, release — your speech is transcribed, cleaned, and dropped into the input box to edit.
</p>

---

Hold **Ctrl + `**, talk, release. The audio is recorded (ffmpeg) → transcribed (**Groq Whisper**, ~1s) → filler words cleaned up (Groq LLM) → pasted into the focused input for you to **edit before sending**. Nothing runs automatically — you stay in control.

> TypeScript. Windows (microphone via DirectShow/`dshow`). Runs as an MCP server that Claude Code keeps alive for the whole session.

## How it works

<p align="center">
  <img src="docs/assets/flow.png" alt="How clvoice-mcp works" width="720">
</p>

```
HOLD Ctrl+`  ──►  ffmpeg records mic  ──►  release
      │                                      │
      ▼                                      ▼
  🔴 recording        Groq Whisper (STT) ─► ✨ clean fillers (Groq LLM)
                                             │
                                             ▼
                          paste into focused input ─► you edit ─► Enter
```

Two ways to trigger:
1. **Push-to-talk hotkey (recommended, hands-free).** The MCP server hosts a global hotkey watcher for the whole session.
2. **MCP tool** `voice_listen` — Claude calls it when you ask (e.g. "listen to me").

**Important:** the transcript is **not returned to Claude** and is **never auto-executed** — it only lands in your input box. You edit, then press Enter to send.

## Features

- 🎙️ Push-to-talk dictation (hold to talk, release to send)
- ⚡ Fast STT via **Groq Whisper** (~1s); **Gemini** as an alternative
- 🎚️ Audio preprocessing (high-pass + loudness normalize) + clip-safe start/stop for cleaner capture
- ✨ Filler-word cleanup ("à, ừm, ờ...") + punctuation via a Groq LLM (context-aware, never executes your text)
- 📋 Clipboard + auto-paste into whatever window is focused
- 🔊 Audio beeps (start / stop / done) + on-terminal status line
- 🧩 Self-hosted in the MCP server — no separate window, single-instance lock + takeover across multiple Claude Code windows
- 🪟 One-command setup (`setup.ps1`)

## Requirements

- **Node.js ≥ 18**
- **ffmpeg** on `PATH` (`ffmpeg -version`) — https://ffmpeg.org/download.html
- A working **microphone**
- **Groq API key** (default, free): https://console.groq.com/keys — or a **Gemini API key**: https://aistudio.google.com/apikey

## Quick setup (Windows)

```powershell
cd clvoice-mcp
powershell -ExecutionPolicy Bypass -File setup.ps1
```

The script installs deps, builds, detects your mic, asks for a Groq key, registers the MCP server (user scope), and adds the status line. Hotkey + cleanup are **on by default**, so nothing else to configure. Then restart Claude Code.

Non-interactive:
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1 -GroqKey "<key>" -MicDevice "<mic>" 
# add -NoStatusLine to skip the status line
```

## Manual setup

```powershell
npm install
npm run build           # produces dist/index.js
ffmpeg -list_devices true -f dshow -i dummy   # find your mic name
claude mcp add clvoice --scope user ^
  --env GROQ_API_KEY=<KEY> ^
  --env "CLVOICE_MIC_DEVICE=<MIC>" ^
  -- node <ABSOLUTE-PATH>\dist\index.js
```

Groq STT, hotkey, and cleanup are all default-on, so they don't need env vars. To use Gemini instead: add `--env CLVOICE_STT=gemini --env GEMINI_API_KEY=...`.

## Configuration (environment variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLVOICE_STT` | ❌ | `groq` | STT engine: `groq` (fast, ~1s) or `gemini`. |
| `CLVOICE_LANG` | ❌ | `vi` | Spoken language: `vi` (default), `en`, or `auto` (detect VI/EN). |
| `GROQ_API_KEY` | ✅ (for groq) | — | Groq API key — https://console.groq.com/keys |
| `CLVOICE_GROQ_MODEL` | ❌ | `whisper-large-v3-turbo` | Groq Whisper model. Set to `whisper-large-v3` for higher accuracy (esp. Vietnamese) at ~1–2s more latency. |
| `GEMINI_API_KEY` | ✅ (for gemini) | — | Gemini API key. |
| `CLVOICE_GEMINI_MODEL` | ❌ | `gemini-2.5-flash` | Gemini model (switch if a model 404s). |
| `CLVOICE_MIC_DEVICE` | ❌ | (first input) | Exact dshow mic name. |
| `CLVOICE_FFMPEG_PATH` | ❌ | `ffmpeg` | Path to the ffmpeg binary. |
| `CLVOICE_HOTKEY` | ❌ | `true` | Host the push-to-talk watcher in the server. `0` to disable. |
| `CLVOICE_CLEAN` | ❌ | `true` | Clean filler words via Groq LLM (+~0.4s, needs `GROQ_API_KEY`, fail-open). `0` to disable. |
| `CLVOICE_CLEAN_MODEL` | ❌ | `llama-3.3-70b-versatile` | Groq chat model for cleanup. |
| `CLVOICE_AUTO_PASTE` | ❌ | `true` | Auto-paste (Ctrl+V) into the focused window. `false` = clipboard only. |
| `CLVOICE_DEFAULT_SECONDS` | ❌ | `15` | Default record duration (MCP tool path). |
| `CLVOICE_MAX_SECONDS` | ❌ | `60` | Hard cap on record duration. |

## Usage

### Hotkey (push-to-talk)
**Hold Ctrl + `**, speak, release. You'll hear a high beep (recording), a low beep (processing), then a short beep (done) as the text is pasted. Change the key in `scripts/clvoice-hotkey.ps1` (`-Key`, `-NoCtrl`, `-Alt`, `-Shift`).

### MCP tools
- `voice_listen({ seconds?, language? })` — record, transcribe, paste into the input. Does not return the transcript.
- `list_audio_devices()` — list mic names for `CLVOICE_MIC_DEVICE`.

## Status line (on the Claude Code terminal)

`setup.ps1` adds this automatically. Manual:
```jsonc
// ~/.claude/settings.json
"statusLine": {
  "type": "command",
  "command": "node \"<ABS>\\scripts\\clvoice-statusline.cjs\"",
  "padding": 0,
  "refreshInterval": 1
}
```
Shows `🔴 recording` → `⏳ transcribing` → `✨ processing`, hidden when idle. The wrapper preserves any existing status line. ~1s refresh (Claude Code limit); beeps are instant.

## Privacy

Audio is sent to the cloud STT provider (Groq or Google) to be transcribed. Don't use it for sensitive content. A local/offline STT is out of scope for v1.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ffmpeg not found` | Install ffmpeg and add to PATH, or set `CLVOICE_FFMPEG_PATH`. |
| No mic / wrong mic | Run `list_audio_devices` (or `ffmpeg -list_devices`), set `CLVOICE_MIC_DEVICE`. |
| No beep / no status on first use | Server warms up a few seconds after Claude Code starts — wait, then try. |
| Hotkey stops after closing a window | Close all old Claude Code windows after changing env (server env is captured at spawn). |
| Empty transcription | Audio was silent/too short — speak clearly, increase duration. |
| Status shows stale state | Check `%TEMP%\clvoice-debug.log` for the last `raw`/`final`/`clean` line. |

## Limitations (v1)

Windows-only · cloud STT (needs internet) · status line capped at ~1s refresh · the recording status is shared across all Claude Code windows (cosmetic).

## License

MIT
