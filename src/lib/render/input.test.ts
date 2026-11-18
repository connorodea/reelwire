import { describe, it, expect } from "vitest";
import { buildRenderInput } from "./input";
import type { ScriptDraft } from "../script/generate";
import type { CaptionCue } from "../captions/build";

const SCRIPT: ScriptDraft = {
  hook: "Big news.",
  body: [
    { text: "Segment one.", brollKeywords: ["a"] },
    { text: "Segment two.", brollKeywords: [] },
  ],
  cta: "Subscribe!",
  thumbnailPrompt: "thumb prompt",
  videoTitle: "The Title",
  videoDesc: "a description",
  videoTags: ["x"],
  model: "claude-sonnet-4-6",
  tokensIn: 10,
  tokensOut: 20,
};

const CAPTIONS: CaptionCue[] = [
  {
    text: "Big news.",
    start: 0,
    end: 0.5,
    words: [
      { word: "Big", start: 0, end: 0.2 },
      { word: "news.", start: 0.2, end: 0.5 },
    ],
  },
];

const BASE = { script: SCRIPT, audioUrl: "https://cdn/x.mp3", captions: CAPTIONS, durationSec: 30 };

describe("buildRenderInput", () => {
  it("builds vertical render input with default fps + composition and maps props", () => {
    const input = buildRenderInput({ ...BASE, format: "VERTICAL_9_16" });
    expect(input).toEqual({
      compositionId: "NewsReel",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
      props: {
        title: "The Title",
        hook: "Big news.",
        segments: SCRIPT.body,
        captions: CAPTIONS,
        audioUrl: "https://cdn/x.mp3",
        cta: "Subscribe!",
      },
    });
  });

  it("uses horizontal dimensions for long-form", () => {
    const input = buildRenderInput({ ...BASE, format: "HORIZONTAL_16_9" });
    expect(input.width).toBe(1920);
    expect(input.height).toBe(1080);
  });

  it("uses square dimensions", () => {
    const input = buildRenderInput({ ...BASE, format: "SQUARE_1_1" });
    expect(input.width).toBe(1080);
    expect(input.height).toBe(1080);
  });

  it("honors custom fps + compositionId and rounds frames up", () => {
    const input = buildRenderInput({
      ...BASE,
      format: "VERTICAL_9_16",
      durationSec: 1.1,
      fps: 24,
      compositionId: "Reel",
    });
    expect(input.fps).toBe(24);
    expect(input.compositionId).toBe("Reel");
    expect(input.durationInFrames).toBe(27); // ceil(1.1 * 24) = 27
  });

  it("floors the duration to at least one frame for zero-length audio", () => {
    const input = buildRenderInput({ ...BASE, format: "VERTICAL_9_16", durationSec: 0 });
    expect(input.durationInFrames).toBe(1);
  });
});
