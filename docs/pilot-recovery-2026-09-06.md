# Recovery fixes after the historical-source pilots

This follow-up addresses the reproducible failures in the [three historical-source pilots](research-pilots-2026-09-06.md). It was validated on September 6, 2026, Pacific time.

## Delivered behavior

- **Repair text and quotations without a model call.** Eligible reading/comparison tasks and human review drafts have a revision dialog. Researchers can correct the account, fixed source version, page and exact quotation. The server checks quotation text, numbered references, access, task revision and dependency revisions. Saving creates a new candidate awaiting acceptance, preserves original attempts, records before/after content and reasons, and invalidates affected downstream work. It does not release uncertain reservations or dispatch paid work. Specialist extraction and claim-audit results retain their existing domain-specific correction flows; accepted artifacts remain immutable.
- **Remove repeated review quotations safely.** New human submissions compact identical source/version/page/quote/offset tuples and remap the prose references. Distinct occurrences remain separate. Older findings and Markdown exports group repeated passages while displaying all original numbers; the underlying artifact and structured citation references remain unchanged.
- **Send the selected image region to OCR.** The reader's region selector now controls the image actually sent to the provider. Cropping precedes resizing, and the normalized region is stored in the run record. Partial OCR goes into the page draft for review instead of replacing the page. Page-level batch reuse excludes cropped results, both in the UI and on the server.
- **Bound follow-up work and make failures recoverable.** General comparisons and follow-ups use a 3,072-token output ceiling and concise instructions. New follow-up drafts default to Quick reading. Follow-ups request the strict comparison schema and undergo numbered-citation validation. Existing draft preferences are preserved. Timeout messages distinguish reservations from confirmed charges and explain the revision or narrower-follow-up options. These changes reduce unnecessary repeated work; they do not guarantee provider latency or OCR accuracy.

## Live verification

The same authorized production account and existing public-source projects were used. No credential or private dataset is included in this report.

1. **Adams timeout recovery:** the earlier incomplete comparison was rebuilt from its three fixed letter versions in the revision dialog. All three exact quotations passed. The result remained pending review. Its model-job count stayed at five before a separately requested new follow-up, demonstrating that the repair did not call the model. A deliberately invalid quotation was rejected without replacing the saved text. The inline dialog retained the edits and showed the error.
2. **Legacy newspaper finding:** the existing four-entry quotation list displayed as two passages with aliases `[1] · [3]` and `[2] · [4]`. Original prose reference numbers were retained.
3. **Real cropped OCR:** the mask article in the Deseret newspaper scan was selected with the reader's drag control. The request completed in about **5.9 seconds** and recorded **$0.000250** settled usage. It read “Dr. Paul” correctly, unlike the original full-page attempt. The result still contained uncertain/damaged material, a clipped ending and added formatting; it was not automatically accepted as an accurate transcription. Inserting it preserved the existing page text. The duplicate test insertion was discarded, leaving version 2 unchanged and the paid OCR candidate recoverable from its saved run.
4. **New strict follow-up:** a concise three-letter question completed in about **11.0 seconds**, recorded **$0.000927**, and passed all three quotation checks. Its human review inherited three quotations instead of six. After correcting the date range and keeping the limited corpus boundary, the review was accepted.

Together, these two new provider calls recorded **$0.001177** in settled application usage. Earlier uncertain reservations were left intact. Timings measure the server run, not archive acquisition or historian review. Provider invoices were not independently reconciled.

## Validation and limits

- Full suite with the existing real backup fixture: **209 passed, 0 failed, 0 skipped**.
- Comment policy, TypeScript and lint passed; Cloudflare production build passed.
- Regression cases cover duplicate-number remapping, distinct text occurrences, invalid quotations/references, access checks, stale edits, concurrent dependency changes, preservation of original attempts and costs, nullable pre-repair results, crop bounds and region provenance.
- No database migration or new paid service is required.

The remaining limits are model-side OCR errors and timeouts, manual reconciliation of uncertain provider charges, and the need for researcher judgment about historical inference. One successful crop and one short answer establish working recovery paths, not a general accuracy or speedup benchmark.
