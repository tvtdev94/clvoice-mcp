---
phase: 3
title: Gemini STT adapter
status: completed
priority: P1
dependencies:
  - 1
effort: M
---

# Phase 3: Gemini STT adapter

## Overview
Interface `SttProvider` + adapter Gemini: nhận file WAV → gửi Gemini API (`@google/genai`) qua inlineData base64 → trả transcript tiếng Việt.

## Requirements
- Functional:
  - `interface SttProvider { transcribe(input: { wavPath: string; mimeType: string; language: string }): Promise<string> }`.
  - `GeminiSttProvider` implement bằng `@google/genai`, đọc `GEMINI_API_KEY` từ env.
- Non-functional: lỗi rõ khi thiếu API key, khi API trả rỗng, khi quota/network fail.

## Architecture
- `src/stt/provider.ts` — khai báo interface `SttProvider` + type input.
- `src/stt/gemini.ts` — `GeminiSttProvider`:
  - `new GoogleGenAI({ apiKey })`.
  - Đọc file WAV → `fs.readFile` → `toString("base64")`.
  - `ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role:"user", parts: [ { inlineData: { mimeType, data: base64 } }, { text: PROMPT } ] }] })`.
  - PROMPT: yêu cầu transcribe nguyên văn tiếng Việt, chỉ trả text, không thêm chú thích. Ví dụ: `"Transcribe the following Vietnamese audio verbatim. Output only the transcription text, no extra commentary."`.
  - Lấy `response.text` (trim). Nếu rỗng → throw "empty transcription".
- Model mặc định: `gemini-2.0-flash` (free tier, hỗ trợ audio). Cho override qua env `CLVOICE_GEMINI_MODEL`.
- Config helper `src/config.ts`: đọc `GEMINI_API_KEY`, `CLVOICE_GEMINI_MODEL`, `CLVOICE_FFMPEG_PATH`, `CLVOICE_MIC_DEVICE`, `CLVOICE_MAX_SECONDS` (default 60), `CLVOICE_DEFAULT_SECONDS` (default 15).

## Related Code Files
- Create: `src/stt/provider.ts`, `src/stt/gemini.ts`, `src/config.ts`

## Implementation Steps
1. `config.ts`: hàm `loadConfig()` đọc env, validate, trả object typed; throw nếu thiếu `GEMINI_API_KEY` (chỉ throw khi thực sự gọi transcribe — không throw lúc khởi động server).
2. `provider.ts`: định nghĩa interface + input type.
3. `gemini.ts`: implement `GeminiSttProvider`, đọc WAV base64, gọi `generateContent`, parse `response.text`, xử lý lỗi (network/quota → message gọn).
4. Manual test: dùng 1 file WAV tiếng Việt mẫu (từ Phase 2 record) → in transcript ra console.

## Success Criteria
- [ ] WAV tiếng Việt → trả transcript text hợp lý.
- [ ] Thiếu `GEMINI_API_KEY` → lỗi rõ ràng, không crash toàn server lúc startup.
- [ ] API lỗi/quota → message gọn, không stack trace thô cho user.

## Risk Assessment
- API surface `@google/genai` có thể đổi → đã verify field `inlineData`/`generateContent`/`response.text` qua context7.
- Quota free tier → README ghi rõ; Groq Whisper là adapter dự phòng (out of scope v1, nhưng interface đã sẵn).
- Privacy: audio gửi lên Google → README disclaimer.
