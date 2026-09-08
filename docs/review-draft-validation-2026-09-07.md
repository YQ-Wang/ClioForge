# Review draft validation — 2026-09-07

## Defect and change

The review editor previously copied a model result's summary without its citation array. Human submission instead inherited citations from every direct dependency in database order. A copied `[1]` could consequently refer to a different passage when another dependency's citations preceded it. The application validated the quoted passages themselves, which did not detect that numbering mismatch.

The copy action now prefers the dossier synthesis and stores its exact citations alongside the editable text. Submission validates those citations against the current direct dependencies before performing the existing source checks and atomic revision checks. It rejects unselected quotations and unresolved numeric references. Legacy submissions without the optional citation field keep their existing behavior. No migration or infrastructure service was added.

The preview uses the same citation compaction as submission. Local draft recovery includes citation bindings, and clearing a saved draft does not delete a concurrent citation edit. Missing references are identified next to the editor and also rejected by the server. Saving remains separate from accepting historical findings.

## Browser exercise

Authenticated Chrome used the existing local copy of the 1776 Adams correspondence dossier. The exercise copied its synthesis, revised two unsupported generalizations, inspected the preview, followed the April 27 reference to its fixed version and page, returned, and refreshed. The modified text and citations survived.

An added `[99]` was rejected by the server without losing the text or advancing the task. After adding the local error hint, the same persisted invalid draft displayed the missing number and disabled submission. Removing it allowed the review to be saved. Refreshing showed the corrected text with its original seven source references. The human task remained pending review and the publication dependency remained blocked; no historical conclusion was accepted and no model call was made.

The draft explicitly identifies itself as a workflow-validation draft. Its corrections reject an inference from absent evidence of other women's responses to a merely personal complaint, and distinguish the May 7 excerpt's limitation from the preparation of other source files. These are conservative review notes, not an independent archival finding.

## Automated checks

The full suite passed **254 tests, zero failures and zero skips**, including the existing historical backup restoration. Added regressions cover changed citation order, replay of a saved submission without a second attempt, unselected quotations, unresolved references, citation-aware browser draft persistence, concurrent citation edits and deterministic selection of the synthesis.

This pass validates research-result handoff into review. It does not establish corpus-wide research accuracy, measured historian-hours saved, or unsupervised scholarly publication.
