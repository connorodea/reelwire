import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  generateScript,
  defaultAnthropic,
  type ScriptChannel,
  type ScriptStory,
} from "./generate";

const STORY: ScriptStory = {
  title: "OpenAI ships a longer-context model",
  snippet: "The new model doubles the context window.",
  sourceName: "TechCrunch",
  sourceUrl: "https://techcrunch.com/openai",
};

const CHANNEL: ScriptChannel = {
  name: "Infinite AI Lab",
  niche: "AI",
  personaPrompt: "Skeptical, fast-talking AI analyst.",
  ctaSnippet: "▶ Automate your channel with Reelwire: https://reelwire.example",
};

function draftJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: "OpenAI just doubled its context window",
    hook: "OpenAI quietly shipped something huge.",
    segments: [
      { text: "Here's what changed.", brollKeywords: ["openai", "logo"] },
      { text: "And why it matters.", brollKeywords: ["context", "window"] },
    ],
    cta: "Subscribe for daily AI news.",
    thumbnailPrompt: "Glowing neural net over a city",
    description: "A breakdown of OpenAI's new model.",
    tags: ["ai", "openai", "llm"],
    ...overrides,
  });
}

function fakeClient(
  content: unknown,
  usage?: { input_tokens: number; output_tokens: number },
) {
  const create = vi.fn(
    async (_args: unknown) =>
      ({ content, usage }) as unknown as Awaited<ReturnType<Anthropic["messages"]["create"]>>,
  );
  const client = { messages: { create } } as unknown as Anthropic;
  return { client, create };
}

function textBlocks(text: string) {
  return [{ type: "text", text }];
}

