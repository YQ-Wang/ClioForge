# Research iteration validation — 2026-09-07

This pass exercised the existing authenticated local copy of the 1776 Adams correspondence project. It improved three connected parts of the workflow, then repeated the exercise with a real follow-up answer.

## Report to original passage

Report and conversation citations now carry the exact quotation to the source reader. The reader verifies the fixed version, page, UTF-16 offset and quotation before locating it. Legacy quotations without offsets are located only if the text occurs once. Stale or ambiguous quotations still open the source, without selecting a potentially wrong occurrence.

The URL retains only the fixed source identifiers and validated offsets. Refresh and browser history restore that location. A temporary reading mark can overlap saved annotations without duplicating source text or creating evidence. Clicking the same citation again restores its reading position. The page reader also resolves stored page numbers rather than treating them as array indexes.

Chrome validation followed the April 27 petition passage from the seven-citation review draft, refreshed, and returned to the review. The exact paragraph remained marked; the source still had its one existing annotation. The review's saved text and citation basis were unchanged.

## Proposed next evidence to an editable follow-up

The dossier's existing next-evidence section now offers a prepare-question action. It does not rewrite the report or call a model. A prepared question persists as a browser draft and cannot overwrite a nonempty or pending question. The researcher selects materials and sends through the existing budgeted, idempotent conversation workflow. Reference numbers from the old report are not copied into the new question as if they belonged to its future answer.

The browser exercise prepared the April 27 follow-up suggestion, confirmed the conversation still had zero turns, refreshed the draft, and added a two-sentence/one-quotation constraint. It then sent one real GLM 5.3 Flash follow-up through the saved OpenRouter connection. The application recorded **$0.0021**. The model returned an answer; there was no provider timeout in this attempt.

The answer distinguished the absence of petition-progress evidence in the three supplied documents from the broader historical question. It proposed consulting later correspondence and petition records rather than claiming those sources had already been searched. Its one quotation opened the exact May 7 passage. The new workflow advanced through answer generation and citation checking to **2/4 steps completed**, with human review ready and publication still blocked. No historical finding was automatically accepted.

The exercise exposed a usability issue in the generated title: a generic scope instruction preceded the actual research question. The preparation template was refined to put the specific proposed check first. This affects newly prepared questions; existing saved tasks remain unchanged.

## Review attention and readability

Ordinary follow-up review pages now open the preferred model report first, as dossier review pages already did. Successful automatic checks are summarized and grouped by source instead of repeating indistinguishable success lines. Failed checks and their recorded explanation remain visible before the quotation list, without expanding a technical record. Passed-check details remain available on demand. These checks verify text and source consistency; they do not validate a historical interpretation.

The follow-up's human review page showed its model answer expanded and the separate citation-check dependency collapsed. Validation also covered English labels, theme appearance and native source navigation.

## Automated validation and limits

The full suite passed **260 tests, zero failures and zero skips**, including the historical-project backup restore. Regressions cover source-range history, invalid or ambiguous anchors, overlapping saved annotations, report-section extraction, bounded question preparation, visible failed checks and safe rendering. Type checking, linting and formatting passed. The final question-order refinement was retested separately.

This pass demonstrates a functioning report → source check → next question → model answer → review handoff. It does not establish corpus-wide accuracy, quantified historian-hours saved, or unsupervised scholarly publication. Broader productivity claims still require independent historian trials on larger, varied corpora.
