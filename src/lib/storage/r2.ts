import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { ObjectStore } from "./service";

/**
 * Presigner function shape — `@aws-sdk/s3-request-presigner`'s `getSignedUrl`
 * satisfies this. Injected (not defaulted) so the adapter stays fully
 * unit-testable with no live AWS/R2 calls.
 */
export type PresignFn = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export interface R2Config {
  client: S3Client;
  bucket: string;
  presign: PresignFn;
}

/** Concrete Cloudflare R2 (S3-compatible) implementation of the `ObjectStore` port. */
export function createR2ObjectStore(config: R2Config): ObjectStore {
  return {
    async putObject(input) {
      await config.client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    },
    presignGetUrl({ key, expiresInSec }) {
      return config.presign(
        config.client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: expiresInSec },
      );
    },
  };
}
