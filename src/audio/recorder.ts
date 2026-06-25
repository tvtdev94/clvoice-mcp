import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

export interface RecordOptions {
  /** Recording duration in seconds. */
  seconds: number;
  /** dshow audio device name; when empty the first detected input is used. */
  deviceName?: string;
  /** ffmpeg binary path (defaults to "ffmpeg"). */
  ffmpegPath?: string;
}

export interface RecordResult {
  /** Absolute path to the recorded WAV file. */
  wavPath: string;
  /** MIME type of the recording. */
  mimeType: string;
}

const FFMPEG_MISSING_HINT =
  "ffmpeg not found. Install ffmpeg and ensure it is on PATH (or set CLVOICE_FFMPEG_PATH).";

function ffmpegBin(ffmpegPath?: string): string {
  return ffmpegPath && ffmpegPath.length > 0 ? ffmpegPath : "ffmpeg";
}

/** Run ffmpeg, collecting stderr. Resolves with stderr text on the given exit policy. */
function runFfmpeg(
  bin: string,
  args: string[],
  opts: { allowNonZero?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    let settled = false;

    // Watchdog: dshow can block indefinitely opening a busy/locked device, so
    // bound every invocation rather than relying solely on ffmpeg's own `-t`.
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          reject(
            new Error(
              `ffmpeg timed out after ${opts.timeoutMs}ms (device may be busy or locked).`,
            ),
          );
        }, opts.timeoutMs)
      : undefined;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      done(() => {
        if (err.code === "ENOENT") {
          reject(new Error(FFMPEG_MISSING_HINT));
        } else {
          reject(err);
        }
      });
    });

    child.on("close", (code) => {
      done(() => {
        if (code === 0 || opts.allowNonZero) {
          resolve(stderr);
        } else {
          const tail = stderr.split("\n").slice(-8).join("\n").trim();
          reject(new Error(`ffmpeg exited with code ${code}.\n${tail}`));
        }
      });
    });
  });
}

/**
 * List dshow audio input device names on Windows.
 *
 * `ffmpeg -list_devices true -f dshow -i dummy` always exits non-zero (it is a
 * query, not a transcode) and prints the device list to stderr, so we parse
 * stderr and ignore the exit code.
 */
export async function listInputDevices(ffmpegPath?: string): Promise<string[]> {
  const stderr = await runFfmpeg(
    ffmpegBin(ffmpegPath),
    ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
    { allowNonZero: true, timeoutMs: 15000 },
  );

  const devices: string[] = [];
  let inAudioSection = false;

  for (const rawLine of stderr.split("\n")) {
    const line = rawLine.trim();
    // Newer ffmpeg groups devices under "DirectShow audio devices" headers.
    if (/DirectShow audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }
    if (/DirectShow video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    const nameMatch = line.match(/"([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    // Skip the "Alternative name" lines (device paths), keep friendly names.
    if (/Alternative name/i.test(line)) continue;

    // Older ffmpeg tags each line with "(audio)"/"(video)" instead of headers.
    if (/\(audio\)/i.test(line)) {
      devices.push(name);
    } else if (inAudioSection && !/\(video\)/i.test(line)) {
      devices.push(name);
    }
  }

  // De-duplicate while preserving order.
  return [...new Set(devices)];
}

/**
 * Record microphone audio to a temporary 16kHz mono WAV using ffmpeg dshow.
 * Picks the first available input device when `deviceName` is not provided.
 */
export async function recordAudio(options: RecordOptions): Promise<RecordResult> {
  const bin = ffmpegBin(options.ffmpegPath);

  let device = options.deviceName?.trim();
  // Users often copy the device name wrapped in quotes; dshow needs the raw name.
  if (device) device = device.replace(/^"(.*)"$/, "$1");
  if (!device) {
    const devices = await listInputDevices(options.ffmpegPath);
    if (devices.length === 0) {
      throw new Error(
        "No microphone input device found. Run the list_audio_devices tool, then set CLVOICE_MIC_DEVICE.",
      );
    }
    device = devices[0];
  }

  const wavPath = join(tmpdir(), `clvoice-${randomUUID()}.wav`);

  await runFfmpeg(
    bin,
    [
      "-hide_banner",
      "-f",
      "dshow",
      "-i",
      `audio=${device}`,
      "-t",
      String(options.seconds),
      // Clean the signal for the STT model: drop sub-80Hz rumble/AC hum, then
      // loudness-normalize so quiet mics are boosted to a consistent level.
      "-af",
      "highpass=f=80,dynaudnorm",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-y",
      wavPath,
    ],
    // Allow the full recording plus headroom for device-open before killing.
    { timeoutMs: (options.seconds + 10) * 1000 },
  );

  return { wavPath, mimeType: "audio/wav" };
}

/** Best-effort removal of a temporary recording. Never throws. */
export async function cleanupTemp(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore — file may already be gone.
  }
}
