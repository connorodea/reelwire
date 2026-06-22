# M1 Core Pipeline — Implementation Plan (TDD, 100% coverage gate)

_Date: 2026-06-21 · Drives the `/loop` dev cadence · Branch: `feat/m1-core-pipeline`_

## Objective

Complete the Reelwire M1 core pipeline so a ranked news story becomes an uploaded
YouTube video, in **both formats** (short <60s and long 8–12 min). Each step is built
**RED → GREEN → 100% coverage** before the next begins (per the `/loop` rule).

## Coverage gate (locked this interval)

`vitest.config.ts` enforces **100%** statements/branches/functions/lines on
`src/lib/**` business logic. Framework shells (Next app, Remotion compositions, worker
entrypoint) and pure infra (`env.ts`, `db.ts`, barrels, types) are excluded — they are
integration concerns, not unit-gated. Run the gate with `pnpm test:coverage`.

## What already exists (M1 foundation, now 100% covered)

- `src/lib/scrape-do/` — Google News fetch via scrape.do (retry/normalize). ✅ 100%
- `src/lib/ranker/` — rank/dedupe + Claude scorer (`score-claude`). ✅ 100%
- `prisma/schema.prisma` — full data model: `Channel` (+ `Niche`, `Format`), `Story`,
  `Script`, `Job` (+ `JobKind`, `JobStatus`), `Render`, `Upload`, `AnalyticsSnapshot`,
  `SystemSetting`, multi-tenant (`Tenant`/`User`/`ApiKey`).
- `env.ts` already declares: `SCRAPE_DO_TOKEN`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`,
  `YOUTUBE_OAUTH_*`, `R2_*`, `SENTRY_DSN`.

## Ordered steps (one per interval; some may span two)

Every new adapter takes its external client via **dependency injection** (the existing
pattern: `ScrapeDoClient({ fetch })`, `createClaudeScorer({ client })`) so it is fully
unit-testable with a fake — no network in tests.

### ✅ Step 0 — Coverage gate + foundation hardening (DONE 2026-06-21)
Added `@vitest/coverage-v8`, aligned vitest to 4.1.9, wrote the gate, brought
`score-claude.ts` and `scrape-do/client.ts` to 100%. 42 tests, gate green, typecheck clean.

### ✅ Step 1 — Script generator · `src/lib/script/` (DONE 2026-06-21)
`generateScript({ story, channel, format }, { client })` → `ScriptDraft` mapped 1:1 onto
the `Script` model (`hook`/`body`/`cta`/`thumbnailPrompt`/`videoTitle`/`videoDesc`/
`videoTags`/`model`/`tokensIn`/`tokensOut`). Format-aware via the Prisma `Format` enum
(`VERTICAL_9_16`/`SQUARE_1_1` = short ~120–150 words; `HORIZONTAL_16_9` = long 1100–1600
words + mid-roll CTA). Channel `ctaSnippet` injected into cta + description (de-duped).
Tolerant JSON extraction factored into `src/lib/shared/json.ts` (own tests; `score-claude`
can migrate to it later). Injected Anthropic client (`defaultAnthropic()` at the root).
**13 generator + 7 json tests; gate 100%.**

### ✅ Step 2 — TTS adapter (Deepgram Aura) · `src/lib/tts/` (DONE 2026-06-21)
`synthesize(text, deps, opts)` → `{ audio, words[], durationSec, voice, encoding,
sampleRate }`. Key SDK fact: Deepgram TTS (`/v1/speak`) returns **audio only** — word
timings need a second Nova STT pass (`/v1/listen`) over the generated audio. So the
orchestrator drives two **injected ports** (`speak`, `transcribe`): empty-text guard,
default voice `aura-asteria-en` / STT `nova-3` / `linear16` @ 24kHz, `punctuated_word`
mapping, duration from last word end. **5 tests; gate 100%.**

⏳ **Deferred (integration boundary):** the concrete `@deepgram/sdk` v5 wrapper that
implements the `speak`/`transcribe` ports (`src/lib/tts/deepgram.ts`) — built and
smoke-tested against the live API (needs `DEEPGRAM_API_KEY`) during the adapter-wiring
step, excluded from the unit gate like `env`/`db`. The v5 SDK is Fern-generated with a
deeply nested shape (`speak/v1/audio`, `listen/v1/media`); faking it in unit tests would
be brittle and dishonest, so the pure orchestration logic is gated instead.

### ✅ Step 3 — Caption builder · `src/lib/captions/` (DONE 2026-06-21)
`buildCaptions(words, { format, maxWords?, gapThresholdSec? })` → `CaptionCue[]`
(`text`/`start`/`end`/`words`). Consumes Step 2's `WordTiming[]`. A cue flushes on the
word limit (short = 3, long = 7), a sentence-ending `.?!`, or a pause longer than the
gap threshold (short 0.5s / long 0.7s). Pure logic. Also lifted the canonical
`VideoFormat` + `isShortFormat` into `src/lib/shared/format.ts` (script now re-exports
it). **7 caption + 2 format tests; gate 100%.**

### ✅ Step 4 — Storage adapter (R2 / S3) · `src/lib/storage/` (DONE 2026-06-21)
`createStorageService(store, { publicBaseUrl })` → `{ keyFor, publicUrl, put, signedUrl }`
over an injected `ObjectStore` port. Deterministic key layout
(`tenants/{t}/channels/{c}/videos/{v}/{artifact}.{ext}`), per-artifact content-type
(audio/video/thumbnail/captions), trailing-slash-safe public URLs, default 1h signed-GET
expiry. **5 tests; gate 100%.**

⏳ **Deferred (integration boundary):** the concrete R2 port impl
(`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `src/lib/storage/r2.ts`) — added
+ smoke-tested in the adapter-wiring step. When the web app later needs browser-PUT
presigning, **sign only headers the browser replays** (Content-Type, never
Content-Disposition) — see `feedback_r2_presign_only_sign_browser_headers`.

