# ClioForge 参伍

[![CI](https://github.com/YQ-Wang/ClioForge/actions/workflows/ci.yml/badge.svg)](https://github.com/YQ-Wang/ClioForge/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

**A self-hosted, open-source research IDE for humans and agents.**

Starting with history and humanities, ClioForge brings together original documents, reading notes, evidence and research tasks. Work through larger collections while keeping interpretations connected to the original material and subject to human review.

[Self-hosting guide](docs/self-hosting.md) · [中文说明](README.zh-CN.md) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

ClioForge is a personal open-source research experiment. There is no maintainer-operated hosted service. Run it on your own computer or deploy it to your own Cloudflare account. Each installation manages its own accounts, data, integrations and user-provided model keys; infrastructure and model providers may charge you for usage.

## What you can do

- Import PDFs, images and text, or select files from Google Drive. Keep originals private and preserve transcription versions.
- Read, highlight and annotate a page; turn passages into evidence with stable source, version and page references.
- Write with a rich editor, tables, drawings and LaTeX; compare versions and export writing with citations.
- Turn reviewed claims and evidence into a [bounded manuscript draft](docs/manuscript-workflow.md), with chapter progress, source references, coverage checks and a final human review.
- Organize research questions, competing interpretations and evidence. Build research plans with a draggable task board and reviewable assistant results.
- Run bounded extraction, comparison and research workflows using your own model API keys. Track execution, dependencies and estimated spending.
- Prepare a [background research dossier](docs/background-dossier.md): per-source reading, cross-critique and source-linked synthesis, ending at human review.
- Collaborate through project invitations, roles and task discussions. Export and restore project backups including originals.
- Work in English or Chinese, with light and dark themes.

## Status and limits

**Self-hosted alpha.** Automated tests and selected end-to-end research exercises cover important workflows; they do not establish reliability for every archive, model or institution. Back up important work and review model output before treating it as evidence.

Semantic search currently covers text, not image similarity. Zotero import is not continuous synchronization. Scheduled literature monitoring checks a bounded set of Crossref metadata, not the entire web. Spending controls use estimates and are not a provider billing cap. Local recovery drafts are browser-specific. Google integration, email and model calls require separate configuration; basic local development does not.

## Run on your own computer

Requires Git and Node.js 22.19 or newer. Local D1, R2 and Queues are emulated; no Cloudflare account is required.

```sh
git clone https://github.com/YQ-Wang/ClioForge.git clioforge
cd clioforge
npm ci
cp .env.example .dev.vars
```

Generate two independent secrets with the following command, running it once for each value. Set `BETTER_AUTH_SECRET` and `FOLIOTRACE_ENCRYPTION_KEY` in `.dev.vars`.

```sh
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
npm run db:migrate:local
npm run dev:cloudflare
```

Open **http://127.0.0.1:3000** and create an account in your own installation. Accounts from any other installation do not carry over. `AUTH_ALLOW_UNVERIFIED_LOCAL=1` only bypasses email verification on localhost or 127.0.0.1. Local development does not deliver real email by default. Keep the encryption key backed up: replacing it makes existing saved model credentials unreadable.

This is a loopback-only development runtime for personal use, not a hardened public server. Keep `.wrangler/state` and your encryption key backed up. For a persistent hosted installation under your control, follow the [self-hosting guide](docs/self-hosting.md). A generic Docker/VPS production backend is not currently provided.

## Development

```sh
npm run check
npm run format:check
npm test
npm run build:cloudflare
npm run check:jobs
```

See [development](docs/development.md), [Cloudflare deployment](docs/deployment.md) and [Google setup](docs/cloud-drive-setup.md). Public configuration files are local examples; deployment commands reject the placeholder database and origin. CI does not deploy any installation or call paid model APIs.

## Architecture

| Concern                                 | Implementation                                   |
| --------------------------------------- | ------------------------------------------------ |
| UI and HTTP API                         | React, Vinext, Cloudflare Workers                |
| Authentication                          | Better Auth, with records in D1                  |
| Projects, versions, references and jobs | D1 / SQLite, Drizzle migrations                  |
| Original files                          | Private R2, served through authenticated APIs    |
| Background research and monitoring      | Queues, a separate Worker and Cron Triggers      |
| Transactional email                     | Cloudflare Email Sending                         |
| Model access                            | User-provided API credentials, encrypted at rest |

The model proposes interpretations; application code records provenance, enforces access, tracks versions and separates pending results from accepted research. These controls make work inspectable, not automatically historically correct.

Some internal `foliotrace` identifiers remain for compatibility with stored data. ClioForge is an independent project and does not include or depend on Prove2Me code.

## License and community

Original application code is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md) for the separately licensed libraries, fonts, citation style and sample inscriptions. The ClioForge name and logo identify this project; forks should identify their own operator and avoid implying affiliation.

Report reproducible bugs or propose a concrete research workflow through [GitHub issues](https://github.com/YQ-Wang/ClioForge/issues). For vulnerabilities, follow [SECURITY.md](SECURITY.md). Please follow the [code of conduct](CODE_OF_CONDUCT.md).
