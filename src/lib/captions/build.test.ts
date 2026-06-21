import { describe, it, expect } from "vitest";
import { buildCaptions } from "./build";
import type { WordTiming } from "../tts/synthesize";

/** Build evenly-spaced words with no sentence punctuation. */
function words(texts: string[], step = 0.3, gap = 0): WordTiming[] {
  let t = 0;
  return texts.map((word) => {
    const start = t;
    const end = t + step;
    t = end + gap;
    return { word, start, end };
  });
}

describe("buildCaptions", () => {
  it("returns [] for empty input", () => {
    expect(buildCaptions([], { format: "VERTICAL_9_16" })).toEqual([]);
  });

  it("short format chunks into <=3-word cues by default", () => {
    const cues = buildCaptions(words(["a", "b", "c", "d", "e", "f", "g"]), {
      format: "VERTICAL_9_16",
    });
    expect(cues.map((c) => c.text)).toEqual(["a b c", "d e f", "g"]);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeCloseTo(0.9);
    expect(cues[0].words).toHaveLength(3);
  });

  it("long format chunks into <=7-word cues by default", () => {
    const cues = buildCaptions(words(["1", "2", "3", "4", "5", "6", "7", "8", "9"]), {
      format: "HORIZONTAL_16_9",
    });
    expect(cues.map((c) => c.text)).toEqual(["1 2 3 4 5 6 7", "8 9"]);
  });

  it("breaks a cue at sentence-ending punctuation", () => {
    const ws: WordTiming[] = [
      { word: "Hello", start: 0, end: 0.3 },
      { word: "world.", start: 0.3, end: 0.6 },
      { word: "again", start: 0.7, end: 0.9 },
    ];
    const cues = buildCaptions(ws, { format: "VERTICAL_9_16" });
    expect(cues.map((c) => c.text)).toEqual(["Hello world.", "again"]);
    expect(cues[0].end).toBe(0.6);
    expect(cues[1].start).toBe(0.7);
  });

  it("breaks on a long pause even below the word limit", () => {
    const ws: WordTiming[] = [
      { word: "a", start: 0, end: 0.2 },
      { word: "b", start: 0.2, end: 0.4 },
      { word: "c", start: 1.5, end: 1.7 }, // 1.1s gap > 0.5 default
    ];
    const cues = buildCaptions(ws, { format: "VERTICAL_9_16" });
    expect(cues.map((c) => c.text)).toEqual(["a b", "c"]);
  });

  it("honors custom maxWords and gapThresholdSec", () => {
    const cues = buildCaptions(words(["a", "b", "c", "d"]), {
      format: "VERTICAL_9_16",
      maxWords: 2,
      gapThresholdSec: 100, // disable pause-breaks
    });
    expect(cues.map((c) => c.text)).toEqual(["a b", "c d"]);
  });

  it("yields a single cue for a single word", () => {
    const cues = buildCaptions([{ word: "solo", start: 0, end: 0.5 }], {
      format: "HORIZONTAL_16_9",
    });
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ text: "solo", start: 0, end: 0.5 });
  });
});
