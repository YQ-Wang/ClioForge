# Public site and search discovery

The public entrance, `/research/adams` and `/guide` render readable content and page metadata on the server. The existing workspace remains at query-based URLs; `/?view=projects` opens sign-in or the project list. Signed-in visitors to `/` retain their workspace entrance.

The sitemap lists only these three public pages. Workspace query URLs use `noindex, nofollow` and private, non-storing cache headers. This is a search-discovery measure, not access control: existing authentication and project permissions still protect research data. Public pages have canonical URLs and social sharing metadata. Chinese and English use the existing language preference; separate language URLs and `hreflang` are not implemented.

## Adams example

The public example is an editorial walkthrough, not a fresh autonomous run, peer-reviewed paper or measured productivity benchmark. It uses three selected paragraphs from the verified 1876 edition, independently of the private pilot's Founders Online transcriptions. It does not publish private projects or overwrite their source versions.

- Rights and exclusions: [Adams source rights](adams-source-rights.md).
- Source manifest and original HTML checksum: `lib/adams-public-case.json`.
- Attributed, freely downloadable excerpts and complete digital edition terms: `public/examples/adams/`.
- Reproduction: download the manifest's source URL and run `python3 scripts/prepare-adams-case.py /path/to/34123-h.htm`, then format the JSON and review the diff. Compare the downloaded HTML checksum before accepting upstream changes.
- For research import, use the historical paragraph as source text and preserve attribution in source metadata; the download also contains redistribution terms, which are not historical evidence.

## Validation

Run `npx tsx --test tests/public-site.test.ts tests/auth-return.test.ts`, followed by `node scripts/validate-public-site.mjs http://127.0.0.1:3000` against a running development server. The second command checks actual unauthenticated HTML, metadata, private query routes, sitemap and downloadable artifact checksums. Repeat it against the deployed origin after publication.

## Google Search Console

The September 8 implementation passed the 288-test regression suite and eight focused source, routing and authentication checks after the final entrance refinement. Read-only HTTP checks verified server-rendered content and metadata, query-route indexing exclusions, the sitemap and download checksums. Chrome checks covered both languages, desktop and 390px layouts, dark mode, public-page navigation, the sign-in entrance and the existing signed-in project list. The new public walkthrough itself did not invoke a model.

After deployment, verify the `clioforge.com` domain property in [Search Console](https://search.google.com/search-console). Copy the exact TXT record provided by Google to Cloudflare DNS, verify ownership, and submit `https://clioforge.com/sitemap.xml`. Inspect the three public URLs and request indexing where appropriate. Do not submit private project URLs. DNS verification and sitemap submission require the actual account-issued values; do not invent them.

Track indexed pages and real search queries before adding more public cases. Each case needs reusable sources and an honest account of evidence, limitations and the work actually done. Sitemap submission and indexing requests do not guarantee indexing or ranking; see [Google's recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
