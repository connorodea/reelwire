# Reelwire Clip Lane (M3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Reelwire from generative-only ("News → YT", "X → Shorts/TT/IG") to *clip-mining* — turn existing long-form video (podcasts, YouTube, file uploads) into vertical shorts for YT Shorts + TikTok + IG Reels. OpusClip core-loop parity.

**Architecture:** Add a `clip` source adapter alongside Google News (M1) and X-Trends (M2). Pipeline (10 BullMQ stages): `poll-source → ingest → transcribe → find-moments → score → cut → reframe → render → publish → measure`. Built inside `~/developer/reelwire` reusing M1 (Tenant/Channel/voice presets, Sentry, Prisma, Remotion) + M2 (publisher fanout YT/TT/IG, Metric model, FunnelLink).

**Tech Stack additions on top of M2:** Deepgram **Nova-3** STT (in addition to existing Aura TTS), **`@fal-ai/client`** (speaker tracking + smart reframe + optional B-roll), **`yt-dlp`** binary on the worker host (YouTube ingest), **`rss-parser`** (podcast RSS poll), **`fluent-ffmpeg`** (cut + crop filter graph), S3-compatible blob (R2 or B2) for transcripts + raw episodes.

**Spec:** `docs/superpowers/specs/2026-06-09-clip-lane-design.md` (read first; all decisions locked in the "Decisions Locked" section).

**Todoist source-of-truth tracker:** project `Reelwire` (`6gj8v8qcv6pcRcmc`), new section `Clip Lane (M3)` to be created at execution kickoff, aligned 1:1 to the milestone map below.

---

## Part 0 — Milestone Map & Plan Decomposition

This is a ~4-5 week build. Writing every TDD step for all 7 milestones up front produces a 5000-line document that rots before it's executed. Instead:

- **This file** = the master plan: dependency graph, file structure, milestone shapes, **and the fully-detailed M3-A plan** (next milestone to execute).
- **Subsequent milestones (M3-B … M3-G)** get their own plan files written by re-invoking this skill when their predecessor milestone is merged.

### Dependency graph

```
M1 Foundation (PR #1, not yet merged) ──┐
                                        ▼
M2-A Foundation ──── (Tenant + Channel + voice presets shared) ────┐
                                                                   │
M2-D Publishers (YT/IG/TikTok) ──── (M3-F reuses verbatim) ────────┤
                                                                   │
                                        M3-A Foundation ───────────┤
                                                                   │
                                        M3-B Ingest ───────────────┤
                                                                   │
                                        M3-C Transcribe + Score ───┤
                                                                   │
                                        M3-D Cut + Reframe ────────┤
                                                                   │
                                        M3-E Render + Caption ─────┤
                                                                   │
                                        M3-F Publish (wires to M2) ┤
                                                                   ▼
                                        M3-G Smoke + Runbook + Deploy
```

**Hard dependencies:**
- M1 PR #1 must merge before M3-A begins (extends `Channel`).
- M2-D (publishers) must merge before M3-F begins (reuses the publisher fanout verbatim — no new YT/TT/IG integration code in M3).
- Everything else inside M3 is internal to the lane and merges independently.

**Soft sequencing:** Because M2 is still in design as of 2026-06-10, M3-A through M3-E can start in parallel with M2 implementation. The only blocker is M3-F → M2-D.

### Milestone summary (what each one produces)

| Milestone | Produces | Estimated PR count |
|---|---|---|
| **M3-A Foundation** | Prisma schema extensions (`Source`/`Episode`/`Transcript`/`Clip`), blob client (R2/B2), fal.ai client wrapper, Deepgram Nova-3 STT extension, `sources:*` CLI, voice-profile presets for clip lane | 1 PR |
| **M3-B Ingest** | yt-dlp wrapper, RSS poller, file-upload handler, `clip:poll-source` + `clip:ingest` BullMQ jobs, 28-day TTL sweeper | 2 PRs (poll + ingest) |
| **M3-C Transcribe + Score** | `clip:transcribe` (Nova-3 + diarize + topics), `clip:find-moments` (Sonnet 4.6 moment finder), `clip:score` (rubric scorer with breakdown) | 2 PRs (transcribe + score) |
| **M3-D Cut + Reframe** | `clip:cut` (ffmpeg), `clip:reframe` (fal.ai bbox + temporal smoothing + ffmpeg crop), QA preview page | 2 PRs (cut + reframe) |
| **M3-E Render + Caption** | `<ClipShort />` Remotion composition, word-level captions, hook overlay, music ducking, channel logo bug, optional B-roll inserts | 1 PR |
| **M3-F Publish** | Wire `clip:publish` into M2 publisher fanout, per-channel daily cap, top-K selection, FunnelLink minting per clip | 1 PR |
| **M3-G Smoke + Runbook + Deploy** | TED fixture end-to-end test, msw fixtures for Deepgram/fal/yt-dlp, runbooks, GH Actions update, worker host bootstrap for yt-dlp + ffmpeg ≥ 6.0 | 1 PR |

