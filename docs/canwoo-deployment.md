# Canwoo deployment checkpoint

Deployed on 2026-09-04 (America/Los_Angeles); final browser verification completed on 2026-09-05. Website: https://canwoo.com.

## Live resources

- Cloudflare account: `bf045b2b8a84caff86b86f4952486119`; Workers Paid and R2 activated by the owner.
- Active domain: `canwoo.com`, zone `81294fdfc4620ff18592678085b2fa03`.
- Main Worker: `canwoo`, version `0c24366b-af3e-499d-bc50-c5b5811d94c0`; custom domain `canwoo.com`, HTTPS checked with certificate verification enabled. Cloudflare reported 21 ms startup time for this release.
- Background Worker: `canwoo-research`, version `aca0e5f5-697c-4f18-9ceb-a1745a0d0e46`; no public HTTP route, Cron `*/15 * * * *`.
- D1 database: `canwoo`, ID `689a6ad8-2a97-4640-a780-b2378ff9d394`, WNAM; migrations 0000–0007 applied remotely.
- Queue: `canwoo-research`, ID `ebd48f61e19c49cabddd4d0f42983e45`; both Workers are producers, research Worker is the sole consumer, concurrency and batch size are 1.
- R2 bucket: `canwoo-originals`, WNAM, Standard storage; r2.dev disabled, no custom bucket domains. Files are accessed through authenticated application routes.
- Email Sending: `canwoo.com` enabled, DNS status `ready`; SPF, DKIM, DMARC and bounce MX records configured. Main Worker uses native `EMAIL` binding restricted to sender `noreply@canwoo.com`.
- Email body preview disabled. Both Workers remove query strings from request logs and traces, including email verification tokens in URLs.
- Production secrets uploaded as `secret_text`: main Worker has `BETTER_AUTH_SECRET`, `FOLIOTRACE_ENCRYPTION_KEY`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` and `GOOGLE_CLOUD_PROJECT_NUMBER`; background Worker has the same encryption key. Picker key setup remains pending.
- Wrangler OAuth credentials encrypted with the key stored in macOS Keychain.
- Git origin: `https://github.com/YQ-Wang/canwoo.git`; no commit or push yet. Deployment was performed from the local checkout, not GitHub CI.

## 2026-09-05 research tools menu update

Replaced the operating-system select popup for “More tools” with the existing accessible dropdown component, matching the workspace typography, icons, rounded surfaces and selected-state colors. Local browser checks passed in Chinese and English, including arrow-key navigation, Enter selection, Escape dismissal and focus return. Typecheck, lint and the production build passed. The deployed menu was visually checked in an authenticated Chrome project. This check does not complete the broader collaboration or Google Picker acceptance work below. Build and deployment logs are in ignored `work/menu-build.log` and `work/menu-deploy.log`.

## Earlier 2026-09-05 collaboration update

Project membership now has email-bound invitations and explicit acceptance, owner-controlled roles and removal, and preserved contributions. Project overview includes direct source-text search. All 40 tests pass; three local accounts completed the actual HTTP invitation/edit/downgrade/removal flow. Typecheck, lint, formatting and production build pass. Production anonymous checks at 11:07Z confirm homepage/privacy 200 and team/invitation APIs 401. See `docs/collaboration.md` and `docs/researcher-focus.md`. The Mac remains locked, so final browser layout acceptance and prior Picker setup remain pending. No real invitation emails or model requests were sent.

See `docs/saas-quality.md` for the preceding 36-test release and its explicit remaining browser/Google acceptance work. Live Google authorization initiation, private API isolation, the new brand asset and `/privacy` passed HTTP checks. Actual Google account login and Drive file import remain unverified; the browser host was locked. No extra paid service or model request was introduced in this product pass.

## Earlier 2026-09-05 interface update

- Public branding is Canwoo / 参伍. Existing storage keys and export identifiers are retained for compatibility.
- The public account page is separate from the authenticated workspace; pending sessions and signed-out users do not render its navigation. Signing out unmounts the workspace immediately.
- Chinese and English are supported across the research interface, accessible controls, dates and authentication emails. A same-site language cookie persists the choice and takes precedence over browser language during server rendering.
- Source text, project titles and local drafts are not translated. A local browser test retained a Chinese project title matching a UI translation key and an unsaved Chinese note across language changes.
- 25 tests pass, including locale precedence, interpolation safety and English verification email delivery through a mocked binding. Typecheck, lint and production build pass. Desktop and 390 px mobile layouts were inspected; the mobile account page and model settings had no horizontal overflow.
- Production HTTP checks confirm both language cookies select the correct HTML language/title, no FolioTrace branding or private sidebar is rendered to guests, and unauthenticated workspace access returns 401. No additional paid services or real model calls were introduced.

## Verification

- 25 tests, typecheck, lint, both Worker dry runs, and production build passed. Tests cover native email binding integration and verification/login with a mocked mail transport, account isolation, storage quotas, immutable citations, budgets and queue recovery.
- HTTPS homepage returned 200. Authentication health returned 200, unauthenticated session returned null, and workspace/file/job routes rejected unauthenticated requests. Cross-origin writes returned 403. All nine CSS, JavaScript and font resources referenced by the initial HTML returned 200. See ignored `work/production-smoke.json`.
- Production D1 answered a read query. A single queue message referencing a nonexistent job was consumed with `outcome=ok`; no model invocation or application data was created. The first scheduled invocation also completed with `outcome=ok`.
- Exactly one owner-authorized test email was sent through Cloudflare Email Sending, and the owner confirmed receipt. This test does not replace a real user signup, verification and login on the production website.
- Live binding settings and private R2 access configuration were checked. No real paid model/OCR calls or real Zotero calls were made. Authenticated production upload/download has not been exercised; those flows have local integration coverage.
- DNS propagated and the Codex in-app browser opened `https://canwoo.com/` normally. Login and registration screens rendered correctly; switching between them was verified, and the registration page was left open for the owner. The initial DNS issue was a cached empty answer from before the domain binding.

## Operating the deployment

Preserve the existing production keys in ignored `work/production-secrets/` (directory 0700, JSON files 0600), and keep a separate secure backup. Do not print or commit them. Replacing the encryption key without migrating stored values makes existing BYOK credentials unreadable.

The initial deployment used `wrangler deploy --secrets-file` to upload code and secrets together. Routine deployments preserve existing secrets:

```sh
npm run build:cloudflare
npm run deploy:jobs
npm run deploy:cloudflare
```

For future schema changes, review and apply migrations with `npm run db:migrate:remote` before deploying code that depends on them. Do not recreate existing resources. Production disables workers.dev and preview URLs. The website uses only the apex domain; `www.canwoo.com` is not configured.

## Initial cost controls

LLM/OCR use user-provided keys. Original uploads are capped at 20 MiB each, 500 MiB per user and 5,000,000,000 bytes across the application. D1 reserves bytes atomically before R2 writes; failed or uncertain uploads keep reservations until reconciled. Older local receipts are conservatively counted at 20 MiB each. This does not cap D1 text/version data, unrelated account resources, or every metered Cloudflare operation.

Cron checks every 15 minutes and only queries due research watches. Queue concurrency is 1. No containers, vector database, paid search provider, or shared platform LLM key is provisioned. Normal small-scale usage should target roughly the $5/month base fee, plus tax, domain registration and any overage; this is not a billing hard cap.
