# Getting started

## Requirements

- Node.js 20+
- PostgreSQL 14+ (or Docker, which can run one for you)
- An API key for an OpenAI-compatible model
- A Deepgram API key for speech (or another provider, see [Configuration](configuration.md#speech))
- Python `edge-tts` only if you use the free Edge voice (`pip install edge-tts`); the Docker image already has it

## Option A: Docker (recommended)

```bash
cp .env.example .env.local
# edit .env.local: set NEXTAUTH_SECRET, AI_API_KEY, DEEPGRAM_API_KEY
docker compose --env-file .env.local up -d --build
```

This starts two containers:

- `db`: Postgres 16. Files in `migrations/` are applied automatically, but **only the first time** the volume is created.
- `app`: the platform on http://localhost:3000 (change with `APP_PORT`).

Compose does not read `.env.local` by itself, so always pass `--env-file`. Every variable the app reads must also be listed under `app.environment` in `docker-compose.yml`, or it never reaches the container.

### Using an external database instead

Set `DATABASE_URL` in `.env.local` to your database (for example a managed Postgres such as Aiven), apply the migrations yourself, and start only the app:

```bash
psql "$DATABASE_URL" -f migrations/001_schema.sql
psql "$DATABASE_URL" -f migrations/002_ai_settings.sql
docker compose --env-file .env.local up -d --build --no-deps app
```

SSL is enabled automatically when the URL contains `sslmode=require` or points at `aivencloud`.

Stop everything with `docker compose --env-file .env.local down`.

## Option B: Run with Node

```bash
npm install
createdb ai_interview_platform
psql -d ai_interview_platform -f migrations/001_schema.sql
psql -d ai_interview_platform -f migrations/002_ai_settings.sql
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

`npm run dev` runs plain `next dev`, which **does not include the live speech WebSocket proxy** (`/api/stt-ws`). To test a full voice interview locally, build and run the production server:

```bash
npm run build
node server-custom.js
```

There is no automated test suite. Before committing, run:

```bash
npx tsc --noEmit
npm run lint
```

## Create the first admin

The schema creates one organization, **Default Organization**. Accounts registered at `/register` join an organization as **inactive members**, so the very first account has to be promoted by hand:

1. Open http://localhost:3000/register and create your account in *Default Organization*.
2. Promote it:

   ```sql
   UPDATE users SET role = 'admin', is_active = true WHERE email = 'you@example.com';
   ```

3. Sign in at `/login`. From now on you can activate other users from the **Team** page.

To rename the organization:

```sql
UPDATE organizations SET name = 'Your Company', slug = 'your-company'
WHERE id = '00000000-0000-0000-0000-000000000001';
```

## Run your first interview

1. Go to **New interview**, fill in the candidate, role, level and duration, and attach a resume (PDF or DOCX).
2. Copy the candidate link and open it in Chrome or Edge (camera, microphone and screen share are required).
3. When the interview ends, the scorecard appears on the dashboard within a minute or two.

Next: tune voices, models and proctoring in [Configuration](configuration.md).
