# Canwoo research platform implementation

Requested scope: implement all three stages, with a live workflow / agent status view and validation on licensed historical data. Keep the existing Cloudflare deployment economical. Existing private source data and versions must survive migrations.

## Delivery ledger

- [ ] Shared project roles enforced at every read/write boundary; comments and review history.
- [ ] Missions, immutable run inputs, dependency graphs, assignments, leases, review gates and durable status events.
- [ ] Interactive workflow graph, agent lanes, task details, artifacts, logs, pause/cancel/retry and accessibility; Chinese / English.
- [ ] Page-level full-text index, variants / aliases, filters, incremental indexing and source navigation.
- [ ] Batch OCR with page checkpoints, quality review and unified budget accounting.
- [ ] Google Drive OAuth + Picker (per-file scope), selected-file import, deduplication and resumable sync; IIIF / TEI ingestion.
- [ ] Complete original-inclusive export, checksums and verified restore.
- [ ] Versioned project snapshots, branches, reviewable merges and conflict detection.
- [ ] Reusable, attributed artifacts; project-scoped reuse permissions and source-change impact propagation.
- [ ] External agent API / SDK / MCP, scoped revocable credentials and fenced task submissions.
- [ ] Multi-step research execution: search, extract, compare, counter-evidence, verify, review and publish; bounded budget and explicit model routing.
- [ ] Entity candidates / aliases, uncertain dates and locations, timeline / relationship views.
- [ ] Reproducible analysis recipes, preserved parameters, versioned inputs and sensitivity comparisons.
- [ ] Source update monitoring, incremental reruns, review inbox and opt-in notifications.
- [ ] Writing with evidence links, citation audit, Markdown / Word-compatible output.
- [ ] Model connectivity / capabilities / evaluation history and cost controls covering all invocation paths.
- [ ] Historical dataset import manifest, repeatable benchmark, quality metrics and actual validation report.
- [ ] CI, migration/build checks, deployment verification and operational documentation.

## Acceptance principles

Graph states are persisted execution states, never simulated progress. A model output is a candidate until reviewed. Original sources and accepted artifact versions remain immutable. Late or duplicate execution results cannot overwrite a new attempt. Tenant and role checks apply to every artifact, file and API operation. Unknown provider outcomes retain cost reservations and require an explicit new attempt. Dataset tests distinguish software correctness from historical interpretation quality. OAuth credentials and user BYOK are deployment prerequisites, never fabricated.

## Working sequence

Latest user direction (2026-09-05): prioritize real researcher tasks and avoid over-engineering. The immediate delivery is invitations, owner-managed membership, source discovery and collaborative review. Broader features below are candidate work, prioritized only against observed research bottlenecks; see `docs/researcher-focus.md` for evidence and pilot criteria.

Build the shared data / authorization and task foundation first; wire the graph and an actual zero-model-cost historical-data workflow; add ingestion, OCR, portable artifacts and analysis; finish external agents, collaboration / branches, automation, model controls and evaluation. Record implementation and validation evidence below as work proceeds.

## Evidence

2026-09-05 navigation/account release: replaced overlapping menus with contextual left navigation and URL-backed project/account settings. Added safe session management, profile/language preferences, password changes, usage summaries and owner-only project editing with conflict checks. Original-inclusive ZIP export now preserves research records and verifies originals with SHA-256; automatic restore remains pending. 51 tests pass; local HTTP/browser verification covers persisted settings and revoked-session denial. The production LOC package contains four PDFs, three note versions and four task records, with all checksums verified. See `docs/saas-quality.md` for the acceptance boundary.

2026-09-05 real-account pilot: the note library and independent draft/save lifecycle are complete; a public LOC comparison now runs with GLM 5.3 Flash high effort through five exact quotations, review, final publication and saved notes. Google Picker and selected-PDF import passed with real accounts; OAuth public release awaits approval. One low-effort OCR candidate and local two-file batch import were checked. All 47 tests passed, including native Worker Fetch, PDF quotation alignment and edited-review publication. See `docs/research-pilot.md` for usage and historical limits. The broad unchecked ledger above includes compound capabilities and remains deliberately unclaimed; the pilot does not complete batch OCR, full backups or scholarly evaluation.

2026-09-05 collaboration release: email-bound invitations now support users who have not registered, explicit acceptance, owner-managed roles, revocation and removal. Direct project-overview text search avoids creating a plan for a simple lookup. 40 tests and three-account local HTTP checks pass. The official 40-record LED test now uses distinct owner/contributor/reviewer accounts; it validates software behavior only. Migration 0007 is live; main Worker 6004ac26-1b84-433d-adea-5e138f1e1f74 and jobs aca0e5f5-697c-4f18-9ceb-a1745a0d0e46 deployed. Prior Google Picker/browser acceptance still requires an unlocked Mac.

2026-09-05: audited existing app, migrations, job executor and ownership checks. Current application uses private per-owner projects, single model jobs and Crossref watches. No existing migrations will be rewritten.

2026-09-05 update: user narrowed cloud drives to Google Drive only. OneDrive was removed from UI, callback validation, APIs and setup documentation. Google uses Picker + drive.file; production OAuth/Picker application credentials remain an external prerequisite. Local bilingual UI checked.

2026-09-05 validation: 33 automated checks passed, including the 40-record official LED workflow, shared roles, lease/review concurrency, Google account-bound PKCE, duplicate imports, chunked size limits, source-change fences, and GLM effort/price routing. GLM 5.3 Flash received 19 live public-data test requests ($0.001968615 provider-reported total); see docs/evaluations/glm-5.3-flash-2026-09-05.md. This does not complete the remaining delivery items above.

2026-09-05 release: migrations 0004 and 0005 applied locally and remotely. Pre-migration D1 Time Travel bookmark saved under ignored work/. Platform, Google-only UI, submit-button fixes and GLM effort/price routing deployed: main Worker e7419bfd-42b5-4c8e-a4a9-759da625c55e; research Worker 75210a17-6b7d-47cc-bf4d-725fc57c9b40. Type checking, lint and production build passed before deployment.

2026-09-05 browser validation: the local 40-source LED project completed all six workflow tasks through the actual queue and both human review gates. The mission reached completed and its final artifact reached accepted. Reviews explicitly identify this as software acceptance testing, not validation of a historical conclusion. Production anonymous access continues to show the login page without the workspace.
