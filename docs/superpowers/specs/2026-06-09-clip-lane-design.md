# Clip Lane — Design

**Date:** 2026-06-09
**Status:** Draft (awaiting user review)
**Owner:** Connor O'Dea
**Tracker:** Todoist project `Reelwire` (`6gj8v8qcv6pcRcmc`)
**Reference channel (target format):** `@InfiniteWealthLabOfficial` — faceless wisdom/business shorts
**Reference product (feature parity goal):** OpusClip

## Problem

Reelwire today is a *generative* engine — Google News (M1) and X tweets (M2) get
turned into scripted, AI-narrated reels. That works, but it ignores the highest-
density source of viral short-form content on the internet: **existing long-form
video**. Podcasts, keynotes, interviews, and YouTube uploads already contain
hundreds of complete, quotable, emotionally-arced moments per hour — they just
need to be *found*, *cut*, *reframed*, *captioned*, and *posted*.

OpusClip productized this and now does $20M+ ARR. We need the same capability
inside Reelwire so we can:

- Mine our own existing long-form content (when we have any) for repurposing.
- Mine licensed or fair-use third-party sources (podcasts on RSS, public keynotes,
  CC-BY YouTube channels) and ship them — with commentary/overlay when the legal
  posture calls for it — to our channel portfolio.
- Reuse every piece of Reelwire infrastructure: BullMQ stage queue, Remotion
  composer, Deepgram TTS, YouTube + TikTok + IG publishers, channel/voice model.

## Goals (v1)

- **OpusClip-equivalent core loop:** URL or upload → transcribe → identify
  viral moments → cut → reframe to 9:16 with speaker tracking → animated
  captions → score → publish.
- **Deepgram Nova-3** for transcription (word timestamps + diarization + topic
  detection + sentiment), reusing the existing `src/lib/deepgram` module.
- **fal.ai** for the visual pipeline (face/object detection, smart reframe,
  optional B-roll generation, optional thumbnail generation).
- **Claude Sonnet 4.6** virality scoring with a structured rubric (no proprietary
  ML model in v1).
- **Per-source rights mode:** every source carries a `rightsMode` (`OWNED`,
  `LICENSED`, `FAIR_USE_COMMENTARY`, `PUBLIC_DOMAIN`) that gates the render
  template (raw clip vs. clip-with-overlay-commentary).
- **3 launch channels** mirroring M2's portfolio split (PRODUCT, AFFILIATE,
  ADSENSE), each with its own source allowlist and channel voice.
- One source episode → **N candidate clips** (typically 8-20 per 60-minute
  podcast) → top-K (default 3) auto-published per channel per day.
- Reuse M2's tri-platform publish fanout (YT Shorts + TikTok + IG Reels).

## Non-Goals (Phase 1 explicit exclusions)

- ✗ Building a SaaS UI for outside users. Internal CLI + minimal admin pages,
  same as M1/M2.
