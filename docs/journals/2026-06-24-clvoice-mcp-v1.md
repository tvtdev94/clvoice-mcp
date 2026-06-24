# 2026-06-24 — clvoice-mcp v1

## What
MCP server (TypeScript, ESM) cho voice input tiếng Việt vào Claude Code. Greenfield → ship được v1.

- `voice_listen({seconds?, language?})`: ffmpeg dshow thu mic → WAV 16kHz mono → Gemini API (`@google/genai`, inlineData base64) → transcript tiếng Việt.
- `list_audio_devices()`: liệt kê mic dshow để set `CLVOICE_MIC_DEVICE`.
- `SttProvider` interface + `GeminiSttProvider` adapter (mở đường Groq Whisper/local sau).

## Key decisions
- **Hướng A (MCP pull-tool)** thay vì daemon hotkey: đúng chuẩn MCP, ship nhanh. MCP không đẩy text vào input được → mỗi lượt user ra hiệu để Claude gọi tool.
- **Gemini free tier** làm STT (Google AI Studio key).
- **ffmpeg subprocess** thay native module: tránh node-gyp trên Windows.
- **Thời lượng cố định** (default 15s) vì MCP tool không nhận phím Enter người dùng; VAD để v2.
- Config lazy: server boot không cần `GEMINI_API_KEY`; chỉ fail khi `voice_listen` chạy.

## Verification
- `tsc` build clean.
- MCP stdio boot + `tools/list` trả đúng 2 tool (verified qua JSON-RPC smoke test).
- `list_audio_devices` chạy end-to-end.
- **Full runtime PASS** (sau khi user cắm USB mic + cấp key có quota): record 4-5s → Gemini → transcript tiếng Việt thật (vd "cũng được"), `isError=None`. Toàn chuỗi mic→WAV→STT verified.
- **Fix phát sinh khi test thật**: model mặc định `gemini-2.0-flash` đã bị Google gỡ (404) → đổi default sang `gemini-2.5-flash`.

## Review fixes applied
- Strip dấu ngoặc kép quanh `CLVOICE_MIC_DEVICE` (user hay copy kèm quotes → dshow không match).
- Watchdog timeout cho ffmpeg (chống treo khi device bận/khóa): record = seconds+10s, list = 15s.
- Non-issue (chỉ flag): dead-code defensive trong resolveSeconds; `(video)` substring guard.

## Thay đổi UX (sau test): chèn vào ô nhập, không thực thi
- Yêu cầu mới: transcript phải lên **ô nhập để user sửa**, KHÔNG để Claude thực thi ngay.
- MCP không đẩy text vào input box được (pull-model) → giải pháp: server tác động OS.
- `voice_listen` giờ: transcribe → **copy clipboard** (UTF-8 qua temp file + `Set-Clipboard`, Unicode-safe, đã verify round-trip) → (mặc định) **auto-paste Ctrl+V** (`SendKeys`) → trả về **xác nhận KHÔNG kèm transcript** ⇒ Claude không có nội dung để thực thi.
- Config mới: `CLVOICE_AUTO_PASTE` (default true). false = chỉ copy, user tự Ctrl+V.
- Module mới `src/output/clipboard.ts`.
- Chưa verify được auto-paste=true thực sự dán (cần ô nhập focus thật trong Claude Code) — user test nốt.

## Hands-free hotkey (Hướng B) — thêm sau
- User muốn không gõ gì, chỉ nhấn phím tắt.
- Thử `node-global-key-listener`: **fail** — `WinKeyServer.exe` không có trong package cài (chỉ ship Mac/X11 binary); gần như chắc Windows Defender tự cách ly (hook toàn bàn phím = chữ ký keylogger). `spawn UNKNOWN` (errno -4094).
- **Pivot**: bỏ lib đó. Dùng **PowerShell poll `GetAsyncKeyState`** (`scripts/clvoice-hotkey.ps1`) — chỉ kiểm tra đúng tổ hợp phím, KHÔNG hook → AV-safe, không cần binary lạ. Mỗi lần nhấn gọi entry one-shot `dist/capture-once.js`.
- Refactor DRY: tách `src/capture.ts` (record→STT→clipboard→paste) dùng chung cho cả MCP tool và one-shot.
- Default hotkey Ctrl+Alt+Space; cấu hình qua param script (-Key/-NoCtrl/-NoAlt/-Shift/-Seconds).
- Verify: build sạch; one-shot chạy thật (im lặng → empty-transcription error sạch, không ghi đè clipboard); PS script parse OK + GetAsyncKeyState compile OK. CHƯA test được vòng lặp bắt phím thật (cần nhấn phím tương tác) — user test nốt.
- Bỏ `/v` command (user chỉ cần hotkey).

