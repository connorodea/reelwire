import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createClaudeScorer } from "./score-claude";
import type { RankableArticle, RankerContext } from "./rank";

const CTX: RankerContext = {
  niche: "AI",
  personaPrompt: "Skeptical AI analyst",
  recentTitles: [],
};

const ARTICLES: RankableArticle[] = [
  { title: "OpenAI ships new model", link: "https://t.com/1", sourceName: "TC", publishedAt: null },
  { title: "New diffusion model", link: "https://t.com/2", sourceName: "VRG", publishedAt: null },
];

function validScores(arts: RankableArticle[]) {
  return {
    scores: arts.map((a, i) => ({
      link: a.link,
      novelty: 8 - i,
      virality: 7,
      niche_fit: 9,
      reason: "test reason",
    })),
  };
}

function fakeClient(content: unknown) {
  const create = vi.fn(
    async (_args: unknown) =>
      ({ content }) as unknown as Awaited<ReturnType<Anthropic["messages"]["create"]>>,
  );
  const client = { messages: { create } } as unknown as Anthropic;
  return { client, create };
}

function textContent(text: string) {
  return [{ type: "text", text }];
}

describe("createClaudeScorer", () => {
  it("returns [] for empty input and does not call the model", async () => {
    const { client, create } = fakeClient(textContent("{}"));
    const score = createClaudeScorer({ client });

    expect(await score([], CTX)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("maps model output to ScoreOutput, defaults the model, omits recent titles, marks unknown dates", async () => {
    const { client, create } = fakeClient(textContent(JSON.stringify(validScores(ARTICLES))));
    const score = createClaudeScorer({ client });

    const out = await score(ARTICLES, CTX);

    expect(out).toEqual([
      { link: "https://t.com/1", noveltyScore: 8, viralityScore: 7, nicheFitScore: 9, reasoning: "test reason" },
      { link: "https://t.com/2", noveltyScore: 7, viralityScore: 7, nicheFitScore: 9, reasoning: "test reason" },
    ]);

    const args = create.mock.calls[0][0] as {
      model: string;
      system: string;
      messages: { content: string }[];
    };
    expect(args.model).toBe("claude-haiku-4-5-20251001");
    expect(args.system).toContain("YouTube content strategist");
    const userMsg = args.messages[0].content;
    expect(userMsg).toContain("Channel niche: AI");
    expect(userMsg).toContain("unknown"); // null publishedAt
    expect(userMsg).not.toContain("Recent video titles");
  });

  it("includes recent titles and ISO dates in the prompt and honors a custom model", async () => {
    const dated: RankableArticle[] = [
      {
        title: "Dated story",
        link: "https://t.com/9",
        sourceName: "X",
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ];
    const { client, create } = fakeClient(textContent(JSON.stringify(validScores(dated))));
    const score = createClaudeScorer({ client, model: "claude-custom" });

    await score(dated, { ...CTX, recentTitles: ["yesterday's headline"] });

    const args = create.mock.calls[0][0] as { model: string; messages: { content: string }[] };
    expect(args.model).toBe("claude-custom");
    const userMsg = args.messages[0].content;
    expect(userMsg).toContain("Recent video titles");
    expect(userMsg).toContain("yesterday's headline");
    expect(userMsg).toContain("2026-06-01T00:00:00.000Z");
  });

  it("ignores non-text content blocks when assembling the response", async () => {
    const content = [
      { type: "tool_use", id: "t1", name: "noop", input: {} },
      { type: "text", text: JSON.stringify(validScores([ARTICLES[0]])) },
    ];
    const { client } = fakeClient(content);
    const score = createClaudeScorer({ client });

    const out = await score([ARTICLES[0]], CTX);
    expect(out).toHaveLength(1);
    expect(out[0].link).toBe("https://t.com/1");
  });

  it("extracts JSON from a markdown code fence", async () => {
    const fenced = "```json\n" + JSON.stringify(validScores([ARTICLES[0]])) + "\n```";
    const { client } = fakeClient(textContent(fenced));
    const score = createClaudeScorer({ client });

    const out = await score([ARTICLES[0]], CTX);
    expect(out[0].nicheFitScore).toBe(9);
  });

  it("extracts a balanced JSON object embedded in prose", async () => {
    const prose = "Sure! Here you go: " + JSON.stringify(validScores([ARTICLES[0]])) + " — hope that helps.";
    const { client } = fakeClient(textContent(prose));
    const score = createClaudeScorer({ client });

    const out = await score([ARTICLES[0]], CTX);
    expect(out).toHaveLength(1);
  });

  it("throws when no JSON can be extracted from the response", async () => {
    const { client } = fakeClient(textContent("I'm sorry, I can't help with that."));
    const score = createClaudeScorer({ client });

    await expect(score([ARTICLES[0]], CTX)).rejects.toThrow(/Could not extract JSON/);
  });

  it("throws when an opening brace has no matching close", async () => {
    const { client } = fakeClient(textContent("here is the start { but it never closes"));
    const score = createClaudeScorer({ client });

    await expect(score([ARTICLES[0]], CTX)).rejects.toThrow(/Could not extract JSON/);
  });

  it("constructs a default Anthropic client from an explicit apiKey without network calls", async () => {
    const score = createClaudeScorer({ apiKey: "sk-test-key" });
    expect(await score([], CTX)).toEqual([]);
  });

  it("falls back to process.env.ANTHROPIC_API_KEY when no apiKey is given", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-env-key";
    try {
      const score = createClaudeScorer({});
      expect(await score([], CTX)).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
