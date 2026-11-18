import type { ScriptDraft } from "../script/generate";
import { isShortFormat, type VideoFormat } from "../shared/format";

export type PrivacyStatus = "private" | "unlisted" | "public";

export interface VideoMetaChannel {
  /** YouTube category id (default "22" = People & Blogs). */
  categoryId?: string;
}

export interface BuildVideoMetadataArgs {
  script: ScriptDraft;
  channel: VideoMetaChannel;
  format: VideoFormat;
  privacyStatus?: PrivacyStatus;
}

export interface VideoMetadata {
  snippet: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
  };
  status: {
    privacyStatus: PrivacyStatus;
    selfDeclaredMadeForKids: boolean;
  };
}

const TITLE_MAX = 100;
const MAX_TAGS = 15;
const DEFAULT_CATEGORY = "22";
const DEFAULT_PRIVACY: PrivacyStatus = "private";

export function buildVideoMetadata(args: BuildVideoMetadataArgs): VideoMetadata {
  const title = truncate(args.script.videoTitle, TITLE_MAX);

  let description = args.script.videoDesc;
  if (isShortFormat(args.format) && !/#shorts/i.test(description)) {
    description = `${description}\n\n#Shorts`;
  }

  return {
    snippet: {
      title,
      description,
      tags: args.script.videoTags.slice(0, MAX_TAGS),
      categoryId: args.channel.categoryId ?? DEFAULT_CATEGORY,
    },
    status: {
      privacyStatus: args.privacyStatus ?? DEFAULT_PRIVACY,
      selfDeclaredMadeForKids: false,
    },
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export interface UploadInput {
  metadata: VideoMetadata;
  videoPath: string;
  format: VideoFormat;
}

export interface UploadResult {
  videoId: string;
  url: string;
}

/** Injected port — implemented by the concrete googleapis adapter at the root. */
export interface YoutubePort {
  insertVideo(input: { metadata: VideoMetadata; videoPath: string }): Promise<{ videoId: string }>;
}

export async function uploadVideo(input: UploadInput, port: YoutubePort): Promise<UploadResult> {
  const { videoId } = await port.insertVideo({
    metadata: input.metadata,
    videoPath: input.videoPath,
  });
  const url = isShortFormat(input.format)
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
  return { videoId, url };
}
