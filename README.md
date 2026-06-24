# clvoice-mcp

**Nhập liệu bằng giọng nói tiếng Việt** vào bất kỳ ô nhập nào (Claude Code, editor...). Thu mic (qua `ffmpeg`) → **Gemini API** chuyển thành text → dán transcript vào ô nhập đang focus để bạn **chỉnh sửa rồi tự gửi** (không thực thi ngay).

Có **2 cách dùng** (chung lõi: recorder + Gemini STT + clipboard/paste):
1. **Hotkey toàn cục (khuyến nghị, hands-free)** — nhấn phím tắt, nói, text hiện trong ô nhập. Độc lập, không cần Claude.
2. **MCP tool** `voice_listen` — Claude gọi tool khi bạn ra hiệu (gõ 1 câu).

> Viết bằng TypeScript. Hỗ trợ **Windows** (microphone qua DirectShow/`dshow`).

## Cách 1 — Hotkey push-to-talk (hands-free, khuyến nghị)

```
GIỮ Ctrl+`  →  thu mic (đang giữ thì còn thu)  →  THẢ phím  →  Gemini STT
   →  dán transcript vào ô nhập đang focus  →  bạn sửa  →  Enter
```

Giữ phím để nói, thả ra là dừng + transcribe (không cố định thời lượng). Watcher poll `GetAsyncKeyState` — KHÔNG hook bàn phím nên AV-safe; điều khiển ffmpeg trực tiếp, dừng bằng `q` để WAV hợp lệ.

**Chạy trong cửa sổ PowerShell của bạn** (để thấy status + nghe beep):

```powershell
npm run build
npm run hotkey -- -ApiKey "AIza..." -MicDevice "Microphone (2- USB PnP Audio Device)"
# Hoặc đặt sẵn env GEMINI_API_KEY/CLVOICE_MIC_DEVICE rồi chỉ cần: npm run hotkey
```

Báo hiệu trạng thái:
- beep cao + `RECORDING...` (đỏ) = bắt đầu thu
- beep trầm + `transcribing...` (vàng) = đã thả, đang xử lý
- beep ngắn + dòng `transcript: ...` = xong, đã dán (beep trầm dài = lỗi)

Tùy chọn `scripts/clvoice-hotkey.ps1`:
- `-Key` đổi phím chính: `F1`-`F12`, chữ/số, `SPACE`, hoặc phím OEM `` ` `` `- = [ ] ; ' , . / \`. Mặc định `` ` ``.
- `-NoCtrl` (bỏ Ctrl), `-Alt` (thêm Alt), `-Shift` (thêm Shift), `-NoBeep` (tắt beep).
- Ví dụ: `-Key ';'` → Ctrl+; ; `-Alt -Key Q` → Ctrl+Alt+Q ; `-NoCtrl -Key F9` → chỉ giữ F9.
- Mặc định hotkey = **Ctrl+`**.

Để tự chạy lúc khởi động Windows: tạo shortcut tới lệnh trên, hoặc Task Scheduler (trigger At log on).

**Hoặc để MCP server tự host watcher** (khuyến nghị — không cần `npm run hotkey`): đặt `CLVOICE_HOTKEY=1` trong env của MCP server (`.mcp.json`/`.claude.json`). Khi Claude Code khởi động, server tự bật watcher cho cả session và tắt khi đóng.

Nhiều cửa sổ Claude Code:
- **Chỉ 1 watcher** chạy (khóa single-instance `%TEMP%\clvoice-hotkey.lock`) → không thu trùng.
- **Takeover poll**: nếu cửa sổ đang giữ watcher bị đóng/crash, một cửa sổ còn lại tự lên thay trong ~5s → hotkey còn sống chừng nào còn ≥1 session mở.
- Lưu ý: dòng status clvoice là **chung** — khi thu, mọi session đều hiện `🔴 ĐANG THU` (chỉ thẩm mỹ; transcript vẫn dán đúng cửa sổ đang focus).

### Status ngay trên terminal Claude Code (tùy chọn)

Watcher ghi trạng thái ra `%TEMP%\clvoice-state.txt` (`REC`/`STT`/rỗng). Một wrapper statusline đọc file đó và hiển thị 1 dòng dưới khung chat Claude Code (giữ nguyên statusline sẵn có, chỉ nối thêm khi đang thu/đang xử lý):

```jsonc
// ~/.claude/settings.json
"statusLine": {
  "type": "command",
  "command": "node \"C:\\w\\clvoice-mcp\\scripts\\clvoice-statusline.cjs\"",
  "padding": 0,
  "refreshInterval": 1   // cập nhật mỗi 1s kể cả khi idle (đang giữ phím)
}
```

- `🔴 clvoice: ĐANG THU` khi giữ phím · `⏳ clvoice: đang chuyển giọng nói...` khi thả · idle thì ẩn.
- Độ trễ ~1s (theo refresh tick); beep vẫn báo tức thì.
- Wrapper `scripts/clvoice-statusline.cjs` tự gọi lại statusline cũ (`~/.claude/statusline.cjs`) nên không mất thông tin model/context.

## Cách 2 — MCP tool

```
Bạn gõ: "nghe tôi nói"  →  Claude gọi voice_listen(15s)
   →  thu mic → Gemini STT → dán vào ô nhập  →  bạn sửa → Enter
