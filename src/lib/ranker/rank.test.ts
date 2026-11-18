import { describe, it, expect, vi } from "vitest";
import { rankArticles, type ScoreFn, type RankerContext } from "./rank";

const CTX: RankerContext = {
  niche: "AI",
  personaPrompt: "Skeptical AI analyst",
  recentTitles: [],
};

const ARTICLES = [
  { title: "OpenAI ships new model", link: "https://t.com/1", sourceName: "TC", publishedAt: null },
  { title: "Stock market down", link: "https://t.com/2", sourceName: "WSJ", publishedAt: null },
  { title: "New diffusion model open-sourced", link: "https://t.com/3", sourceName: "VRG", publishedAt: null },
];

describe("rankArticles", () => {
  it("scores each article and sorts by totalScore desc", async () => {
    const scoreFn: ScoreFn = vi.fn<ScoreFn>(async (articles) =>
      articles.map((a, i) => ({
        link: a.link,
        noveltyScore: 5 + i,
        viralityScore: 6,
        nicheFitScore: a.title.toLowerCase().includes("ai") || a.title.includes("model") ? 9 : 2,
        reasoning: "test",
      })),
    );

    const ranked = await rankArticles(ARTICLES, CTX, { scoreFn });

    expect(scoreFn).toHaveBeenCalledTimes(1);
    expect(ranked).toHaveLength(3);
    // descending by totalScore
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].totalScore).toBeGreaterThanOrEqual(ranked[i].totalScore);
    }
    // niche-fit-9 articles must outrank the niche-fit-2 article
    const stockIdx = ranked.findIndex((a) => a.title === "Stock market down");
    expect(stockIdx).toBe(ranked.length - 1);
  });

  it("computes totalScore as a weighted sum of novelty/virality/nicheFit", async () => {
    const scoreFn: ScoreFn = async () => [
      { link: ARTICLES[0].link, noveltyScore: 10, viralityScore: 10, nicheFitScore: 10 },
    ];
    const ranked = await rankArticles([ARTICLES[0]], CTX, { scoreFn });
    // weights: novelty 0.3, virality 0.4, nicheFit 0.3 → 10
    expect(ranked[0].totalScore).toBeCloseTo(10);
  });

  it("respects topN — returns only the top N", async () => {
    const scoreFn: ScoreFn = async (articles) =>
      articles.map((a, i) => ({
        link: a.link,
        noveltyScore: 10 - i,
        viralityScore: 5,
        nicheFitScore: 5,
      }));
    const ranked = await rankArticles(ARTICLES, CTX, { scoreFn, topN: 2 });
    expect(ranked).toHaveLength(2);
  });

  it("drops articles the scorer omits", async () => {
    const scoreFn: ScoreFn = async (articles) =>
      // only return a score for the first one
      [{ link: articles[0].link, noveltyScore: 8, viralityScore: 8, nicheFitScore: 8 }];

    const ranked = await rankArticles(ARTICLES, CTX, { scoreFn });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].link).toBe(ARTICLES[0].link);
  });

  it("clamps out-of-range scores into [0,10]", async () => {
    const scoreFn: ScoreFn = async () => [
      { link: ARTICLES[0].link, noveltyScore: 15, viralityScore: -3, nicheFitScore: 11 },
    ];
    const ranked = await rankArticles([ARTICLES[0]], CTX, { scoreFn });
    expect(ranked[0].noveltyScore).toBe(10);
    expect(ranked[0].viralityScore).toBe(0);
    expect(ranked[0].nicheFitScore).toBe(10);
  });

  it("passes recentTitles to the scorer for novelty context", async () => {
    const scoreFn: ScoreFn = vi.fn(async () => []);
    const ctx: RankerContext = { ...CTX, recentTitles: ["yesterday's story"] };
    await rankArticles(ARTICLES, ctx, { scoreFn });

    const calls = (scoreFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1].recentTitles).toEqual(["yesterday's story"]);
  });

  it("returns empty when input is empty (and does NOT call the scorer)", async () => {
    const scoreFn: ScoreFn = vi.fn(async () => []);
    const ranked = await rankArticles([], CTX, { scoreFn });
    expect(ranked).toEqual([]);
    expect(scoreFn).not.toHaveBeenCalled();
  });
});
