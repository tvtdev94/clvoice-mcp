import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import type { SttProvider, TranscribeInput } from "./provider.js";

/** Build the transcription instruction for a given language. */
function buildPrompt(language: string): string {
  const lang = language === "vi" ? "Vietnamese" : language;
  return (
    `Transcribe the following ${lang} audio verbatim. ` +
    `Output ONLY the transcription text with correct ${lang} diacritics, ` +
    `no quotes, no translation, no commentary, no timestamps.`
  );
}

/** Gemini-backed STT provider using the @google/genai SDK and inline audio data. */
export class GeminiSttProvider implements SttProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and set it in the MCP server env.",
      );
    }

    const bytes = await readFile(input.wavPath);
    const base64 = bytes.toString("base64");

    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    let response;
    try {
      response = await ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt(input.language) },
              { inlineData: { mimeType: input.mimeType, data: base64 } },
            ],
          },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini API request failed: ${msg}`);
    }

    const text = (response.text ?? "").trim();
    if (!text) {
      throw new Error(
        "Gemini returned an empty transcription. The audio may be silent or too short.",
      );
    }
    return text;
  }
}
