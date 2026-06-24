import type { Config } from "./config.js";
import type { SttProvider } from "./stt/provider.js";
import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordAudio, cleanupTemp } from "./audio/recorder.js";
import { copyToClipboard, pasteToActiveWindow } from "./output/clipboard.js";
import { cleanTranscript } from "./clean.js";

const STATE_FILE = join(tmpdir(), "clvoice-state.txt");

/** Write the phase shown by the Claude Code statusline ("STT" | "CLEAN" | ""). */
function setState(s: string): void {
  try {
    writeFileSync(STATE_FILE, s);
  } catch {
    // ignore
  }
}

/** Append a diagnostic line to %TEMP%/clvoice-debug.log. Never throws. */
function debugLog(line: string): void {
  try {
    appendFileSync(join(tmpdir(), "clvoice-debug.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore
  }
}

export interface CaptureDeps {
  config: Config;
  stt: SttProvider;
}

export interface CaptureOptions {
  seconds: number;
  language: string;
}

export interface CaptureResult {
  /** The transcribed text (also placed on the clipboard). */
  text: string;
  /** Whether the text was auto-pasted into the focused window. */
  pasted: boolean;
}

/**
 * Transcribe an existing audio file, copy to clipboard, and optionally paste it
 * into the focused window. Shared by the fixed-duration path and the
 * push-to-talk path (where recording is controlled externally).
 */
export async function insertFromFile(
  deps: CaptureDeps,
  input: { wavPath: string; mimeType: string; language: string },
): Promise<CaptureResult> {
  try {
    setState("STT");
    const raw = await deps.stt.transcribe({
      wavPath: input.wavPath,
      mimeType: input.mimeType,
      language: input.language,
    });

    let text = raw;
    if (deps.config.cleanEnabled) {
      setState("CLEAN");
      text = await cleanTranscript(raw, { apiKey: deps.config.groqApiKey, model: deps.config.cleanModel });
    }

    debugLog(
      `stt=${deps.config.sttProvider} clean=${deps.config.cleanEnabled} changed=${raw !== text} ` +
        `model=${deps.config.cleanModel} | raw="${raw}" | final="${text}"`,
    );

    await copyToClipboard(text);

    let pasted = false;
    if (deps.config.autoPaste) {
      try {
        await pasteToActiveWindow();
        pasted = true;
      } catch {
        pasted = false; // Clipboard still holds the text.
      }
    }

    return { text, pasted };
  } finally {
    setState("");
  }
}

/**
 * Fixed-duration capture pipeline (used by the MCP tool and capture-once):
 * record mic for N seconds -> transcribe -> clipboard -> optional auto-paste.
 * Always cleans up the temporary recording.
 */
export async function captureToInput(
  deps: CaptureDeps,
  opts: CaptureOptions,
): Promise<CaptureResult> {
  let wavPath: string | undefined;
  try {
    const recording = await recordAudio({
      seconds: opts.seconds,
      deviceName: deps.config.micDevice || undefined,
      ffmpegPath: deps.config.ffmpegPath,
    });
    wavPath = recording.wavPath;

    return await insertFromFile(deps, {
      wavPath: recording.wavPath,
      mimeType: recording.mimeType,
      language: opts.language,
    });
  } finally {
    if (wavPath) await cleanupTemp(wavPath);
  }
}
