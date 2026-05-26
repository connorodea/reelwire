import { createHash } from "node:crypto";

const STRIP_PARAM_PREFIXES = ["utm_"];
const STRIP_PARAM_EXACT = new Set([
  "ref",
  "ref_src",
  "ref_url",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "yclid",
]);

export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input;
  }

  u.hostname = u.hostname.toLowerCase();
  u.hash = "";

  const sp = u.searchParams;
  for (const key of Array.from(sp.keys())) {
    const lower = key.toLowerCase();
    if (STRIP_PARAM_EXACT.has(lower) || STRIP_PARAM_PREFIXES.some((p) => lower.startsWith(p))) {
      sp.delete(key);
    }
  }

  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") {
    out = out.slice(0, -1);
  }
  return out;
}

export function hashArticle(input: { title?: string; link: string }): string {
  const canonical = canonicalizeUrl(input.link);
  return createHash("sha256").update(canonical).digest("hex");
}

export interface DedupeOptions {
  /** hashes already seen in prior runs */
  seen?: Set<string>;
}

export function dedupeArticles<T extends { title?: string; link: string }>(
  articles: T[],
  opts: DedupeOptions = {},
): T[] {
  const seen = new Set(opts.seen ?? []);
  const out: T[] = [];
  for (const a of articles) {
    const h = hashArticle(a);
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(a);
  }
  return out;
}
