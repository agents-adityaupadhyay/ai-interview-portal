# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # next dev (port 3000)
npm run build    # next build (output: 'standalone')
npm run lint     # next lint
```

`npm start` (`next start`) also exists but skips `server-custom.js`, so it has no STT WebSocket proxy. Run production locally with `node server-custom.js` after a build.

Type-check with `npx tsc --noEmit`. The only tests are the assistant's flow tests: `npm run test:agent` (node:test via `tsx`, scripted model, no DB or key needed); run one file with `npx tsx --test src/lib/agent/tests/agent-flow.test.ts`. `npm run lint` has no ESLint config yet and stops at Next's setup prompt.

Setup: copy `.env.example` to `.env.local`, create a Postgres DB and apply the schema manually (no migration runner exists):

```bash
psql -U postgres -d ai_interview_platform -f migrations/001_schema.sql
psql -U postgres -d ai_interview_platform -f migrations/002_ai_settings.sql
psql -U postgres -d ai_interview_platform -f migrations/003_agent_chat.sql
```

`DATABASE_URL` and `NEXTAUTH_SECRET` are required; `DEEPGRAM_API_KEY`, `AI_BASE_URL`, `AI_API_KEY` (any OpenAI-compatible endpoint), `AI_MODEL` are needed for the interview itself. Email falls back to console logging without SMTP.

## Architecture

Single Next.js 14 (App Router, TypeScript, Tailwind) app serving both UI and API; Postgres via raw `pg` queries (no ORM). Next-auth (credentials) with `src/middleware.ts` protecting only the recruiter pages listed in its `matcher` — candidate-facing routes (`/interview/[id]`, `/completed/[id]`) and all `/api/*` routes are NOT covered by middleware, so API routes must authorize themselves (see `src/lib/auth-check.ts`; candidates authenticate via the interview `token`).

**Custom server (`server-custom.js`)**: production runs `node server-custom.js`, not `next start`. It loads `.env.local`, monkey-patches `http.createServer` to capture the Next standalone server, and adds a WebSocket endpoint `/api/stt-ws` that proxies candidate audio to the STT provider (Deepgram / Soniox / Sarvam). It validates the interview `token` directly against the DB and normalizes each provider's message format. STT provider config therefore exists in two places: `server-custom.js` (live WS proxy) and `src/lib/providers/index.ts` (`getSTTConfig`) — keep them in sync. The client first calls `/api/stt-proxy?token=…` (only for `waiting`/`in_progress` interviews) to learn which provider is active. `STT_CLIENT_PROVIDERS` (exposed via `/api/config`) lists the providers the page may use; `browser` is the Web Speech API fallback, which needs no proxy. Note `npm run dev` uses plain `next dev`, so the WS proxy is not available there.

**Provider abstraction (`src/lib/providers/`)**: TTS providers (deepgram, edge, elevenlabs, cartesia, sarvam) implement `TTSProvider` and are selected lazily by `TTS_PROVIDER`. Edge TTS shells out to the Python `edge-tts` package (installed in the Docker image).

**AI layer (`src/lib/ai.ts`, `ai-settings.ts`)**: builds interviewer prompts (domain/level-aware) and calls the OpenAI-compatible model with raw `fetch` to `${AI_BASE_URL}/v1/chat/completions` (the `ai` SDK is used only by the assistant). `stripThinking` removes leaked reasoning from "thinking" models' output before it is spoken. Scorecards can use a separate model via `SUMMARY_AI_BASE_URL`/`SUMMARY_AI_API_KEY`/`SUMMARY_AI_MODEL`, each falling back to its `AI_*` value. Per-org tunables (persona, scoring thresholds, follow-up behaviour, custom guidelines) are stored in the DB (`migrations/002_ai_settings.sql`) and edited at `/settings/ai`.

**Interview lifecycle**: recruiter creates interview (`/api/create-interview`, resume parsed with pdf-parse/mammoth) → candidate gets tokenized link → `InterviewRoom`/`CodingInterview` components run STT → `/api/ai-response` → TTS (`/api/ai-speak[-stream]`) loop, with `Proctoring`/`ScreenShare`/`AudioRecorder` posting to `/api/proctor-event`, `/api/proctor-heartbeat`, `/api/upload-recording` → on end, scorecard is generated asynchronously (`scoring-tracker.ts` does an atomic claim in the DB with 5‑minute stuck-recovery; `parse-scorecard.ts`/`normalize-scorecard.ts`/`scorecard-calc.ts` handle LLM JSON repair and score math using org thresholds). Strike counts for proctoring are enforced server-side. Multi-tenant via `org_id`; `src/lib/store.ts` holds the `Interview` types and DB access. `src/lib/rate-limit.ts` (used by the AI/TTS/create routes) is an in-memory per-process map, so limits are not shared across replicas (the `rate-limiter-flexible` dependency is not used).

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

## UI theme

Colours are theme tokens generated in `tailwind.config.ts`: every family the pages use (`gray`, `indigo` = brand, `red`, `green`, `amber`, `blue`, `purple`, ...) resolves to a CSS variable, with separate variables for background/border shades and text shades so dark mode can tint chips while lightening their labels. `bg-white` means "card surface" and goes dark; `text-white` stays white. Dark mode is the `dark` class on `<html>`, set before paint by `lib/theme-script.ts` and switched by `useTheme` (`lib/theme.ts`, light/dark/system in `localStorage`). `zinc` is untouched and `.interview-room` pins the light token values, because the candidate interview room is designed dark on its own. Avoid hex colours in components (use `currentColor` + a text class) or they won't follow the theme. Greys are warm neutrals; the brand violet (`indigo`) is an accent only (focus, active, links, charts), while `.btn-primary` is solid ink (`bg-gray-900 text-gray-50`, so it inverts in dark mode). Surfaces use the `shadow-hairline` ring instead of borders, and `.badge-*` are neutral pills with a coloured dot. Fonts are self-hosted with `next/font` (Inter; Inter Tight for headings; JetBrains Mono as `font-mono` for numbers, dates and shortcuts), so `next build` needs network access to Google Fonts. Recruiter pages share `DashboardLayout`: an inset canvas (sidebar on the tinted frame, content on a raised panel) with `TopBar` (breadcrumbs, search, Ask AI), `Sidebar` (grouped nav from `components/nav.tsx`, `N` = new interview) and the Ctrl/⌘K `CommandPalette`; the dashboard overview is `components/dashboard/Overview.tsx`.

## Video recording

Gated by `VIDEO_RECORDING=on` (exposed to the client via `/api/config`; compose default is `off`). `VideoRecorder` (WebM only, so no Safari) composites the screen share (full frame) with a square camera box in the bottom-right corner onto a 1280×720 canvas and mixes mic + AI voice in Web Audio; `InterviewRoom` must call `window.__recordAIAudio(audio)` on every TTS `Audio` element it creates, or that speech is missing from the recording. It uploads 5s chunks to `/api/video-chunk` with an `offset` for idempotent appends; path validation, the flag check and the size caps (per chunk, per part, parts per interview) live in `src/lib/video-storage.ts`. Files are per recording session under `data/recordings/video/<interviewId>/`, since a resumed interview starts a new part. Recruiters play them back through `/api/recording/[id]/video` (Range support, same-org check) in `RecordingPlayer` on the dashboard page. Nothing deletes recordings yet. The older `AudioRecorder` and `/api/upload-recording` are unused by the interview room.

## AI assistant (recruiter chat agent)

Gated by `AGENT_CHAT=on` (via `/api/config`; every `/api/agent/*` route 404s when off) and needs `migrations/003_agent_chat.sql`. Docs: `docs/ai-assistant.md` (features, milestone plan). Built on AI SDK v7 (`streamText` + UI message stream; client `@ai-sdk/react` `useChat`), model via `@ai-sdk/openai-compatible` using `AGENT_AI_*` falling back to `AI_*` (`config.ts` appends `/v1`).

- Capabilities are **features** in `src/lib/agent/features/` (`defineFeature`: tools + prompt guidance), listed in `features/index.ts` and filtered by `AGENT_FEATURES`. Each tool declares a `risk`; `destructive`/`external` pause for an approval card (`approval.ts`), also through `execute_tool` in lazy mode.
- Tools must act through the app's own routes via `callAppApi` (forwards the recruiter's session cookie, `x-forwarded-for` and `Origin` to `http://127.0.0.1:$PORT` or `AGENT_APP_BASE_URL`), never `pool`/`store` directly, so route-level org/admin checks apply. Several routes are not org-scoped beyond the session check (e.g. `/api/create-interview` loads a question bank or email template by id alone), so keep that in mind when exposing new ones.
- History is server-owned (`history.ts` accepts only a new user message or approval/`ask_user` responses on the latest assistant message). Threads are scoped by `user_id` + `org_id` in `pg-store.ts`; messages are ordered by a `seq` column. Attachments (PDF/DOCX/TXT, data URLs) are stored in message parts; `run-turn.ts` replaces them with a text note before the model sees them, and `features/attachments.ts` reads them for tools.
- UI: `src/components/agent-ui/` is the skill's kit (agent mode + side panel sharing one `Chat` per thread; restyle via the `--agent-*` tokens in `agent-ui.css`, not the layout rules; it also neutralizes the app's global `*:focus-visible` ring and Tailwind's list reset). `src/components/agent/` is the app wiring: `AgentRoot` in `Providers` (root layout, so chats survive navigation) checks flag + session + recruiter route and lazy-loads `AgentHost`; the Sidebar's Ask AI talks to it through `agent-bridge.ts`, so nothing agent-related loads when the flag is off. The repo's `tsconfig` targets `es5`: avoid spreading `Map`/`Set` iterators and regex `s` flags in agent code.
