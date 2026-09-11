# Agentic source search

ClioForge source search is a bounded, persisted research loop. The model does not receive a single web-search result and turn it directly into a project source. It chooses one operation at a time; application code executes that operation, normalizes and stores the result, and returns a bounded ledger for the next decision.

## Researcher workflow

Open **Source management** and choose **Add sources with AI search**. This control remains available whether the project is empty or already contains sources.

The dialog has two separate researcher-controlled inputs:

- **Research request** describes the topic, people, periods, places and desired material.
- **Source selection criteria** defines what may be retained. A scholarly default prefers primary sources, critical editions, finding aids, peer-reviewed work and stable institutional records. Edit it freely to require or exclude specific periods, regions, languages, formats, repositories, access conditions or methodologies.

Selection criteria are saved on the search run and copied into every model task. They therefore govern query refinement, candidate inspection, rejection, access resolution, import and lead creation rather than acting as a display-only hint.

The researcher also chooses Low, High or Max reasoning and one search mode. A run currently allows at most eight model-directed operations. It may stop earlier when the agent emits `finish`.

## Execution contract

Each model decision must match the strict `source_search_tool_v1` schema and select exactly one of:

1. `search`
2. `inspect_result`
3. `resolve_full_text`
4. `import_source`
5. `save_source_lead`
6. `reject_result`
7. `finish`

The application rejects invented candidate identifiers, duplicate operations, premature import/lead actions and a finish action before meaningful search. A candidate must be inspected before full-text resolution or rejection, and resolved before import or lead creation. Search records, decisions, normalized candidates, rejection reasons and leads survive page reloads and project backup/restore.

The agent context retains operation history plus the 60 most recent unique candidates. Candidate snippets are bounded before persistence and again before prompting so a noisy catalog cannot exhaust the model context. Catalog metadata, abstracts, OCR and web text are explicitly marked as untrusted research data and are not treated as historical evidence.

## Connectors

| Connector                          | Current coverage                                        | Credential             |
| ---------------------------------- | ------------------------------------------------------- | ---------------------- |
| Crossref                           | Scholarly metadata, DOI, deposited abstracts/licenses   | None                   |
| OpenAlex                           | Scholarly metadata, abstracts and open-access locations | None                   |
| Library of Congress                | Search API records and public object links              | None                   |
| Harvard LibraryCloud               | Harvard catalog and digital-object metadata             | None                   |
| University of Washington CONTENTdm | UW digital collections                                  | None                   |
| DSpace                             | UW and Cornell repository discovery endpoints           | None                   |
| DPLA                               | Aggregated US cultural-heritage metadata                | `DPLA_API_KEY`         |
| Brave web search                   | Optional broad/domain-restricted discovery              | `BRAVE_SEARCH_API_KEY` |
| Tavily web search                  | Optional broad/domain-restricted discovery              | `TAVILY_API_KEY`       |

The normalized schema retains provider/external ID, title, creators, date, material type, languages, institution, collection, DOI/Handle/ARK/OCLC fields, landing and file URLs, rights/license, access state, snippet and verification level. Crossref documents its public metadata API and its distinction between metadata and publisher content in the [Crossref REST API guide](https://www.crossref.org/documentation/retrieve-metadata/rest-api/). The other integrations follow the [OpenAlex API](https://docs.openalex.org/), [Library of Congress JSON/YAML API](https://www.loc.gov/apis/json-and-yaml/), [Harvard LibraryCloud API](https://librarycloud.harvard.edu/), [DPLA API](https://pro.dp.la/developers/api-codex), [CONTENTdm API](https://help.oclc.org/Metadata_Services/CONTENTdm/Advanced_website_customization/API_Reference/CONTENTdm_API/CONTENTdm_Server_API_Functions_-_dmwebservices) and [DSpace REST contract](https://github.com/DSpace/RestContract).

OAI-PMH and IIIF remain record/collection-level protocols, not useful universal keyword indexes. Their tool names are reserved, but the current executor reports them unavailable until a collection endpoint or inspected record supplies the required context. Future harvesting should preserve OAI set/resumption state and follow the [OAI-PMH protocol](https://www.openarchives.org/OAI/openarchivesprotocol.html); image and manifest traversal should follow the [IIIF Presentation API](https://iiif.io/api/presentation/3.0/).

## Import and lead rules

Automatic import is deliberately narrower than discovery. ClioForge imports only a resolved HTTPS file marked public/open, on the standard HTTPS port, with no URL credentials, local/private destination or unsafe redirect. The response must be non-empty, at most 20 MiB and one of PDF, plain text, HTML, JPEG or PNG. PDF content must start with the PDF signature. HTML is reduced to bounded plain text before storage.

The original is written to private R2, then a source/version and provenance record are committed with provider ID, landing URL, license, retrieval time and SHA-256. PDF and image originals still require the normal preparation/OCR workflow before they provide page text.

If download, access, storage, media validation or import fails, the run continues and creates a persistent **source needing a file** entry. It contains the catalog link, relevance reason and access note so a researcher can obtain and upload a lawful copy later. This is also the normal result for relevant paywalled or metadata-only records.

## Configuration

Catalog-only search works without search-provider credentials. Optional provider credentials belong on the background research Worker, not in source code or browser state:

```sh
npx wrangler secret put BRAVE_SEARCH_API_KEY --config "$CLIOFORGE_JOBS_CONFIG"
npx wrangler secret put TAVILY_API_KEY --config "$CLIOFORGE_JOBS_CONFIG"
npx wrangler secret put DPLA_API_KEY --config "$CLIOFORGE_JOBS_CONFIG"
```

Configure at most the web provider you intend users to select. Missing credentials are recorded as an unavailable connector; they do not fabricate an empty search result.

Model connection and rates are configured under **Assistant settings**. The output reservation is user-editable and defaults to 16,384 tokens for new settings; the former fixed 4,096-token application value is no longer imposed when saving settings. Provider/model context and output limits still apply, and a larger reservation requires more project budget. Fireworks currently lists the model as [`accounts/fireworks/models/kimi-k3`](https://fireworks.ai/models/fireworks/kimi-k3), and its [Chat Completions reference](https://docs.fireworks.ai/api-reference/post-chatcompletions) accepts `reasoning_effort: "max"`.

## Where to extend it

- `lib/harness/source-search-prompt.ts`: research policy and model instructions
- `lib/harness/source-search-tools.ts`: tool actions, ledger and deterministic sequence validation
- `lib/harness/source-search-executor.ts`: persistence, resolution, import and lead fallback
- `lib/search/connectors.ts`: institutional and scholarly connector adapters
- `lib/search/safe-fetch.ts`: network and download boundary
- `lib/search/evaluation.ts`: cross-region/period quality cases and noise traps
- `lib/platform/source-search-recipe.ts`: bounded mission graph and user criteria propagation
- `scripts/evaluate-source-search.mts`: operator-run live Kimi evaluation
- `tests/source-search-agent.test.ts`, `tests/core.test.ts`, `tests/lifecycle.test.ts` and `tests/e2e/source-search.spec.ts`: unit, integration, lifecycle and browser coverage

Add a connector by implementing a fixed-host query, normalizing every response through `sourceCandidate`, returning explicit unavailable status on failure, and adding synthetic contract tests. Do not make an institution's human search page a brittle scraper when an official API, OAI endpoint, IIIF collection or repository API exists.
