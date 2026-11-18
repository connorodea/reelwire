// Types matching the scrape.do Google News API response.
// Source: https://scrape.do/documentation/google-scraper-api/news/

export interface SearchParameters {
  engine: "google_news";
  q?: string;
  google_domain: string;
  hl: string;
  gl: string;
  topic_token?: string;
  section_token?: string;
  story_token?: string;
  publication_token?: string;
  kgmid?: string;
  so?: string;
}

export interface NewsSource {
  name: string;
  title?: string;
  icon?: string;
  authors?: string[];
}

export interface FlatNewsResult {
  position: number;
  title: string;
  link: string;
  source: NewsSource;
  date?: string;
  iso_date?: string;
  thumbnail?: string;
  thumbnail_small?: string;
  topic_token?: string;
  publication_token?: string;
  section_token?: string;
  story_token?: string;
  stories?: never;
}

export interface ClusterNewsResult {
  position: number;
  title: string;
  story_token?: string;
  stories: Array<{
    position: number;
    title: string;
    link: string;
    source: NewsSource;
    date?: string;
    iso_date?: string;
    thumbnail?: string;
  }>;
}

export type NewsResult = FlatNewsResult | ClusterNewsResult;

export interface ScrapeDoNewsResponse {
  search_parameters: SearchParameters;
  title?: string;
  news_results: NewsResult[];
  menu_links?: unknown[];
  sub_menu_links?: unknown[];
  related_topics?: unknown[];
  related_publications?: unknown[];
}

// ─── Normalized article shape used by the rest of the pipeline ────────────────

export interface NormalizedArticle {
  title: string;
  link: string;
  sourceName: string;
  publishedAt: Date | null;
  thumbnail: string | null;
  storyToken: string | null;
  /** index in the original news_results (for stable ordering) */
  position: number;
  /** true if this article was extracted from a cluster (stories[]) */
  fromCluster: boolean;
}

// ─── Request options ─────────────────────────────────────────────────────────

export interface NewsSearchOptions {
  /** keyword search */
  q?: string;
  topicToken?: string;
  sectionToken?: string;
  storyToken?: string;
  publicationToken?: string;
  kgmid?: string;
  hl?: string;
  gl?: string;
  googleDomain?: string;
  /** 0 = relevance, 1 = date (only with q or kgmid) */
  so?: 0 | 1;
}

export interface ScrapeDoClientConfig {
  token: string;
  baseUrl?: string;
  /** max retry attempts on 429 / 5xx (default 3) */
  maxRetries?: number;
  /** initial backoff in ms (default 500) — doubled each attempt */
  backoffMs?: number;
  /** custom fetch implementation (for testing) */
  fetch?: typeof fetch;
}
