# Architecture

One Next.js 14 app (App Router, TypeScript, Tailwind) serves both the UI and the API. Data lives in Postgres, accessed with raw `pg` queries (no ORM). A small custom Node server wraps Next.js to add a WebSocket for live speech.

```
 Recruiter browser                     Candidate browser
   dashboard, setup                      interview room
        │                                │        │  audio (WebSocket)
        ▼                                ▼        ▼
 ┌──────────────────────── server-custom.js ─────────────────────┐
 │  Next.js app (pages + /api/*)            /api/stt-ws proxy    │──► Deepgram / Soniox / Sarvam
 │      │            │                                           │
 │      │            ├──► AI model (any OpenAI-compatible API)    │
 │      │            └──► TTS provider (Deepgram, Edge, …)        │
 └──────┼────────────────────────────────────────────────────────┘
        ▼
   PostgreSQL            data/  (recordings, proctoring photos)
```

## Main parts

| Area | Where | Notes |
|------|-------|-------|
| Custom server | `server-custom.js` | Production entry point. Loads `.env.local`, starts the Next standalone server and adds `/api/stt-ws`, which checks the interview token against the database and streams audio to the speech-to-text provider |
| Speech providers | `src/lib/providers/` | TTS providers share one interface and are picked by `TTS_PROVIDER`. STT settings exist in both `server-custom.js` and `providers/index.ts`; keep them in sync |
| AI interviewer | `src/lib/ai.ts`, `src/lib/ai-settings.ts` | Builds domain- and level-aware prompts, calls the model, strips leaked "thinking" text. Per-organization settings are stored in `organizations.ai_settings` |
| Scoring | `src/lib/scoring-tracker.ts`, `parse-scorecard.ts`, `normalize-scorecard.ts`, `scorecard-calc.ts` | Runs after the interview ends, repairs the model's JSON and computes scores using the organization's thresholds |
| Data access | `src/lib/store.ts`, `src/lib/db.ts` | Interview types and queries |
| Auth | `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/auth-check.ts` | NextAuth credentials login for recruiters; candidates use the interview token |

## Interview lifecycle

1. **Create.** A recruiter submits `/new`. `/api/create-interview` parses the resume (PDF via `pdf-parse`, DOCX via `mammoth`) and returns a link with a secret token.
2. **Join.** The candidate opens `/interview/[id]?token=…`. The room asks for camera, microphone, screen share and fullscreen.
3. **Converse.** Each turn: candidate audio → STT over the WebSocket → `/api/ai-response` → TTS via `/api/ai-speak-stream` → audio played back.
4. **Proctor.** `Proctoring` and `ScreenShare` post to `/api/proctor-event` and `/api/proctor-heartbeat`. Strikes are counted on the server, and the interview ends when the limit is reached.
5. **Record (optional).** With `VIDEO_RECORDING=on`, `VideoRecorder` uploads 5-second chunks to `/api/video-chunk`. Each upload carries a byte `offset`, so retries never duplicate data. A resumed interview starts a new recording part.
6. **Score.** When the interview ends, scoring runs in the background. A database "claim" stops two servers from scoring the same interview, and a claim stuck for over 5 minutes is retried.
7. **Review.** Recruiters see the transcript, scorecard, proctoring timeline, photos and video on `/dashboard/[id]` and `/review/[id]`.

## Security model

| Concern | How it's handled |
|---------|------------------|
| Recruiter pages | `src/middleware.ts` requires a session for the pages in its `matcher` |
| API routes | Not covered by middleware. **Each route checks access itself**, by session (recruiters) or interview token (candidates) |
| Multi-tenancy | Every query is scoped by `org_id`; recordings are served only to the same organization |
| Passwords | bcrypt, cost 12 |
| SQL injection | Parameterized queries everywhere |
| File paths | IDs validated before touching disk |
| Shell commands | Edge TTS runs through `execFile` with an argument list, no shell |
| Rate limiting | Per-IP limits on AI, TTS and interview creation. Kept in memory, so limits are per server instance |

## Storage

| Data | Location |
|------|----------|
| Interviews, users, transcripts, proctoring events, question banks | Postgres (`migrations/001_schema.sql`) |
| Organization AI settings | `organizations.ai_settings` (`migrations/002_ai_settings.sql`) |
| Proctoring photos, recordings | `data/proctoring`, `data/recordings` on local disk. Needs a persistent volume in containers |

There is no migration runner: apply new files in `migrations/` in order.
