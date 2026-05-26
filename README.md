# Reelwire

> The newswire that ships reels.

Reelwire turns live news into automated YouTube videos at scale. Pipeline:

```
scrape.do Google News → Claude story ranker → Claude script writer →
Deepgram Aura voiceover → Remotion render → YouTube Data API upload
```

## Status

M1 — Foundation (in progress). See [Todoist project](https://todoist.com/app/project/6gj8v8qcv6pcRcmc).

## Stack

- **Next.js 14** (app router) — admin UI + API routes
- **Prisma + Postgres** — on hetznerCO
- **BullMQ + Redis** — job queue (ingest → script → tts → render → upload)
- **Remotion 4** — video composition + rendering
- **Deepgram Aura** — TTS with per-channel voice catalog
- **Claude Sonnet 4.6** — script generation; **Haiku** — story ranking
- **scrape.do** — Google News scraping
- **YouTube Data API v3** — upload + scheduling

## Local dev

```bash
pnpm install
cp .env.example .env  # fill in keys
pnpm db:push
pnpm dev              # next on :3040
pnpm worker           # bullmq worker
pnpm test             # vitest
```

## Deploy

hetznerCO via GitHub Actions. See [README_DEPLOY.md](./README_DEPLOY.md).
