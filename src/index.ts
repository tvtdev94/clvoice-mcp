#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createSttProvider } from "./stt/factory.js";
import { createVoiceListenHandler } from "./tools/voice-listen.js";
import { createListAudioDevicesHandler } from "./tools/list-audio-devices.js";
import { startHotkeyWatcher } from "./hotkey-host.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const stt = createSttProvider(config);

  const server = new McpServer({ name: "clvoice-mcp", version: "0.1.0" });

  const voiceListen = createVoiceListenHandler({ config, stt });
  const listDevices = createListAudioDevicesHandler({ config });

  server.registerTool(
    "voice_listen",
    {
      title: "Voice Listen (Vietnamese)",
      description:
        "Record the microphone for a few seconds, transcribe the Vietnamese speech, and place the " +
        "text into the user's input box (clipboard + optional auto-paste) for them to edit. " +
        "It does NOT return the transcript and must NOT be executed: after calling, just confirm " +
        "briefly and wait for the user's next (edited) message. Use when the user wants to dictate input.",
      inputSchema: {
        seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Recording duration in seconds (default 15, clamped to the server max)."),
        language: z
          .string()
          .optional()
          .describe('Spoken language hint, default "vi" (Vietnamese).'),
      },
    },
    async (args) => voiceListen(args),
  );

  server.registerTool(
    "list_audio_devices",
    {
      title: "List Audio Input Devices",
      description:
        "List available microphone input device names so the user can set CLVOICE_MIC_DEVICE.",
      inputSchema: {},
    },
    async () => listDevices(),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Optionally host the push-to-talk hotkey watcher for this session's lifetime.
  if (config.hotkeyEnabled) startHotkeyWatcher();
}

main().catch((err) => {
  // Fatal bootstrap error — log to stderr (stdout is reserved for MCP protocol).
  console.error("clvoice-mcp failed to start:", err);
  process.exit(1);
});
