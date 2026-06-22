import { buildCaptions } from "../captions/build";
import { buildRenderInput, type RenderInput } from "../render/input";
import { buildVideoMetadata, type VideoMetadata, type PrivacyStatus, type VideoMetaChannel } from "../youtube/youtube";
import type { ScriptDraft, ScriptStory, ScriptChannel } from "../script/generate";
import type { SynthesisResult } from "../tts/synthesize";
import type { VideoFormat } from "../shared/format";

export type JobStatus =
  | "SCRIPTING"
  | "SYNTHESIZING"
  | "RENDERING"
  | "UPLOADING"
  | "COMPLETED"
  | "FAILED";

export type PipelineChannel = ScriptChannel & VideoMetaChannel & { voiceId: string };

export interface PipelineRef {
  tenantId: string;
  channelId: string;
  videoId: string;
}

/** Side-effectful stages, injected. Pure builders are called directly. */
export interface PipelinePorts {
  generateScript(story: ScriptStory, channel: ScriptChannel, format: VideoFormat): Promise<ScriptDraft>;
  synthesize(narration: string, voice: string): Promise<SynthesisResult>;
  storeAudio(ref: PipelineRef, bytes: Uint8Array): Promise<{ publicUrl: string }>;
  render(input: RenderInput, outputPath: string): Promise<{ outputPath: string }>;
  upload(
    metadata: VideoMetadata,
    videoPath: string,
    format: VideoFormat,
  ): Promise<{ videoId: string; url: string }>;
  setStatus(status: JobStatus): Promise<void> | void;
}

export interface RunPipelineArgs {
  ref: PipelineRef;
  story: ScriptStory;
  channel: PipelineChannel;
  format: VideoFormat;
  workdir: string;
  privacyStatus?: PrivacyStatus;
}

export interface PipelineResult {
  videoId: string;
  videoUrl: string;
  scriptTitle: string;
  durationSec: number;
  captionCount: number;
  status: "COMPLETED";
}

export async function runPipeline(
  args: RunPipelineArgs,
  ports: PipelinePorts,
): Promise<PipelineResult> {
  try {
    await ports.setStatus("SCRIPTING");
    const script = await ports.generateScript(args.story, args.channel, args.format);

    await ports.setStatus("SYNTHESIZING");
    const audio = await ports.synthesize(buildNarration(script), args.channel.voiceId);
    const captions = buildCaptions(audio.words, { format: args.format });
    const { publicUrl: audioUrl } = await ports.storeAudio(args.ref, audio.audio);

    await ports.setStatus("RENDERING");
    const renderInput = buildRenderInput({
      script,
      audioUrl,
      captions,
      format: args.format,
      durationSec: audio.durationSec,
    });
    const outputPath = `${args.workdir}/${args.ref.videoId}.mp4`;
    const rendered = await ports.render(renderInput, outputPath);

    await ports.setStatus("UPLOADING");
    const metadata = buildVideoMetadata({
      script,
      channel: args.channel,
      format: args.format,
      privacyStatus: args.privacyStatus,
    });
    const uploaded = await ports.upload(metadata, rendered.outputPath, args.format);

    await ports.setStatus("COMPLETED");
    return {
      videoId: uploaded.videoId,
      videoUrl: uploaded.url,
      scriptTitle: script.videoTitle,
      durationSec: audio.durationSec,
      captionCount: captions.length,
      status: "COMPLETED",
    };
  } catch (err) {
    await ports.setStatus("FAILED");
    throw err;
  }
}

function buildNarration(script: ScriptDraft): string {
  return [script.hook, ...script.body.map((s) => s.text)].join(" ");
}
