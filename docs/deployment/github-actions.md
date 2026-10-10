# Deploy with GitHub Actions

Two workflows build and deploy the app to a Linux server running Docker:

- `.github/workflows/docker-deploy.yml` (**Docker CI Build**): on every push to `main`, builds the image and pushes it to GHCR
- `.github/workflows/docker-cd-deploy.yml` (**Docker CD Deploy**): runs automatically after a successful CI build on `main` (or manually), and deploys over SSH

## What the workflow does

1. CI workflow builds the app image from `Dockerfile`
2. CI workflow pushes the image to `ghcr.io/<owner>/<repo>` (for this repo: `ghcr.io/agents-adityaupadhyay/ai-interview-portal`)
3. CD workflow creates a runtime `.env.production` file from GitHub Secrets and Variables
4. CD workflow uploads `docker-compose.yml` and `.env.production` to the target server
5. CD workflow runs `docker compose pull` and `docker compose up -d`

## Server prerequisites

Prepare the target Linux server before enabling the workflow:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker <deploy-user>
mkdir -p /opt/ai-interview-platform
```

Log out and back in after changing the Docker group so the deploy user can run Docker without `sudo`.

## GitHub repository variables

The deploy job runs in the GitHub **environment** named by the repository variable `DEPLOY_ENVIRONMENT` (default `PROD`). Create that environment under `Settings -> Environments`; variables and secrets can live on the environment or the repository.

Add these under `Settings -> Secrets and variables -> Actions -> Variables`:

| Variable | Example | Notes |
|----------|---------|-------|
| `DEPLOY_ENVIRONMENT` | `PROD` | GitHub environment for the deploy job |
| `DEPLOY_HOST` | `203.0.113.10` | Server IP or DNS name |
| `DEPLOY_PORT` | `22` | SSH port |
| `DEPLOY_USER` | `deploy` | User with Docker access |
| `DEPLOY_PATH` | `/opt/ai-interview-platform` | Remote folder for compose files |
| `APP_PORT` | `3000` | Public host port |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` | Production PostgreSQL connection string |
| `NEXTAUTH_URL` | `https://interview.example.com` | Public base URL |
| `NEXT_PUBLIC_APP_URL` | `https://interview.example.com` | Usually same as `NEXTAUTH_URL` |
| `AI_BASE_URL` | `https://api.openai.com` | OpenAI-compatible API base |
| `AI_MODEL` | `gpt-4o` | Runtime model |
| `TTS_PROVIDER` | `deepgram` | Or `edge` |
| `EDGE_TTS_VOICE` | `en-IN-NeerjaNeural` | Only used for `edge` |
| `EDGE_TTS_RATE` | `+10%` | Only used for `edge` |
| `STT_PROVIDER` | `deepgram` | Current STT backend |
| `STT_LANGUAGE` | `en-IN` | Speech locale |
| `MAX_PROCTORING_STRIKES` | `20` | Server-side max strikes |
| `NEXT_PUBLIC_MAX_PROCTORING_STRIKES` | `20` | Client-visible max strikes |
| `HEARTBEAT_STALE_MS` | `180000` | Candidate disconnect threshold |
| `SILENCE_DELAY_MS` | `3000` | Silence detection delay |
| `SMTP_HOST` | `smtp.gmail.com` | Optional |
| `SMTP_PORT` | `587` | Optional |
| `SMTP_USER` | `notifications@example.com` | Optional |
| `SMTP_FROM` | `Interviews <notifications@example.com>` | Optional |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `1` | Keep `1` unless you intentionally allow insecure TLS |

## GitHub repository secrets

Add these under `Settings -> Secrets and variables -> Actions -> Secrets`:

| Secret | Notes |
|--------|-------|
| `DEPLOY_SSH_KEY` | Private key for the deploy user |
| `GHCR_USERNAME` | GitHub username for package pull auth |
| `GHCR_TOKEN` | Personal access token with `read:packages` |
| `NEXTAUTH_SECRET` | Strong random secret |
| `AI_API_KEY` | AI provider API key |
| `DEEPGRAM_API_KEY` | Deepgram key |
| `SMTP_PASS` | Optional SMTP password or app password |

If you enable other providers such as Sarvam, Cartesia, or ElevenLabs, or turn on `VIDEO_RECORDING`, add matching variables/secrets and extend the workflow-generated `.env.production` block. See [Configuration](../configuration.md) for the full list.

## SSH key setup

Generate a dedicated deploy key locally:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ai_interview_platform_deploy
```

Install the public key on the server:

```bash
ssh-copy-id -i ~/.ssh/ai_interview_platform_deploy.pub <deploy-user>@<deploy-host>
```

Then copy the private key contents into the `DEPLOY_SSH_KEY` GitHub secret.

## GHCR token setup

Create a GitHub personal access token for the deploy server account with:

| Permission | Required |
|------------|----------|
| `read:packages` | Yes |
| `repo` | No, unless the account needs repo access for other reasons |

Store that token as `GHCR_TOKEN`, and store the matching username as `GHCR_USERNAME`.

## First deployment

After adding the variables and secrets:

1. Push to `main`. `Docker CI Build` builds and pushes the image, then `Docker CD Deploy` starts automatically.
2. To redeploy or roll back, run `Docker CD Deploy` manually from Actions and set `image_tag` to a commit SHA (default `latest`).
3. SSH to the server and verify the container state.

Useful verification commands on the server:

```bash
cd /opt/ai-interview-platform
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100
curl -f http://localhost:3000/api/health
```

## Helper script

This repository includes [scripts/set-github-actions-config.ps1](../../scripts/set-github-actions-config.ps1) to push the required GitHub Actions secrets and variables from your local `.env.local` into the repository settings.

Example:

```powershell
./scripts/set-github-actions-config.ps1 \
	-Repo "agents-adityaupadhyay/ai-interview-portal" \
	-EnvFile ".env.local" \
	-DeployHost "your-server-host" \
	-DeployUser "deploy" \
	-DeployPath "/opt/ai-interview-platform" \
	-DeployPort "22" \
	-AppPort "3000"
```

Requirements for the script:

1. GitHub CLI installed
2. `gh auth login` completed for the target account
3. A local private SSH key file for `DEPLOY_SSH_KEY`
4. A GHCR token with `read:packages` scope

Use `-DryRun` first if you want to preview which names will be created.

## Troubleshooting

| Problem | Check |
|---------|-------|
| SSH step fails | `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, and `DEPLOY_SSH_KEY` |
| GHCR login fails on server | `GHCR_USERNAME`, `GHCR_TOKEN`, and package visibility |
| Container restarts immediately | `docker compose logs` and required env values |
| App healthcheck fails | Database reachability, `NEXTAUTH_URL`, and API keys |
| TLS/database handshake issues | Keep `NODE_TLS_REJECT_UNAUTHORIZED=1` unless you knowingly need to relax it |

## Security note

Do not commit `.env.local` or production secrets. Rotate any credentials that were previously pasted into local files or shared publicly.
