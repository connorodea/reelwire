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

### Step 1 — Script generator · `src/lib/script/`
`generateScript({ story, channel, format }, { client })` → `ScriptDraft`
(`title`, `hook`, `segments[]`, `cta`, `description`, `tags[]`). Format-aware:
`short` = 1 punchy idea, ~120–150 words; `long` = multi-segment, 1100–1600 words with
mid-roll CTA marker. Injectable Anthropic client; tolerant JSON extraction (reuse the
`extractJson` approach). **Tests:** both formats, CTA injection from channel config,
empty/garbage model output, custom model.

### Step 2 — TTS adapter (Deepgram Aura) · `src/lib/tts/`
`synthesize(text, { client, voice })` → `{ audio: Uint8Array, words: WordTiming[] }`.
Injectable Deepgram client. **Tests:** maps SDK response → timings, voice override,
empty text guard, error surface. (Use `deepgram:api` skill for the SDK contract.)

### Step 3 — Caption builder · `src/lib/captions/`
`buildCaptions(words, { format })` → `CaptionCue[]` (chunked: dense 2–4-word cues for
shorts, line-level for long). Pure logic. **Tests:** chunking rules per format, gap
handling, empty input.

### Step 4 — Storage adapter (R2 / S3) · `src/lib/storage/`
`putObject` / `getSignedUrl` via injectable S3 client. **Sign only headers the browser
replays** (see `feedback_r2_presign_only_sign_browser_headers`). **Tests:** key layout,
content-type, presign signed-headers, error surface.

### Step 5 — Render driver · `src/lib/render/`
`buildRenderInput({ script, audioUrl, captions, format })` → Remotion input props +
dimensions (`short` 1080×1920, `long` 1920×1080). Injectable renderer; unit-test props
assembly, the renderer call is mocked. **Tests:** both aspect ratios, prop mapping,
duration from audio, renderer invocation.

### Step 6 — YouTube uploader · `src/lib/youtube/`
`buildVideoMetadata({ script, channel, format })` + `upload(file, meta, { client })`
via injectable googleapis client. Description carries product/affiliate CTAs from
channel config. **Tests:** metadata (title/desc/tags/category/privacy), CTA block,
upload call shape, error surface.

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
