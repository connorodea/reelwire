import { describe, it, expect, vi } from "vitest";
import { ScrapeDoClient, ScrapeDoError } from "./client";
import fixture from "./__fixtures__/openai-news-response.json";

const TOKEN = "test-token-123";

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("ScrapeDoClient.searchNews", () => {
  it("calls the documented endpoint with token + q", async () => {
    const fetchMock = mockFetchOk(fixture);
    const client = new ScrapeDoClient({ token: TOKEN, fetch: fetchMock });

    await client.searchNews({ q: "openai" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe("https://api.scrape.do/plugin/google/news");
    expect(u.searchParams.get("token")).toBe(TOKEN);
    expect(u.searchParams.get("q")).toBe("openai");
    // defaults
    expect(u.searchParams.get("hl")).toBe("en");
    expect(u.searchParams.get("gl")).toBe("us");
  });

  it("passes through topic_token / section_token / so when provided", async () => {
    const fetchMock = mockFetchOk(fixture);
    const client = new ScrapeDoClient({ token: TOKEN, fetch: fetchMock });

    await client.searchNews({
      topicToken: "T_ABC",
      sectionToken: "S_DEF",
      hl: "es",
      gl: "mx",
      so: 1,
    });

    const [url] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const u = new URL(url as string);
    expect(u.searchParams.get("topic_token")).toBe("T_ABC");
    expect(u.searchParams.get("section_token")).toBe("S_DEF");
    expect(u.searchParams.get("hl")).toBe("es");
    expect(u.searchParams.get("gl")).toBe("mx");
    expect(u.searchParams.get("so")).toBe("1");
    expect(u.searchParams.has("q")).toBe(false);
  });

  it("rejects when no driver parameter is supplied", async () => {
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(fixture) });
    await expect(client.searchNews({})).rejects.toThrow(/driver/i);
  });

  it("returns raw payload + normalized articles", async () => {
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(fixture) });
    const result = await client.searchNews({ q: "openai" });

    expect(result.raw.news_results).toHaveLength(3);
    // 1 flat + 2 from cluster + 1 flat = 4 normalized
    expect(result.articles).toHaveLength(4);
  });

  it("normalizes flat results", async () => {
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(fixture) });
    const { articles } = await client.searchNews({ q: "openai" });

    const first = articles[0];
    expect(first.title).toBe("OpenAI launches new model with longer context window");
    expect(first.link).toBe("https://techcrunch.com/2026/05/25/openai-new-model");
    expect(first.sourceName).toBe("TechCrunch");
    expect(first.publishedAt?.toISOString()).toBe("2026-05-26T12:00:00.000Z");
    expect(first.thumbnail).toBe("https://img.example.com/openai-1.jpg");
    expect(first.storyToken).toBe("STORY_001");
    expect(first.fromCluster).toBe(false);
  });

  it("flattens cluster results into individual articles", async () => {
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(fixture) });
    const { articles } = await client.searchNews({ q: "openai" });

    const cluster = articles.filter((a) => a.fromCluster);
    expect(cluster).toHaveLength(2);
    expect(cluster[0].title).toBe("OpenAI partners with retailer X");
    expect(cluster[0].sourceName).toBe("WSJ");
    expect(cluster[1].title).toBe("Anthropic ships new Claude version");
  });

  it("handles missing iso_date by returning null publishedAt", async () => {
    const noDate = {
      search_parameters: { engine: "google_news", google_domain: "google.com", hl: "en", gl: "us" },
      news_results: [
        { position: 1, title: "No date", link: "https://x.com/y", source: { name: "X" } },
      ],
    };
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(noDate) });
    const { articles } = await client.searchNews({ q: "x" });

    expect(articles[0].publishedAt).toBeNull();
  });

  it("returns empty articles when news_results is empty array", async () => {
    const empty = {
      search_parameters: { engine: "google_news", google_domain: "google.com", hl: "en", gl: "us" },
      news_results: [],
    };
    const client = new ScrapeDoClient({ token: TOKEN, fetch: mockFetchOk(empty) });
    const { articles } = await client.searchNews({ q: "nothing" });

    expect(articles).toHaveLength(0);
  });
});

describe("ScrapeDoClient retry behavior", () => {
  it("retries on 429 with exponential backoff and eventually succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new ScrapeDoClient({
      token: TOKEN,
      fetch: fetchMock,
      maxRetries: 3,
      backoffMs: 1, // keep test fast
    });

    const result = await client.searchNews({ q: "openai" });
    expect(calls).toBe(3);
    expect(result.articles.length).toBeGreaterThan(0);
  });

  it("throws ScrapeDoError after exhausting retries on 5xx", async () => {
    const fetchMock = vi.fn(
      async () => new Response("server error", { status: 502 }),
    ) as unknown as typeof fetch;

    const client = new ScrapeDoClient({
      token: TOKEN,
      fetch: fetchMock,
      maxRetries: 2,
      backoffMs: 1,
    });

    await expect(client.searchNews({ q: "x" })).rejects.toThrow(ScrapeDoError);
    // initial + 2 retries = 3 total calls
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it("does NOT retry on 4xx other than 429 (e.g. 401 invalid token)", async () => {
    const fetchMock = vi.fn(
      async () => new Response("unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    const client = new ScrapeDoClient({
      token: TOKEN,
      fetch: fetchMock,
      maxRetries: 3,
      backoffMs: 1,
    });

    await expect(client.searchNews({ q: "x" })).rejects.toThrow(ScrapeDoError);
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
