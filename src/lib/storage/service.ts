/**
 * Object-storage service for pipeline artifacts (audio, video, thumbnail,
 * captions). Owns the deterministic key layout, content-type mapping, public-URL
 * construction, and put/sign orchestration over an injected `ObjectStore` port.
 *
 * The concrete Cloudflare R2 implementation of the port (`@aws-sdk/client-s3` +
 * `@aws-sdk/s3-request-presigner`) is an integration boundary built/smoke-tested
 * separately. NOTE for the future browser-upload (presigned PUT) path: sign ONLY
 * the headers the browser actually replays (Content-Type) — never Content-
 * Disposition — or uploads fail with 403 SignatureDoesNotMatch.
 */

export type Artifact = "audio" | "video" | "thumbnail" | "captions";

export interface ArtifactRef {
  tenantId: string;
  channelId: string;
  videoId: string;
  artifact: Artifact;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | string;
  contentType: string;
}

/** Injected port — implemented by the concrete R2/S3 adapter at the root. */
export interface ObjectStore {
  putObject(input: PutObjectInput): Promise<void>;
  presignGetUrl(input: { key: string; expiresInSec: number }): Promise<string>;
}

export interface StorageConfig {
  /** Public base URL for the bucket (e.g. R2_PUBLIC_URL). */
  publicBaseUrl: string;
}

export interface PutResult {
  key: string;
  publicUrl: string;
}

export interface StorageService {
  keyFor(ref: ArtifactRef): string;
  publicUrl(key: string): string;
  put(ref: ArtifactRef, body: Uint8Array | string): Promise<PutResult>;
  signedUrl(key: string, expiresInSec?: number): Promise<string>;
}

const DEFAULT_EXPIRY_SEC = 3600;

const ARTIFACT_MAP: Record<Artifact, { ext: string; contentType: string }> = {
  audio: { ext: "mp3", contentType: "audio/mpeg" },
  video: { ext: "mp4", contentType: "video/mp4" },
  thumbnail: { ext: "jpg", contentType: "image/jpeg" },
  captions: { ext: "vtt", contentType: "text/vtt" },
};

export function createStorageService(store: ObjectStore, config: StorageConfig): StorageService {
  const base = config.publicBaseUrl.replace(/\/$/, "");

  const keyFor = (ref: ArtifactRef): string =>
    `tenants/${ref.tenantId}/channels/${ref.channelId}/videos/${ref.videoId}/${ref.artifact}.${ARTIFACT_MAP[ref.artifact].ext}`;

  const publicUrl = (key: string): string => `${base}/${key}`;

  return {
    keyFor,
    publicUrl,
    async put(ref, body) {
      const key = keyFor(ref);
      await store.putObject({ key, body, contentType: ARTIFACT_MAP[ref.artifact].contentType });
      return { key, publicUrl: publicUrl(key) };
    },
    signedUrl(key, expiresInSec) {
      return store.presignGetUrl({ key, expiresInSec: expiresInSec ?? DEFAULT_EXPIRY_SEC });
    },
  };
}
