import { describe, it, expect, vi } from "vitest";
import {
  synthesize,
  type SynthesizeDeps,
  type TranscriptWord,
} from "./synthesize";

const AUDIO = new Uint8Array([1, 2, 3, 4]);

function fakeDeps(words: TranscriptWord[], audio: Uint8Array = AUDIO) {
  const speak = vi.fn(async (_text: string, _opts: unknown) => audio);
  const transcribe = vi.fn(async (_audio: Uint8Array, _opts: unknown) => words);
  const deps: SynthesizeDeps = { speak, transcribe };
  return { deps, speak, transcribe };
}

describe("synthesize", () => {
  it("rejects empty / whitespace-only text without calling speak", async () => {
    const { deps, speak } = fakeDeps([]);
    await expect(synthesize("   ", deps)).rejects.toThrow(/must not be empty/);
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks the trimmed text, transcribes the audio, and maps word timings with defaults", async () => {
    const { deps, speak, transcribe } = fakeDeps([
      { word: "breaking", start: 0, end: 0.4, punctuated_word: "Breaking" },
      { word: "news", start: 0.4, end: 0.9, punctuated_word: "news." },
    ]);

    const result = await synthesize("  Breaking news.  ", deps);

    // speak: trimmed text + default voice/encoding/sampleRate
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe("Breaking news.");
    expect(speak.mock.calls[0][1]).toEqual({
      voice: "aura-asteria-en",
      encoding: "linear16",
      sampleRate: 24000,
    });

    // transcribe: the produced audio + default STT model + matching encoding/rate
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][0]).toBe(AUDIO);
    expect(transcribe.mock.calls[0][1]).toEqual({
      encoding: "linear16",
      sampleRate: 24000,
      model: "nova-3",
    });

    expect(result.audio).toBe(AUDIO);
    expect(result.words).toEqual([
      { word: "Breaking", start: 0, end: 0.4 },
      { word: "news.", start: 0.4, end: 0.9 },
    ]);
    expect(result.durationSec).toBe(0.9);
    expect(result.voice).toBe("aura-asteria-en");
    expect(result.encoding).toBe("linear16");
    expect(result.sampleRate).toBe(24000);
  });

  it("falls back to the raw word when punctuated_word is absent", async () => {
    const { deps } = fakeDeps([
      { word: "plain", start: 0, end: 0.2 },
      { word: "fancy", start: 0.2, end: 0.5, punctuated_word: "Fancy!" },
    ]);
    const result = await synthesize("plain fancy", deps);
    expect(result.words.map((w) => w.word)).toEqual(["plain", "Fancy!"]);
  });

  it("honors custom voice, sttModel, encoding and sampleRate", async () => {
    const { deps, speak, transcribe } = fakeDeps([{ word: "hi", start: 0, end: 0.1 }]);

    const result = await synthesize("hi", deps, {
      voice: "aura-orion-en",
      sttModel: "nova-2",
      encoding: "mp3",
      sampleRate: 48000,
    });

    expect(speak.mock.calls[0][1]).toEqual({
      voice: "aura-orion-en",
      encoding: "mp3",
      sampleRate: 48000,
    });
    expect(transcribe.mock.calls[0][1]).toEqual({
      encoding: "mp3",
      sampleRate: 48000,
      model: "nova-2",
    });
    expect(result.voice).toBe("aura-orion-en");
    expect(result.encoding).toBe("mp3");
    expect(result.sampleRate).toBe(48000);
  });

  it("returns durationSec 0 when transcription yields no words", async () => {
    const { deps } = fakeDeps([]);
    const result = await synthesize("silence please", deps);
    expect(result.words).toEqual([]);
    expect(result.durationSec).toBe(0);
  });
});
