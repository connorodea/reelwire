import type {
  ClusterNewsResult,
  FlatNewsResult,
  NewsResult,
  NewsSearchOptions,
  NormalizedArticle,
  ScrapeDoClientConfig,
  ScrapeDoNewsResponse,
} from "./types";

const ENDPOINT = "https://api.scrape.do/plugin/google/news";
const DEFAULT_HL = "en";
const DEFAULT_GL = "us";

export class ScrapeDoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "ScrapeDoError";
  }
}

export interface SearchResult {
  raw: ScrapeDoNewsResponse;
  articles: NormalizedArticle[];
}

export class ScrapeDoClient {
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ScrapeDoClientConfig) {
    if (!config.token) throw new Error("ScrapeDoClient: token is required");
    this.token = config.token;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? 500;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async searchNews(opts: NewsSearchOptions): Promise<SearchResult> {
    const url = this.buildUrl(opts);
    const raw = await this.fetchWithRetry(url);
    const articles = normalize(raw.news_results ?? []);
    return { raw, articles };
  }

  private buildUrl(opts: NewsSearchOptions): string {
    const driverKeys = [
      opts.q,
      opts.topicToken,
      opts.sectionToken,
      opts.storyToken,
      opts.publicationToken,
      opts.kgmid,
    ];
    if (!driverKeys.some(Boolean)) {
      throw new Error(
        "ScrapeDoClient: must supply one driver param (q | topicToken | sectionToken | storyToken | publicationToken | kgmid)",
      );
    }

    const u = new URL(ENDPOINT);
    u.searchParams.set("token", this.token);
    if (opts.q) u.searchParams.set("q", opts.q);
    if (opts.topicToken) u.searchParams.set("topic_token", opts.topicToken);
    if (opts.sectionToken) u.searchParams.set("section_token", opts.sectionToken);
    if (opts.storyToken) u.searchParams.set("story_token", opts.storyToken);
    if (opts.publicationToken) u.searchParams.set("publication_token", opts.publicationToken);
    if (opts.kgmid) u.searchParams.set("kgmid", opts.kgmid);
    u.searchParams.set("hl", opts.hl ?? DEFAULT_HL);
    u.searchParams.set("gl", opts.gl ?? DEFAULT_GL);
    if (opts.googleDomain) u.searchParams.set("google_domain", opts.googleDomain);
    if (opts.so !== undefined) u.searchParams.set("so", String(opts.so));
    return u.toString();
  }

  private async fetchWithRetry(url: string): Promise<ScrapeDoNewsResponse> {
    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= this.maxRetries) {
      const res = await this.fetchImpl(url);

      if (res.ok) {
        return (await res.json()) as ScrapeDoNewsResponse;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) {
        const body = await safeText(res);
        throw new ScrapeDoError(
          `scrape.do request failed: ${res.status}`,
          res.status,
          body,
        );
      }

      lastErr = new ScrapeDoError(
        `scrape.do retryable failure: ${res.status}`,
        res.status,
        await safeText(res),
      );

      if (attempt === this.maxRetries) break;
      await sleep(this.backoffMs * Math.pow(2, attempt));
      attempt += 1;
    }

    throw lastErr;
  }
}

// ─── normalization ───────────────────────────────────────────────────────────

function isCluster(r: NewsResult): r is ClusterNewsResult {
  return Array.isArray((r as ClusterNewsResult).stories);
}

function normalize(results: NewsResult[]): NormalizedArticle[] {
  const out: NormalizedArticle[] = [];
  for (const r of results) {
    if (isCluster(r)) {
      for (const s of r.stories) {
        out.push({
          title: s.title,
          link: s.link,
          sourceName: s.source?.name ?? "",
          publishedAt: parseDate(s.iso_date),
          thumbnail: s.thumbnail ?? null,
          storyToken: r.story_token ?? null,
          position: r.position,
          fromCluster: true,
        });
      }
    } else {
      const f = r as FlatNewsResult;
      out.push({
        title: f.title,
        link: f.link,
        sourceName: f.source?.name ?? "",
        publishedAt: parseDate(f.iso_date),
        thumbnail: f.thumbnail ?? null,
        storyToken: f.story_token ?? null,
        position: f.position,
        fromCluster: false,
      });
    }
  }
  return out;
}

function parseDate(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── re-exports ──────────────────────────────────────────────────────────────

export type { NormalizedArticle, NewsSearchOptions, ScrapeDoNewsResponse } from "./types";