```

**Quan trọng (cả 2 cách):** transcript **không** được trả về cho Claude và **không thực thi ngay** — chỉ đưa vào ô nhập để bạn sửa rồi tự gửi. Tắt auto-paste bằng `CLVOICE_AUTO_PASTE=false` (chỉ copy clipboard, tự Ctrl+V).

## Setup trên máy khác (Windows, Groq mặc định)

### Tự động (khuyến nghị)
```powershell
cd clvoice-mcp
powershell -ExecutionPolicy Bypass -File setup.ps1
```
Script tự: cài deps + build → dò mic (cho chọn) → hỏi Groq key → đăng ký MCP (user scope). Hotkey + dọn từ đệm đã **bật mặc định** nên không cần khai báo. Xong thì restart Claude Code. (Có thể truyền sẵn: `-GroqKey <key> -MicDevice "<mic>"`.)

### Thủ công

1. **Cài sẵn:** Node.js ≥ 18, **ffmpeg** trên PATH (`ffmpeg -version`), một microphone. Lấy **Groq API key** free: https://console.groq.com/keys
2. **Lấy code + build:**
   ```powershell
   git clone <repo>   # hoặc copy thư mục clvoice-mcp
   cd clvoice-mcp
   npm install
   npm run build
   ```
3. **Tìm tên mic:**
   ```powershell
   ffmpeg -list_devices true -f dshow -i dummy
   ```
   Copy tên trong nhóm "audio" (vd `Microphone (Realtek Audio)`).
4. **Đăng ký MCP (user-scope):** thay `<KEY>`, `<MIC>`, `<ĐƯỜNG-DẪN>`:
   ```powershell
   claude mcp add clvoice --scope user ^
     --env GROQ_API_KEY=<KEY> ^
     --env "CLVOICE_MIC_DEVICE=<MIC>" ^
     -- node <ĐƯỜNG-DẪN>\dist\index.js
   ```
   (Groq STT + hotkey + dọn từ đệm đều **bật mặc định** → không cần khai báo. Muốn Gemini: thêm `--env CLVOICE_STT=gemini --env GEMINI_API_KEY=...`. Tắt hotkey/clean: `--env CLVOICE_HOTKEY=0` / `--env CLVOICE_CLEAN=0`.)
5. **(Tuỳ chọn) Status trên terminal:** thêm `statusLine` trỏ tới `scripts\clvoice-statusline.cjs` (xem mục Status bên dưới) — nhớ đường dẫn tuyệt đối của máy đó.
6. **Restart Claude Code**, đợi ~3-5s, bấm **Ctrl+`** để dùng.

> Lưu ý: đường dẫn `dist\index.js`, mic, và đường dẫn statusline **khác nhau theo máy** — chỉnh cho đúng máy đó.

## Yêu cầu

- **Node.js ≥ 18**
- **ffmpeg** cài sẵn và nằm trên `PATH` (kiểm tra: `ffmpeg -version`). Tải: https://ffmpeg.org/download.html
- **Groq API key** (mặc định, free): https://console.groq.com/keys — hoặc **Gemini API key**: https://aistudio.google.com/apikey
- Một microphone hoạt động

## Cài đặt & build

```bash
npm install
npm run build
```

Sinh ra `dist/index.js`.

## Đăng ký vào Claude Code

Dùng **đường dẫn tuyệt đối** tới `dist/index.js`:

```bash
claude mcp add clvoice --env GEMINI_API_KEY=YOUR_KEY -- node C:\\path\\to\\clvoice-mcp\\dist\\index.js
```

Hoặc cấu hình thủ công trong `.mcp.json` / settings:

```json
{
  "mcpServers": {
    "clvoice": {
      "command": "node",
      "args": ["C:\\path\\to\\clvoice-mcp\\dist\\index.js"],
      "env": { "GEMINI_API_KEY": "YOUR_KEY" }
    }
  }
}
```

## Biến môi trường

