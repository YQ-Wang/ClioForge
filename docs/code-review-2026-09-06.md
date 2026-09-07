# Reliability review — 2026-09-06

This review starts from `92a27e060c05babb7c45f0b62f092823d6879c23` and covers authentication and project roles, original-file handling, versioned writing and evidence, background execution and budgets, model and archive connectors, backup recovery, and the dependency graph. It is a focused code review with regression tests, not an independent penetration test or a certification of every integration or workload.

## Findings addressed

| Priority          | Observed defect                                                                                                                                      | Change and evidence                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1                | A mission could pause, cancel or fail after creating its underlying model job; the durable job could still be executed or redelivered independently. | Persist the parent task and attempt in the job snapshot. At the paid-call checkpoint, require that the same task attempt is running, its lease is live and its mission remains active. Recheck project write permission after preparation. Tests reproduce pause, cancel, replacement, lease expiry and event-write failure and assert zero provider calls and released reservations. |
| P1                | Recovery could select an old job and then reset or settle a newer attempt that another worker had just claimed.                                      | Recheck the fetched job's status and start time; fence the preparing-to-queued update by attempt and cutoff. Tests inject both a fresh fetched snapshot and a stale snapshot followed by a competing claim.                                                                                                                                                                           |
| P2                | Chinese indexing rebuilt a code-point array for every character, causing quadratic work on valid long pages.                                         | Build each array once. Tests retain supplementary Han characters, normalized punctuation and all search terms for a 100,000-character page. A generous CPU budget guards against quadratic regression.                                                                                                                                                                                |
| P2                | Crossref monitoring read the entire response before checking its size.                                                                               | Enforce a two-million-byte streaming limit and cancel oversized responses before JSON parsing. An oversized stream failed the regression before the fix and is cancelled after it.                                                                                                                                                                                                    |
| Moderate advisory | The schema-tooling chain included vulnerable esbuild 0.18.20, also in the production npm graph through Better Auth's optional peer.                  | Override only that transitive esbuild to 0.25.12. Verify CommonJS and ESM transformation, actual Drizzle schema generation, both Worker builds, and full and production dependency audits. See SECURITY.md.                                                                                                                                                                           |

The three fault-injection regressions failed against the original implementation before the fixes. A same-machine, single-run indexing comparison on 20,000 Han characters measured approximately 1,646 ms before and 1.8 ms after, with the same output length. This is an isolated function measurement, not a claim about end-to-end research throughput.

## Validation

- 187 tests passed, zero failed or skipped, including the existing private archive restoration fixture. That fixture is not distributed with the repository; CI normally skips its optional test.
- TypeScript, lint, English-comment checks and formatting passed.
- Application and research Worker builds passed without deployment.
- A clean `npm ci` installed the patched lockfile; only the targeted esbuild and its platform packages changed versions.
- Full and production npm audits returned zero advisories at review time. This does not prove the absence of vulnerabilities.
- A temporary Drizzle output directory was used for schema-generation verification; existing migrations and production data were not changed.
- Provider responses in the fault-injection tests are simulated. No paid model requests or real emails were required.

## Rollout behavior

Deploy the research Worker before the application. New jobs carry execution contract version 1. Previously queued jobs without that contract are retained as failed requests, release their unspent reservation and require an explicit new retry. This deliberately avoids assuming that an old job's parent is still authorized. Running calls that have already crossed the paid-call checkpoint cannot reliably be recalled; uncertain provider charges retain their reservation.

No schema migration is required. Existing source versions, citations, completed jobs and backups remain readable.

## Follow-up hardening

The follow-up passes 198 tests with no failures or skips, plus type/lint/comment checks and both Worker builds. It adds bounded, permission-checked collection pages, a shared insertion checkpoint, a lightweight project overview, cancellation of superseded refreshes, linear note-state resolution and atomic per-account API limits shared with project agents. The browser no longer requests the original unbounded workspace/workbench responses. See [Project loading and API limits](project-loading.md) for the updated API contract and its limits.

## Remaining concerns

- Detailed research sections still assemble all their records in browser memory after pagination. Very large archives need finer-grained reader/history loading, and server-side writing export still uses full-project assembly.
- Uniform authenticated request limits now exist. Long-term quotas for growing text and version histories, realistic production load tests and operational alerting still need separate validation before an unrestricted large rollout.
- Live Google Drive consent/Picker, email deliverability, provider billing reconciliation, multi-user browser races and long-running Cloudflare load were not independently retested in this review. After the Mac was unlocked, Google sign-in, existing online notes and citation navigation were verified in Chrome. Local workspace, writing and responsive navigation checks are recorded in [Browser regression](browser-regression-2026-09-06.md).

The code is materially more robust after these fixes. The remaining items mean this review should not be described as a blanket production-readiness or unlimited-scale guarantee.
