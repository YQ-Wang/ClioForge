# ClioForge visual identity

ClioForge pairs the original gold-paper folding fan and Qiji 參伍 lettering with
Geist Sans, the open-source typeface developed by Vercel. The lowercase Latin
wordmark uses weight 600 and slightly tightened spacing (-0.02 em), matching the
interface's clear sans-serif character. The wordmark is outlined SVG, so it is
sharp at any size and does not flash or shift when fonts load.

Latin outlines are scaled uniformly and centered using their visible bounds,
including the descender. The Chinese lettering retains its original geometry.
Desktop and mobile lockups preserve both aspect ratios and leave space between
the fan, Latin and Chinese elements.

## Rebuilding the artwork

The source is the Geist Sans 1.800 Latin variable WOFF2 supplied by Google Fonts,
retained in `scripts/brand/Geist-Latin.woff2` for reproducible generation. Its
SHA-256 is `9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608`.
Copyright 2024 The Geist Project Authors. SIL OFL 1.1; see `scripts/brand/OFL.txt`
and `public/brand/Geist-OFL.txt`. Typeface use implies no Vercel affiliation.

With fontTools and Brotli installed:

```sh
python scripts/build-latin-wordmark.py
node scripts/build-brand.mjs
npx oxfmt lib/brand-art.ts lib/brand-latin.json
```

The first script writes the pinned font's glyph outlines to `lib/brand-latin.json`.
The second generates the shared geometry and public SVGs. Normal app builds need
neither Python nor access to a font service for the wordmark.

Public assets use `/brand/clioforge-mark.svg`, `/brand/clioforge-wordmark.svg`
and `/brand/clioforge-han-wordmark.svg`. Earlier paths remain available to cached
clients with their original licenses. See [assets](../public/brand/README.md),
[Geist](https://vercel.com/font) and [compatibility details](clioforge-transition.md).
