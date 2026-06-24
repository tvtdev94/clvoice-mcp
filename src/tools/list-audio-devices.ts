import type { Config } from "../config.js";
import { listInputDevices } from "../audio/recorder.js";
import type { ToolResult } from "./voice-listen.js";

export interface ListAudioDevicesDeps {
  config: Config;
}

/**
 * Factory for the list_audio_devices tool handler: returns dshow microphone
 * names so the user can set CLVOICE_MIC_DEVICE to the exact value.
 */
export function createListAudioDevicesHandler(deps: ListAudioDevicesDeps) {
  return async (): Promise<ToolResult> => {
    try {
      const devices = await listInputDevices(deps.config.ffmpegPath);
      if (devices.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Không tìm thấy thiết bị microphone nào (dshow). Kiểm tra mic và quyền truy cập.",
            },
          ],
        };
      }
      const list = devices.map((d, i) => `${i + 1}. ${d}`).join("\n");
      const text =
        `Microphone devices:\n${list}\n\n` +
        `Đặt CLVOICE_MIC_DEVICE = tên chính xác (giá trị thuần, KHÔNG kèm dấu ngoặc kép). ` +
        `Khi set qua shell có khoảng trắng thì mới bọc ngoặc kép cho shell, ví dụ: CLVOICE_MIC_DEVICE="Microphone (Realtek Audio)".`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Lỗi list_audio_devices: ${msg}` }],
        isError: true,
      };
    }
  };
}
