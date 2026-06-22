import { describe, it, expect, vi } from "vitest";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createR2ObjectStore } from "./r2";

function fakeS3() {
  const send = vi.fn(async (_cmd: unknown) => ({}));
  const client = { send } as unknown as S3Client;
  return { client, send };
}

describe("createR2ObjectStore", () => {
  it("puts an object as a PutObjectCommand with bucket/key/body/content-type", async () => {
    const { client, send } = fakeS3();
    const presign = vi.fn(
      async (_c: S3Client, _cmd: GetObjectCommand, _o: { expiresIn: number }) =>
        "https://signed.example/url",
    );
    const store = createR2ObjectStore({ client, bucket: "reel-media", presign });
    const body = new Uint8Array([1, 2, 3]);

    await store.putObject({ key: "k/x.mp4", body, contentType: "video/mp4" });

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toEqual({
      Bucket: "reel-media",
      Key: "k/x.mp4",
      Body: body,
      ContentType: "video/mp4",
    });
  });

  it("presigns a GET url via the injected presigner", async () => {
    const { client } = fakeS3();
    const presign = vi.fn(
      async (_c: S3Client, _cmd: GetObjectCommand, _o: { expiresIn: number }) =>
        "https://signed.example/url",
    );
    const store = createR2ObjectStore({ client, bucket: "reel-media", presign });

    const url = await store.presignGetUrl({ key: "k/x.mp3", expiresInSec: 900 });

    expect(url).toBe("https://signed.example/url");
    expect(presign).toHaveBeenCalledTimes(1);
    const [c, cmd, opts] = presign.mock.calls[0];
    expect(c).toBe(client);
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect((cmd as GetObjectCommand).input).toEqual({ Bucket: "reel-media", Key: "k/x.mp3" });
    expect(opts).toEqual({ expiresIn: 900 });
  });
});
