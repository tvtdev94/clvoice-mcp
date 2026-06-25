import { readFile } from "node:fs/promises";
import type { SttProvider, TranscribeInput } from "./provider.js";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Groq-backed STT provider (OpenAI-compatible Whisper endpoint). Much faster
 * than the Gemini path for short clips (~0.5-2s vs ~3-5s).
 */
export class GroqSttProvider implements SttProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys.",
      );
    }

    const bytes = await readFile(input.wavPath);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: input.mimeType }), "audio.wav");
    form.append("model", this.model);
    // Omit "language" to let Whisper auto-detect (handles Vietnamese + English).
    if (input.language && input.language !== "auto") form.append("language", input.language);
    form.append("response_format", "json");
    form.append("temperature", "0"); // reduce hallucination on noise/silence

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(`Groq API request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { text?: string };
    const text = (data.text ?? "").trim();
    if (!text) {
      throw new Error("Groq returned an empty transcription. The audio may be silent or too short.");
    }
    return text;
  }
}
