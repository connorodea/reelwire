import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { extractJson } from "../shared/json";
import type { VideoFormat } from "../shared/format";

export type { VideoFormat };

/** Minimal story shape the writer needs (a subset of the `Story` model). */
export interface ScriptStory {
  title: string;
  snippet?: string | null;
  sourceName?: string | null;
  sourceUrl: string;
}

/** Minimal channel shape the writer needs (a subset of the `Channel` model). */
export interface ScriptChannel {
  name: string;
  niche: string;
  personaPrompt: string;
  ctaSnippet?: string | null;
}

export interface GenerateScriptInput {
  story: ScriptStory;
  channel: ScriptChannel;
  format: VideoFormat;
}

export interface ScriptSegment {
  text: string;
  brollKeywords: string[];
}

/** Plain draft mapping 1:1 onto the persisted `Script` model (sans ids). */
export interface ScriptDraft {
  hook: string;
  body: ScriptSegment[];
  cta: string | null;
  thumbnailPrompt: string | null;
  videoTitle: string;
  videoDesc: string;
  videoTags: string[];
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface GenerateScriptDeps {
  /** Inject the Anthropic client (use `defaultAnthropic()` at the composition root). */
  client: Anthropic;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DraftSchema = z.object({
  title: z.string(),
  hook: z.string(),
  segments: z
    .array(
      z.object({
        text: z.string(),
        brollKeywords: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  cta: z.string().optional(),
  thumbnailPrompt: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
});

interface FormatSpec {
  label: string;
  guidance: string;
}

const SHORT_SPEC: FormatSpec = {
  label: "vertical short video (YouTube Shorts / TikTok / Reels, under 60 seconds)",
  guidance:
    "ONE punchy idea, ~120-150 words total. A 2-second hook, fast pacing, a single payoff. Keep each segment short.",
};

const FORMAT_SPECS: Record<VideoFormat, FormatSpec> = {
  VERTICAL_9_16: SHORT_SPEC,
  SQUARE_1_1: SHORT_SPEC,
  HORIZONTAL_16_9: {
    label: "horizontal long-form video (YouTube, 8-12 minutes)",
    guidance:
      "Multiple segments, 1100-1600 words total. A strong cold-open hook, 4-7 body segments, and a clear mid-roll CTA marker. Build a narrative arc.",
  },
};

export function defaultAnthropic(apiKey?: string): Anthropic {
  return new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
}

export async function generateScript(
  input: GenerateScriptInput,
  deps: GenerateScriptDeps,
): Promise<ScriptDraft> {
  const model = deps.model ?? DEFAULT_MODEL;
  const spec = FORMAT_SPECS[input.format];

  const res = await deps.client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystem(input.channel, spec),
    messages: [{ role: "user", content: buildUser(input.story, spec) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = DraftSchema.parse(JSON.parse(extractJson(text)));

  return {
    hook: parsed.hook,
    body: parsed.segments.map((s) => ({ text: s.text, brollKeywords: s.brollKeywords })),
    cta: parsed.cta ?? input.channel.ctaSnippet ?? null,
    thumbnailPrompt: parsed.thumbnailPrompt ?? null,
    videoTitle: parsed.title,
    videoDesc: appendCta(parsed.description, input.channel.ctaSnippet),
    videoTags: parsed.tags,
    model,
    tokensIn: res.usage?.input_tokens ?? null,
    tokensOut: res.usage?.output_tokens ?? null,
  };
}

function appendCta(description: string, ctaSnippet?: string | null): string {
  if (!ctaSnippet) return description;
  if (description.includes(ctaSnippet)) return description;
  return `${description}\n\n${ctaSnippet}`;
}

function buildSystem(channel: ScriptChannel, spec: FormatSpec): string {
  return `You are the scriptwriter for the faceless YouTube channel "${channel.name}" in the ${channel.niche} niche.

Channel voice/persona:
${channel.personaPrompt}

Target format: ${spec.label}.
${spec.guidance}

Respond ONLY with valid JSON matching this schema:
{"title":"<=70 chars","hook":"first 8 seconds","segments":[{"text":"narration","brollKeywords":["k1","k2"]}],"cta":"optional call to action","thumbnailPrompt":"optional image prompt","description":"YouTube description","tags":["tag1","tag2"]}

Do not wrap the JSON in markdown or add commentary.`;
}

function buildUser(story: ScriptStory, spec: FormatSpec): string {
  return `Write a ${spec.label} script from this news story:

Title: ${story.title}
Source: ${story.sourceName ?? "unknown"}
URL: ${story.sourceUrl}
Summary: ${story.snippet ?? "(none provided)"}`;
}
