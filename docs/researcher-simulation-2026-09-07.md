# Researcher simulation: from a checked letter to a retained finding

This developer trial continued the existing local Adams correspondence project.
It did not modify production research records or stand in for independent
historian evaluation. The question remained whether the selected 1776 letters
establish submission of a petition, rather than a proposed petition.

## Three iterations

1. **Read and question the assistant report.** The saved GLM 5.3 Flash report
   contained a bare `P12` in a competing interpretation. It meant the petition
   passage, but the displayed citation `[12]` meant omitted paragraphs in a
   different letter. Reprocessing the actual saved provider response with the
   corrected resolver converts this to `[1]`, the petition passage, retaining
   all thirteen existing quotations and their offsets. No additional provider
   request was made. Only repetitions of an explicitly selected passage are
   normalized; new bare references and ambiguous ranges are rejected.
2. **Check and shorten the account.** In Chrome, the trial researcher opened
   the March 31 original, returned to the task, and verified that the unsaved
   edited review survived. The April 27 petition wording and May excerpt's
   preparation limitations were checked on their source pages. A shorter
   account retained three citations, distinguished intention from submission,
   and named the remaining archival questions. The preview and saved review
   now remove unused numbered citations and agree on the new numbering.
3. **Retain and develop the result.** Code inspection of this handoff exposed
   a citation-binding defect: publication selected the human's text but could
   retain the model's citation order. The fix transfers text and citations
   together and remaps independently numbered contributions when combining
   them. A regression fails against the original publishing implementation
   and passes with the fix. Chrome then exercised review acceptance, final
   finding acceptance, library search, opening the finding and developing it
   into a saved version-one note with three fixed-source links.

The final acceptance control now explains why a compiled finding still needs
attention and says **Accept and save finding**. The review gate remains explicit;
the trial's saved account and acceptance reasons identify it as a developer
simulation.

## Cross-checks

- Searching `adam` with approximate spelling returned six current source pages
  containing `Adams`, with approximate-match labels. These include a copied
  excerpt and editorial headings, not six independent historical witnesses.
- The people/source-context page retained pending identity and transmission
  judgments, source links and their explanatory notes. A new search log records
  the actual six-page result and its limited coverage; no external archive
  search is claimed.
- The completed investigation's twelve task results passed offline trace
  checks, with no pending results or replay failures. Such checks establish
  source integrity, not the validity of the historical argument.
- Focused regressions cover shortened reviews, legacy reviews without inline
  numbers, reordered and repeated citations, unknown references, exact
  publication bindings and saved artifact content.

Release checks: 284 tests passed with zero failures and skips. TypeScript, lint,
comment-language and formatting checks passed, as did the production-target
application build and research-worker dry run. All 23 database migrations remain
unchanged. Gitleaks found no secrets in the public source snapshot or Git history.

## What this establishes

The workflow preserves a bounded interpretation, its uncertainty, the researcher's
edits and the relevant source passages through review and writing. That is a
useful operational result; it is not a measured productivity multiplier or
evidence that unattended historical judgment is reliable. The earlier model
calls were reused, so this trial does not measure fresh provider latency or
compare models. Previously stored artifacts are not rewritten by these fixes.

OCR, external Drive authorization, registration and multi-user editing were not
retested end to end in this iteration. Broader language/material coverage and
independent researcher usability trials remain necessary.
