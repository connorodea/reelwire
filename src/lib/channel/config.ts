import type { VideoFormat } from "../shared/format";
import type { PrivacyStatus } from "../youtube/youtube";

/** Channel fields the pipeline reads (subset of the `Channel` model). */
export interface ChannelInput {
  name: string;
  niche: string;
  personaPrompt: string;
  ctaSnippet?: string | null;
  voiceId?: string | null;
  format?: VideoFormat | null;
}

/** Tenant/global defaults (typically parsed from `SystemSetting`). */
export interface ChannelDefaults {
  voiceId?: string;
  format?: VideoFormat;
  categoryId?: string;
  privacyStatus?: PrivacyStatus;
  fps?: number;
  ctaSnippet?: string | null;
}

/** Fully-resolved config the pipeline stages consume. */
export interface ResolvedChannelConfig {
  name: string;
  niche: string;
  personaPrompt: string;
  ctaSnippet: string | null;
  voiceId: string;
  format: VideoFormat;
  categoryId: string;
  privacyStatus: PrivacyStatus;
  fps: number;
}

const HARD = {
  voiceId: "aura-asteria-en",
  format: "VERTICAL_9_16" as VideoFormat,
  categoryId: "22",
  privacyStatus: "private" as PrivacyStatus,
  fps: 30,
};

/** Resolve with precedence: channel value → tenant default → hard default. */
export function resolveChannelConfig(
  channel: ChannelInput,
  defaults: ChannelDefaults = {},
): ResolvedChannelConfig {
  return {
    name: channel.name,
    niche: channel.niche,
    personaPrompt: channel.personaPrompt,
    ctaSnippet: channel.ctaSnippet ?? defaults.ctaSnippet ?? null,
    voiceId: channel.voiceId || defaults.voiceId || HARD.voiceId,
    format: channel.format || defaults.format || HARD.format,
    categoryId: defaults.categoryId || HARD.categoryId,
    privacyStatus: defaults.privacyStatus || HARD.privacyStatus,
    fps: defaults.fps ?? HARD.fps,
  };
}

const VIDEO_FORMATS = new Set<VideoFormat>(["VERTICAL_9_16", "HORIZONTAL_16_9", "SQUARE_1_1"]);
const PRIVACY_STATUSES = new Set<PrivacyStatus>(["private", "unlisted", "public"]);

function isVideoFormat(v: string | undefined): v is VideoFormat {
  return v !== undefined && VIDEO_FORMATS.has(v as VideoFormat);
}

function isPrivacyStatus(v: string | undefined): v is PrivacyStatus {
  return v !== undefined && PRIVACY_STATUSES.has(v as PrivacyStatus);
}

/** Turn untrusted SystemSetting string KV into typed, validated defaults. */
export function parseChannelDefaults(settings: Record<string, string>): ChannelDefaults {
  const out: ChannelDefaults = {};
  if (settings["tts.voiceId"]) out.voiceId = settings["tts.voiceId"];
  if (isVideoFormat(settings["channel.format"])) out.format = settings["channel.format"];
  if (settings["youtube.categoryId"]) out.categoryId = settings["youtube.categoryId"];
  if (isPrivacyStatus(settings["youtube.privacyStatus"])) {
    out.privacyStatus = settings["youtube.privacyStatus"];
  }
  const fps = Number(settings["render.fps"]);
  if (Number.isFinite(fps) && fps > 0) out.fps = fps;
  if (settings["channel.ctaSnippet"]) out.ctaSnippet = settings["channel.ctaSnippet"];
  return out;
}
