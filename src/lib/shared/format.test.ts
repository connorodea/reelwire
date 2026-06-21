import { describe, it, expect } from "vitest";
import { isShortFormat } from "./format";

describe("isShortFormat", () => {
  it("treats vertical and square as short-form", () => {
    expect(isShortFormat("VERTICAL_9_16")).toBe(true);
    expect(isShortFormat("SQUARE_1_1")).toBe(true);
  });

  it("treats horizontal as long-form", () => {
    expect(isShortFormat("HORIZONTAL_16_9")).toBe(false);
  });
});
