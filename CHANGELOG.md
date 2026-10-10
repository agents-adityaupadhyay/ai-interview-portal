# Changelog

All notable changes to this project are listed here. Versions follow [Semantic Versioning](https://semver.org/).

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
