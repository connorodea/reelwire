import { describe, it, expect, vi } from "vitest";
import { createStorageService, type ObjectStore } from "./service";

const REF = { tenantId: "t1", channelId: "c1", videoId: "v1", artifact: "audio" } as const;

function fakeStore() {
  const putObject = vi.fn(async (_input: unknown) => {});
  const presignGetUrl = vi.fn(async (_input: unknown) => "https://signed.example/url");
  const store: ObjectStore = { putObject, presignGetUrl };
  return { store, putObject, presignGetUrl };
}

describe("createStorageService", () => {
  it("builds deterministic keys per artifact", () => {
    const svc = createStorageService(fakeStore().store, { publicBaseUrl: "https://cdn.example" });
    expect(svc.keyFor({ ...REF, artifact: "audio" })).toBe(
      "tenants/t1/channels/c1/videos/v1/audio.mp3",
    );
    expect(svc.keyFor({ ...REF, artifact: "video" })).toBe(
      "tenants/t1/channels/c1/videos/v1/video.mp4",
    );
    expect(svc.keyFor({ ...REF, artifact: "thumbnail" })).toBe(
      "tenants/t1/channels/c1/videos/v1/thumbnail.jpg",
    );
    expect(svc.keyFor({ ...REF, artifact: "captions" })).toBe(
      "tenants/t1/channels/c1/videos/v1/captions.vtt",
    );
  });

  it("builds public URLs, tolerating a trailing slash on the base", () => {
    const a = createStorageService(fakeStore().store, { publicBaseUrl: "https://cdn.example" });
    const b = createStorageService(fakeStore().store, { publicBaseUrl: "https://cdn.example/" });
    expect(a.publicUrl("a/b.mp4")).toBe("https://cdn.example/a/b.mp4");
    expect(b.publicUrl("a/b.mp4")).toBe("https://cdn.example/a/b.mp4");
  });

  it("puts an artifact with the right key + content-type and returns its public URL", async () => {
    const { store, putObject } = fakeStore();
    const svc = createStorageService(store, { publicBaseUrl: "https://cdn.example/" });
    const body = new Uint8Array([1, 2, 3]);

    const result = await svc.put({ ...REF, artifact: "video" }, body);

    expect(putObject).toHaveBeenCalledTimes(1);
    expect(putObject.mock.calls[0][0]).toEqual({
      key: "tenants/t1/channels/c1/videos/v1/video.mp4",
      body,
      contentType: "video/mp4",
    });
    expect(result).toEqual({
      key: "tenants/t1/channels/c1/videos/v1/video.mp4",
      publicUrl: "https://cdn.example/tenants/t1/channels/c1/videos/v1/video.mp4",
    });
  });

  it("requests a signed GET url with a default 1-hour expiry", async () => {
    const { store, presignGetUrl } = fakeStore();
    const svc = createStorageService(store, { publicBaseUrl: "https://cdn.example" });

    const url = await svc.signedUrl("k/x.mp3");

    expect(url).toBe("https://signed.example/url");
    expect(presignGetUrl.mock.calls[0][0]).toEqual({ key: "k/x.mp3", expiresInSec: 3600 });
  });

  it("honors a custom signed-url expiry", async () => {
    const { store, presignGetUrl } = fakeStore();
    const svc = createStorageService(store, { publicBaseUrl: "https://cdn.example" });

    await svc.signedUrl("k/x.mp3", 120);

    expect(presignGetUrl.mock.calls[0][0]).toEqual({ key: "k/x.mp3", expiresInSec: 120 });
  });
});
