# GLM 5.3 Flash · ClioForge suitability check

2026-09-05. Recommendation: suitable as an initial working-model preset with exact-citation checks, schema validation and human review. This small check does not establish expert historical competence, handwriting accuracy or long-context reliability.

Model: `z-ai/glm-5.3-flash` through OpenRouter. The catalog advertises text/image/video input and a 1,310,720-token model context; individual endpoints have different context limits. Its reasoning metadata lists mandatory reasoning and `low`, `high`, `max`, with **max as the default**. ClioForge explicitly sets effort instead of relying on that default.

## Controlled evaluation

One Z.AI provider, no provider fallbacks, 4096-token output ceiling, JSON mode, hidden reasoning excluded from responses. Three tasks per effort: exact record extraction with missing dates; rejecting unsupported population/date claims; identifying missing provenance despite an instruction embedded in source text. These checks use the public LED/Heidelberg record HD010014 and a separately labelled synthetic editorial variant. The prompt, assertions and results are reproducible with `scripts/evaluate-openrouter.mjs` and the adjacent JSON report. The key is never included in the report.

| Effort | Checks passed | Mean response time | Total reported reasoning tokens | Cost for 3 requests |
| ------ | ------------- | ------------------ | ------------------------------- | ------------------- |
| low    | 3 / 3         | 2.67 s             | 0                               | $0.000134655        |
| high   | 3 / 3         | 5.07 s             | 437                             | $0.000251475        |
| max    | 3 / 3         | 7.98 s             | 1,271                           | $0.000457955        |

These are three individual short tasks per level, not repeated statistical measurements. Zero reported reasoning tokens is what the provider returned; it does not change the catalog's mandatory-reasoning declaration. Higher effort did not improve the checked outcomes in this sample.

An exploratory first round routed across providers. All 9 calls returned HTTP 200, but one response did not parse as strict JSON. Two identifier assertions in that round were ambiguous: the prompt said `record_id` while the source had both a numeric `id` and an HD `record_number`. Both choices were plausible; these were not treated as established model failures. The controlled round explicitly asks for `record_number`, retains the original exploratory results locally, and fixes the provider to avoid conflating routing with effort.

A separate vision smoke test transcribed a newly rendered, modern printed image of the same Latin text exactly (line whitespace normalized), preserving the abbreviations and Roman numerals. It took 1.87 s on Z.AI with low effort. This verifies basic image input and transcription, **not** damaged inscriptions, historical photographs, handwriting or layout recovery.

Total: 18 text requests and 1 image request, provider-reported cost **$0.001968615**. No automatic retries or other models were used. No private research files were sent. The temporary key file was removed after testing.

## Task policy implemented

- low: search assistance, extraction, metadata, formatting and OCR candidates.
- high: comparisons, counter-evidence, evidence verification and ordinary research analysis.
- max: planning and synthesis when explicitly selected for complex work.

This routing is a product policy, not a claim that the test proves high/max are necessary. Input parameters and resolved effort are retained in job model snapshots. A task can explicitly override its effort with `input.effort`. The standard OpenRouter price ceilings are $0.15 input / $0.50 output per million tokens; a project's configured rates can apply tighter ceilings. The current $0.075 / $0.25 launch discount is time-limited (the page lists September 9, 2026, 16:00 UTC for ZAI) and is not assumed in the default ceiling.

The recommended connection preset still uses each user's BYOK. The validation key was not turned into a shared site-wide billing credential. Model-generated results remain candidates. Exact quotes are checked against immutable source versions; interpretation quality and uncertain claims require researcher review.

## Sources and limitations

- [OpenRouter model and current pricing](https://openrouter.ai/z-ai/glm-5.3-flash)
- [OpenRouter reasoning options](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [Public model catalog](https://openrouter.ai/api/v1/models)
- [Aeneas source repository and LED licensing](https://github.com/google-deepmind/predictingthepast)

The source sample is CC-BY-SA-4.0, attributed to the Aeneas team / Google DeepMind (2025) and Epigraphic Database Heidelberg: Cowey, Feraudi-Gruénais, Gräf, Grieshaber, Klar and Osnabrügge (2019). The 40-record convenience fixture is not representative of the full corpus. This check did not run the Aeneas model or compare against expert adjudication.
