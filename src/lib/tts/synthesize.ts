/**
 * TTS synthesis for the Reelwire pipeline.
 *
 * Deepgram's TTS (`/v1/speak`) returns audio only — it does NOT return word
 * timings. Caption sync therefore requires a second pass: transcribe the
 * generated audio with Nova STT (`/v1/listen`) to recover word-level timings.
 *
 * This module owns that orchestration as pure, fully-unit-tested logic over two
 * injected ports. The concrete `@deepgram/sdk` wiring that implements those
 * ports is an integration boundary built/smoke-tested separately (it needs a
 * live DEEPGRAM_API_KEY), the same way `env`/`db` are treated.
 */

/** A single word with start/end times in seconds (caption-ready). */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/** Deepgram Nova word shape (subset we consume). */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  punctuated_word?: string;
}

export interface SpeakOptions {
  voice: string;
  encoding: string;
  sampleRate: number;
}

export interface TranscribeOptions {
  encoding: string;
  sampleRate: number;
  model: string;
}

/** Injected ports — implemented by the concrete Deepgram adapter at the root. */
export interface SynthesizeDeps {
  speak: (text: string, opts: SpeakOptions) => Promise<Uint8Array>;
  transcribe: (audio: Uint8Array, opts: TranscribeOptions) => Promise<TranscriptWord[]>;
}

export interface SynthesizeOptions {
  /** Deepgram Aura voice id (default `aura-asteria-en`). */
  voice?: string;
  /** Nova STT model for the alignment pass (default `nova-3`). */
  sttModel?: string;
  /** Audio encoding shared by speak + transcribe (default `linear16`). */
  encoding?: string;
  /** Sample rate in Hz (default `24000`). */
  sampleRate?: number;
}

export interface SynthesisResult {
  audio: Uint8Array;
  words: WordTiming[];
  durationSec: number;
  voice: string;
  encoding: string;
  sampleRate: number;
}

const DEFAULT_VOICE = "aura-asteria-en";
const DEFAULT_STT_MODEL = "nova-3";
const DEFAULT_ENCODING = "linear16";
const DEFAULT_SAMPLE_RATE = 24000;

export async function synthesize(
  text: string,
  deps: SynthesizeDeps,
  opts: SynthesizeOptions = {},
): Promise<SynthesisResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("synthesize: text must not be empty");

  const voice = opts.voice ?? DEFAULT_VOICE;
  const encoding = opts.encoding ?? DEFAULT_ENCODING;
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const sttModel = opts.sttModel ?? DEFAULT_STT_MODEL;

  const audio = await deps.speak(trimmed, { voice, encoding, sampleRate });
  const rawWords = await deps.transcribe(audio, { encoding, sampleRate, model: sttModel });

  const words: WordTiming[] = rawWords.map((w) => ({
    word: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
  }));

  const durationSec = words.length > 0 ? words[words.length - 1].end : 0;

  return { audio, words, durationSec, voice, encoding, sampleRate };
}
