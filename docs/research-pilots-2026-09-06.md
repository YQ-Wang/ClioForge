# Three historical-source pilots

Run on the production ClioForge installation on September 6, 2026 (Pacific time), using an authorized researcher account and its OpenRouter connection to `z-ai/glm-5.3-flash`.

## What this establishes

Three bounded questions reached imported sources, a model answer, automatic quotation checks, a manually rewritten review, and an accepted finding. Each project also contains a reading note. The newspaper pilot additionally exercised image-only PDF upload, paid OCR, correction into a new source version, and Markdown export.

These are practical exercises using established research archives, not replications of published research projects or independent historical scholarship. An AI coding assistant operated the application and inspected the sources. No historian independently reviewed the findings. There was no timed human-only baseline, so these runs do not establish a percentage productivity improvement or readiness for unattended research. Debugging and source preparation took substantially longer than the model calls.

## Sources and questions

| Pilot                                         | Material                                              | Question and retained boundary                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adams Papers / Founders Online                | Three letters, March–April 1776                       | Compare Abigail's legal requests, John's response, and the proposed petition to Congress. A proposal does not establish submission; absence in these letters does not prove a petition was never submitted. |
| Darwin Correspondence Project                 | Four letters, June–October 1858                       | Distinguish proposed consent, third-party accounts of publication arrangements, and Wallace's later acknowledgement. The selected letters alone do not establish or disprove prior authorization.           |
| University of Michigan Influenza Encyclopedia | Two image-only newspaper PDFs, November–December 1918 | Distinguish advocacy of compulsory masks, implementation, and claims about effectiveness. A policy proposal is not an enacted order or evidence of its effects.                                             |

### Adams Papers

