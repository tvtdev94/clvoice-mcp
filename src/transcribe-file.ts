#!/usr/bin/env node
/**
 * Transcribe an existing WAV file -> clipboard + auto-paste, then delete it.
 * Invoked by the push-to-talk watcher (clvoice-hotkey.ps1) after it has
 * recorded audio on key-hold and stopped on key-release.
 *
 * argv[2] = wav path (required), argv[3] = language hint (default "vi").
 */
import { loadConfig } from "./config.js";
import { createSttProvider } from "./stt/factory.js";
import { insertFromFile } from "./capture.js";
import { cleanupTemp } from "./audio/recorder.js";

async function main(): Promise<void> {
  const wavPath = process.argv[2];
  if (!wavPath) {
    console.error("usage: transcribe-file <wav> [language]");
    process.exit(2);
  }
  const config = loadConfig();
  const stt = createSttProvider(config);
  const language = (process.argv[3] ?? config.language).trim() || config.language;

  try {
    const { text, pasted } = await insertFromFile(
      { config, stt },
      { wavPath, mimeType: "audio/wav", language },
    );
    console.log(`[clvoice] transcript: ${text}`);
    console.log(
      pasted
        ? "[clvoice] pasted into focused window."
        : "[clvoice] copied to clipboard (press Ctrl+V).",
    );
  } finally {
    await cleanupTemp(wavPath);
  }
}

main().catch((err) => {
  console.error("[clvoice] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