### ✅ Step 5 — Render driver · `src/lib/render/` (DONE 2026-06-21)
`buildRenderInput({ script, audioUrl, captions, format, durationSec, fps?, compositionId? })`
→ `RenderInput` (`compositionId`/`width`/`height`/`fps`/`durationInFrames`/`props`).
Dimensions per format (1080×1920 / 1920×1080 / 1080×1080), `durationInFrames =
max(1, ceil(durationSec*fps))`, default 30fps + `NewsReel` composition, props assembled
from the script + captions + audio URL. Typed `RenderPort` exposed for the orchestrator.
**5 tests; gate 100%.**

⏳ **Deferred (integration boundary):** the concrete `@remotion/renderer` impl of
`RenderPort` (`src/lib/render/remotion.ts` — bundle + `renderMedia`) lands in the
adapter-wiring step; the `NewsReel` composition (framework shell) is excluded from the
unit gate.

### ✅ Step 6 — YouTube uploader · `src/lib/youtube/` (DONE 2026-06-21)
`buildVideoMetadata({ script, channel, format, privacyStatus? })` → `VideoMetadata`
(snippet+status): 100-char title truncation, format-aware `#Shorts` append (de-duped),
tags capped at 15, default category `22` + `private`. CTA already lives in
`script.videoDesc` from step 1. `uploadVideo({ metadata, videoPath, format }, port)`
returns the format-aware URL (`/shorts/{id}` vs `/watch?v={id}`) over an injected
`YoutubePort`. **7 tests; gate 100%.**

⏳ **Deferred (integration boundary):** the concrete `googleapis` impl of `YoutubePort`
(OAuth refresh-token → `youtube.videos.insert` resumable upload, `src/lib/youtube/google.ts`)
lands in the adapter-wiring step.

### Step 7 — Pipeline orchestrator · `src/lib/pipeline/`
Pure function chaining scrape → rank → script → tts → captions → render → upload with
injected adapters; emits `Job`/`Story`/`Script`/`Render`/`Upload` state transitions.
**Tests:** happy path (both formats), per-stage failure → job state, idempotency.

### Step 8 — Worker wiring · `worker/`
BullMQ queues/workers invoking the orchestrator; Prisma persistence. Unit-test the job
handlers with fakes (queue + adapters injected). Integration smoke separate from the
unit gate.

### Step 9 — Channel config surface · `src/lib/channel/`
Resolve per-channel niche/persona/voice/CTA/format-mix config (DB + `SystemSetting`
defaults) that feeds steps 1, 5, 6. **Tests:** defaulting, override precedence.

## Definition of done per interval

1. New/changed `src/lib/**` files at **100%** coverage (`pnpm test:coverage` green).
2. `pnpm typecheck` clean.
3. Commit with `--author="Connor O'Dea <102129457+connorodea@users.noreply.github.com>"`
   on `feat/m1-core-pipeline`; push to **connorodea** remote (`unset GITHUB_TOKEN` first).
4. Update this plan's checkboxes.

## Notes

- "Both formats" is a first-class parameter through steps 1, 3, 5, 6 — never a fork.
- No QuickLotz/QuickBidz anything (litigation hold). Repo is `connorodea/reelwire` (public).
- Keep adapters thin and injectable; the orchestrator (step 7) is where they compose.
