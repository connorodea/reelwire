import { describe, it, expect, vi } from "vitest";
import { runPipeline, type PipelineChannel, type PipelinePorts } from "./run";
import type { ScriptDraft, ScriptStory } from "../script/generate";
import type { SynthesisResult } from "../tts/synthesize";
import type { RenderInput } from "../render/input";
import type { VideoMetadata } from "../youtube/youtube";

const STORY: ScriptStory = {
  title: "OpenAI ships a model",
  snippet: "summary",
  sourceName: "TC",
  sourceUrl: "https://t.co/x",
};

const CHANNEL: PipelineChannel = {
  name: "Lab",
  niche: "AI",
  personaPrompt: "persona",
  ctaSnippet: "cta",
  voiceId: "aura-luna-en",
  categoryId: "28",
};

const REF = { tenantId: "t", channelId: "c", videoId: "vid1" };

const SCRIPT: ScriptDraft = {
  hook: "Big news.",
  body: [
    { text: "Seg one.", brollKeywords: [] },
    { text: "Seg two.", brollKeywords: [] },
  ],
  cta: "Subscribe!",
  thumbnailPrompt: null,
  videoTitle: "The Title",
  videoDesc: "desc",
  videoTags: ["x"],
  model: "claude-sonnet-4-6",
  tokensIn: 1,
  tokensOut: 2,
};

const AUDIO_BYTES = new Uint8Array([9, 9, 9]);

const SYNTH: SynthesisResult = {
  audio: AUDIO_BYTES,
  words: [
    { word: "Hello", start: 0, end: 0.3 },
    { word: "world.", start: 0.3, end: 0.6 },
    { word: "again", start: 0.7, end: 0.9 },
  ],
  durationSec: 12,
  voice: "aura-luna-en",
  encoding: "linear16",
  sampleRate: 24000,
};

function fakePorts() {
  const statuses: string[] = [];
  const generateScript = vi.fn(async (_s: unknown, _c: unknown, _f: unknown) => SCRIPT);
  const synthesize = vi.fn(async (_text: string, _voice: string) => SYNTH);
  const storeAudio = vi.fn(async (_ref: unknown, _bytes: Uint8Array) => ({
    publicUrl: "https://cdn/a.mp3",
  }));
  const render = vi.fn(async (_input: unknown, outputPath: string) => ({ outputPath }));
  const upload = vi.fn(async (_m: unknown, _p: string, _f: unknown) => ({
    videoId: "yt1",
    url: "https://www.youtube.com/shorts/yt1",
  }));
  const setStatus = vi.fn(async (s: string) => {
    statuses.push(s);
  });
  const ports: PipelinePorts = { generateScript, synthesize, storeAudio, render, upload, setStatus };
  return { ports, generateScript, synthesize, storeAudio, render, upload, setStatus, statuses };
}

describe("runPipeline", () => {
  it("runs every stage, wires outputs through, and records status transitions in order", async () => {
    const p = fakePorts();

    const result = await runPipeline(
      { ref: REF, story: STORY, channel: CHANNEL, format: "VERTICAL_9_16", workdir: "/tmp/work" },
      p.ports,
    );

    expect(result).toEqual({
      videoId: "yt1",
      videoUrl: "https://www.youtube.com/shorts/yt1",
      scriptTitle: "The Title",
      durationSec: 12,
      captionCount: 2, // "Hello world." (sentence break) + "again"
      status: "COMPLETED",
    });

    expect(p.statuses).toEqual([
      "SCRIPTING",
      "SYNTHESIZING",
      "RENDERING",
      "UPLOADING",
      "COMPLETED",
    ]);

    expect(p.generateScript).toHaveBeenCalledWith(STORY, CHANNEL, "VERTICAL_9_16");
    // narration = hook + segment texts
    expect(p.synthesize).toHaveBeenCalledWith("Big news. Seg one. Seg two.", "aura-luna-en");
    expect(p.storeAudio.mock.calls[0][0]).toEqual(REF);
    expect(p.storeAudio.mock.calls[0][1]).toBe(AUDIO_BYTES);

    const [renderInput, outPath] = p.render.mock.calls[0] as [RenderInput, string];
    expect(outPath).toBe("/tmp/work/vid1.mp4");
    expect(renderInput.width).toBe(1080);
    expect(renderInput.durationInFrames).toBe(360); // 12s * 30fps
    expect(renderInput.props.audioUrl).toBe("https://cdn/a.mp3");
    expect(renderInput.props.captions).toHaveLength(2);

    const [meta, videoPath, fmt] = p.upload.mock.calls[0] as [VideoMetadata, string, string];
    expect(videoPath).toBe("/tmp/work/vid1.mp4");
    expect(fmt).toBe("VERTICAL_9_16");
    expect(meta.snippet.title).toBe("The Title");
  });

  it("sets status FAILED and rethrows when a stage fails", async () => {
    const p = fakePorts();
    p.render.mockRejectedValueOnce(new Error("render boom"));

    await expect(
      runPipeline(
        { ref: REF, story: STORY, channel: CHANNEL, format: "HORIZONTAL_16_9", workdir: "/tmp" },
        p.ports,
      ),
    ).rejects.toThrow("render boom");

    expect(p.statuses).toEqual(["SCRIPTING", "SYNTHESIZING", "RENDERING", "FAILED"]);
    expect(p.upload).not.toHaveBeenCalled();
  });
});
