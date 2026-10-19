# Pages and API reference

**Auth column:** *Session* = signed-in recruiter, *Admin* = signed-in admin, *Token* = candidate's interview token, *Public* = no auth.

## Pages

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Recruiter | Dashboard: interviews, filters, scoring status |
| `/new` | Recruiter | Create an interview |
| `/dashboard/[id]` | Recruiter | Transcript, scores, proctoring, photos, video |
| `/review/[id]` | Recruiter | Scorecard |
| `/compare` | Recruiter | Side-by-side candidate comparison |
| `/questions` | Recruiter | Question banks |
| `/templates` | Recruiter | Email templates |
| `/team` | Admin | Activate users and change roles |
| `/settings/ai` | Admin | Interviewer persona, scoring thresholds, guidelines |
| `/login`, `/register` | Public | Sign in, create an account |
| `/interview/[id]` | Candidate | Live interview room |
| `/completed/[id]` | Candidate | Thank-you page |

## Interviews

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/api/create-interview` | Session | Create an interview (multipart form with resume) |
| `GET` | `/api/interviews` | Session | List the organization's interviews |
| `GET` | `/api/interview/[id]` | Session / Token | Interview details |
| `DELETE` | `/api/interview/[id]` | Session | Delete |
| `POST` | `/api/interview/[id]/start` | Session / Token | Mark as started |
| `POST` | `/api/interview/[id]/end` | Session / Token | End and start scoring |
| `GET` | `/api/interview/[id]/violations` | Session / Token | Current strike count |

## AI and speech

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/api/ai-response` | Token | Next interviewer reply (text) |
| `POST` | `/api/ai-speak` | Token | Reply plus audio |
| `POST` | `/api/ai-speak-stream` | Token | Reply plus audio, streamed sentence by sentence |
| `POST` | `/api/tts` | Token | Text to speech |
| `GET` | `/api/stt-proxy` | Token | Which STT provider is active |
| `WS` | `/api/stt-ws` | Token | Live audio → transcript (production server only) |
| `GET` | `/api/config` | Public | Client settings (strike limit, STT providers, video recording and assistant on/off) |

## AI assistant

All return `404` when `AGENT_CHAT` is off. See [AI assistant](ai-assistant.md).

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/api/agent/chat` | Session | Send a message (or approval/answer) and stream the reply (AI SDK UI message stream). Body: `{ threadId, trigger, message, pageContext }` |
| `GET` | `/api/agent/threads` | Session | The user's 50 most recent conversations |
| `GET` | `/api/agent/threads/[threadId]/messages` | Session | Messages of one of the user's conversations |
| `DELETE` | `/api/agent/threads/[threadId]` | Session | Delete one of the user's conversations |

## Scoring, proctoring and recordings

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/api/scorecard` | Admin or interview creator | Generate or regenerate a scorecard |
| `GET` | `/api/scoring-status/[id]` | Public | Scoring progress (status only) |
| `POST` | `/api/proctor-event` | Token | Log an event, optionally with a photo |
| `POST` | `/api/proctor-heartbeat` | Token | Candidate still present |
| `POST` | `/api/video-chunk` | Token | Append a video chunk at an `offset` |
| `GET` | `/api/recording/[id]` | Session | Audio recording |
| `GET` | `/api/recording/[id]/video` | Session (same org) | List recording parts, or stream one with `?part=` (supports Range requests) |

## Organization and content

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` / `POST` | `/api/questions` | Session | Question banks |
| `GET` / `PUT` / `DELETE` | `/api/questions/[id]` | Session | One question bank |
| `GET` | `/api/email-templates` | Session | Email templates |
| `POST` / `PUT` / `DELETE` | `/api/email-templates` | Admin | Manage email templates |
| `GET` / `PUT` | `/api/settings/ai` | Admin | Organization AI settings |
| `GET` | `/api/users` | Admin | Team members |
| `PATCH` / `DELETE` | `/api/users/[id]` | Admin | Activate, change role, remove |
| `GET` | `/api/organizations` | Public | Organizations to pick when registering |
| `POST` | `/api/auth/register` | Public | Create an (inactive) account |
| `GET` | `/api/health` | Public | Health check |
| `POST` | `/api/client-log` | Public | Browser error logging |
