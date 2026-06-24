import type { Config } from "../config.js";
import type { SttProvider } from "../stt/provider.js";
import { captureToInput } from "../capture.js";

export interface VoiceListenArgs {
  seconds?: number;
  language?: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** MCP CallToolResult carries an open index signature; mirror it for assignability. */
  [x: string]: unknown;
}

export interface VoiceListenDeps {
  config: Config;
  stt: SttProvider;
}

/** Clamp a requested duration into [1, maxSeconds], falling back to the default. */
function resolveSeconds(requested: number | undefined, config: Config): number {
  const base = requested ?? config.defaultSeconds;
  if (!Number.isFinite(base) || base < 1) return config.defaultSeconds;
  return Math.min(Math.floor(base), config.maxSeconds);
}

/**
 * Factory for the voice_listen tool handler: records the mic, transcribes, and
 * places the text into the user's input box (clipboard + optional auto-paste).
 * The transcript is intentionally NOT returned so the assistant cannot act on
 * it. Failures map to a friendly tool-level error instead of crashing.
 */
export function createVoiceListenHandler(deps: VoiceListenDeps) {
  return async (args: VoiceListenArgs): Promise<ToolResult> => {
    const seconds = resolveSeconds(args.seconds, deps.config);
    const language = (args.language ?? "vi").trim() || "vi";

    try {
      const { text, pasted } = await captureToInput(deps, { seconds, language });

      const status = pasted
        ? `Đã chèn transcript vào ô nhập (${text.length} ký tự). Mời người dùng chỉnh sửa rồi gửi.`
        : `Đã copy transcript vào clipboard (${text.length} ký tự). Nhấn Ctrl+V để dán vào ô nhập, chỉnh sửa rồi gửi.`;

      return {
        content: [
          {
            type: "text",
            text:
              `${status}\n\n` +
              `[Hướng dẫn cho trợ lý: KHÔNG thực thi, KHÔNG đoán nội dung vừa thu. ` +
              `Chỉ xác nhận ngắn gọn và chờ tin nhắn tiếp theo của người dùng.]`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Lỗi voice_listen: ${msg}` }],
        isError: true,
      };
    }
  };
}
