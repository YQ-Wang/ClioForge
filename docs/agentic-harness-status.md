# Agentic and harness capability inventory

Code audit: 7 September 2026. This inventory describes the local working tree, including the pending harness changes. It does not certify the deployed version or historical accuracy. "Implemented" means an application path and regression coverage exist; it does not mean unrestricted autonomy.

## Implemented within explicit boundaries

| Capability                               | What ClioForge actually does                                                                                                                | Evidence and limits                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Durable task orchestration               | Persists dependencies, attempts, leases, results and pause/cancel state; recovers lost queue handoffs and rejects duplicate delivery        | `lib/platform/missions.ts`, `execute.ts`; integration tests exercise concurrent recovery, stale leases and stopped missions        |
| Permission and spending control          | Checks project access, fixed source scope and budget reservations before calls; retains uncertain paid requests                             | `lib/jobs.ts`; no promise of a provider billing hard cap or cancellation after sending                                             |
| Structured outputs and exact evidence    | Uses task-specific schemas, numbered passages and fixed version/page/offset validation; model-authored checks do not confer acceptance      | `lib/dossier-output.ts`, `lib/platform/model-result.ts`; quotation fidelity does not establish an interpretation's validity        |
| Calibrated batch extraction              | Sample correction, independent-page review, bounded batches, editable omissions and per-page evaluation                                     | `lib/platform/research-recipes.ts`; up to 1,000 selected pages, with human gates between batches                                   |
| Background dossier                       | Reads sources separately, compares interpretations/counterevidence, synthesizes and stops for review                                        | `docs/background-dossier.md`; up to 10 sources/24 selected pages; at most one explicitly configured output correction              |
| Bounded investigation loop               | Chooses search/read/finish, persists tool results, then synthesizes only returned passages                                                  | `lib/harness/research-tools.ts`; four operations, selected corpus only; early finish skips remaining paid decisions                |
| Incremental continuation                 | Invalidates downstream work on changed evidence, creates a continuation draft and reuses unchanged results with snapshot checks             | `lib/platform/incremental.ts`; starting a continuation is explicit, not silent revision of accepted findings                       |
| Reviewed research to manuscript          | Freezes reviewed claims/evidence, drafts sequential sections, checks references and coverage, saves a new editable note                     | `lib/manuscript.ts`, `tests/manuscript.test.ts`; human revision and acceptance remain necessary                                    |
| Saved-response recovery                  | Separates provider uncertainty, output validation and local handoff failures; reuses a confirmed saved answer without new inference         | `lib/platform/recover-model-result.ts`; this pass adds the explicit recovery path after a second local delivery failure            |
| Reusable method editions                 | Immutable method editions, parent links and per-task method snapshots                                                                       | `lib/harness/methods.ts`; versioning is implemented, automatic method promotion is not                                             |
| Inspectable execution and offline checks | Exports source pages, current task results and retained job records; checks graph, quotations, tool decisions and ledger continuity locally | `lib/harness/trace.ts`; no model calls during replay; it does not rerun every older response or reproduce external search rankings |

## Present but incomplete or deliberately bounded

| Capability                    | Current implementation                                                                                             | Remaining gap and decision                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context handoff               | Selects relevant saved prose, quotes, caveats and next steps from the root and explicitly selected prior turn      | No project-wide persistent research memory. Keep explicit source-linked context until a concrete cross-task retrieval case demonstrates the need; do not add an opaque summary agent                                                                           |
| Quality-informed model choice | Manual result evaluations, actual provider/model attribution, separate exploration and synthesis models            | No controlled same-material model benchmark or automatic escalation. Collect independent evaluations first; choosing a more expensive model is not evidence of better scholarship                                                                              |
| Acquisition and retrieval     | Bounded external catalogue discovery, selected-page search, aliases and separately initiated text embedding search | The new investigation tool does not browse arbitrary sites, automatically import full texts, or use image similarity. Semantic-index preparation still depends on an open page; background corpus ingestion needs its own resumable design and load validation |

These three capabilities are not being described as finished. They are larger product/evaluation work, not prerequisites for the bounded background preparation workflow. They are deferred rather than concealed behind an "autonomous research" label.

## Gaps repaired in this pass

1. **Evidence beyond the first page chunk:** `read_page` accepts a zero-based `start`, returns at most 8,000 characters, and records the actual range, total length and `next_start`. A continuation is a separate bounded operation. Search hits can locate relevant context; jumping to the end does not imply earlier text was read. Existing records without the optional coverage field remain readable.
2. **Repeated operations:** searches differing only in case or whitespace now stop; an omitted read offset equals zero. Different offsets remain legitimate continuation. This is deterministic duplicate detection, not a semantic similarity classifier.
3. **Second local handoff failure:** "Recheck saved answer" now also handles failed local delivery. It retains the attempt, rechecks permission, current sources/dependencies and mission state, and does not create another paid request. Repeated infrastructure failures remain visible; no unbounded retry loop was added.
4. **Replay could accept internally inconsistent ledgers:** checks now reject dependency cycles, duplicate edges/pages, changed earlier steps, operations not matching the saved decision, decisions missing their preceding ledger, hidden/forged quotations, incorrect reading ranges and continued work after a stop. A checksum alone is not treated as sufficient evidence of a valid execution.

## What is not a useful default yet

- Unrestricted multi-agent debate, self-granted tools and automatic publication: these add activity without demonstrated quality gains or replace scholarly acceptance.
- Automatic model fallback after uncertain requests: risks duplicate paid work and conceals where an execution failed.
- A new vector database or orchestration framework: the current gaps can be repaired in the existing D1/Queues architecture without a new fixed subscription.
- Claims of archival completeness, historical truth or a productivity multiplier: require independent historians, held-out material and measured review time, not more generated text.

## Validation of this pass

The targeted D1/Worker checks cover long-page continuation, normalized duplicate stopping, scoped search, same-attempt recovery, unchanged spending and uncertain provider calls. Offline tests include intentionally altered ledgers with recomputed checksums, so they exercise execution consistency rather than just checksum rejection.

The previously recorded Adams trial was replayed with the stricter checks: **10 current results checked, 2 pending, zero failures**. Its retained seven model requests and 4,186 accounting units were unchanged; this pass's replay and regression tests made no new paid model calls. This is reuse of an earlier live-provider trial, not a fresh model-quality evaluation.

Chrome interaction checks on the local Adams project verified that execution replay opens, shows the checked/pending counts and preserves the human-review boundary. This is an interaction/DOM check, not a new screenshot-based audit of the entire UI.

Validation results: **280 full-suite tests passed, zero failures and zero skips**. The final replay/output-schema assertions also passed in a focused nine-test run. TypeScript, lint, English-comment checks, formatting, Cloudflare application build and research-worker dry run passed. Migration checks report 22 unchanged files and one appended migration. No push or deployment was performed in this pass.
