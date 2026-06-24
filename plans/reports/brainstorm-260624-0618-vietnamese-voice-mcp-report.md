# Brainstorm: clvoice-mcp — Voice input tiếng Việt cho Claude Code

- Date: 2026-06-24
- Status: Approved (v1 design)
- Mode: brainstorm (no flags)
- Repo: `C:\w\clvoice-mcp` (greenfield, trống)

## Problem statement
User muốn nhập liệu cho Claude Code bằng **giọng nói tiếng Việt** thay vì gõ. Viết bằng **TypeScript**, đóng gói dạng **MCP server**.

## Bối cảnh codebase (scout)
- Thư mục trống hoàn toàn → greenfield, không ràng buộc stack/schema/API.
- Platform: Windows (win32) → ràng buộc chính cho thu âm mic.

## Mâu thuẫn kiến trúc cốt lõi (brutal honesty)
MCP = mô hình **pull** (Claude gọi tool, tool trả kết quả). Không đẩy text vào ô nhập được.
"Voice input" thông thường = **push** (nói → text hiện ở input trước khi Claude xử lý).
→ Hai chiều ngược nhau. Phải chọn cách dung hòa.

## Approaches đã cân nhắc
| Hướng | Mô tả | Pros | Cons | Chọn |
|---|---|---|---|---|
| A — MCP listen tool | Claude gọi `voice_listen()` → thu mic → STT → trả transcript | Đúng chuẩn MCP, ship nhanh, cross-platform | Phải kích hoạt mỗi lượt, không hands-free hẳn | ✅ v1 |
| B — Daemon hotkey + gõ phím ảo | App nền hotkey → thu → tự gõ vào terminal | UX tự nhiên nhất | KHÔNG phải MCP, native module khó trên Windows | ❌ |
| C — Hybrid vòng lặp | MCP tool Claude tự gọi lại liên tục | Gần hands-free | Phức tạp, phụ thuộc Claude gọi lại | ❌ (upgrade sau) |

## Giải pháp chốt (v1)
MCP server TS, stdio transport, expose **1 tool** `voice_listen`.

### Quyết định
- **Engine STT**: **Gemini API (free tier — Google AI Studio)**. Tiếng Việt tốt, audio input, free để bắt đầu. Adapter pattern để thêm **Groq Whisper API (free tier)** / local whisper sau.
- **Dừng thu âm**: thời lượng cố định (mặc định 15s, Claude truyền `seconds`). MCP tool không nhận phím Enter người dùng → VAD là upgrade.
- **Thu mic**: shell ra **ffmpeg** (`dshow` trên Windows). Ổn định, không build native. User phải cài ffmpeg sẵn.
- **Kiến trúc**: interface `SttProvider` → core không phụ thuộc engine cụ thể.

### Tool contract
`voice_listen({ seconds?: number = 15, language?: string = "vi" }) -> { text: string }`

### Config (env)
- `GEMINI_API_KEY` (bắt buộc cho v1)
- `CLVOICE_FFMPEG_PATH` (tùy chọn, mặc định `ffmpeg` trên PATH)
- `CLVOICE_MAX_SECONDS` (chặn trên thời lượng thu)

### Cấu trúc thư mục
```
clvoice-mcp/
├── src/
│   ├── index.ts              # MCP bootstrap + đăng ký tool
│   ├── tools/voice-listen.ts
│   ├── audio/recorder.ts     # ffmpeg wrapper (dshow)
│   └── stt/
│       ├── provider.ts       # interface SttProvider
│       └── gemini.ts         # Gemini adapter
├── package.json
├── tsconfig.json
└── README.md
```

## Acceptance criteria
1. `claude mcp add clvoice -- node dist/index.js` → tool `voice_listen` hiện trong Claude Code.
2. Nói tiếng Việt 1 câu → trả đúng text (chấp nhận sai chính tả nhẹ).
3. Lỗi rõ ràng khi thiếu API key / thiếu ffmpeg / không có mic.
4. Build TS sạch, chạy trên Windows.

## Out of scope (v1)
Daemon hotkey/gõ phím ảo · VAD tự dừng · vòng lặp hội thoại · local STT · đa nền tảng · sửa chính tả bằng LLM.

## Rủi ro & mitigation
- **Tên mic dshow khác nhau giữa máy** → README kèm lệnh liệt kê device + config name. (Điểm dễ vướng nhất.)
- Latency vài giây (thu + upload + STT) → chấp nhận v1.
- Privacy: audio gửi lên Google → ghi rõ; muốn riêng tư dùng local STT (v2).
- Gemini free tier có rate limit → ghi rõ; Groq Whisper là phương án free thứ 2.

## Success metrics
- Setup tới lần transcribe đầu tiên < 10 phút theo README.
- Độ chính xác tiếng Việt "đủ dùng" cho câu lệnh ngắn-vừa.

## Next steps
- `/ck:plan` để chia phase triển khai (bootstrap MCP → recorder ffmpeg → Gemini adapter → tool wiring → README/test thủ công).

## Unresolved questions
- Cần xác định cách Claude biết khi nào nên gọi `voice_listen` (prompt convention vs slash command wrapper) — quyết khi plan.
- Có cần lệnh phụ `list_audio_devices` để hỗ trợ setup không? (đề xuất: có, nhỏ gọn, giảm rủi ro mic — cân nhắc khi plan).
