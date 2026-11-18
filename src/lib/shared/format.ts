/** Canonical video format type — mirrors the Prisma `Format` enum. */
export type VideoFormat = "VERTICAL_9_16" | "HORIZONTAL_16_9" | "SQUARE_1_1";

/** Vertical/square = short-form (Shorts/TikTok/Reels); horizontal = long-form. */
export function isShortFormat(format: VideoFormat): boolean {
  return format !== "HORIZONTAL_16_9";
}