- [Abigail Adams to John Adams, 31 March–5 April 1776](https://founders.archives.gov/documents/Adams/04-01-02-0241)
- [John Adams to Abigail Adams, 14 April 1776](https://founders.archives.gov/documents/Adams/04-01-02-0248)
- [Abigail Adams to Mercy Otis Warren, 27 April 1776](https://founders.archives.gov/documents/Adams/04-01-02-0257)

The imported text files contain the historical letter bodies, canonical URLs and preparation notes; modern editorial notes were omitted. The first letter includes a later continuation, so its content should not all be assigned to March 31. The Warren letter repeats John's response and is not independent corroboration of that event.

### Darwin Correspondence Project

- [Darwin to Lyell, 18 June 1858, DCP 2285](https://www.darwinproject.ac.uk/letter/?docId=letters/DCP-LETT-2285.xml)
- [Darwin to Lyell, 25 June 1858, DCP 2294](https://www.darwinproject.ac.uk/letter/?docId=letters/DCP-LETT-2294.xml)
- [Hooker and Lyell to the Linnean Society, 30 June 1858, DCP 2299](https://www.darwinproject.ac.uk/letter/?docId=letters/DCP-LETT-2299.xml)
- [Wallace to Hooker, 6 October 1858, DCP 2337](https://www.darwinproject.ac.uk/letter/?docId=letters/DCP-LETT-2337.xml)
- [The project's primary-source teaching context](https://www.darwinproject.ac.uk/learning/universities/letters-primary-source/controversy)

The model overstated the corpus boundary as a claim about all surviving evidence. Manual review narrowed it to the four supplied letters. It also distinguished a quoted acknowledgement of receipt from evidence of prior consent. A date typo introduced during review was rejected, resubmitted and corrected before acceptance, exercising the human revision path without another model call.

### Influenza Encyclopedia

- [Deseret Evening News, November 27, 1918, p. 1: Favors Compulsory Wearing Of Masks](https://hdl.handle.net/2027/spo.1540flu.0010.451)
- [The Minneapolis Journal, December 26, 1918, p. 14: Face Masks (How To Keep Well)](https://hdl.handle.net/2027/spo.0830flu.0006.380)
- [Archive context: Salt Lake City](https://www.influenzaarchive.org/cities/city-saltlakecity.html)

Both PDFs contain one image page and no embedded text. The original PDFs were preserved as version 1. Version 2 contains reviewed portions of the relevant articles, with explicit partial-coverage notes; it is not a full-page transcription.

One OCR request completed but confused a person's name and several words in the multi-column scan. The page image was inspected to correct the relevant passage. Another OCR request timed out; selected passages were transcribed manually from the image instead of silently presenting OCR as successful. An uncertain surname and omitted damaged text were recorded. The exercise concerns historical rhetoric and evidence, not present-day medical advice.

## Outcomes, including failed attempts

Nine sources were imported: seven letter texts and two scanned PDFs. Three notes and three accepted findings were retained in the authorized account. Failed attempts remain visible for inspection.

| Stage                       | Observed outcome                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial general comparisons | Extra prose after JSON, incorrect source-version identifiers, missing citation markers, and timeouts prevented acceptance. A completed provider call did not necessarily produce a valid research task. |
| Structured comparison retry | Better output shape, but still encountered invalid citations and long responses. One low-effort general comparison also timed out; low effort alone is not a reliability guarantee.                     |
| Explicit short follow-ups   | All three pilots produced answers with matching quotations. The final two letter runs used Chinese output while the interface remained English.                                                         |
| Human review                | Corrected overbroad inference, letter dating, and citation use before accepting findings. Automatic matching did not establish the historical inference.                                                |
| Finding and export          | Accepted findings were visible. Downloading the newspaper report exposed relative source links; the export now emits absolute URLs, still subject to project access controls.                           |

The final short calls took approximately 10.1 seconds (Adams), 17.7 seconds (Darwin), and 9.6 seconds (newspapers), measured from server job start to finish. These exclude queue time, source acquisition, transcription and review. The newspaper follow-up preceded the language fix and was rewritten in Chinese during review.

## Changes driven by the pilots

- Added an output-language choice independent of interface language; follow-ups inherit their original task's language.
- Expanded initial source selection from three to ten, retaining explicit selection controls.
- Added a bounded strict comparison schema, up to twelve numbered quotations, with server checks for referenced quotations.
- Removed competing source identifiers from model context and constrain structured quotation identifiers to the supplied fixed versions.
- Prevented invalid candidate citations from expanding the source scope of a follow-up. Previously a rejected answer could cause a subsequent follow-up to fail with a missing-source error.
- Changed the general comparison's default effort to low; specialist recipes retain their task-specific settings.
- Cleared stale action errors when a new operation starts.
- Made downloaded report source links absolute.

## Cost and validation

The application recorded **$0.015068** in settled model usage across these pilots, including successful responses subsequently rejected by research validation and one completed OCR call. Three uncertain calls retain **$0.222137** in budget reservations: two comparison timeouts and one OCR timeout. Reservations are not verified provider charges. The OpenRouter invoice was not reconciled, and these figures exclude hosting and developer time. Uncertain calls were not automatically retried.

- `CLIOFORGE_BACKUP_TEST_FILE=work/e2e-september6/LED-end-to-end.zip npm test`: **201 passed, 0 failed, 0 skipped**. The backup is an ignored local fixture and is not published.
- `npm run check`: comment-policy check, TypeScript and lint passed.
- Production Cloudflare build passed; no schema migration or additional paid resource was needed.
- Regression coverage includes comparison output limits, fixed-version schema constraints, and exclusion of untrusted candidate citations from follow-up scope.

Private project IDs, credentials, downloaded corpora and raw execution logs are intentionally absent from this public report. Operators can reproduce the questions using the canonical archive links above, import materials with their source and reuse notes, select a small corpus explicitly, and compare the candidate answer with the originals before accepting it.

## Next priorities

1. Region selection and column-aware OCR, with convenient correction against the scan. Full-page OCR remains unreliable on complex newspapers.
2. Repair a candidate's quotation or citation marker without paying for a new model response. Keep the original candidate and correction history.
3. Reduce duplicate inherited quotations in human-review findings while preserving the meaning of existing citation numbers. The current model-plus-verification dependency path repeats quotations.
4. Make long-task timeouts and uncertain-cost reconciliation easier to resolve. Short bounded tasks worked better here, but the sample is too small to generalize success rates.
5. Run a historian-led comparison against their existing workflow, measuring usable evidence collected, corrections required, time to a defensible note, and provenance retained.

The current value is a connected, inspectable reading-and-review workflow for a supervised alpha. The pilots do not justify calling the platform an autonomous industrial research system.
