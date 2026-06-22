import { describe, it, expect } from "vitest";
import {
  resolveChannelConfig,
  parseChannelDefaults,
  type ChannelInput,
  type ChannelDefaults,
} from "./config";
import type { VideoFormat } from "../shared/format";
import type { PrivacyStatus } from "../youtube/youtube";

describe("resolveChannelConfig", () => {
  it("uses channel values and falls back to hard defaults when no tenant defaults are given", () => {
    const channel: ChannelInput = {
      name: "N",
      niche: "AI",
      personaPrompt: "P",
      ctaSnippet: "CTA",
      voiceId: "aura-luna-en",
      format: "HORIZONTAL_16_9",
    };
    expect(resolveChannelConfig(channel)).toEqual({
      name: "N",
      niche: "AI",
      personaPrompt: "P",
      ctaSnippet: "CTA",
      voiceId: "aura-luna-en",
      format: "HORIZONTAL_16_9",
      categoryId: "22",
      privacyStatus: "private",
      fps: 30,
    });
  });

  it("falls back to tenant defaults for fields the channel leaves unset", () => {
    const channel: ChannelInput = { name: "N", niche: "AI", personaPrompt: "P", ctaSnippet: null };
    const defaults: ChannelDefaults = {
      voiceId: "aura-zeus-en",
      format: "SQUARE_1_1",
      categoryId: "27",
      privacyStatus: "public",
      fps: 24,
      ctaSnippet: "DEF CTA",
    };
    expect(resolveChannelConfig(channel, defaults)).toEqual({
      name: "N",
      niche: "AI",
      personaPrompt: "P",
      ctaSnippet: "DEF CTA",
      voiceId: "aura-zeus-en",
      format: "SQUARE_1_1",
      categoryId: "27",
      privacyStatus: "public",
      fps: 24,
    });
  });

  it("falls back to hard defaults when neither channel nor tenant set a field", () => {
    const channel: ChannelInput = { name: "N", niche: "AI", personaPrompt: "P" };
    expect(resolveChannelConfig(channel, {})).toEqual({
      name: "N",
      niche: "AI",
      personaPrompt: "P",
      ctaSnippet: null,
      voiceId: "aura-asteria-en",
      format: "VERTICAL_9_16",
      categoryId: "22",
      privacyStatus: "private",
      fps: 30,
    });
  });
});

describe("parseChannelDefaults", () => {
  it("parses all provided settings into typed defaults", () => {
    const out = parseChannelDefaults({
      "tts.voiceId": "aura-orion-en",
      "channel.format": "HORIZONTAL_16_9",
      "youtube.categoryId": "27",
      "youtube.privacyStatus": "public",
      "render.fps": "24",
      "channel.ctaSnippet": "CTA copy",
    });
    expect(out).toEqual({
      voiceId: "aura-orion-en",
      format: "HORIZONTAL_16_9" as VideoFormat,
      categoryId: "27",
      privacyStatus: "public" as PrivacyStatus,
      fps: 24,
      ctaSnippet: "CTA copy",
    });
  });

  it("returns an empty object when no settings are present", () => {
    expect(parseChannelDefaults({})).toEqual({});
  });

  it("ignores an invalid format, invalid privacy, and non-positive fps", () => {
    expect(
      parseChannelDefaults({
        "channel.format": "BOGUS",
        "youtube.privacyStatus": "loud",
        "render.fps": "0",
      }),
    ).toEqual({});
  });
});
