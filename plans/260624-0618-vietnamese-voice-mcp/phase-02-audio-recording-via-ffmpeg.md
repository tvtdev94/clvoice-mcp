---
phase: 2
title: Audio recording via ffmpeg
status: completed
priority: P1
dependencies:
  - 1
effort: M
---

# Phase 2: Audio recording via ffmpeg

## Overview
Module thu microphone trên Windows bằng cách shell ra `ffmpeg` (dshow), ghi WAV tạm theo thời lượng cố định. Kèm helper liệt kê audio device để hỗ trợ setup.

## Requirements
- Functional:
  - `recordAudio({ seconds, deviceName?, ffmpegPath? }) -> Promise<{ wavPath, mimeType }>` thu mic `seconds` giây ra file WAV tạm.
  - `listInputDevices({ ffmpegPath? }) -> Promise<string[]>` parse danh sách audio input device từ ffmpeg.
- Non-functional: dọn file tạm; lỗi rõ ràng khi thiếu ffmpeg / không tìm thấy device.

## Architecture
- `src/audio/recorder.ts`.
- Windows dshow: `ffmpeg -f dshow -i audio="<device>" -t <seconds> -ar 16000 -ac 1 -y <out.wav>`.
  - 16kHz mono WAV — đủ cho STT, file nhỏ.
  - Device mặc định: nếu không truyền `deviceName`, lấy device đầu tiên từ `listInputDevices`; nếu rỗng → throw lỗi hướng dẫn.
- List device: `ffmpeg -list_devices true -f dshow -i dummy` → ffmpeg in ra **stderr**, parse các dòng có `(audio)`.
- File tạm: `os.tmpdir()` + tên unique (dùng `process.pid` + counter, KHÔNG dùng Date.now/Math.random nếu chạy trong harness — nhưng đây là code runtime app, được phép; vẫn ưu tiên `crypto.randomUUID()`).
- Spawn qua `node:child_process` `spawn`; check `error` event (ENOENT → ffmpeg chưa cài) và exit code.

## Related Code Files
- Create: `src/audio/recorder.ts`
- Modify: (none — index wiring để Phase 4)

## Implementation Steps
1. `recorder.ts`: hàm `resolveFfmpeg(ffmpegPath?)` → trả path hoặc `"ffmpeg"`.
2. `listInputDevices`: spawn `ffmpeg -list_devices true -f dshow -i dummy`, gom stderr, regex lấy tên trong `"..."` thuộc nhóm `(audio)`. Trả mảng tên.
3. `recordAudio`: build args dshow như trên; spawn; reject nếu `error`(ENOENT) hoặc exit≠0 kèm tail stderr; resolve `{ wavPath, mimeType:"audio/wav" }`.
4. Helper `cleanupTemp(path)` xóa file an toàn (try/catch).
5. Unit-ish manual: chạy thử `listInputDevices` in ra device thật; thu 3s và kiểm tra file WAV có dung lượng > 0.

## Success Criteria
- [ ] `listInputDevices()` trả ít nhất 1 tên mic trên máy có mic.
- [ ] `recordAudio({seconds:3})` tạo file WAV > 0 byte.
- [ ] Thiếu ffmpeg → lỗi message rõ "ffmpeg not found, install and add to PATH".
- [ ] Không còn file tạm rác sau khi cleanup.

## Risk Assessment
- **Tên device dshow khác nhau giữa máy** (điểm dễ vướng nhất) → expose `deviceName` config + tool `list_audio_devices` (Phase 4) để user lấy đúng tên.
- Tên device có ký tự đặc biệt/Unicode → truyền nguyên `audio=<name>` qua spawn args (không qua shell) để tránh quoting lỗi.
- Mitigation: log args ffmpeg khi debug; tail stderr trong thông báo lỗi.