- ✗ Mining content where rights are unclear (no "scrape any YouTube channel and
  repost"). Every source must be added to the catalog with an explicit
  `rightsMode`.
- ✗ Trained virality model. Claude-rubric scoring in v1; learned ranker is M5+.
- ✗ Multi-speaker B-roll synthesis (generative video of the actual speakers).
- ✗ Voice cloning of the source speaker.
- ✗ Real-time / streaming ingestion. Episode-level batch only.
- ✗ Vertical video translation/dubbing. (Phase 2.)
- ✗ Comment scraping / sentiment-based ranking from the source platform.

## Content Strategy

**Format:** 25-60 second vertical clips of real speakers with word-by-word
animated captions, optional B-roll inserts on key concepts, ambient music bed
ducked under voice. Hook overlay (`"Why experience beats theory →"`) in first
1.5s. Channel logo bug bottom-right.

**Two render templates:**

1. **Direct cut (`OWNED` / `LICENSED` / `PUBLIC_DOMAIN`)** — reframed source
   video is the foreground. Captions on top.
2. **Commentary frame (`FAIR_USE_COMMENTARY`)** — source clip occupies upper
   ~55% of frame, our reaction title/text occupies lower ~45%, captions overlay
   the source. This is the legally-defensible posture for content where we
   don't have an explicit license but the use is transformative.

**Channel voice is still the product.** Even though the audio comes from the
source speaker, *clip selection* expresses the channel personality: the
"AFFILIATE — wealth wisdom" channel cuts different moments from a Naval podcast
than the "ADSENSE — life advice" channel would.

## Architecture

```
┌──────────────────────────── Reelwire (extended) ─────────────────────────────┐
│                                                                              │
│   Sources              Ingest                Compose             Distribute  │
│  ┌──────────────┐                                              ┌──────────┐  │
│  │ Google News  │──┐                                      ──> │ YT Shorts│  │
│  │   (M1)       │  │                                           └──────────┘  │
│  └──────────────┘  │                                           ┌──────────┐  │
│  ┌──────────────┐  │                                      ──> │ TikTok   │  │
│  │ X.com trends │──┤                                           └──────────┘  │
│  │   (M2)       │  │                                           ┌──────────┐  │
│  └──────────────┘  │                                      ──> │ IG Reels │  │
│  ┌──────────────┐  │   ┌──────────────────────────────┐        └──────────┘  │
│  │ Long-form    │  │   │  yt-dlp / RSS / direct upload│             ▲       │
│  │ video (M3)   │──┼──>│  ──> Deepgram Nova-3 STT     │             │       │
│  │  - YouTube   │  │   │  ──> Claude moment finder    │             │       │
│  │  - Podcast   │  │   │  ──> Claude virality scorer  │   ┌─────────┴────┐  │
│  │    RSS       │  │   │  ──> ffmpeg cut              │──>│  Remotion    │  │
│  │  - File      │  │   │  ──> fal.ai face track +     │   │  composer    │  │
│  │    upload    │  │   │       smart reframe 9:16     │   │  + captions  │  │
│  └──────────────┘  │   │  ──> fal.ai b-roll (optional)│   │  + b-roll    │  │
│                    │   │  ──> caption synthesis       │   │  + music     │  │
│                    │   └──────────────────────────────┘   └──────────────┘  │
│                    ▼                                                         │
│             ┌─────────────┐                                                  │
│             │  Prisma /   │  Source · Episode · Transcript · Clip ·          │
│             │  Postgres   │  Render · Publish · Metric                       │
│             └─────────────┘                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

M3 reuses the existing BullMQ + Redis worker, the existing `src/lib/deepgram`
client (extended with Nova-3 STT), the existing `src/lib/claude` client, the
existing Remotion composer (extended with a `<ClipShort />` composition), and
the existing publishers from M2.

The only **new** external integrations are:

- **Deepgram Nova-3 STT** (currently using Aura TTS only)
- **fal.ai** (`@fal-ai/client`) for face/object detection + smart-crop + optional
  generative B-roll
- **yt-dlp** as a binary on the worker host for YouTube ingestion
- **Podcast RSS poller** (simple `rss-parser`)

## Source Catalog

A `Source` row in Postgres is the canonical "thing we mine." Every source has:

- `kind`: `YOUTUBE_CHANNEL`, `YOUTUBE_VIDEO`, `PODCAST_RSS`, `FILE_UPLOAD`
- `rightsMode`: `OWNED` | `LICENSED` | `FAIR_USE_COMMENTARY` | `PUBLIC_DOMAIN`
- `allowedChannels`: array of Reelwire channel IDs that may publish from it
- `pollIntervalMin`: how often to check for new episodes (null = manual)
- `clipsPerEpisodeMax`: cap on how many clips we extract (default 5)
- `voiceProfile`: free-text guidance fed into the moment-finder prompt
  ("we want stoic, philosophical moments, not promotional ones")

Launch catalog (illustrative — final list locked in implementation):

| Source                                | Kind            | Rights              |
|---------------------------------------|-----------------|---------------------|
| Naval podcast (RSS)                   | PODCAST_RSS     | FAIR_USE_COMMENTARY |
| Lex Fridman (RSS)                     | PODCAST_RSS     | FAIR_USE_COMMENTARY |
| Diary of a CEO (RSS)                  | PODCAST_RSS     | FAIR_USE_COMMENTARY |
| Connor's own long-form (file/upload)  | FILE_UPLOAD     | OWNED               |
| TED Talks official channel            | YOUTUBE_CHANNEL | LICENSED (CC-BY)    |

## Pipeline Stages (BullMQ)

Job names mirror M1/M2 convention (`<lane>:<stage>`).

| Stage                | Job                  | Input               | Output                      |
|----------------------|----------------------|---------------------|-----------------------------|
| 1. Poll              | `clip:poll-source`   | `sourceId`          | N × `Episode` rows queued   |
| 2. Ingest            | `clip:ingest`        | `episodeId`         | local mp4 + audio in `/var/lib/reelwire/episodes/<id>/` |
| 3. Transcribe        | `clip:transcribe`    | `episodeId`         | `Transcript` row with word-level JSON in S3-compatible blob |
| 4. Find moments      | `clip:find-moments`  | `transcriptId`      | N × `Clip` rows (status `CANDIDATE`) |
| 5. Score             | `clip:score`         | `clipId`            | `Clip.viralityScore` + `Clip.titleHook` + `Clip.descTemplate` |
| 6. Cut               | `clip:cut`           | `clipId`            | rough mp4 + clip audio file |
| 7. Reframe           | `clip:reframe`       | `clipId`            | 1080×1920 mp4 with smart pan |
| 8. Caption + compose | `clip:render`        | `clipId`            | final mp4 in `Render` table |
| 9. Publish           | `clip:publish`       | `renderId, channelId` | `Publish` row per platform (YT/TT/IG) |
| 10. Measure          | `clip:measure`       | `publishId`         | `Metric` rows hourly for 72h, then daily |

Stages 4-5 can batch per episode (one Claude call sees all candidate windows).
Stages 6-8 are per-clip and embarrassingly parallel.

## Data Model (Prisma sketch)

```prisma
enum SourceKind          { YOUTUBE_CHANNEL YOUTUBE_VIDEO PODCAST_RSS FILE_UPLOAD }
enum RightsMode          { OWNED LICENSED FAIR_USE_COMMENTARY PUBLIC_DOMAIN }
enum EpisodeStatus       { DISCOVERED INGESTING TRANSCRIBING ANALYZING READY FAILED }
enum ClipStatus          { CANDIDATE SCORED CUTTING REFRAMING RENDERING READY PUBLISHED REJECTED FAILED }
enum RenderTemplate      { DIRECT_CUT COMMENTARY_FRAME }

model Source {
  id                String   @id @default(cuid())
  name              String
  kind              SourceKind
  url               String?           // RSS URL or YouTube channel URL
  rightsMode        RightsMode
  allowedChannels   String[]          // Channel IDs
  pollIntervalMin   Int?
  clipsPerEpisodeMax Int     @default(5)
  voiceProfile      String?  @db.Text
  enabled           Boolean  @default(true)
  episodes          Episode[]
  createdAt         DateTime @default(now())
}

model Episode {
  id          String         @id @default(cuid())
  sourceId    String
  source      Source         @relation(fields: [sourceId], references: [id])
  externalId  String         // YouTube videoId or RSS guid
  title       String
  publishedAt DateTime
  durationSec Int?
  mediaPath   String?        // local path after ingest
  status      EpisodeStatus  @default(DISCOVERED)
  transcript  Transcript?
  clips       Clip[]
  createdAt   DateTime       @default(now())
  @@unique([sourceId, externalId])
}

model Transcript {
  id           String   @id @default(cuid())
  episodeId    String   @unique
  episode      Episode  @relation(fields: [episodeId], references: [id])
  deepgramReq  Json     // request params used (model, diarize, etc.)
  wordsBlobUrl String   // pointer to word-level JSON in object storage
  speakerCount Int
  language     String
  topics       Json?    // Deepgram topic detection
  createdAt    DateTime @default(now())
}

model Clip {
  id              String      @id @default(cuid())
  episodeId       String
  episode         Episode     @relation(fields: [episodeId], references: [id])
  startSec        Float
  endSec          Float
  speakerLabel    String?     // "Naval" / "Lex" / "Speaker 0"
  hookText        String?     // overlay shown in first 1.5s
  titleSuggested  String?
  descSuggested   String?     @db.Text
  viralityScore   Float?      // 0-100, Claude rubric
  scoreBreakdown  Json?       // sub-scores per rubric axis
  template        RenderTemplate
  status          ClipStatus  @default(CANDIDATE)
  rejectReason    String?
  renders         Render[]
  createdAt       DateTime    @default(now())
  @@index([episodeId, viralityScore])
}

// Render + Publish + Metric reuse the M2 models verbatim.
```

## Virality Scoring Rubric (Claude Sonnet 4.6)

Score each candidate window 0-100 as a weighted sum of:

| Axis              | Weight | Signal                                                              |
|-------------------|-------:|---------------------------------------------------------------------|
| Hook strength     |    25  | Does the first sentence stop the scroll? (question, claim, contrast)|
| Completeness      |    20  | Is the thought self-contained — no "...as I was saying earlier"?    |
| Emotional arc     |    15  | Tension → release, surprise, or stakes raised then resolved.        |
| Insight density   |    15  | Quotable, screenshottable, transferable to other contexts.          |
| Channel fit       |    15  | Matches the target channel's `voiceProfile`.                        |
| Pacing            |    10  | No long pauses, no filler-word swamps, no tangents.                 |

Claude returns `{score, breakdown, hookText, titleSuggested, descSuggested,
rejectReason?}` per window. Windows scoring below the channel's `minScore` (default
60) are auto-rejected and never rendered.

## Reframing — fal.ai

OpusClip's reframe is the single hardest piece. v1 approach:

1. **Sample frames at 2 fps** through the clip window.
2. Call **`fal-ai/florence-2-large`** (or `fal-ai/sam2` for fast segmentation)
   with prompt `"primary speaking person"` to get a per-frame bbox.
3. Apply **temporal smoothing** (Kalman filter or running average over a 1.5s
   window) so the crop doesn't jitter.
4. Build an ffmpeg `crop=W:H:x(t):y(t)` filter where `x(t)` and `y(t)` are
   stepwise functions from the smoothed track.
5. Hard-cut between speakers when diarization changes — no slow pans across
   participants.

Fallback when no speaker is detected (B-roll / animations): center-crop with
zoom-to-fit, no pan.

## Captions

Reuse Deepgram word-level timestamps from the transcript. Captions render as a
Remotion `<Sequence>` per word with `interpolate` opacity + scale on enter.
Default style: **Inter Bold, 64px, white, 4px black stroke, lower third,
two-line max, highlight current word in channel accent color**. Configurable
per channel.

## Risks & Mitigations

| Risk                                                | Mitigation                                                                                          |
|-----------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| YouTube Content ID claim on reposted podcast clips  | `FAIR_USE_COMMENTARY` template adds visible reaction frame; restrict to ≤60s; never use music-heavy segments. |
| DMCA strike from source rights holder               | Per-source `rightsMode` is mandatory; no source ships without it; manual takedown path on every publish. |
| fal.ai reframe drifts off speaker                   | Temporal smoothing + hard fallback to center-crop; QA dashboard shows reframe preview before publish. |
| Deepgram diarization mis-attributes speakers        | Show speaker label in admin UI; allow manual swap before render kicks off.                          |
| Claude scores look high but clips flop              | `Metric` table tracks score → views correlation; we recalibrate the rubric quarterly.               |
| Source long-form is 3 hours, transcript blob is huge| Store word JSON in S3-compatible blob (R2 or B2), not in Postgres. Only metadata in DB.            |
| Storage explosion (raw mp4 per episode)             | Retention: delete source mp4 28 days after last clip ships; keep transcript forever.                |
| yt-dlp breakage from YouTube changes                | Pin a known-good version, monitor exit codes, fall back to `youtube-dl-exec`.                       |

## Testing

- **Unit:** virality scorer on a 50-window fixture set; assert relative ranking
  is stable across runs (no randomness leaking).
- **Unit:** reframe smoothing on a synthetic bbox track with injected jitter.
- **Integration:** end-to-end on a 10-minute public-domain TED Talk fixture
  checked into `tests/fixtures/clip/ted-fixture/` — should produce ≥1 ready
  clip in <90s wall time on dev hardware.
- **Snapshot:** Remotion composition output rendered at 1 fps and compared
  against a golden PNG sequence (caption position, hook timing, logo bug).
- **Manual:** weekly review of top-5 clips per channel by user; ratings feed
  back into the rubric calibration doc.

## Cost & Capacity (rough envelope)

Assume 3 channels × 3 clips/day = **9 clips/day**, average source episode 45 min.

| Item                                  | Per episode | Per day (3 eps) |
|---------------------------------------|------------:|----------------:|
| Deepgram Nova-3 STT @ $0.0043/min     |       $0.19 |           $0.58 |
| Claude moment-finder (Sonnet 4.6)     |       $0.40 |           $1.20 |
| Claude scoring (Sonnet 4.6)           |       $0.15 |           $0.45 |
| fal.ai reframe (~$0.02/clip × 5)      |       $0.10 |           $0.30 |
| fal.ai B-roll (optional, ~$0.05/clip) |       $0.10 |           $0.30 |
| Storage (R2, ~2GB/episode × 28d)      |          —  |          ~$0.05 |
| **Total**                             |     **~$0.94** |       **~$2.88** |

Annualized: **~$1,050/yr** for full M3 throughput at launch volume. Order of
magnitude cheaper than OpusClip's $30+/mo paid tier for the same output, before
counting any monetization on the published clips.

## Decisions Locked (2026-06-09)

1. **STT = Deepgram Nova-3** (not Whisper) for diarization + topic detection + speed.
2. **Vision = fal.ai** (not self-hosted SAM2 / not Replicate) for unified billing + Reelwire's no-GPU posture.
3. **Scoring = Claude Sonnet 4.6 rubric** (not a trained classifier). Phase 2 considers ML.
4. **Rights are per-source, not per-clip.** No "we'll figure it out at publish time."
5. **`FAIR_USE_COMMENTARY` ships with a visible overlay frame**, not raw clip + nothing.
6. **Storage is 28-day TTL on raw mp4**, forever on transcript JSON.
7. **Reuse M2 publisher fanout verbatim** — no new YT/TT/IG integration code in M3.

## Phase 2 (post-MVP, not blocking)

- Learned virality classifier trained on (clip features → 72h views)
- Vertical translation/dubbing via Deepgram TTS + fal voice cloning
- Multi-aspect render (1:1 for X, 4:5 for IG feed, 9:16 for Shorts/TT/Reels)
- B-roll library cached per topic so we don't regenerate the same "AI brain" stock shot 50 times
- Hook A/B testing (render 2 hook variants per clip, like M2 already does)
- Live RSS poller daemon (currently every poll is its own job; daemon would consolidate)
- Comment-mining for trending topics within the source's existing audience

## Deployment

Identical to M1/M2: hetznerCO via the standardized GitHub Actions deploy. Two new
worker dependencies on the host:

- `yt-dlp` binary (apt install or pinned static binary)
- `ffmpeg` ≥ 6.0 (already required by Remotion; verify version)

New env vars (added to `.env.example`):

```
DEEPGRAM_API_KEY=          # already exists for Aura; reused for Nova-3
FAL_KEY=                   # new
CLIP_BLOB_BUCKET=          # R2 or B2 bucket for transcripts + raw episodes
CLIP_BLOB_ENDPOINT=
CLIP_BLOB_KEY=
CLIP_BLOB_SECRET=
```

## Acceptance Criteria (M3 done = ready to merge)

- [ ] `Source` admin page lists catalog with `rightsMode` and `enabled` toggle.
- [ ] Poll job pulls new episodes from a PODCAST_RSS source within 1 poll interval.
- [ ] `clip:transcribe` produces a Deepgram transcript with diarization for a 45-minute episode in <3 minutes wall time.
- [ ] `clip:find-moments` returns ≥5 candidate windows per 45-minute episode with non-overlapping ranges.
- [ ] `clip:score` returns score + hook + title + description fields populated for every candidate.
- [ ] `clip:reframe` produces a 1080×1920 mp4 where the primary speaker is centered ≥95% of frames (measured against a held-out QA set).
- [ ] `clip:render` outputs a final mp4 that matches the channel's caption style and logo placement.
- [ ] `clip:publish` ships the top-K clips per channel per day to YT Shorts + TikTok + IG Reels using the M2 publisher.
- [ ] End-to-end on the TED fixture completes in <90s and produces ≥1 ready clip.
- [ ] All scored decisions are persisted (`Clip.scoreBreakdown`) so we can audit the ranker later.
- [ ] No source publishes without an explicit `rightsMode` row in the database.