describe("generateScript", () => {
  it("produces a vertical (short) draft mapped to the Script shape and defaults the model", async () => {
    const { client, create } = fakeClient(textBlocks(draftJson()), {
      input_tokens: 100,
      output_tokens: 200,
    });

    const draft = await generateScript({ story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" }, { client });

    expect(draft.videoTitle).toBe("OpenAI just doubled its context window");
    expect(draft.hook).toBe("OpenAI quietly shipped something huge.");
    expect(draft.body).toEqual([
      { text: "Here's what changed.", brollKeywords: ["openai", "logo"] },
      { text: "And why it matters.", brollKeywords: ["context", "window"] },
    ]);
    expect(draft.thumbnailPrompt).toBe("Glowing neural net over a city");
    expect(draft.videoTags).toEqual(["ai", "openai", "llm"]);
    expect(draft.model).toBe("claude-sonnet-4-6");
    expect(draft.tokensIn).toBe(100);
    expect(draft.tokensOut).toBe(200);

    const args = create.mock.calls[0][0] as {
      model: string;
      system: string;
      messages: { content: string }[];
    };
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.system).toContain("Skeptical, fast-talking AI analyst.");
    expect(args.system).toContain("under 60 seconds");
    expect(args.system).toContain("120-150 words");
    const user = args.messages[0].content;
    expect(user).toContain("OpenAI ships a longer-context model");
    expect(user).toContain("TechCrunch");
    expect(user).toContain("https://techcrunch.com/openai");
    expect(user).toContain("The new model doubles the context window.");
  });

  it("uses long-form guidance for the horizontal format", async () => {
    const { client, create } = fakeClient(textBlocks(draftJson()), {
      input_tokens: 1,
      output_tokens: 1,
    });

    await generateScript({ story: STORY, channel: CHANNEL, format: "HORIZONTAL_16_9" }, { client });

    const args = create.mock.calls[0][0] as { system: string };
    expect(args.system).toContain("8-12 minutes");
    expect(args.system).toContain("1100-1600 words");
    expect(args.system).toContain("mid-roll");
  });

  it("honors a custom model", async () => {
    const { client, create } = fakeClient(textBlocks(draftJson()));
    const draft = await generateScript(
      { story: STORY, channel: CHANNEL, format: "SQUARE_1_1" },
      { client, model: "claude-custom" },
    );
    expect(draft.model).toBe("claude-custom");
    expect((create.mock.calls[0][0] as { model: string }).model).toBe("claude-custom");
  });

  it("injects the channel CTA into cta + description when the model omits a cta", async () => {
    const { client } = fakeClient(textBlocks(draftJson({ cta: undefined })));
    const draft = await generateScript(
      { story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" },
      { client },
    );
    expect(draft.cta).toBe(CHANNEL.ctaSnippet);
    expect(draft.videoDesc).toContain(CHANNEL.ctaSnippet!);
    expect(draft.videoDesc).toContain("A breakdown of OpenAI's new model.");
  });

  it("does not duplicate the CTA when the description already contains it", async () => {
    const desc = `Full breakdown. ${CHANNEL.ctaSnippet}`;
    const { client } = fakeClient(textBlocks(draftJson({ cta: undefined, description: desc })));
    const draft = await generateScript(
      { story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" },
      { client },
    );
    const occurrences = draft.videoDesc.split(CHANNEL.ctaSnippet!).length - 1;
    expect(occurrences).toBe(1);
  });

  it("leaves cta + thumbnailPrompt null and description untouched when nothing provides them", async () => {
    const channelNoCta: ScriptChannel = { ...CHANNEL, ctaSnippet: null };
    const { client } = fakeClient(
      textBlocks(draftJson({ cta: undefined, thumbnailPrompt: undefined })),
    );
    const draft = await generateScript(
      { story: STORY, channel: channelNoCta, format: "VERTICAL_9_16" },
      { client },
    );
    expect(draft.cta).toBeNull();
    expect(draft.thumbnailPrompt).toBeNull();
    expect(draft.videoDesc).toBe("A breakdown of OpenAI's new model.");
  });

  it("defaults brollKeywords to [] and tokens to null when the model omits them", async () => {
    const json = draftJson({ segments: [{ text: "No keywords here." }] });
    const { client } = fakeClient(textBlocks(json)); // no usage
    const draft = await generateScript(
      { story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" },
      { client },
    );
    expect(draft.body).toEqual([{ text: "No keywords here.", brollKeywords: [] }]);
    expect(draft.tokensIn).toBeNull();
    expect(draft.tokensOut).toBeNull();
  });

  it("falls back to placeholders for a missing source and snippet in the prompt", async () => {
    const bareStory: ScriptStory = { title: "Just a title", sourceUrl: "https://x.com/y" };
    const { client, create } = fakeClient(textBlocks(draftJson()), {
      input_tokens: 1,
      output_tokens: 1,
    });
    await generateScript({ story: bareStory, channel: CHANNEL, format: "VERTICAL_9_16" }, { client });
    const user = (create.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(user).toContain("unknown");
    expect(user).toContain("(none provided)");
  });

  it("ignores non-text content blocks", async () => {
    const content = [
      { type: "tool_use", id: "t1", name: "noop", input: {} },
      { type: "text", text: draftJson() },
    ];
    const { client } = fakeClient(content);
    const draft = await generateScript(
      { story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" },
      { client },
    );
    expect(draft.videoTitle).toBe("OpenAI just doubled its context window");
  });

  it("throws when the model returns no JSON", async () => {
    const { client } = fakeClient(textBlocks("I'm sorry, I can't help with that."));
    await expect(
      generateScript({ story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" }, { client }),
    ).rejects.toThrow(/Could not extract JSON/);
  });

  it("throws when the JSON does not match the script schema", async () => {
    const { client } = fakeClient(textBlocks('{"hook":"no title field"}'));
    await expect(
      generateScript({ story: STORY, channel: CHANNEL, format: "VERTICAL_9_16" }, { client }),
    ).rejects.toThrow();
  });
});

describe("defaultAnthropic", () => {
  it("builds a client from an explicit apiKey", () => {
    const client = defaultAnthropic("sk-explicit");
    expect(client).toBeTruthy();
    expect(typeof client.messages.create).toBe("function");
  });

  it("falls back to process.env.ANTHROPIC_API_KEY", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-env";
    try {
      const client = defaultAnthropic();
      expect(client).toBeTruthy();
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
