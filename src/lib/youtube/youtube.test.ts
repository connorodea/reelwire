import { describe, it, expect, vi } from "vitest";
import { buildVideoMetadata, uploadVideo, type YoutubePort } from "./youtube";
import type { ScriptDraft } from "../script/generate";

function script(overrides: Partial<ScriptDraft> = {}): ScriptDraft {
  return {
    hook: "hook",
    body: [],
    cta: null,
    thumbnailPrompt: null,
    videoTitle: "The Title",
    videoDesc: "A description.",
    videoTags: ["a", "b"],
    model: "claude-sonnet-4-6",
    tokensIn: null,
    tokensOut: null,
    ...overrides,
  };
}

function fakePort(videoId = "abc123") {
  const insertVideo = vi.fn(async (_input: unknown) => ({ videoId }));
  const port: YoutubePort = { insertVideo };
  return { port, insertVideo };
}

describe("buildVideoMetadata", () => {
  it("builds Shorts metadata: appends #Shorts, defaults category 22 + private", () => {
    const meta = buildVideoMetadata({ script: script(), channel: {}, format: "VERTICAL_9_16" });
    expect(meta.snippet.title).toBe("The Title");
    expect(meta.snippet.description).toBe("A description.\n\n#Shorts");
    expect(meta.snippet.tags).toEqual(["a", "b"]);
    expect(meta.snippet.categoryId).toBe("22");
    expect(meta.status.privacyStatus).toBe("private");
    expect(meta.status.selfDeclaredMadeForKids).toBe(false);
  });

  it("does not duplicate #Shorts when the description already has it", () => {
    const meta = buildVideoMetadata({
      script: script({ videoDesc: "Watch this #shorts now" }),
      channel: {},
      format: "VERTICAL_9_16",
    });
    const count = (meta.snippet.description.match(/#shorts/gi) ?? []).length;
    expect(count).toBe(1);
  });

  it("does not append #Shorts for long-form", () => {
    const meta = buildVideoMetadata({ script: script(), channel: {}, format: "HORIZONTAL_16_9" });
    expect(meta.snippet.description).toBe("A description.");
  });

  it("truncates a title longer than 100 characters", () => {
    const meta = buildVideoMetadata({
      script: script({ videoTitle: "x".repeat(120) }),
      channel: {},
      format: "VERTICAL_9_16",
    });
    expect(meta.snippet.title).toHaveLength(100);
  });

  it("caps tags at 15 and honors custom category + privacy", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const meta = buildVideoMetadata({
      script: script({ videoTags: tags }),
      channel: { categoryId: "27" },
      format: "VERTICAL_9_16",
      privacyStatus: "public",
    });
    expect(meta.snippet.tags).toHaveLength(15);
    expect(meta.snippet.categoryId).toBe("27");
    expect(meta.status.privacyStatus).toBe("public");
  });
});

describe("uploadVideo", () => {
  it("uploads and returns a Shorts URL for short formats", async () => {
    const { port, insertVideo } = fakePort("abc123");
    const meta = buildVideoMetadata({ script: script(), channel: {}, format: "VERTICAL_9_16" });

    const result = await uploadVideo(
      { metadata: meta, videoPath: "/tmp/v.mp4", format: "VERTICAL_9_16" },
      port,
    );

    expect(insertVideo).toHaveBeenCalledTimes(1);
    expect(insertVideo.mock.calls[0][0]).toEqual({ metadata: meta, videoPath: "/tmp/v.mp4" });
    expect(result).toEqual({
      videoId: "abc123",
      url: "https://www.youtube.com/shorts/abc123",
    });
  });

  it("returns a standard watch URL for long-form", async () => {
    const { port } = fakePort("xyz789");
    const meta = buildVideoMetadata({ script: script(), channel: {}, format: "HORIZONTAL_16_9" });

    const result = await uploadVideo(
      { metadata: meta, videoPath: "/tmp/v.mp4", format: "HORIZONTAL_16_9" },
      port,
    );

    expect(result.url).toBe("https://www.youtube.com/watch?v=xyz789");
  });
});
