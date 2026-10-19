# Changelog

All notable changes to this project are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Recruiter AI assistant (`AGENT_CHAT=on`, needs `migrations/003_agent_chat.sql`): the Hiring Assistant, opened from Ask AI in the sidebar (Ctrl/⌘ J) as a full-screen agent mode or a side panel, that searches interviews and scorecards, manages question banks, screens attached resumes and creates interviews. It acts through the app's own API with the recruiter's permissions, and deletes and invite emails need approval in the chat. Features can be switched on one by one with `AGENT_FEATURES`. See `docs/ai-assistant.md`.
- `npm run test:agent`: flow tests for the assistant with a scripted model.

### Changed
- Video recording now captures the whole interview: the shared screen with the candidate's camera in a corner box, with both the candidate's and the AI interviewer's voice. Previously it recorded only the camera and microphone.
- Upgraded the unused `ai` SDK dependency from v4 to v7 (now used by the assistant only).
- Resume text extraction moved to `src/lib/resume-text.ts` and is shared by `/api/create-interview` and the assistant.

## [1.0.0] - 2026-10-10

First release under new maintainership by Aditya Upadhyay. This is the base for all future versions.

### Added
- Optional camera and microphone video recording (`VIDEO_RECORDING=on`), with resumable chunk uploads and in-dashboard playback.
- Bundled Postgres in `docker-compose.yml`, with migrations applied on first start.
- All speech provider settings (Sarvam, Cartesia, ElevenLabs, Soniox, summary model) passed through Docker Compose.
- GitHub Actions CI/CD to GHCR and an SSH-deployed Docker host, plus an OpenShift template.

### Changed
- Documentation reorganized under `docs/` (getting started, configuration, architecture, API, deployment).
- Seeded organization renamed to "Default Organization".
- The live speech proxy now uses SSL for managed Postgres, matching the app.

### Removed
- Unused legacy AI call alias.

[1.0.0]: https://github.com/agents-adityaupadhyay/ai-interview-portal/releases/tag/v1.0.0
