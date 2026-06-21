import type { WordTiming } from "../tts/synthesize";
import { isShortFormat, type VideoFormat } from "../shared/format";

/** A caption cue: the on-screen text plus its time window and source words. */
export interface CaptionCue {
  text: string;
  start: number;
  end: number;
  words: WordTiming[];
}

export interface BuildCaptionsOptions {
  format: VideoFormat;
  /** Max words per cue. Defaults: short = 3 (punchy), long = 7 (subtitle line). */
  maxWords?: number;
  /** Force a new cue when the pause before the next word exceeds this (seconds). */
  gapThresholdSec?: number;
}

/**
 * Group word timings into caption cues. Short formats get dense, fast cues;
 * long-form gets readable subtitle lines. A cue is flushed when it reaches the
 * word limit, the speaker ends a sentence, or a long pause precedes the next word.
 */
export function buildCaptions(words: WordTiming[], opts: BuildCaptionsOptions): CaptionCue[] {
  const short = isShortFormat(opts.format);
  const maxWords = opts.maxWords ?? (short ? 3 : 7);
  const gapThreshold = opts.gapThresholdSec ?? (short ? 0.5 : 0.7);

  const cues: CaptionCue[] = [];
  let buf: WordTiming[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    cues.push({
      text: buf.map((w) => w.word).join(" "),
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      words: buf,
    });
    buf = [];
  };

  for (const w of words) {
    if (buf.length > 0 && w.start - buf[buf.length - 1].end > gapThreshold) {
      flush();
    }
    buf.push(w);
    if (buf.length >= maxWords || endsSentence(w.word)) {
      flush();
    }
  }
  flush();

  return cues;
}

function endsSentence(word: string): boolean {
  return /[.!?]$/.test(word.trim());
}
