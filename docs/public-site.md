# Bundled guides and source examples

ClioForge is self-hosted software. The root opens the current installation’s workspace/sign-in, not a hosted-service marketing page. `/guide` and `/research/adams` remain bundled learning resources. They do not require an upstream account or send users to an upstream installation.

Every page uses `noindex, nofollow`; the sitemap is empty and robots.txt advertises no sitemap. Crawling remains allowed so crawlers can observe indexing exclusions. These are indexing preferences, not access controls: authentication and project permissions protect research data. No canonical URL or www redirect points to the retired project domain.

## Adams example

The example is an editorial walkthrough, not a fresh autonomous run, peer-reviewed paper or measured productivity benchmark. It uses three selected paragraphs from the verified 1876 edition, independently of private pilot transcriptions. It does not publish private projects or overwrite their source versions.

- Rights and exclusions: [Adams source rights](adams-source-rights.md).
- Source manifest and original HTML checksum: `lib/adams-public-case.json`.
- Attributed excerpts and complete digital edition terms: `public/examples/adams/`.
- Reproduction: download the manifest’s source URL and run `python3 scripts/prepare-adams-case.py /path/to/34123-h.htm`, then format the JSON and review the diff. Compare the downloaded HTML checksum before accepting upstream changes.
- For research import, use the historical paragraph as source text and preserve attribution in source metadata; redistribution terms in the download are not historical evidence.

## Validation

Run `node --import tsx --test tests/public-site.test.ts tests/offline.test.ts`, then `node scripts/validate-public-site.mjs http://127.0.0.1:3000` against your running installation. This checks the unauthenticated workspace entrance, bundled guides, indexing exclusions and source checksums without sending model requests.

See [hosted service retirement](clioforge-transition.md) for the separate 410 endpoint. Do not submit a research installation or private project URLs to Search Console by default.