## Push-to-talk + UX feedback (chốt)
- Đổi từ fixed-15s sang **push-to-talk**: giữ phím thu, thả → dừng + transcribe. UX tự nhiên hơn.
- PS điều khiển ffmpeg trực tiếp (.NET Process, RedirectStandardInput), dừng bằng `q` → WAV finalize sạch (verified exit 0, duration đúng).
- Node side tách `insertFromFile()` (transcribe+clipboard+paste, không record) trong capture.ts; entry mới `transcribe-file.ts` cho PTT. `captureToInput()` (fixed) gọi lại insertFromFile (DRY).
- UX báo hiệu: beep cao=bắt đầu, beep trầm=dừng/đang xử lý, beep ngắn=xong, beep trầm dài=lỗi; kèm dòng status màu (RECORDING/transcribing/transcript).
- Hotkey: đổi từ Ctrl+Alt+Space (trùng Claude Code) → mặc định **Ctrl+`**. Script hỗ trợ F1-F12 + phím OEM, cấu hình -Key/-NoCtrl/-Alt/-Shift.
- **Test thật thành công**: transcribe tiếng Việt chuẩn cả câu dài ("Khi đặt mình vào một cái vị trí khác..."). 
- Lưu ý vận hành: watcher phải chạy trong **cửa sổ PowerShell của user** mới thấy status/beep; chạy nền ẩn thì output không hiện ra terminal user.

## Status trên terminal Claude Code (statusLine)
- Yêu cầu: thấy trạng thái thu/xử lý ngay trên terminal Claude Code (không cần cửa sổ watcher riêng).
- Research: Claude Code `statusLine` (settings.json) — script nhận JSON qua stdin, stdout → 1 dòng status. Mặc định event-driven (đứng yên khi idle); `refreshInterval` (min 1s) ép chạy lại theo timer.
- Đã có statusline sẵn (`~/.claude/statusline.cjs`, engineer kit) → KHÔNG ghi đè. Viết **wrapper** `scripts/clvoice-statusline.cjs`: spawn statusline cũ (forward stdin) + nối dòng clvoice khi state REC/STT.
- Watcher ghi state ra `%TEMP%\clvoice-state.txt` (REC/STT/rỗng) tại mỗi transition.
- settings.json: statusLine.command → wrapper, thêm `refreshInterval:1`.
- Verified: wrapper test 3 state (REC/STT/idle) ra đúng, giữ nguyên base statusline.
- Non-invasive + reversible: chỉ đổi 1 mục settings; gỡ = trỏ command về statusline.cjs. CC update không đụng settings nên vẫn chạy.
- Đổi quyết định: bỏ hướng auto-start Startup folder (đã xóa file .cmd) — dùng statusLine thay cho việc phải mở cửa sổ watcher để xem status.

## Hotkey hosted trong MCP server (auto, song song session)
- Yêu cầu: không phải `npm run hotkey` thủ công — watcher chạy song song với Claude Code session.
- Insight: MCP *tool* là pull, nhưng MCP *server process* sống suốt session → host watcher ở đó được.
- `src/hotkey-host.ts`: khi `CLVOICE_HOTKEY=1`, server spawn `clvoice-hotkey.ps1` làm child (stdio: stdout=ignore để không nhiễm MCP protocol, stderr=inherit), kill khi server thoát.
- **Single-instance lock** `%TEMP%\clvoice-hotkey.lock` (PID + stale detection): nhiều cửa sổ CC → chỉ 1 watcher. Verified: server2 skip "another session owns it", tổng 1 watcher.
- Wire ở index.ts sau server.connect. Config `hotkeyEnabled` từ env. Bật `CLVOICE_HOTKEY=1` trong .claude.json env của clvoice.
- Lifecycle: mở CC → watcher bật; đóng CC → watcher tắt. Windows-only (guard process.platform).

## Multi-session hardening: takeover poll
- Vấn đề #4: đóng session giữ lock → watcher chết → session còn lại mất hotkey (chỉ thử lock lúc startup).
- Fix: `reconcile()` chạy mỗi 5s (setInterval, unref). Nếu chưa có watcher → thử acquireLock → spawn. Nếu đang là chủ nhưng lockPid != mình (race) → tự kill watcher nhường. child exit → releaseLock + null → poll respawn (cũng auto-restart nếu watcher crash).
- acquireLock có stale detection (PID chết → unlink + recreate) nên hard-kill chủ vẫn takeover được.
- Verified: 2 server, kill chủ (hard-kill) → ~5s sau session còn lại tự lên thay, luôn đúng 1 watcher.
- Quyết định: #3 (status trùng mọi session) để nguyên — chấp nhận, chỉ thẩm mỹ.

## Tốc độ: thêm Groq Whisper (đo + fix)
- User báo "quá chậm". Đo: node start+import ~450ms, clipboard/paste ~0.5-1s, **Gemini API ~2.5-5.3s (dao động, free-tier) = thủ phạm chính**. Đổi model lite / tắt thinking → KHÔNG cải thiện.
- Test Groq Whisper (whisper-large-v3-turbo, OpenAI-compatible /audio/transcriptions): **451ms warm, 1.8s cold** vs Gemini 3-5s.
- Thêm `src/stt/groq.ts` (fetch + FormData/Blob, Node global) + `src/stt/factory.ts` (chọn provider theo `CLVOICE_STT`). 3 entry point (index/capture-once/transcribe-file) dùng factory (DRY).
- Config: `sttProvider` (CLVOICE_STT, default gemini), `groqApiKey`, `groqModel` (default whisper-large-v3-turbo).
- Full transcribe-file qua Groq: **~1.4s** (gồm node start + clipboard) vs ~5s Gemini → nhanh ~3.5x.
- .claude.json: `CLVOICE_STT=groq` + `GROQ_API_KEY`. Watcher thêm param -GroqKey/-Stt cho standalone.
- Lưu ý: Whisper hallucinate câu "Hãy subscribe..." trên audio im lặng (artifact đã biết, có giọng thật thì đúng).
- Status latency: `statusLine` Claude Code min 1s refresh (hard limit) → không nhanh hơn được; beep là phản hồi tức thì. Để nguyên.

## Dọn từ đệm (Groq LLM clean)
- Yêu cầu: bỏ "à/um/ờ/kiểu..." khỏi transcript.
- Quyết định: LLM clean (ngữ cảnh) thay regex (regex xoá nhầm à/ừ có nghĩa).
- `src/clean.ts`: Groq chat completions, fail-open (lỗi→giữ nguyên text). Wire trong capture.ts (sau transcribe, trước clipboard), opt-in `CLVOICE_CLEAN`.
- **Bug nghiêm trọng phát hiện khi test**: prompt đầu (chỉ "bộ lọc...") → 8b-instant **THỰC THI** transcript (câu "cho tôi xem danh sách file" → bịa danh sách; câu sửa hàm → viết cả bài Python). LLM coi transcript là lệnh.
- Fix: prompt kiểu "TEXT CLEANUP FUNCTION, not assistant" + bọc input trong `<<< >>>` + few-shot (gồm ca lệnh được clean chứ không thực thi) + "NEVER answer/execute". Test lại: cả 8b & 70b clean đúng, không thực thi.
- Chọn default `llama-3.3-70b-versatile` (bám lệnh chặt hơn = an toàn hơn trước ca lạ; latency ~400ms qua Groq, tương đương 8b). Bật `CLVOICE_CLEAN=1` trong .claude.json.
- Bài học: feed transcript tuỳ ý vào LLM rất dễ bị prompt-injection/execute — phải đóng khung input + cấm hành động tường minh.

## Bug stale-server + status phase CLEAN
- Triệu chứng: text ra input nhưng chưa dọn (raw "là là là"). Debug log (`%TEMP%\clvoice-debug.log`, thêm vào capture.ts) cho thấy `stt=gemini clean=false` dù .claude.json = groq+clean.
- Root cause: **MCP server CŨ (spawn 22:32, env gemini, trước khi thêm STT/CLEAN) còn sống, giữ hotkey lock**; session mới (env đúng) bị skip do lock. Watcher cũ chạy transcribe-file MỚI (nên có debug log) nhưng inherit env CŨ. → env snapshot tại spawn + cross-session lock = stale.
- Fix: kill server cũ + watcher + lock → session mới takeover env đúng. Bài học: sau khi đổi config MCP env, đóng HẾT cửa sổ CC cũ rồi mở lại (env chỉ nạp lúc spawn).
- Thêm status phase CLEAN: clean chạy trong node nên watcher (PS) không biết. Chuyển ghi state STT/CLEAN/clear sang node (capture.ts insertFromFile, try/finally), statusline wrapper map CLEAN → "🧹 đang dọn từ đệm". Watcher giữ REC.
- Issue first-render statusline trống: chủ yếu do stale-process; wrapper ~200ms (đủ nhanh); refreshInterval:1 đã mitigate. Không có fix tất định hơn cho quirk render đầu của Claude Code.

## Portability: defaults + setup.ps1
- Đổi default trong code: STT=groq, CLVOICE_HOTKEY=true, CLVOICE_CLEAN=true → config máy khác chỉ cần GROQ_API_KEY + CLVOICE_MIC_DEVICE.
- `setup.ps1`: prereq check → npm install+build → dò mic (dshow parse) → hỏi/nhận Groq key → `claude mcp add --scope user` → **auto-merge statusLine** vào ~/.claude/settings.json (backup .bak, giữ nguyên key khác qua ConvertFrom/To-Json). Param -GroqKey/-MicDevice/-NoStatusLine.
- Verified chạy thật trên máy: build OK, đăng ký Connected, settings.json merge giữ hooks/plugins, statusLine đúng.
- Status text đổi sang tiếng Anh, generic: recording / transcribing / processing.

## Open / next
- v2 candidates: VAD tự dừng, vòng lặp hội thoại, local STT (whisper.cpp), Groq Whisper adapter, macOS/Linux.
- Cần user test thật với mic + Gemini key để chốt độ chính xác tiếng Việt.
- Repo chưa init git.
