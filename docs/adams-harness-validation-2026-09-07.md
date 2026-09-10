# Adams correspondence: annotation and follow-up validation

September 7, 2026, Pacific time. This continued the same five-source production project and existing OpenRouter connection described in [the earlier continuation](adams-continuation-2026-09-07.md). Earlier failed attempts remain in the project history.

## What the live trial established

A new GLM 5.3 Flash request succeeded on the John Adams to James Sullivan excerpt. The operator added a reading comment asking whether “Women will demand a Vote.” predicts a consequence of changing voter qualifications or endorses it, then asked the assistant for a short interpretation with a continuous quotation.

The answer interpreted the sentence in its warning context, cited an exact passage beginning “Depend upon it, sir,” and acknowledged the excerpt's limits. ClioForge's automatic text check passed. The UI recorded approximately $0.0004 for this step; provider billing was not independently reconciled.

The operator then opened the review task, assigned it, rewrote the answer to limit the inference to this paragraph, and accepted it with a recorded reason. The compiled report preserved that revision and its fixed-version citation. It was accepted and converted into the saved note **1776 选民资格 · 从批注到审读结论**, with an inline source link, original quotation and explicit scholarly limitations. This is an operational review by an AI coding assistant, not independent historian verification.

This demonstrates a useful model-assisted reading-to-writing workflow. It does not establish a model reliability rate, a measured speedup, or unattended historical research capability.

A second live GLM 5.3 Flash request also succeeded after deployment. From an original task covering five sources, the operator selected only page 1 of the May 7 Abigail letter, entered a question, refreshed the browser and verified restoration of the exact selection and question. The submitted task reported **one source**, quoted the criticism of absolute power over wives exactly, and distinguished that passage from a complete electoral proposal. Its recorded cost was approximately $0.0003. It remains available for scholarly review, rather than being automatically accepted.

The combined recorded cost of these two successful steps is approximately $0.0007. This excludes prior uncertain reservations and is not a provider billing audit.

## ClioForge defects addressed

- **Implicit inherited source scope:** follow-ups can now explicitly select 1–24 pages from at most ten source versions. This replaces inherited source pages. Earlier questions remain as background, but previous answer text and quotations are omitted in this mode so excluded material is not silently reintroduced. The selected scope and immutable retry request survive browser draft restoration.
- **Mixed findings:** the library separates compiled research reports, review notes and supporting steps, with title/excerpt search and a direct return to the originating research plan. Shared findings do not expose the private originating plan identifier. Long headings are clamped visually while their full text remains available.
- **Partial comparison draft loss:** selecting only the first passage now preserves it as a note draft. Previously both passages or an observation were required. Clearing all passages and observations clears that local draft.
- **Discarding abandoned drafts:** the draft shelf now offers an explicit confirmation before removing local unsaved work. It checks the account/project prefix and refuses a draft that changed since selection. Saved project versions are unaffected.
- **Technical wording in scholarly answers:** reading instructions retain the prompt-injection boundary but ask the assistant to describe evidentiary limits in ordinary research language rather than expose implementation terminology to readers.

## Distinguishing request failures from application failures

The provider adapter applies a 90-second deadline for low effort and 150 seconds otherwise, spanning the request and response body. A transport failure, incomplete response body, malformed provider JSON and a returned answer failing local citation checks are different conditions. A deadline alone does not identify whether OpenRouter, an upstream model endpoint, network conditions or the application's chosen deadline caused the delay.

Existing regression tests cover interrupted response bodies, safe HTTP diagnostics, Worker adapter execution, uncertain request accounting and local citation rejection. The new source-scope regression inspects the actual prompt sent to a fixture provider: selected text is present, excluded source and page sentinels are absent, duplicate submission is not dispatched twice, and foreign-project or nonexistent pages are rejected. A separate draft regression preserves the same page scope after a lost submission response.

No retry policy or provider timeout was increased to make this trial appear successful. Uncertain prior calls retain their reservations and are not automatically replayed.

## Validation boundaries

The full suite passed **218 tests, zero failures and zero skips**, including restore from the existing real project archive. TypeScript, lint, comment checks, Cloudflare application build and research-worker dry run passed.

After deployment, findings showed two reports, four review notes and one supporting step. Combining the review category with “Sullivan” returned the two relevant records, and returning to the original five-source plan worked. The new library was visually checked at desktop width and at 390 px in English, including the dark theme; the original language, theme and viewport were restored.

The first-passage comparison regression was reproduced in the previous deployment. In the repaired deployment, selecting one word immediately created a recoverable note draft with its source link, despite the second side remaining empty. This is evidence of draft recovery, not a completed historical comparison from those temporary test words. The new discard dialog was then checked in production: cancelling retained the draft; confirming removed only that temporary draft. The three saved project notes remained available.

This continuation specifically exercises annotations, model reading, exact quotation checks, human review, compilation, conversion to a saved note and findings navigation. It does not newly establish end-to-end coverage of OCR, Drive file import, scheduled external discovery, multiple real collaborators or independent historian productivity. Earlier coverage is retained in the linked report rather than reclassified as new evidence.
