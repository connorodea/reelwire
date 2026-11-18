import {
  runPipeline,
  type JobStatus,
  type PipelineChannel,
  type PipelinePorts,
  type PipelineRef,
} from "./run";
import type { ScriptStory } from "../script/generate";
import type { VideoFormat } from "../shared/format";
import type { PrivacyStatus } from "../youtube/youtube";

/** Persisted job state (subset the handler reads/writes). */
export interface JobRecord {
  status: JobStatus;
  videoId?: string | null;
  videoUrl?: string | null;
}

/** Persistence port — implemented by the concrete Prisma adapter at the root. */
export interface JobStore {
  get(jobId: string): Promise<JobRecord | null>;
  setStatus(jobId: string, status: JobStatus): Promise<void>;
  recordResult(jobId: string, result: { videoId: string; videoUrl: string }): Promise<void>;
}

/** What the queue carries for one video job. */
export interface VideoJobPayload {
  jobId: string;
  ref: PipelineRef;
  story: ScriptStory;
  channel: PipelineChannel;
  format: VideoFormat;
  workdir: string;
  privacyStatus?: PrivacyStatus;
}

export interface ProcessVideoJobDeps {
  store: JobStore;
  /** The stage ports; `setStatus` is wired from the store inside the handler. */
  ports: Omit<PipelinePorts, "setStatus">;
}

export interface ProcessResult {
  status: "completed";
  videoId: string;
  videoUrl: string;
  skipped: boolean;
}

/**
 * Idempotent video-job handler. Skips already-COMPLETED jobs (the job-id dedup
 * seam), otherwise runs the pipeline — persisting each status transition through
 * the store and recording the final result. Failures propagate (the queue retries);
 * the pipeline has already persisted FAILED via the wired `setStatus`.
 */
export async function processVideoJob(
  payload: VideoJobPayload,
  deps: ProcessVideoJobDeps,
): Promise<ProcessResult> {
  const existing = await deps.store.get(payload.jobId);
  if (existing?.status === "COMPLETED") {
    return {
      status: "completed",
      videoId: existing.videoId!,
      videoUrl: existing.videoUrl!,
      skipped: true,
    };
  }

  const ports: PipelinePorts = {
    ...deps.ports,
    setStatus: (status) => deps.store.setStatus(payload.jobId, status),
  };

  const result = await runPipeline(
    {
      ref: payload.ref,
      story: payload.story,
      channel: payload.channel,
      format: payload.format,
      workdir: payload.workdir,
      privacyStatus: payload.privacyStatus,
    },
    ports,
  );

  await deps.store.recordResult(payload.jobId, {
    videoId: result.videoId,
    videoUrl: result.videoUrl,
  });

  return {
    status: "completed",
    videoId: result.videoId,
    videoUrl: result.videoUrl,
    skipped: false,
  };
}
