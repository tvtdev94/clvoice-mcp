#!/usr/bin/env node
/**
 * One-shot voice capture: record mic -> transcribe -> clipboard + auto-paste,
 * then exit. Designed to be invoked by the PowerShell hotkey watcher
 * (clvoice-hotkey.ps1) on each hotkey press.
 *
 * Optional argv[2] overrides the recording duration in seconds.
 */
import { loadConfig } from "./config.js";
import { createSttProvider } from "./stt/factory.js";
import { captureToInput } from "./capture.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const stt = createSttProvider(config);

  const argSeconds = Number.parseInt(process.argv[2] ?? "", 10);
  const seconds =
    Number.isFinite(argSeconds) && argSeconds > 0
      ? Math.min(argSeconds, config.maxSeconds)
      : config.defaultSeconds;

  console.log(`[clvoice] recording ${seconds}s...`);
  const { text, pasted } = await captureToInput({ config, stt }, { seconds, language: config.language });
  console.log(`[clvoice] transcript: ${text}`);
  console.log(
    pasted
      ? "[clvoice] pasted into focused window."
      : "[clvoice] copied to clipboard (press Ctrl+V).",
  );
}

main().catch((err) => {
  console.error("[clvoice] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