| Biến | Bắt buộc | Mặc định | Mô tả |
|------|----------|----------|-------|
| `CLVOICE_STT` | ❌ | `groq` | Engine STT: `groq` (mặc định, nhanh ~1s) hoặc `gemini`. |
| `GROQ_API_KEY` | ✅ (khi dùng groq) | — | Groq API key (free): https://console.groq.com/keys |
| `CLVOICE_GROQ_MODEL` | ❌ | `whisper-large-v3-turbo` | Model Whisper trên Groq. |
| `GEMINI_API_KEY` | khi dùng gemini | — | Gemini API key (free tier). |
| `CLVOICE_GEMINI_MODEL` | ❌ | `gemini-2.5-flash` | Model Gemini dùng để transcribe. Nếu model bị gỡ (lỗi 404), đổi sang model flash mới hơn (vd `gemini-flash-latest`). |
| `CLVOICE_MIC_DEVICE` | ❌ | (tự chọn mic đầu tiên) | Tên thiết bị dshow chính xác. |
| `CLVOICE_FFMPEG_PATH` | ❌ | `ffmpeg` | Đường dẫn binary ffmpeg. |
| `CLVOICE_DEFAULT_SECONDS` | ❌ | `15` | Thời lượng thu mặc định. |
| `CLVOICE_MAX_SECONDS` | ❌ | `60` | Chặn trên thời lượng thu. |
| `CLVOICE_AUTO_PASTE` | ❌ | `true` | `true`: tự dán (Ctrl+V) transcript vào ô nhập. `false`: chỉ copy clipboard, tự dán tay. |
| `CLVOICE_HOTKEY` | ❌ | `true` | MCP server tự chạy hotkey watcher suốt session (không cần `npm run hotkey`). Khóa single-instance chống trùng nhiều cửa sổ. Đặt `0` để tắt. |
| `CLVOICE_CLEAN` | ❌ | `true` | Dọn từ đệm (à/um/ờ...) + chuẩn hoá dấu câu bằng Groq LLM sau khi transcribe (+~0.4s). Cần `GROQ_API_KEY`. Fail-open. Đặt `0` để tắt. |
| `CLVOICE_CLEAN_MODEL` | ❌ | `llama-3.3-70b-versatile` | Model Groq dùng để dọn từ đệm. |

## Tools

### `voice_listen({ seconds?, language? })`
Thu mic `seconds` giây (mặc định 15, clamp theo `CLVOICE_MAX_SECONDS`), transcribe rồi **đưa text vào ô nhập** (clipboard + auto-paste) để bạn sửa. Không trả transcript về Claude, không thực thi. `language` mặc định `"vi"`.

### `list_audio_devices()`
Liệt kê tên microphone (dshow) để bạn đặt `CLVOICE_MIC_DEVICE` cho đúng.

## Chọn đúng microphone

Tên thiết bị dshow khác nhau giữa các máy. Nếu thu sai mic hoặc báo không có mic:

1. Gọi tool `list_audio_devices` (hoặc chạy `ffmpeg -list_devices true -f dshow -i dummy`).
2. Copy tên chính xác (ví dụ `Microphone (Realtek Audio)`).
3. Đặt `CLVOICE_MIC_DEVICE` bằng tên đó.

## Quyền riêng tư

Audio được gửi lên Google (Gemini API) để chuyển thành văn bản. Không dùng nếu nội dung nhạy cảm. Bản local STT (offline) nằm ngoài phạm vi v1.

## Troubleshooting

| Triệu chứng | Nguyên nhân & cách xử lý |
|-------------|--------------------------|
| `ffmpeg not found` | Cài ffmpeg và thêm vào PATH, hoặc set `CLVOICE_FFMPEG_PATH`. |
| `No microphone input device found` | Chạy `list_audio_devices`, set `CLVOICE_MIC_DEVICE`. |
| `GEMINI_API_KEY is not set` | Thêm key vào env khi đăng ký MCP server. |
| Transcript rỗng | Audio im lặng/quá ngắn — nói to/rõ hơn, tăng `seconds`. |
| Lỗi quota Gemini | Free tier có giới hạn rate; đợi hoặc nâng quota. |
| Model 404 (no longer available) | Model bị Google gỡ — set `CLVOICE_GEMINI_MODEL` sang model mới (vd `gemini-flash-latest`). |
| Auto-paste không dán vào đúng chỗ | Cửa sổ Claude Code phải đang focus. Transcript vẫn nằm trong clipboard — nhấn Ctrl+V thủ công. Hoặc set `CLVOICE_AUTO_PASTE=false`. |

## Giới hạn v1 (out of scope)

Daemon hotkey/gõ phím ảo · tự dừng khi im lặng (VAD) · vòng lặp hội thoại tự động · local STT · macOS/Linux · sửa chính tả bằng LLM.

## License

MIT
