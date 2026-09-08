# Research harness: Adams letters trial

This trial used the existing local copy of the Adams correspondence case and its previously authorized OpenRouter GLM 5.3 Flash connection. Production sources, notes and accepted interpretations were not changed.

The question was whether the selected 1776 letters establish that a petition was submitted, or only proposed. Selected material was the March 31 letter to John Adams, April 27 letter to Mercy Otis Warren, and May 7 excerpt to John Adams. The imported texts preserve source-edition links and preparation limitations; they are not manuscript facsimiles.

## Observed execution

1. The assistant searched the selected pages for `petition` and obtained one excerpt.
2. It read the relevant April 27 page.
3. It read the May 7 excerpt.
4. It read the March 31 page to seek additional or contrary context.
5. It synthesized the returned passages. Thirteen citations matched their fixed versions and offsets.
6. The plan reached its researcher-review gate: ten automatic tasks completed, one human task ready, and publication blocked on review.

The report distinguishes a proposed joint petition from evidence of an actual submission, names unperformed next archival checks, and states that silence in these excerpts is not evidence that no petition existed. This is a developer's operational reading of the output, not independent historian approval. The report remains unaccepted.

## Defects found and repaired

- Generic citation instructions conflicted with action selection, causing the second decision to include citations. Action decisions now have their own constrained output schema and overriding instruction. A controlled retry completed the remaining tool operations.
- The first synthesis copied valid text but attached incorrect `start` offsets. Synthesis now selects numbered passages derived from tool-returned text; the application supplies quotations and offsets.
- The borrowed short-dossier validator capped citations at twelve, rejecting a report whose thirteen references included source-preparation limitations. The new investigation-report contract allows twenty-four references without changing the older dossier limit. An explicit saved-answer recheck then recovered the existing response without another model request.
- The existing local project's five-cent allowance stopped synthesis before calling the model because its remaining budget could not cover the conservative reservation. The test allowance was increased to ten cents; no production budget or subscription changed.

All failed outputs and paid responses were retained. Seven actual model calls, including failed output attempts, accounted for **4,186 units (approximately $0.004186)** at the configured rates. Rechecking the saved answer added no model call. These are application accounting records, not an independent provider billing audit.

## Verification boundaries

The authenticated local API trial exercised the real Worker/queue/provider path and offline replay. Chrome checks confirmed task activity, source-opening controls, dependency-ordered replay, diagnostic expansion and the explicit review handoff. Replay reported ten checked results, two without results and zero failed current-result checks. Earlier failed responses remain in the export.

Automated regressions cover foreign-page rejection, repeated operations, early finish without paid decisions, corrupted replay files, immutable method editions, obsolete model evaluation attribution, late-context caveats, timeout reservations, duplicate queue delivery, local handoff recovery and fenced saved-answer rechecks.

No test establishes a productivity multiplier, historical accuracy rate, complete archival coverage, or fully unattended scholarly judgment. There was no new end-to-end certification of every earlier feature, such as OCR, Google Drive, or multi-user editing. This change has only been tested locally; production deployment is separate.

Final automated validation: **273 tests passed, zero failures and zero skips**. TypeScript, lint, comment-language checks, formatting, the Cloudflare application build and research-worker dry run passed. Migration validation confirmed 22 unchanged migrations and one appended migration. A credential-pattern scan of the 30 changed or added public files found no matching secrets; this is not a substitute for a security audit.
