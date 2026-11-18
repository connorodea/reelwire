import { describe, it, expect } from "vitest";
import { canonicalizeUrl, hashArticle, dedupeArticles } from "./dedupe";

describe("canonicalizeUrl", () => {
  it("lowercases host", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/path")).toBe(
      "https://www.example.com/path",
    );
  });

  it("strips utm_* and ref tracking params", () => {
    expect(
      canonicalizeUrl("https://x.com/a?utm_source=google&utm_medium=cpc&id=1"),
    ).toBe("https://x.com/a?id=1");
    expect(canonicalizeUrl("https://x.com/a?ref=newsletter&x=1")).toBe(
      "https://x.com/a?x=1",
    );
  });

  it("strips trailing slash and url fragment", () => {
    expect(canonicalizeUrl("https://x.com/path/#section-2")).toBe(
      "https://x.com/path",
    );
  });

  it("returns the input unchanged when not a valid URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("hashArticle", () => {
  it("produces the same hash for the same canonical URL even if title differs", () => {
    const a = hashArticle({ title: "OpenAI launches X", link: "https://x.com/a?utm_source=g" });
    const b = hashArticle({ title: "OpenAI Launches X — Updated", link: "https://x.com/a" });
    expect(a).toBe(b);
  });

  it("differs when canonical URL differs", () => {
    const a = hashArticle({ title: "T", link: "https://x.com/a" });
    const b = hashArticle({ title: "T", link: "https://x.com/b" });
    expect(a).not.toBe(b);
  });
});

describe("dedupeArticles", () => {
  it("removes duplicates by canonical URL, keeping the first occurrence", () => {
    const input = [
      { title: "A", link: "https://x.com/1?utm_source=g" },
      { title: "B", link: "https://x.com/2" },
      { title: "A copy", link: "https://x.com/1" }, // duplicate of first
      { title: "C", link: "https://x.com/3" },
    ];
    const out = dedupeArticles(input);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.title)).toEqual(["A", "B", "C"]);
  });

  it("dedupes against an existing hash set (seen) — useful for cross-run dedupe", () => {
    const seen = new Set<string>([
      hashArticle({ title: "X", link: "https://x.com/old" }),
    ]);
    const input = [
      { title: "X copy", link: "https://x.com/old?utm_source=newsletter" },
      { title: "Y", link: "https://x.com/new" },
    ];
    const out = dedupeArticles(input, { seen });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Y");
  });
});
