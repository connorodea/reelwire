import type { ScriptDraft } from "../script/generate";
import type { CaptionCue } from "../captions/build";
import type { VideoFormat } from "../shared/format";

/** Props handed to the Remotion composition (consumed by the React component). */
export interface ReelProps {
  title: string;
  hook: string;
  segments: { text: string; brollKeywords: string[] }[];
  captions: CaptionCue[];
  audioUrl: string;
  cta: string | null;
}

/** Everything `@remotion/renderer` needs to render one video. */
export interface RenderInput {
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  props: ReelProps;
}

export interface BuildRenderInputArgs {
  script: ScriptDraft;
  audioUrl: string;
  captions: CaptionCue[];
  format: VideoFormat;
  durationSec: number;
  fps?: number;
  compositionId?: string;
}

/** Injected renderer port — implemented by the concrete `@remotion/renderer` adapter. */
export interface RenderPort {
  render(input: RenderInput, outputPath: string): Promise<{ outputPath: string }>;
}

const DEFAULT_FPS = 30;
const DEFAULT_COMPOSITION = "NewsReel";

const DIMENSIONS: Record<VideoFormat, { width: number; height: number }> = {
  VERTICAL_9_16: { width: 1080, height: 1920 },
  HORIZONTAL_16_9: { width: 1920, height: 1080 },
  SQUARE_1_1: { width: 1080, height: 1080 },
};

export function buildRenderInput(args: BuildRenderInputArgs): RenderInput {
  const { width, height } = DIMENSIONS[args.format];
  const fps = args.fps ?? DEFAULT_FPS;
  const durationInFrames = Math.max(1, Math.ceil(args.durationSec * fps));

  return {
    compositionId: args.compositionId ?? DEFAULT_COMPOSITION,
    width,
    height,
    fps,
    durationInFrames,
    props: {
      title: args.script.videoTitle,
      hook: args.script.hook,
      segments: args.script.body,
      captions: args.captions,
      audioUrl: args.audioUrl,
      cta: args.script.cta,
    },
  };
}
