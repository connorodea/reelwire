import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RankableArticle, RankerContext, ScoreFn, ScoreOutput } from "./rank";

const MODEL = "claude-haiku-4-5-20251001";

const ScoreSchema = z.object({
  scores: z.array(
    z.object({
      link: z.string(),
      novelty: z.number().min(0).max(10),
      virality: z.number().min(0).max(10),
      niche_fit: z.number().min(0).max(10),
      reason: z.string().optional(),
    }),
  ),
});

export interface ClaudeScorerConfig {
  apiKey?: string;
  model?: string;
  client?: Anthropic;
}

export function createClaudeScorer(config: ClaudeScorerConfig = {}): ScoreFn {
  const client =
    config.client ?? new Anthropic({ apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY });
  const model = config.model ?? MODEL;

  return async (articles: RankableArticle[], ctx: RankerContext): Promise<ScoreOutput[]> => {
    if (articles.length === 0) return [];

    const userMsg = buildPrompt(articles, ctx);

    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const json = extractJson(text);
    const parsed = ScoreSchema.parse(JSON.parse(json));

    return parsed.scores.map((s) => ({
      link: s.link,
      noveltyScore: s.novelty,
      viralityScore: s.virality,
      nicheFitScore: s.niche_fit,
      reasoning: s.reason,
    }));
  };
}

const SYSTEM_PROMPT = `You are a YouTube content strategist. You score news articles for a faceless YouTube channel on three axes:

- novelty (0-10): how fresh is this story vs the channel's recent coverage?
- virality (0-10): predicted click-through + watch-through on YouTube. Strong hooks, conflict, surprise, or status updates from major brands score higher.
- niche_fit (0-10): alignment with the channel's niche and persona.

Respond ONLY with valid JSON matching this exact schema:
{"scores":[{"link":"<exact link>","novelty":<0-10>,"virality":<0-10>,"niche_fit":<0-10>,"reason":"<one short sentence>"}]}

Include one entry per article in the input. Use the exact link string from each article. Do not wrap the JSON in markdown or commentary.`;

function buildPrompt(articles: RankableArticle[], ctx: RankerContext): string {
  const recent =
    ctx.recentTitles.length > 0
      ? `Recent video titles already published on this channel (penalize stories that overlap):\n${ctx.recentTitles
          .map((t) => `- ${t}`)
          .join("\n")}\n\n`
      : "";

  const list = articles
    .map(
      (a, i) =>
        `${i + 1}. link: ${a.link}\n   title: ${a.title}\n   source: ${a.sourceName}\n   published: ${a.publishedAt?.toISOString() ?? "unknown"}`,
    )
    .join("\n\n");

  return `Channel niche: ${ctx.niche}
Channel persona: ${ctx.personaPrompt}

${recent}Score these ${articles.length} articles:

${list}`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  // tolerate markdown-fenced JSON despite the prompt instruction
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fence) return fence[1];
  // grab the first balanced JSON object
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error(`Could not extract JSON from Claude response: ${trimmed.slice(0, 200)}`);
}
