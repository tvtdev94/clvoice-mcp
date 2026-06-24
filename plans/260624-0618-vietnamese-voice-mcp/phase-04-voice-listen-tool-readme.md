---
phase: 4
title: voice_listen tool & README
status: completed
priority: P1
dependencies:
  - 2
  - 3
effort: M
---

# Phase 4: voice_listen tool & README

## Overview
Ghép recorder (Phase 2) + Gemini STT (Phase 3) vào tool MCP thật `voice_listen`, thêm tool phụ `list_audio_devices`, viết README hướng dẫn cài + đăng ký + acceptance test thủ công.

## Requirements
- Functional:
  - `voice_listen({ seconds?, language? })`: record mic → transcribe → trả `{ content:[{type:"text", text: transcript}] }`. Default `seconds` = `CLVOICE_DEFAULT_SECONDS` (15), clamp theo `CLVOICE_MAX_SECONDS`.
  - `list_audio_devices()`: trả danh sách tên mic để user cấu hình `CLVOICE_MIC_DEVICE`.
  - Cleanup file WAV tạm sau khi transcribe (cả khi lỗi).
- Non-functional: lỗi trả về dưới dạng tool result `isError: true` + message tiếng người, không làm chết server.

## Architecture
- `src/tools/voice-listen.ts`: factory nhận `{ recorder, stt, config }` → trả handler. Tách logic khỏi `index.ts` (DRY/test).
- `src/index.ts`: thay stub Phase 1 bằng wiring thật; đăng ký cả `voice_listen` + `list_audio_devices`.
- Flow handler: `loadConfig` → `recordAudio` → `stt.transcribe` → `cleanupTemp` (finally) → trả text.
- Error: bọc try/catch, trả `{ content:[{type:"text", text:"Lỗi: ..."}], isError:true }`.

## Related Code Files
- Create: `src/tools/voice-listen.ts`, `src/tools/list-audio-devices.ts`, `README.md`
- Modify: `src/index.ts` (wiring thật, bỏ stub)

## Implementation Steps
1. `voice-listen.ts`: handler ghép record→transcribe→cleanup, clamp seconds, map lỗi sang message tiếng Việt gọn.
2. `list-audio-devices.ts`: handler gọi `listInputDevices`, format danh sách.
3. `index.ts`: import config + recorder + GeminiSttProvider, đăng ký 2 tool với `registerTool`, connect stdio. Bỏ stub.
4. `README.md`: prerequisites (Node 18+, ffmpeg trên PATH, `GEMINI_API_KEY`), cài đặt, build, đăng ký `claude mcp add clvoice -- node <abs>/dist/index.js`, env vars table, cách lấy tên mic qua `list_audio_devices`, cách dùng ("gõ: nghe tôi nói rồi làm theo"), privacy disclaimer, troubleshooting (mic device name, ffmpeg missing, quota).
5. `npm run build` sạch; acceptance test thủ công theo Success Criteria.

## Success Criteria
- [ ] `npm run build` sạch.
- [ ] Đăng ký vào Claude Code → cả 2 tool hiện.
- [ ] `list_audio_devices` trả tên mic thật.
- [ ] `voice_listen` → nói tiếng Việt → trả transcript đúng.
- [ ] Thiếu API key / ffmpeg / mic → tool trả lỗi rõ, server không chết.
- [ ] Không còn WAV tạm sau mỗi lần gọi.

## Risk Assessment
- Đường dẫn tuyệt đối khi `claude mcp add` → README nhấn mạnh dùng abs path tới `dist/index.js`.
- Lần đầu chạy mic device sai tên → hướng dẫn chạy `list_audio_devices` trước, set `CLVOICE_MIC_DEVICE`.
- Mitigation: thông báo lỗi kèm gợi ý hành động cụ thể.
