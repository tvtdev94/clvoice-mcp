/** Speech-to-text provider abstraction. */

export interface TranscribeInput {
  /** Absolute path to the audio file to transcribe. */
  wavPath: string;
  /** MIME type of the audio file, e.g. "audio/wav". */
  mimeType: string;
  /** BCP-47-ish language hint, e.g. "vi". */
  language: string;
}

/**
 * A pluggable STT backend. v1 ships GeminiSttProvider; the interface keeps the
 * door open for Groq Whisper / local whisper adapters without touching callers.
 */
export interface SttProvider {
  transcribe(input: TranscribeInput): Promise<string>;
}
