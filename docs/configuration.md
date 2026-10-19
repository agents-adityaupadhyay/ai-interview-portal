# Configuration

All settings are environment variables. Locally they live in `.env.local` (start from `.env.example`). In Docker they must also be listed under `app.environment` in `docker-compose.yml`.

Per-organization interviewer behaviour (persona, tone, scoring thresholds, follow-up style, custom guidelines) is not an environment variable. Admins edit it in the app at **Settings → AI**.

## Core (required)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `NEXTAUTH_SECRET` | Random secret for signing sessions. Generate with `openssl rand -base64 32` and never reuse the example value |
| `NEXTAUTH_URL` | Public URL of the app, e.g. `https://interview.example.com` |
| `NEXT_PUBLIC_APP_URL` | URL used in candidate links and emails. Defaults to `NEXTAUTH_URL` |

## AI model

Any OpenAI-compatible endpoint works. `AI_BASE_URL` must **not** end in `/v1`; the app adds `/v1/chat/completions` itself.

| Variable | Description |
|----------|-------------|
| `AI_BASE_URL` | e.g. `https://api.openai.com`, `https://api.groq.com/openai`, `http://localhost:11434` (Ollama) |
| `AI_API_KEY` | Key for that endpoint |
| `AI_MODEL` | Model used during the live interview |
| `SUMMARY_AI_BASE_URL`, `SUMMARY_AI_API_KEY`, `SUMMARY_AI_MODEL` | Optional separate (usually larger) model for scorecards. Each falls back to its `AI_*` value |

"Thinking" models are supported: leaked reasoning is stripped before the reply is spoken.

## Speech

### Speech-to-text (candidate → text)

| Variable | Default | Description |
|----------|---------|-------------|
| `STT_PROVIDER` | `deepgram` | `deepgram`, `soniox` or `sarvam` |
| `STT_LANGUAGE` | `en-IN` | Language / accent the transcriber expects |
| `STT_CLIENT_PROVIDERS` | `deepgram,browser` | Providers the interview page may use; `browser` is the built-in Web Speech fallback |
| `DEEPGRAM_API_KEY`, `SONIOX_API_KEY`, `SARVAM_API_KEY` | | Key for the chosen provider |

Live transcription goes through the WebSocket proxy in `server-custom.js`, so it only works with the production server (`node server-custom.js` or Docker), not `npm run dev`.

### Text-to-speech (AI → voice)

Choose a provider with `TTS_PROVIDER`. Each provider has its own voice settings:

| `TTS_PROVIDER` | Voice and accent | Speed | Other | Notes |
|----------------|------------------|-------|-------|-------|
| `deepgram` (default) | fixed: `aura-angus-en` | — | — | Fast; voice not configurable yet |
| `edge` | `EDGE_TTS_VOICE` (`en-IN-NeerjaNeural`) | `EDGE_TTS_RATE` (`+10%`) | — | Free; slowest; needs Python `edge-tts` |
| `cartesia` | `CARTESIA_VOICE_ID`, `CARTESIA_LANGUAGE` (`en`), `CARTESIA_MODEL` (`sonic-2`) | `CARTESIA_SPEED` (`1.0`) | — | Very low latency |
| `elevenlabs` | `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` (`eleven_turbo_v2_5`) | `ELEVENLABS_SPEED` (`1.0`) | `ELEVENLABS_STABILITY` (`0.5`), `ELEVENLABS_SIMILARITY` (`0.75`), `ELEVENLABS_MAX_CONCURRENT` (`4`) | Most natural voices |
| `sarvam` | `SARVAM_SPEAKER` (`priya`), `SARVAM_LANGUAGE` (`en-IN`) | `SARVAM_PACE` (`1.2`) | — | Best for Indian languages |

Each provider also needs its key: `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `ELEVENLABS_API_KEY` or `SARVAM_API_KEY`.

Useful Indian English voices for Edge: `en-IN-NeerjaNeural` (female), `en-IN-NeerjaExpressiveNeural` (animated female), `en-IN-PrabhatNeural` (male).

## Proctoring and interview timing

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PROCTORING_STRIKES` | `25` | Strikes before the interview is ended (enforced on the server) |
| `NEXT_PUBLIC_MAX_PROCTORING_STRIKES` | `25` | Fallback for the above |
| `SILENCE_DELAY_MS` | `3000` | Silence before the candidate's turn is considered finished |
| `HEARTBEAT_STALE_MS` | `180000` | How long without a heartbeat before a candidate counts as disconnected |

## Video recording

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEO_RECORDING` | `off` | `on` records the interview: the shared screen with the camera in a corner box, with the candidate's microphone and the AI interviewer's voice |

Recording uses WebM, so it works in Chrome, Edge and Firefox but not Safari. The video is 1280×720 at about 1.2 Mbps (roughly 550 MB per hour). On mobile, where there is no screen share, the camera fills the frame. If the browser cannot composite, it falls back to recording the camera and microphone only. Files are stored under `data/recordings/video/<interviewId>/`; give the container a persistent volume for `data/`. Recordings are not deleted automatically.

## AI assistant

The recruiter Hiring Assistant (Ask AI in the sidebar). See [AI assistant](ai-assistant.md) for what it can do. It needs `migrations/003_agent_chat.sql`.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_CHAT` | `off` | `on` shows the assistant on recruiter pages |
| `AGENT_FEATURES` | all | Comma-separated feature ids to enable: `interviews`, `question-banks`, `resume-screening`, `interview-creation` |
| `AGENT_AI_BASE_URL`, `AGENT_AI_API_KEY`, `AGENT_AI_MODEL` | `AI_*` values | Optional separate model for the assistant. It must support tool (function) calling well, e.g. `gpt-4o`. Same no-`/v1` rule as `AI_BASE_URL` |
| `AGENT_MAX_STEPS` | `12` | Model calls per reply (each tool round trip is one) |
| `AGENT_HISTORY_TOKEN_BUDGET` | `60000` | Approximate conversation history kept per reply; older turns are dropped |
| `AGENT_TOOL_TIMEOUT_MS` | `30000` | Time limit for one tool call |
| `AGENT_APP_BASE_URL` | `http://127.0.0.1:$PORT` | Where the assistant calls the app's own API. Change only if the app is not reachable on loopback |

Behind a reverse proxy, turn off response buffering for `/api/agent/chat` (nginx: `proxy_buffering off;`) so replies stream.

## Email

Optional. Without SMTP settings, emails are printed to the server log instead.

| Variable | Description |
|----------|-------------|
| `SMTP_HOST`, `SMTP_PORT` (`587`) | Mail server |
| `SMTP_USER`, `SMTP_PASS` | Credentials |
| `SMTP_FROM` | Sender, e.g. `Interviews <noreply@example.com>`. Defaults to `SMTP_USER` |

## Misc

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `3000` | Host port in `docker-compose.yml` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `1` | Keep `1` in production |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `postgres` / `postgres` / `ai_interview_platform` | Bundled Docker database only |
