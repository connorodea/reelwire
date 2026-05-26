export interface RankableArticle {
  title: string;
  link: string;
  sourceName: string;
  publishedAt: Date | null;
}

export interface RankerContext {
  /** Channel niche (e.g. "AI", "Crypto", "Sports"). */
  niche: string;
  /** Channel persona snippet to inform niche-fit scoring. */
  personaPrompt: string;
  /** Titles from recent (last 7 days) published videos — used by the LLM for novelty check. */
  recentTitles: string[];
}

export interface ScoreOutput {
  link: string;
  noveltyScore: number;
  viralityScore: number;
  nicheFitScore: number;
  reasoning?: string;
}

export type ScoreFn = (
  articles: RankableArticle[],
  ctx: RankerContext,
) => Promise<ScoreOutput[]>;

export interface RankedArticle extends RankableArticle {
  noveltyScore: number;
  viralityScore: number;
  nicheFitScore: number;
  totalScore: number;
  reasoning?: string;
}

export interface RankOptions {
  scoreFn: ScoreFn;
  topN?: number;
}

// Weights derived from YouTube channel-growth research:
// virality matters most (algo-driven discovery), novelty + niche tied for second.
const WEIGHTS = { novelty: 0.3, virality: 0.4, nicheFit: 0.3 };

const clamp = (n: number, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, n));

export async function rankArticles<T extends RankableArticle>(
  articles: T[],
  ctx: RankerContext,
  opts: RankOptions,
): Promise<(RankedArticle & T)[]> {
  if (articles.length === 0) return [];

  const scores = await opts.scoreFn(articles, ctx);
  const byLink = new Map(scores.map((s) => [s.link, s]));

  const ranked: (RankedArticle & T)[] = [];
  for (const a of articles) {
    const s = byLink.get(a.link);
    if (!s) continue;
    const novelty = clamp(s.noveltyScore);
    const virality = clamp(s.viralityScore);
    const nicheFit = clamp(s.nicheFitScore);
    const totalScore =
      novelty * WEIGHTS.novelty +
      virality * WEIGHTS.virality +
      nicheFit * WEIGHTS.nicheFit;
    ranked.push({
      ...a,
      noveltyScore: novelty,
      viralityScore: virality,
      nicheFitScore: nicheFit,
      totalScore,
      reasoning: s.reasoning,
    });
  }

  ranked.sort((a, b) => b.totalScore - a.totalScore);
  return opts.topN ? ranked.slice(0, opts.topN) : ranked;
}
