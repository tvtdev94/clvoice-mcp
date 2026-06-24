/**
 * Runtime configuration resolved from environment variables.
 *
 * Design note: missing GEMINI_API_KEY must NOT crash the server at startup —
 * the server should boot, advertise its tools, and only fail (with a clear
 * message) when a tool that actually needs the key is invoked.
 */

export interface Config {
  /** Selected STT backend. */
  sttProvider: "gemini" | "groq";
  /** Spoken language hint: "auto" (detect), "vi", "en", ... */
  language: string;
  /** Gemini API key. Empty string when unset — validated lazily by the STT provider. */
  geminiApiKey: string;
  /** Gemini model id used for transcription. */
  geminiModel: string;
  /** Groq API key. Empty string when unset — validated lazily by the STT provider. */
  groqApiKey: string;
  /** Groq Whisper model id used for transcription. */
  groqModel: string;
  /** Path to the ffmpeg binary (defaults to "ffmpeg" on PATH). */
  ffmpegPath: string;
  /** Explicit dshow microphone device name; empty = auto-pick first input. */
  micDevice: string;
  /** Default recording duration (seconds) when the tool caller omits it. */
  defaultSeconds: number;
  /** Hard upper bound on recording duration (seconds). */
  maxSeconds: number;
  /** When true, auto-paste (Ctrl+V) the transcript into the focused window. */
  autoPaste: boolean;
  /** When true, the MCP server hosts the push-to-talk hotkey watcher. */
  hotkeyEnabled: boolean;
  /** When true, clean filler words from the transcript via a Groq chat model. */
  cleanEnabled: boolean;
  /** Groq chat model used for transcript cleanup. */
  cleanModel: string;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(v)) return false;
  if (["true", "1", "yes", "on"].includes(v)) return true;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read and normalize configuration from process.env. Never throws. */
export function loadConfig(): Config {
  // Default to Groq (fast); set CLVOICE_STT=gemini to switch.
  const sttProvider = (process.env.CLVOICE_STT ?? "groq").trim().toLowerCase() === "gemini" ? "gemini" : "groq";
  return {
    sttProvider,
    language: (process.env.CLVOICE_LANG ?? "auto").trim().toLowerCase(),
    geminiApiKey: (process.env.GEMINI_API_KEY ?? "").trim(),
    geminiModel: (process.env.CLVOICE_GEMINI_MODEL ?? "gemini-2.5-flash").trim(),
    groqApiKey: (process.env.GROQ_API_KEY ?? "").trim(),
    groqModel: (process.env.CLVOICE_GROQ_MODEL ?? "whisper-large-v3-turbo").trim(),
    ffmpegPath: (process.env.CLVOICE_FFMPEG_PATH ?? "ffmpeg").trim(),
    micDevice: (process.env.CLVOICE_MIC_DEVICE ?? "").trim(),
    defaultSeconds: parsePositiveInt(process.env.CLVOICE_DEFAULT_SECONDS, 15),
    maxSeconds: parsePositiveInt(process.env.CLVOICE_MAX_SECONDS, 60),
    autoPaste: parseBool(process.env.CLVOICE_AUTO_PASTE, true),
    hotkeyEnabled: parseBool(process.env.CLVOICE_HOTKEY, true),
    cleanEnabled: parseBool(process.env.CLVOICE_CLEAN, true),
    cleanModel: (process.env.CLVOICE_CLEAN_MODEL ?? "llama-3.3-70b-versatile").trim(),
  };
}
