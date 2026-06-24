---
title: 'clvoice-mcp: Vietnamese voice input MCP (v1)'
description: >-
  MCP server (TypeScript) exposing a voice_listen tool that records Vietnamese
  mic audio via ffmpeg and transcribes it through Gemini API
status: completed
priority: P2
branch: ''
tags:
  - mcp
  - typescript
  - voice
  - stt
  - vietnamese
blockedBy: []
blocks: []
created: '2026-06-23T23:25:34.103Z'
createdBy: 'ck:plan'
source: skill
---

# clvoice-mcp: Vietnamese voice input MCP (v1)

## Overview

MCP server viết bằng TypeScript, expose **1 tool** `voice_listen` để Claude Code thu giọng nói tiếng Việt từ microphone (qua `ffmpeg` dshow trên Windows) → gửi audio lên **Gemini API** (free tier) → trả transcript tiếng Việt cho Claude xử lý tiếp.

Kiến trúc chốt ở brainstorm: **Hướng A** (MCP pull-tool), STT **Gemini API free tier**, thu mic shell ra **ffmpeg**, thời lượng cố định (mặc định 15s). Adapter pattern (`SttProvider`) để thêm Groq Whisper / local sau.

- Brainstorm: `../reports/brainstorm-260624-0618-vietnamese-voice-mcp-report.md`
- Repo: greenfield (`C:\w\clvoice-mcp` trống)

## Tech baseline (đã xác minh qua context7)

- MCP: package `@modelcontextprotocol/sdk` → `McpServer` + `registerTool(name, {description, inputSchema}, handler)` + `StdioServerTransport`. inputSchema dùng `zod`.
- Gemini: SDK `@google/genai` → `ai.models.generateContent({ model, contents: [{ parts: [{ inlineData: { mimeType, data(base64) } }, { text }] }] })`. mimeType `audio/wav` được hỗ trợ.
- Node ≥ 18, TypeScript, ESM.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scaffold & MCP bootstrap](./phase-01-scaffold-mcp-bootstrap.md) | Completed |
| 2 | [Audio recording via ffmpeg](./phase-02-audio-recording-via-ffmpeg.md) | Completed |
| 3 | [Gemini STT adapter](./phase-03-gemini-stt-adapter.md) | Completed |
| 4 | [voice_listen tool & README](./phase-04-voice-listen-tool-readme.md) | Completed |

## Dependencies

- Build order tuần tự: 1 → 2 → 3 → 4. Phase 4 wiring phụ thuộc 2 (recorder) + 3 (STT).
- External runtime: `ffmpeg` cài sẵn trên PATH; `GEMINI_API_KEY` trong env.
- No cross-plan dependencies (greenfield, no other plans).

## Acceptance criteria (toàn plan)

- [ ] `claude mcp add clvoice -- node dist/index.js` → tool `voice_listen` hiện trong Claude Code.
- [ ] Nói tiếng Việt 1 câu → tool trả đúng text (chấp nhận sai chính tả nhẹ).
- [ ] Lỗi rõ ràng khi thiếu `GEMINI_API_KEY` / thiếu ffmpeg / không có mic.
- [ ] `npm run build` (tsc) sạch, chạy được trên Windows.

## Out of scope (v1)

Daemon hotkey/gõ phím ảo · VAD tự dừng khi im lặng · vòng lặp hội thoại · local STT · macOS/Linux · sửa chính tả bằng LLM.

## Open questions

- Cách Claude biết khi nào nên gọi `voice_listen` — prompt convention (user gõ "nghe tôi nói") là đủ cho v1; slash-command wrapper để sau.
- Có cần tool phụ `list_audio_devices` không → **quyết: có**, nhỏ gọn, giảm rủi ro mic mismatch (đưa vào Phase 2).
