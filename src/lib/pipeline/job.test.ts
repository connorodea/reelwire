import { describe, it, expect, vi } from "vitest";
import { processVideoJob, type JobRecord, type JobStore, type VideoJobPayload } from "./job";
import type { PipelineChannel } from "./run";
import type { ScriptDraft, ScriptStory } from "../script/generate";
import type { SynthesisResult } from "../tts/synthesize";

const STORY: ScriptStory = { title: "t", snippet: "s", sourceName: "src", sourceUrl: "https://u" };

const CHANNEL: PipelineChannel = {
  name: "Lab",
  niche: "AI",
  personaPrompt: "persona",
  ctaSnippet: "cta",
  voiceId: "aura-luna-en",
  categoryId: "28",
};

const PAYLOAD: VideoJobPayload = {
  jobId: "job-1",
  ref: { tenantId: "t", channelId: "c", videoId: "vid1" },
  story: STORY,
  channel: CHANNEL,
  format: "VERTICAL_9_16",
  workdir: "/tmp/work",
};

const SCRIPT: ScriptDraft = {
  hook: "Big news.",
  body: [{ text: "Seg one.", brollKeywords: [] }],
  cta: null,
  thumbnailPrompt: null,
  videoTitle: "The Title",
  videoDesc: "desc",
  videoTags: [],
  model: "claude-sonnet-4-6",
  tokensIn: null,
  tokensOut: null,
};

const SYNTH: SynthesisResult = {
  audio: new Uint8Array([1]),
  words: [{ word: "Big", start: 0, end: 0.2 }],
  durationSec: 5,
  voice: "aura-luna-en",
  encoding: "linear16",
  sampleRate: 24000,
};

function fakeDeps(existing: JobRecord | null) {
  const get = vi.fn(async (_id: string) => existing);
  const setStatus = vi.fn(async (_id: string, _s: string) => {});
  const recordResult = vi.fn(async (_id: string, _r: unknown) => {});
  const store: JobStore = { get, setStatus, recordResult };

  const generateScript = vi.fn(async () => SCRIPT);
  const synthesize = vi.fn(async () => SYNTH);
  const storeAudio = vi.fn(async () => ({ publicUrl: "https://cdn/a.mp3" }));
  const render = vi.fn(async (_i: unknown, outputPath: string) => ({ outputPath }));
  const upload = vi.fn(async () => ({ videoId: "yt1", url: "https://www.youtube.com/shorts/yt1" }));
  const ports = { generateScript, synthesize, storeAudio, render, upload };

  return {
    deps: { store, ports },
    get,
    setStatus,
    recordResult,
    generateScript,
    render,
  };
}

describe("processVideoJob", () => {
  it("skips processing when the job is already COMPLETED (idempotency)", async () => {
    const d = fakeDeps({ status: "COMPLETED", videoId: "old-vid", videoUrl: "https://yt/old" });

    const result = await processVideoJob(PAYLOAD, d.deps);

    expect(result).toEqual({
      status: "completed",
      videoId: "old-vid",
      videoUrl: "https://yt/old",
      skipped: true,
    });
    expect(d.generateScript).not.toHaveBeenCalled();
    expect(d.recordResult).not.toHaveBeenCalled();
  });

  it("runs the pipeline for a new job, wires setStatus to the store, and records the result", async () => {
    const d = fakeDeps(null);

    const result = await processVideoJob(PAYLOAD, d.deps);

    expect(result).toEqual({
      status: "completed",
      videoId: "yt1",
      videoUrl: "https://www.youtube.com/shorts/yt1",
      skipped: false,
    });
    expect(d.generateScript).toHaveBeenCalledTimes(1);
    expect(d.setStatus.mock.calls.map((c) => c[1])).toEqual([
      "SCRIPTING",
      "SYNTHESIZING",
      "RENDERING",
      "UPLOADING",
      "COMPLETED",
    ]);
    expect(d.setStatus.mock.calls.every((c) => c[0] === "job-1")).toBe(true);
    expect(d.recordResult).toHaveBeenCalledWith("job-1", {
      videoId: "yt1",
      videoUrl: "https://www.youtube.com/shorts/yt1",
    });
  });

  it("propagates a pipeline failure, records FAILED, and does not record a result", async () => {
    const d = fakeDeps(null);
    d.render.mockRejectedValueOnce(new Error("render boom"));

    await expect(processVideoJob(PAYLOAD, d.deps)).rejects.toThrow("render boom");

    expect(d.setStatus.mock.calls.map((c) => c[1])).toContain("FAILED");
    expect(d.recordResult).not.toHaveBeenCalled();
  });

  it("re-runs a job that exists but is not COMPLETED (e.g. a FAILED retry)", async () => {
    const d = fakeDeps({ status: "FAILED", videoId: null, videoUrl: null });

    const result = await processVideoJob(PAYLOAD, d.deps);

    expect(result.skipped).toBe(false);
    expect(d.generateScript).toHaveBeenCalledTimes(1);
  });
});
