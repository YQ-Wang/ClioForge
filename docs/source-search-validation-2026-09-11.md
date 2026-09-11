# Source-search validation — September 11, 2026

This report covers the local implementation on the feature branch. Tests used synthetic model credentials, catalog responses, files and authenticated browser responses. No paid model call, production account, production project or private credential was used.

## Functional coverage

- A strict Fireworks Kimi K3 request carries `reasoning_effort: max` and the strict source-search JSON schema without exposing the synthetic credential.
- Mission integration persists a four-round search → inspect → resolve → attempted import flow. The unresolved import becomes a persistent source lead instead of failing the mission.
- A safe public text download is stored in private R2 with a source version, origin metadata and SHA-256 provenance.
- Connector normalization, unavailable connector reporting, candidate-ID validation, operation ordering, duplicate-operation rejection and bounded agent context have deterministic tests.
- HTTPS, credential, private/local network, nonstandard port, redirect, type, size and PDF-signature checks cover the automatic-download boundary.
- Project source management displays leads and permits authorized dismissal. Project purge, account deletion and project package export/restore include the new state. Restore reuses an existing global catalog record by `(provider, external_id)` and remaps project references.
- A production browser build opens AI search from a non-empty project's Source management screen, submits the default editable source-selection criteria with Max reasoning, polls persisted progress and renders the resulting candidate and source lead without browser console errors.

## Research-quality matrix

The read-only live evaluation script includes six intentionally different cases:

1. Ming succession controversy, the 1593 metropolitan evaluation and Donglin formation, with Roman inscription and modern Chinese-party noise traps
2. Western Han Hexi administration, tuntian, excavated documents and frontier transport
3. Qing granaries, local officials and eighteenth-century famine relief, excluding PRC food-policy material
4. The medieval Investiture Contest, Gregory VII, Henry IV and Canossa, excluding corporate ceremony uses
5. The Catholic League and politiques in the French Wars of Religion, 1576–1598
6. Old age, household structure and poor relief in industrializing Britain and France, 1750–1914, excluding commercial anti-aging material

Metrics report candidate count, anchor coverage, explicit exclusion hits and a simple clean-precision proxy. These are retrieval diagnostics, not a claim that a model has validated historical truth or that the six cases represent all languages, periods and institutions.

## Local results

| Check                                                          | Result                                        |                                                                    Observed local time |
| -------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------: |
| TypeScript, lint and comment policy                            | Passed                                        |                                                               about 4 seconds together |
| Migration append-only check and format check                   | Passed                                        |                                                                under 1 second together |
| Persisted agent loop integration                               | Passed                                        |                                                                        about 4 seconds |
| Safe public-original import integration                        | Passed                                        |                                                                         under 1 second |
| Project package round trip with search run, candidate and lead | Passed                                        |                                                                            3.4 seconds |
| Production build plus Chrome E2E                               | Passed, 1/1                                   | build about 11 seconds; browser test 2.7 seconds, 4.9 seconds including runner startup |
| Full local unit/integration regression                         | Passed, 320/320                               |                                                                          135.0 seconds |
| Cloudflare application build and research Worker dry run       | Passed                                        |                      application build 11.4 seconds; Worker 856.3 KiB / 151.4 KiB gzip |
| Dependency advisory audit                                      | Passed, 0 known vulnerabilities at audit time |                                                   under 1 second after registry access |

Times are single local observations and are not service-level objectives. External connector latency and paid-model latency were not benchmarked because this validation deliberately did not use network credentials or a live model.

## Manual Kimi K3 Max evaluation

Run this only after rotating any credential that has been pasted into chat or another recorded channel. Read the new credential silently in your own terminal so it does not enter shell history:

```sh
read -s FIREWORKS_API_KEY
export FIREWORKS_API_KEY
npm run eval:source-search:live
unset FIREWORKS_API_KEY
```

The default model is `accounts/fireworks/models/kimi-k3`, reasoning is always Max, and the script performs up to eight read-only operations per case. It never chooses project import. To run one case or override the researcher's criteria:

```sh
npm run eval:source-search:live -- --case=ming-succession-donglin
SOURCE_SELECTION_CRITERIA='Require primary sources and university-press scholarship; exclude material after 1912.' npm run eval:source-search:live -- --case=ming-succession-donglin
```

Optional `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY` and `DPLA_API_KEY` environment variables enable those connectors for this manual process. Reports are written under ignored `artifacts/source-search-evaluations/`. A report stores the model name, criteria, timings, token counts, decisions, candidates and metrics; it does not store provider credentials.

Review every report for query refinement, false positives, unexplained rejection, access claims and institution diversity. Feed failures back into selection criteria, connector normalization and the deterministic evaluation cases before changing the agent prompt.

## Known limits

- This pass verifies connector contracts with synthetic responses; university APIs can change and still need periodic live smoke tests by an operator.
- Metadata/abstract inspection checks bibliographic relevance, not the truth of a work's claims. Only imported/prepared page text can support later ClioForge evidence.
- Generic OAI-PMH and IIIF harvesting is not activated without repository/collection configuration.
- DNS rebinding cannot be fully ruled out by URL-literal checks alone. Cloudflare egress isolation, fixed-host connector allowlists and manual redirect validation reduce the current boundary; a future egress proxy can add address resolution and network policy enforcement.
- The agent sees a bounded recent candidate window. Earlier records remain in D1 and the UI but may require another search to return to the active model context.
