import { describe, it, expect } from "vitest";
import { extractJson } from "./json";

describe("extractJson", () => {
  it("returns the string unchanged when it already starts with {", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("trims surrounding whitespace before the leading brace", () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("unwraps a ```json fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("unwraps a bare ``` fenced block", () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts a balanced object embedded in prose", () => {
    expect(extractJson('Sure, here you go: {"a":1} — done')).toBe('{"a":1}');
  });

  it("throws when there is no JSON object at all", () => {
    expect(() => extractJson("no json here")).toThrow(/Could not extract JSON/);
  });

  it("throws when an opening brace never closes", () => {
    expect(() => extractJson("start { but it never closes")).toThrow(/Could not extract JSON/);
  });
});
