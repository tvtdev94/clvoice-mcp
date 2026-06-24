import type { Config } from "../config.js";
import type { SttProvider } from "./provider.js";
import { GeminiSttProvider } from "./gemini.js";
import { GroqSttProvider } from "./groq.js";

/** Build the STT provider selected by config (CLVOICE_STT). */
export function createSttProvider(config: Config): SttProvider {
  if (config.sttProvider === "groq") {
    return new GroqSttProvider({ apiKey: config.groqApiKey, model: config.groqModel });
  }
  return new GeminiSttProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
}
