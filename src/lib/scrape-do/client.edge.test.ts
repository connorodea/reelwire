import { describe, it, expect, vi } from "vitest";
import { ScrapeDoClient } from "./client";

const TOKEN = "test-token-123";

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("ScrapeDoClient normalization + url edge cases", () => {
  it("passes through story/publication/kgmid/google_domain params and tolerates a missing news_results key", async () => {
    const fetchMock = mockFetchOk({}); // no news_results → `?? []`
    const client = new ScrapeDoClient({ token: TOKEN, fetch: fetchMock });

    const { articles } = await client.searchNews({
      storyToken: "ST_1",
      publicationToken: "PUB_1",
      kgmid: "KG_1",
      googleDomain: "google.co.uk",
      hl: "fr",
      gl: "fr",
    });

    expect(articles).toHaveLength(0);
    const [url] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const u = new URL(url as string);
    expect(u.searchParams.get("story_token")).toBe("ST_1");
    expect(u.searchParams.get("publication_token")).toBe("PUB_1");
    expect(u.searchParams.get("kgmid")).toBe("KG_1");
    expect(u.searchParams.get("google_domain")).toBe("google.co.uk");
    expect(u.searchParams.get("hl")).toBe("fr");
    expect(u.searchParams.get("gl")).toBe("fr");
  });

  it("defaults missing source/thumbnail/story_token on both flat and cluster results", async () => {
    const payload = {
      news_results: [
        { position: 1, title: "Flat no extras", link: "https://x.com/flat" },
        { position: 2, stories: [{ title: "Cluster no extras", link: "https://x.com/cluster" }] },
      ],
    };
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(payload) });

    const { articles } = await client.searchNews({ q: "x" });
    const flat = articles.find((a) => !a.fromCluster)!;
    const cluster = articles.find((a) => a.fromCluster)!;

    expect(flat.sourceName).toBe("");
    expect(flat.thumbnail).toBeNull();
    expect(flat.storyToken).toBeNull();
    expect(cluster.sourceName).toBe("");
    expect(cluster.thumbnail).toBeNull();
    expect(cluster.storyToken).toBeNull();
  });

  it("returns null publishedAt for an unparseable iso_date", async () => {
    const payload = {
      news_results: [
        { position: 1, title: "Bad date", link: "https://x.com/bad", iso_date: "not-a-real-date" },
      ],
    };
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(payload) });

    const { articles } = await client.searchNews({ q: "x" });
    expect(articles[0].publishedAt).toBeNull();
  });

  it("defaults fetch to the global fetch when none is injected", () => {
    const client = new ScrapeDoClient({ token: TOKEN });
    expect(client).toBeInstanceOf(ScrapeDoClient);
  });

  it("throws when constructed without a token", () => {
    expect(() => new ScrapeDoClient({ token: "" })).toThrow(/token is required/);
  });

  it("returns an empty error body when reading the response text throws", async () => {
    const badRes = {
      ok: false,
      status: 400,
      text: async () => {
        throw new Error("stream already consumed");
      },
    };
    const fetchMock = vi.fn(async () => badRes) as unknown as typeof fetch;
    const client = new ScrapeDoClient({ token: TOKEN, fetch: fetchMock });

    await expect(client.searchNews({ q: "x" })).rejects.toMatchObject({
      name: "ScrapeDoError",
      status: 400,
      body: "",
    });
  });
});