**Total: ~10 PRs.** Each PR independently deployable, tested, and revertable.

### Branch + PR strategy

Per global `CLAUDE.md`:
- Each milestone gets its own feature branch: `feat/m3-a-foundation`, `feat/m3-b-ingest`, etc.
- Spec/plan branch `feat/m3-clip-lane-design` is **docs-only** — does not need to merge before M3-A; the spec is the input.
- Author: `--author="Connor O'Dea <102129457+connorodea@users.noreply.github.com>"` on every commit.
- `unset GITHUB_TOKEN` and verify `gh auth status` shows `connorodea` before any `gh` command.

---

## Part 1 — M3-A Foundation (detailed TDD plan)

**Branch:** `feat/m3-a-foundation` (off `main` after M1 PR #1 merges)
**Acceptance:**
- `reelwire sources:add` / `sources:list` / `sources:enable` / `sources:disable` work end-to-end against a real Prisma DB.
- Schema migration applies cleanly to a fresh Postgres.
- Blob client uploads + retrieves a 1MB fixture against an R2 bucket (or B2 fallback).
- fal.ai client wrapper successfully calls `fal-ai/florence-2-large` on a fixture image and returns a parsed bbox.
- Deepgram Nova-3 STT helper transcribes a 60-second fixture audio with word-level timestamps + diarization.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all clean.

### File Structure (M3-A)

| Path | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | Add `SourceKind`/`RightsMode`/`EpisodeStatus`/`ClipStatus`/`RenderTemplate` enums + `Source`/`Episode`/`Transcript`/`Clip` models |
| `prisma/migrations/<ts>_m3_clip_lane/` | create (by prisma) | First M3 migration |
| `.env.example` | modify | Add `FAL_KEY`, `CLIP_BLOB_BUCKET`, `CLIP_BLOB_ENDPOINT`, `CLIP_BLOB_KEY`, `CLIP_BLOB_SECRET`, `CLIP_BLOB_REGION` |
| `src/lib/env.ts` | modify | Zod schema entries for new env vars |
| `src/lib/blob/client.ts` | create | Thin S3-compatible client (works with R2 and B2); `put` / `get` / `getSignedUrl` / `delete` |
| `src/lib/blob/client.test.ts` | create | Unit tests (mock S3) |
| `src/lib/fal/client.ts` | create | `@fal-ai/client` wrapper with timeout (30s) + retry (3x exponential) + cost tracking |
| `src/lib/fal/client.test.ts` | create | Unit tests w/ mocked fal endpoint |
| `src/lib/deepgram/stt.ts` | create | Nova-3 STT helper — accepts audio URL/buffer, returns typed `Transcript` (words[] + speakers[] + topics) |
| `src/lib/deepgram/stt.test.ts` | create | Unit tests against fixture transcript JSON |
| `src/lib/deepgram/index.ts` | modify | Re-export `transcribe` alongside existing `synthesize` |
| `src/lib/clip/source-repo.ts` | create | Prisma CRUD for `Source` (add, list, enable, disable, byId) |
| `src/lib/clip/source-repo.test.ts` | create | Unit tests against test DB |
| `src/lib/clip/voice-profiles/index.ts` | create | Loader for clip-lane voice profiles (different from M2 voice presets — these describe *what kind of moments to surface*, not how to narrate) |
| `src/lib/clip/voice-profiles/profiles/wealth-wisdom.json` | create | "Stoic, philosophical, business-mindset moments" |
| `src/lib/clip/voice-profiles/profiles/life-advice.json` | create | "Practical, actionable, relatable moments" |
| `src/lib/clip/voice-profiles/profiles/contrarian-takes.json` | create | "Surprising, counterintuitive, debate-bait moments" |
| `src/cli/commands/sources.ts` | create | citty subcommands: `sources:add`, `sources:list`, `sources:enable`, `sources:disable` |
| `src/cli/commands/sources.test.ts` | create | Unit tests w/ in-memory citty runner |
| `src/cli/index.ts` | modify | Wire `sources` subcommand into root |
| `tests/fixtures/clip/sample-60s.mp3` | create | 60-second public-domain audio fixture |
| `tests/fixtures/clip/sample-frame.jpg` | create | 720×1280 fixture frame for fal bbox test |
| `tests/fixtures/clip/sample-transcript.json` | create | Pre-recorded Deepgram response for offline tests |
| `tests/fixtures/clip/sample-bbox.json` | create | Pre-recorded fal Florence-2 response |
| `README.md` | modify | Add M3 stack line under "Stack" section |

### Task list (M3-A) — strict TDD

> All tasks follow `superpowers:test-driven-development`: RED (write failing test) → run + verify fail → GREEN (minimum impl) → run + verify pass → REFACTOR.

#### 1. Schema + migration

- [ ] **1.1** Add new enums to `prisma/schema.prisma`: `SourceKind`, `RightsMode`, `EpisodeStatus`, `ClipStatus`, `RenderTemplate` (copy verbatim from spec § "Data Model").
- [ ] **1.2** Add `Source`, `Episode`, `Transcript`, `Clip` models (copy verbatim from spec; verify Channel relation column matches M2 / M1 schema).
- [ ] **1.3** `pnpm prisma migrate dev --name m3_clip_lane` — verify it applies cleanly to a fresh local DB.
- [ ] **1.4** Commit the migration directory.

#### 2. Env vars + zod

- [ ] **2.1** Append to `.env.example`: `FAL_KEY=`, `CLIP_BLOB_BUCKET=`, `CLIP_BLOB_ENDPOINT=`, `CLIP_BLOB_KEY=`, `CLIP_BLOB_SECRET=`, `CLIP_BLOB_REGION=auto`.
- [ ] **2.2** Add zod entries to `src/lib/env.ts`. All required except `CLIP_BLOB_REGION` which defaults to `"auto"`.
- [ ] **2.3** Write test: env loader throws on missing `FAL_KEY`. Run → verify fail → implement (already failing because zod will throw) → verify pass.

#### 3. Blob client (`src/lib/blob/`)

- [ ] **3.1 (RED)** Write `client.test.ts`:
  - `put(key, body, contentType)` calls S3 PutObject with `Bucket`, `Key`, `Body`, `ContentType`.
  - `get(key)` returns a Buffer.
  - `getSignedUrl(key, ttlSec)` returns a presigned URL with the expected TTL.
  - `delete(key)` calls DeleteObject.
  - Errors bubble with the original AWS SDK error message.
- [ ] **3.2** Run tests → expect 5 failures.
- [ ] **3.3 (GREEN)** Implement `client.ts` using `@aws-sdk/client-s3` (already R2/B2 compatible) + `@aws-sdk/s3-request-presigner`. Use env config.
- [ ] **3.4** Re-run → all pass.
- [ ] **3.5 (REFACTOR)** Extract a single `s3Client()` factory; verify tests still pass.

#### 4. fal.ai client (`src/lib/fal/`)

- [ ] **4.1 (RED)** Write `client.test.ts`:
  - `call(modelId, input)` resolves with parsed output on first try.
  - Retries 3× with exponential backoff on transient errors (HTTP 5xx, timeout).
  - Throws on permanent errors (HTTP 4xx) without retry.
  - Tracks cost in a returned `costUSD` field (estimated from model price table).
  - Respects 30s timeout.
- [ ] **4.2** Run → expect 5 failures.
- [ ] **4.3 (GREEN)** Implement `client.ts` using `@fal-ai/client`. Maintain a small `modelPrices.ts` with per-call price estimates for the models we use (Florence-2, SAM2, optional video model).
- [ ] **4.4** Re-run → all pass.

#### 5. Deepgram Nova-3 STT (`src/lib/deepgram/stt.ts`)

- [ ] **5.1 (RED)** Write `stt.test.ts`:
  - `transcribe({ audioUrl, diarize, detectTopics })` calls Deepgram with `model=nova-3-general`, `diarize=true`, `detect_topics=true`, `punctuate=true`, `smart_format=true`.
  - Returns `{ words: Word[], speakers: number, topics: Topic[], language: string }` typed correctly.
  - Maps Deepgram word JSON 1:1 to our `Word` shape (`{ text, startSec, endSec, speaker, confidence }`).
  - Handles 4xx errors with a `DeepgramSTTError` carrying the request id.
- [ ] **5.2** Run → expect 4 failures.
- [ ] **5.3 (GREEN)** Implement against `@deepgram/sdk`. Use fixture `tests/fixtures/clip/sample-transcript.json` for tests (no network).
- [ ] **5.4** Re-run → all pass.
- [ ] **5.5** Add a manual smoke script `scripts/smoke-deepgram-stt.ts` that hits the real API against the public-domain `sample-60s.mp3` fixture and prints the first 10 words. Document in README.

#### 6. Source repo (`src/lib/clip/source-repo.ts`)

- [ ] **6.1 (RED)** Write `source-repo.test.ts` against test DB:
  - `add({ name, kind, url, rightsMode, allowedChannels, ... })` inserts a row and returns the typed model.
  - `add(...)` throws if `kind = YOUTUBE_CHANNEL` or `PODCAST_RSS` but `url` is missing.
  - `list({ enabled? })` returns rows ordered by `createdAt desc`; respects the optional filter.
  - `enable(id)` / `disable(id)` flip `enabled` and return the updated row.
  - `byId(id)` returns null on missing.
- [ ] **6.2** Run → expect 6 failures.
- [ ] **6.3 (GREEN)** Implement.
- [ ] **6.4** Re-run → all pass.

#### 7. Clip-lane voice profiles

- [ ] **7.1** Define the JSON schema (`name`, `description`, `wantedMomentTraits`, `unwantedMomentTraits`, `examplePositiveLines`, `exampleNegativeLines`).
- [ ] **7.2** Create the 3 launch profiles (`wealth-wisdom`, `life-advice`, `contrarian-takes`).
- [ ] **7.3 (RED)** Write `voice-profiles/index.test.ts`: loader returns typed profile by key; throws on missing key; lists all keys.
- [ ] **7.4 (GREEN)** Implement loader.
- [ ] **7.5** Re-run → all pass.

#### 8. CLI: `sources:*`

- [ ] **8.1 (RED)** Write `cli/commands/sources.test.ts` with an in-memory citty runner:
  - `sources:add --name "Naval" --kind PODCAST_RSS --url "https://..." --rights FAIR_USE_COMMENTARY --channels ch_abc,ch_def --voice-profile wealth-wisdom` creates the row and prints the new ID.
  - `sources:list` prints a table with id / name / kind / rightsMode / enabled.
  - `sources:enable <id>` / `sources:disable <id>` toggle and confirm.
  - All four refuse to run without the env vars set.
- [ ] **8.2** Run → expect 8 failures.
- [ ] **8.3 (GREEN)** Implement using citty + the source repo.
- [ ] **8.4** Re-run → all pass.
- [ ] **8.5** Wire into `src/cli/index.ts`.

#### 9. Lint, typecheck, README

- [ ] **9.1** `pnpm typecheck` clean.
- [ ] **9.2** `pnpm lint` clean.
- [ ] **9.3** `pnpm test` — entire suite green.
- [ ] **9.4** Add M3 stack note + Clip Lane line to `README.md` (under existing Stack section).

#### 10. PR

- [ ] **10.1** `git status` — confirm only intended files.
- [ ] **10.2** Push branch.
- [ ] **10.3** Open PR titled `M3-A: clip-lane foundation — schema, blob client, fal + Nova-3 helpers, sources:* CLI`.

### PR body template (M3-A)

```markdown
## Summary

- Adds Prisma schema for the Clip Lane: `Source`, `Episode`, `Transcript`, `Clip` + enums.
- Adds `src/lib/blob/` (R2/B2-compatible S3 client), `src/lib/fal/` (fal.ai wrapper w/ retry + cost tracking), `src/lib/deepgram/stt.ts` (Nova-3 STT helper alongside existing Aura TTS).
- Adds clip-lane voice profiles (`wealth-wisdom`, `life-advice`, `contrarian-takes`) — these describe *what moments to surface*, not how to narrate.
- Adds `reelwire sources:add` / `list` / `enable` / `disable` CLI.
- No new external integrations beyond what's in the spec (Deepgram Nova-3 reuses the existing key; fal.ai is new but the wrapper is the only touchpoint).

## Test plan

- [ ] `pnpm test` green (≈25 new tests)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm prisma migrate dev --name m3_clip_lane` applies cleanly to a fresh DB
- [ ] `scripts/smoke-deepgram-stt.ts` returns word-level timestamps for the 60s fixture
- [ ] `reelwire sources:add` round-trips through `sources:list`
```

---

## Part 2 — M3-B through M3-G (milestone shapes)

> Detailed plan files for these will be written *when their predecessor merges*, using the `writing-plans` skill against the spec + this milestone shape. Stubs below are intentionally light — they exist so the dependency graph and Todoist sections can be cut now.

### M3-B Ingest

**Branch:** `feat/m3-b-ingest`
**Depends on:** M3-A merged.

**Surface:**
- `src/lib/clip/ingesters/youtube.ts` — wraps `yt-dlp` (download + extract audio).
- `src/lib/clip/ingesters/rss.ts` — `rss-parser` + episode dedup via `Source.externalId`.
- `src/lib/clip/ingesters/upload.ts` — handles signed-upload completion → registers an `Episode`.
- `worker/jobs/clip-poll-source.ts` — BullMQ job that scans a `Source` and queues new `clip:ingest` jobs.
- `worker/jobs/clip-ingest.ts` — BullMQ job that pulls the media to blob storage.
- `worker/jobs/clip-storage-sweep.ts` — daily job that deletes raw mp4s older than 28 days (transcript JSON is kept forever).
- `src/cli/commands/episodes.ts` — `episodes:list`, `episodes:reingest <id>`.

**Acceptance:**
- Poll a real PODCAST_RSS source (Naval) → new episode rows within one poll interval.
- Ingest a 45-minute mp3 to R2/B2 in <2 minutes wall time.
- Storage sweep removes only mp4s past TTL; transcripts untouched.

**Estimated PRs:** 2 (poll/RSS + YT, then ingest + sweep + upload).

### M3-C Transcribe + Score

**Branch:** `feat/m3-c-transcribe-score`
**Depends on:** M3-B merged.

**Surface:**
- `worker/jobs/clip-transcribe.ts` — calls `deepgram/stt.transcribe` with diarize + topics; writes `Transcript` row + word JSON to blob.
- `src/lib/clip/find-moments.ts` — Claude Sonnet 4.6 prompt: input = transcript JSON window-summarized + voice profile; output = list of candidate `{startSec, endSec, speakerLabel, oneLineSummary, reasoning}`.
- `src/lib/clip/score.ts` — Claude Sonnet 4.6 prompt: rubric from spec § "Virality Scoring Rubric"; output = `{score, breakdown, hookText, titleSuggested, descSuggested, rejectReason?}`.
- `worker/jobs/clip-find-moments.ts` + `worker/jobs/clip-score.ts`.
- `src/cli/commands/clips.ts` — `clips:list --episode <id>`, `clips:score <id>`, `clips:reject <id> --reason`.

**Acceptance:**
- 45-minute episode → ≥5 candidate windows in <60s.
- Scoring is deterministic on a fixture set (same transcript → same ranking).
- Below-`minScore` clips auto-rejected with stored reason.

**Estimated PRs:** 2 (transcribe + write-up of moment-finder; score + reject).

### M3-D Cut + Reframe

**Branch:** `feat/m3-d-cut-reframe`
**Depends on:** M3-C merged.

**Surface:**
- `src/lib/clip/cut.ts` — wraps `fluent-ffmpeg` to extract `[startSec, endSec]` from the source mp4 to a temp file. Validate codec / fps / sample rate.
- `src/lib/clip/reframe/` — three files:
  - `sample-frames.ts` — extract 2 fps frames from a clip.
  - `detect-speaker.ts` — call fal.ai Florence-2 (or SAM2) per frame, parse bbox.
  - `smooth-track.ts` — Kalman filter or running-average smoothing over a 1.5s window.
  - `apply-crop.ts` — build ffmpeg `crop=W:H:x(t):y(t)` filter and run.
- `worker/jobs/clip-cut.ts` + `worker/jobs/clip-reframe.ts`.
- `src/app/(admin)/clips/[id]/preview/page.tsx` — QA preview: source frame + bbox overlay + reframed result side-by-side.

**Acceptance:**
- 45s clip → 1080×1920 reframed mp4 in <90s.
- Primary speaker centered ≥95% of frames on a held-out QA set (10 clips, manually scored).
- Speaker changes (diarization) → hard cut in reframe, no slow pan.
- Fallback: no-speaker frames → center-crop with zoom-to-fit.

**Estimated PRs:** 2 (cut + reframe-detect; reframe-smooth + apply-crop + preview page).

### M3-E Render + Caption

**Branch:** `feat/m3-e-render-caption`
**Depends on:** M3-D merged.

**Surface:**
- `remotion/compositions/ClipShort.tsx` — top-level composition. Takes `{ template, sourceClipUrl, words, hookText, channelLogoUrl, musicUrl, brollSegments? }`.
- `remotion/components/Captions.tsx` — word-by-word animated captions using Deepgram word timestamps; current-word highlight in channel accent color.
- `remotion/components/HookOverlay.tsx` — title overlay shown 0-1.5s.
- `remotion/components/CommentaryFrame.tsx` — split-screen layout for `FAIR_USE_COMMENTARY` template.
- `remotion/components/MusicBed.tsx` — ambient track, ducked under voice via Remotion `useAudioData`.
- `remotion/components/BRoll.tsx` — optional cutaway image/video inserts (driven by per-clip `brollSegments`).
- `src/lib/clip/render.ts` — invokes Remotion CLI render with the composition.
- `worker/jobs/clip-render.ts`.

**Acceptance:**
- Two render templates (`DIRECT_CUT`, `COMMENTARY_FRAME`) both produce valid 1080×1920 mp4 with H.264 + AAC.
- Word-level captions sync within ±50ms of source audio.
- Music bed ducks to -18 dB when speaker is talking, returns to -6 dB in silences.
- Snapshot test (1 fps PNG sequence) matches golden frames.

**Estimated PRs:** 1.

### M3-F Publish (wire to M2)

**Branch:** `feat/m3-f-publish`
**Depends on:** M3-E merged **and** M2-D merged.

**Surface:**
- `src/lib/clip/publish-selector.ts` — top-K selection per channel per day (default K=3) ordered by `viralityScore`; respects per-channel cap.
- `worker/jobs/clip-publish.ts` — calls the M2 publisher fanout (YT Shorts + TikTok + IG Reels). No new platform integration code.
- `src/lib/clip/funnel.ts` — mints a per-clip `FunnelLink` (reusing the M2 model) with `/r/clip-{id}` short slug.
- `src/cli/commands/clips.ts` — extend with `clips:publish-now <id>`, `clips:dry-run <channelId>` (show what would publish today).

**Acceptance:**
- Top-K selection deterministic on a fixture set.
- Daily channel cap respected (no more than N clips/day/channel).
- FunnelLink minted before publish; description includes the short URL.
- Stagger delays between platforms match M2 conventions.

**Estimated PRs:** 1.

### M3-G Smoke + Runbook + Deploy

**Branch:** `feat/m3-g-smoke-deploy`
**Depends on:** M3-F merged.

**Surface:**
- `tests/integration/clip-ted-fixture.test.ts` — end-to-end on the public-domain TED Talk fixture: poll → ingest → transcribe → find-moments → score → cut → reframe → render. Asserts ≥1 ready clip in <90s wall time on dev hardware.
- `tests/fixtures/clip/ted-fixture/` — checked-in 10-minute TED clip + expected transcript + expected reframe bbox track.
- `tests/mocks/deepgram-stt.ts`, `tests/mocks/fal-client.ts`, `tests/mocks/yt-dlp.ts` — msw / spawn mocks for offline runs.
- `docs/runbooks/m3-clip-lane.md` — operations runbook (when to manually reject, how to retune a voice profile, how to inspect a stuck job, how to manually trigger reingest).
- `.github/workflows/deploy.yml` — confirm worker host bootstrap installs `yt-dlp` + verifies `ffmpeg` ≥ 6.0.
- `deploy/worker-bootstrap.sh` — idempotent install of yt-dlp + ffmpeg version check.

**Acceptance:**
- Full e2e green in CI.
- Worker host bootstrap is idempotent (running twice is a no-op).
- Runbook covers all 7 acceptance criteria from the spec.

**Estimated PRs:** 1.

---

## Cross-cutting conventions (apply to every milestone)

1. **TDD strict.** No production code without a failing test first. RED → GREEN → REFACTOR (`superpowers:test-driven-development`).
2. **Vitest** is the runner. `pnpm test` runs the whole suite; per-file with `pnpm test path/to/file.test.ts`.
3. **No mocks for the database.** Use a real Postgres test DB (per-test schema or transactional rollback) — same lesson as the user's `feedback_use_hetzner_postgres` memory: mocked DB tests pass while migrations break in prod.
4. **No bare `git add -A`.** Stage explicit paths (per `feedback_no_git_add_all`).
5. **Never push directly to main.** Always branch → PR.
6. **Author noreply form** on every commit (`102129457+connorodea@users.noreply.github.com`).
7. **`unset GITHUB_TOKEN` + verify `gh auth status`** before any `gh` command.
8. **No QuickLotz/QuickBidz mentions** anywhere in code, commits, or PRs (per active litigation rule).
9. **Sentry-wrap every BullMQ job** using the M2-A `wrapJob` helper. No exceptions.
10. **All rights gating goes through `Source.rightsMode`** — there is no "we'll check at publish time."
11. **Don't commit raw episode mp4s or transcript JSON to the repo.** They go to blob storage; tests use small fixtures.
12. **Word-level timestamps everywhere.** Captions, scoring windows, cut boundaries — all use `wordsBlobUrl` from the `Transcript` row, never re-transcribe.
13. **Cost tracking on every external call.** fal.ai wrapper returns `costUSD`; Deepgram billing pulled from response headers; Claude usage tracked via existing M1 helper. All persisted on the relevant row (`Transcript.costUSD`, `Clip.scoreCostUSD`, `Render.renderCostUSD`).

---

## Self-Review (writing-plans skill checkpoint)

- [x] **Spec is the source of truth.** Every milestone references a section of `2026-06-09-clip-lane-design.md`. No new decisions invented in the plan.
- [x] **Each milestone is independently mergeable.** M3-A through M3-E need only M1 + their own predecessor. M3-F is the only milestone that pulls a hard dep from M2.
- [x] **TDD breakdown only for the next executable milestone (M3-A).** Subsequent milestones are shapes — they'll get their own plan files when their predecessor merges, so requirements don't rot.
- [x] **Acceptance criteria are testable.** Every milestone has measurable acceptance (wall-time targets, frame-coverage thresholds, deterministic ranking, etc.) — no "it works" vibes.
- [x] **Rights model is enforced in code, not docs.** `Source.rightsMode` is `NOT NULL` and gates the render template at the `clip:render` job boundary.
- [x] **Cost envelope from spec is replicated here.** ~$2.88/day → ~$1k/yr at launch volume.
- [x] **Cross-cutting conventions encode the relevant memories** (no mock DB, no `git add -A`, no force push, no QL mentions, noreply author).
- [x] **No CLI installs anything globally.** All deps in `package.json` or installed by `deploy/worker-bootstrap.sh` on the target host only.

---

## Execution Handoff

**Next action:** Wait for user approval on the design PR (#2). Once approved:

1. Confirm M1 PR #1 status. If not merged, decide: stack M3-A on `feat/m1-foundation` (rebase after merge) or wait.
2. Create Todoist section `Clip Lane (M3)` under project `Reelwire` (`6gj8v8qcv6pcRcmc`).
3. Create one Todoist task per checkbox in Part 1 (M3-A). Total ≈45 tasks.
4. Cut branch `feat/m3-a-foundation` off `main` (or off `feat/m1-foundation` if stacking).
5. Execute Part 1 task-by-task using `superpowers:subagent-driven-development`.
6. When M3-A merges, return to this skill to write the M3-B plan file.

**Risk to flag at execution kickoff:** fal.ai's reframe quality is the single biggest unknown. Before M3-D code starts, spike 1 day on a manual test: 5 sample clips through `fal-ai/florence-2-large` + manual smoothing, eyeballed. If quality is unusable, switch to `fal-ai/sam2` or self-hosted alternative *before* committing to the BullMQ job design.
