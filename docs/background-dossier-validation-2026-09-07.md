# Background dossier validation — 2026-09-07

## Case and execution

The existing local Adams correspondence project supplied three imported public-source texts: Abigail Adams's letters of 31 March, 27 April and 7 May 1776. The question separated criticism of marital authority, representational language and a proposal to petition Congress from evidence that a petition was actually submitted. Source preparation notes and excerpt boundaries remained in the selected pages.

The final round ran through the local Cloudflare-backed application API and its background queue, using the saved OpenRouter connection for `google/gemini-2.5-flash-lite`. The default GLM model setting was not changed. No browser event advanced the workflow.

- Start: `2026-09-08T00:52:06.112Z` (September 7 in Los Angeles).
- Quotation-check completion: `2026-09-08T00:52:46.868Z`.
- Three source readings, one critique, one synthesis and the deterministic quotation check completed.
- One source-reading output needed the permitted automatic correction: six paid calls across five model steps, with no manual retry in this final round.
- Recorded estimated task cost: **$0.007354**, including that correction. The existing **$0.05 project budget** was not increased. This is application accounting at the configured rates, not a provider invoice or a general per-project price.
- The final human review became ready. Publication remained blocked. No historical finding was accepted on behalf of a researcher.

Ignored local evidence: `work/background-e2e/state-v6.json`, `view-v6.json` and `final-report.md`. Prior failed rounds are retained separately; credentials and session cookies are not included in this public document.

## Failures that changed the implementation

1. Copying historical quotations produced altered spelling, ellipsis-joined passages and mismatched citation numbers. These were confirmed provider responses, not timeouts. The dossier now asks the model to select application-numbered passages. Canwoo fills exact version/page/character references and rejects unknown numbers.
2. The normal grouped form `[P8, P9]` was initially rejected. It is now parsed as two explicit references without inferring missing numbers or relaxing exact-text checks.
3. A technically valid early report repeated its summary instead of supplying useful critique or a next-reading plan. Those are now required output fields and visible report sections. Their citations and the limitations' citations are resolved against the same fixed passage bank.
4. A longer report hit the configured output limit. This was output truncation, not a network timeout. Shorter section instructions and omission of repeated machine-check records from the next model's context let the final round complete within the existing output limit. The truncated attempt and its conservative budget reservation were retained.
5. Failure injection showed that a worker could lose its execution lease after saving a paid response. Recovery now reuses that response only when the attempt, sources and upstream inputs still match. Cost is derived from retained jobs rather than incremented again at each handoff.

## Productivity assessment

The final report correctly kept the April 27 proposal separate from evidence of actual submission. It supplied alternative readings of the rebellion language and marital-authority criticism, and proposed checking later correspondence and petition records. Its quotations remain navigable to the imported text.

This is useful preparation for a researcher: an inspectable starting dossier produced while the browser is closed. It is not independent historical verification. One alternative suggested that absence of broad female response might favor a personal-complaint interpretation. That inference is not established by this selected corpus and needs rejection or qualification during review. The report's blanket language about incomplete letters also needs checking against each file's preparation note. Neither exact quotation matching nor agreement between assistants resolves these interpretive issues.

No claim is made here about measured scholar-hours saved, comprehensive archival coverage, collection-scale accuracy or the relative quality of GLM versus Gemini. This exercise validates a bounded workflow with one low-cost model, not autonomous scholarship across all models and corpora.

## Checks and remaining acceptance

Regression coverage includes the full dossier through the final review gate; exact offsets and Unicode passage splitting; grouped and invalid references; mandatory critique and next-source fields; saved-response recovery without a second call or duplicate charge; obsolete attempts; changed inputs and source revisions; pause; uncertain provider calls; correction exhaustion; and budget exhaustion before a new call.

The final full regression suite passed **247 tests with zero failures or skips**, including the existing Adams backup restoration. TypeScript, lint, comment checks, formatting, the Cloudflare app build, the research-worker deployment dry run and a redacted staged-change secret scan passed.

The Mac remained locked during this pass. The authenticated application API, queue execution, production build and automated checks were exercised; new browser click/visual acceptance is not claimed. Existing desktop acceptance is documented separately in `background-research.md`.
