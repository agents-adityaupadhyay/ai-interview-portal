# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # next dev (port 3000)
npm run build    # next build (output: 'standalone')
npm run lint     # next lint
```

There is no test suite. Type-check with `npx tsc --noEmit`.

Setup: copy `.env.example` to `.env.local`, create a Postgres DB and apply the schema manually (no migration runner exists):

```bash
psql -U postgres -d ai_interview_platform -f migrations/001_schema.sql
psql -U postgres -d ai_interview_platform -f migrations/002_ai_settings.sql
```

`DATABASE_URL` and `NEXTAUTH_SECRET` are required; `DEEPGRAM_API_KEY`, `AI_BASE_URL`, `AI_API_KEY` (any OpenAI-compatible endpoint), `AI_MODEL` are needed for the interview itself. Email falls back to console logging without SMTP.

## Architecture

Single Next.js 14 (App Router, TypeScript, Tailwind) app serving both UI and API; Postgres via raw `pg` queries (no ORM). Next-auth (credentials) with `src/middleware.ts` protecting only the recruiter pages listed in its `matcher` — candidate-facing routes (`/interview/[id]`, `/completed/[id]`) and all `/api/*` routes are NOT covered by middleware, so API routes must authorize themselves (see `src/lib/auth-check.ts`; candidates authenticate via the interview `token`).

**Custom server (`server-custom.js`)**: production runs `node server-custom.js`, not `next start`. It loads `.env.local`, monkey-patches `http.createServer` to capture the Next standalone server, and adds a WebSocket endpoint `/api/stt-ws` that proxies candidate audio to the STT provider (Deepgram / Soniox / Sarvam). It validates the interview `token` directly against the DB and normalizes each provider's message format. STT provider config therefore exists in two places: `server-custom.js` (live WS proxy) and `src/lib/providers/index.ts` (`getSTTConfig`) — keep them in sync. The client first calls `/api/stt-proxy?token=…` (only for `waiting`/`in_progress` interviews) to learn which provider is active. Note `npm run dev` uses plain `next dev`, so the WS proxy is not available there.

**Provider abstraction (`src/lib/providers/`)**: TTS providers (deepgram, edge, elevenlabs, cartesia, sarvam) implement `TTSProvider` and are selected lazily by `TTS_PROVIDER`. Edge TTS shells out to the Python `edge-tts` package (installed in the Docker image).

**AI layer (`src/lib/ai.ts`, `ai-settings.ts`)**: builds interviewer prompts (domain/level-aware) and calls the OpenAI-compatible model via the `ai` SDK. `stripThinking` removes leaked reasoning from "thinking" models' output before it is spoken. Per-org tunables (persona, scoring thresholds, follow-up behaviour, custom guidelines) are stored in the DB (`migrations/002_ai_settings.sql`) and edited at `/settings/ai`.

**Interview lifecycle**: recruiter creates interview (`/api/create-interview`, resume parsed with pdf-parse/mammoth) → candidate gets tokenized link → `InterviewRoom`/`CodingInterview` components run STT → `/api/ai-response` → TTS (`/api/ai-speak[-stream]`) loop, with `Proctoring`/`ScreenShare`/`AudioRecorder` posting to `/api/proctor-event`, `/api/proctor-heartbeat`, `/api/upload-recording` → on end, scorecard is generated asynchronously (`scoring-tracker.ts` does an atomic claim in the DB with 5‑minute stuck-recovery; `parse-scorecard.ts`/`normalize-scorecard.ts`/`scorecard-calc.ts` handle LLM JSON repair and score math using org thresholds). Strike counts for proctoring are enforced server-side. Multi-tenant via `org_id`; `src/lib/store.ts` holds the `Interview` types and DB access. `src/lib/rate-limit.ts` (used by the AI/TTS/create routes) is an in-memory per-process map, so limits are not shared across replicas.

Recordings/proctoring images are written to `data/recordings` and `data/proctoring` on local disk (needs a persistent volume in containers).

## Deployment

Docker multi-stage build (`Dockerfile`) → GHCR image. GitHub Actions: `docker-deploy.yml` ("Docker CI Build") builds/pushes on main; `docker-cd-deploy.yml` auto-runs after a successful CI build (or manually with `image_tag`) and SSH-deploys to the environment named by repo var `DEPLOY_ENVIRONMENT` (default `PROD`). See `docs/deployment/github-actions.md` and `scripts/set-github-actions-config.ps1`. The OpenShift template is in `openshift/`, its guide in `docs/deployment/openshift.md`. User-facing docs live in `docs/` (indexed from `README.md`); keep `docs/configuration.md` in sync when adding env vars. `deploy_key`/`deploy_key.pub` in the working tree are local, git-ignored artifacts — never commit them.

## Local Docker run

`docker-compose.yml` has an optional bundled Postgres (`db`, migrations auto-applied on first start only) plus `app`. Compose does not read `.env.local` on its own; pass it explicitly. With an external DB (e.g. Aiven in `.env.local`), skip the bundled one:

```bash
docker compose --env-file .env.local up -d --build --no-deps app   # http://localhost:3000
docker compose --env-file .env.local down
```

Every env var the code reads must also be listed under `app.environment` in `docker-compose.yml`, or it never reaches the container. `AI_BASE_URL` must not include `/v1` (the code appends `/v1/chat/completions`). With an external DB, apply `migrations/*.sql` yourself; `002_ai_settings.sql` adds `organizations.ai_settings`, which `/settings/ai` needs. `server-custom.js` opens its own `pg` pool, so DB SSL settings must match `src/lib/db.ts`.

## Video recording

Gated by `VIDEO_RECORDING=on` (exposed to the client via `/api/config`; compose default is `off`). `VideoRecorder` (camera + mic, WebM only, so no Safari) uploads 5s chunks to `/api/video-chunk` with an `offset` for idempotent appends. Files are per recording session under `data/recordings/video/<interviewId>/`, since a resumed interview starts a new part. Recruiters play them back through `/api/recording/[id]/video` (Range support, same-org check) in `RecordingPlayer` on the dashboard page. Nothing deletes recordings yet. The older `AudioRecorder` and `/api/upload-recording` are unused by the interview room.
