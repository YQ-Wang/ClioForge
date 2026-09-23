# Literature discovery

Find more sources is available on the project overview, in source management, and beside each research question. It supplements a question's reading list; it does not certify that a bibliography is complete or that a source supports an argument.

## Research workflow

1. Enter up to three short queries, one per line. Direct search needs no model connection. Optional AI planning turns a longer question into up to three queries using the researcher's existing model and cost controls.
2. Optional OpenCC conversion adds simplified/traditional variants, retaining original queries and a six-query cap. AI planning is instructed to preserve a Chinese query, consider English terms, and distinguish the historical period from publication dates.
3. Crossref, OpenAlex and the Library of Congress each return at most five records per query. Exa adds web discovery only when explicitly selected and configured. There is no recursive crawling or automatic pagination.
4. Inspect title matches, publication metadata, catalog provenance and matched queries. Weak title matches are collapsed, not discarded. This lexical sort is not a confidence score or a scholarly quality judgment. Different editions with different identifiers remain separate.
5. Save a retrieved candidate to the existing project bibliography. The server resolves its identifier against the saved result instead of trusting client-supplied metadata. Repeated imports deduplicate through the existing bibliography importer. The record retains the discovery query, catalogs and retrieval timestamp. Bibliography exports and footnotes continue to use the existing CSL pipeline.
6. Open a catalog-provided full-text lead, verify the edition and permissions, and import the acquired file through the existing source importer. Link its bibliography record, read, annotate and collect evidence. Searching or saving a reference does not create evidence or indicate that full text has been read.

Recent searches are personal and project-scoped. Closing the dialog does not discard completed results. The last twenty sessions are listed; results are not automatically rerun when reopened. Background research plans reuse the same free catalog adapters and Chinese expansion, without silently enabling the user's paid Exa connection.

## Optional connections and cost controls

In the discovery dialog, open **Optional search services and usage**:

- Exa: supply your own API key and a monthly maximum number of attempts. Enable Exa for each search where it is wanted.
- OpenAlex: basic unauthenticated search works subject to the provider's public limits. A personal key can be saved to use the associated provider allowance.
- Leave the key blank when updating an existing connection's limit. Zero pauses new calls through that connection. Removing/replacing a connection does not reset that month's consumed attempts.

Credentials are encrypted with the installation encryption key and bound to the account and provider. Read APIs never return keys. At most six Exa requests can be made per search. Reservations are atomic and retained after failures or uncertain outcomes. There are no automatic provider retries. The limit is a ClioForge attempt limit, not a dollar cap on the external account; provider pricing, calls from other applications, and model usage are separate.

Successful results are cached for 24 hours per researcher, project, provider and exact query. Cache hits consume no search allowance. Catalog responses are capped at 2 MB with a 12-second request timeout; redirects are not followed. Only search queries go to fixed provider endpoints, never project originals. Full-text links are displayed, not fetched automatically. Account deletion clears credentials, sessions and caches; project deletion cascades its sessions and caches.

## Chinese coverage and boundaries

The Chinese specialist section links to NCPSSD, Taiwan's thesis portal, Chinese Text Project and Google Scholar. These are external research destinations, not implemented search adapters. Wanfang, CNKI, SerpApi and ctext APIs are not enabled by this change. They require separate evaluation of authorization, coverage and costs. An OpenRouter model key cannot pay for Exa or SerpApi searches.

Chinese variants help discover differently written titles; they do not resolve people, translate a topic or recover every historical glyph. AI aliases remain retrieval suggestions, not identity assertions. General catalogs can return unrelated Chinese results and erroneous metadata. Recheck authors, editions and publication information before citation.

## Validation

- `npm test` includes synthetic adapter, simplified/traditional retrieval, DOI deduplication, source isolation, cache reuse, saved-session recovery, bibliography import/export and concurrent allowance tests.
- `npx tsx scripts/validate-literature.ts` is an opt-in live probe of public catalogs using Adams correspondence and late-Qing women's education. It calls no models or paid APIs and writes local output to ignored `work/literature/live-catalog-probe.json`.
- The September 2026 live probe returned relevant Adams editions, and Chinese records on late-Qing female students' music activities and disputes over female education. It also returned unrelated medical papers. This prompted title-match ranking and explicit weak-result disclosure. This is a smoke test, not an independent recall benchmark or a measured productivity multiplier.
- Local browser validation used an existing Adams research project: search without a model, save a result to its bibliography, open existing bibliography management, and reopen the saved search.
- The discovery dialog separates query editing from results, keeps saved references marked when returning to a result, and places save feedback beside the affected record. Browser checks covered English/light and Chinese/dark appearances, a 390-pixel viewport, long titles, query validation, weaker-match expansion, keyboard focus, scroll restoration and bibliography navigation. Detailed provenance remains available inside each record.
- Exa's request shape, credential handling, uncertain failures and spending reservations are tested with fixtures. No real Exa key was available for a paid end-to-end search. AI planning retains the existing model call path; this validation did not spend model credits.

Deployments must apply `0025_literature_discovery.sql` before serving these routes. No new cloud resource or fixed subscription is required by this feature.
