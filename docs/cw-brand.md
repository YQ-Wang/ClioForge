# Canwoo — folded paper identity

The current identity pairs an original gold-paper fan with lowercase Newsreader lettering and Qiji Chinese lettering. The fan takes the restraint and folded construction of a Ming-style fan as its starting point, without tracing a historical object or another company's logo.

## Mark and lettering

The display mark has eleven paper folds and ten internal ribs, excluding the two guard sticks. Each crown has a small angular rise, each fold has two flat planes, and a curved inner hem leaves the lower ribs exposed. Two guard sticks converge at a compact pivot. The fan's own structure carries the suggested W; there is no separately superimposed letter. The header and login signature use the same ten-rib structure with larger openings and stronger ribs. Only the tiny browser icon retains a nine-fold, eight-rib optical variant.

The lowercase `canwoo` wordmark uses actual Newsreader glyph outlines at weight 450 and optical size 48. HarfBuzz applies the font's native kerning. The complete shaped word is scaled uniformly, preserving letter proportions and spacing, with visible ink spanning y=3 to y=29 in a 32-unit-high viewBox to align with the Qiji lettering. The fixed SVG geometry avoids font requests and differences in browser shaping. The surrounding bilingual brand has an accessible name; the internal artwork is decorative to assistive technology.

The Latin source is `ofl/newsreader/Newsreader[opsz,wght].ttf` from [google/fonts revision 8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/newsreader). Its SHA-256 is `8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1`. Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader); the SIL OFL 1.1 notice is retained in `public/brand/Newsreader-OFL.txt`.

The Chinese brand label displays 參伍 using glyph outlines from the open-source Qiji font. Each outline is uniformly scaled and optically positioned as fixed SVG artwork beside the Latin lettering. The traditional display spelling was selected after reviewing the Qiji preview. No full Chinese font is loaded. Interface text continues to use Geist and system Chinese sans-serif fallbacks. Historical source-reading typography is unchanged.

The source is the `qiji.ttf` asset from [Qiji release 0.0.4](https://github.com/LingDong-/qiji-font/releases/tag/0.0.4), copyright 2020 Lingdong Huang. The selected glyphs are `glyph3509` for 參 and `glyph3966` for 伍. Its SIL OFL 1.1 notice is retained in `public/brand/Qiji-OFL.txt`. The earlier Ma Shan Zheng license remains in `public/brand/MaShanZheng-OFL.txt` for previously distributed assets.

Light gold is `#9b7a3f`; dark gold is `#d3b783`. There are no gradients, paper textures, metallic filters or animation. Small marks omit the display artwork's subtle fold shading.

## Login page

A pale paper-colored introduction sits beside a clear login form. Ink green, warm neutral surfaces and the gold fan create a coherent entrance without changing the research workspace's action colors. The introduction uses a pale generated canal-town illustration inspired by historical pictorial maps. The fan and caption form a small signature above the heading, in the clean upper negative space. On mobile the image and fan are quieter, and the secondary research promise is hidden. Both languages and system light/dark appearance are supported.

Google, email and password controls share a 48px height. Password visibility can be toggled with a named, keyboard-focusable button. Switching account modes hides the password again. Authentication requests and permissions are unchanged.

## Sources of inspiration

- [Google Sans design history](https://design.google/library/google-sans-flex-font): distinct optical requirements for brand lettering and small interface text.
- [OpenAI's design guidelines](https://openai.com/brand/): careful relationships between geometry, letterforms and the overall identity.
- [Vercel's Geist typography](https://vercel.com/geist/typography): consistent size, weight, line height and spacing in the product interface.

These references inform the design approach. Their logos and proprietary letter outlines are not included in the new mark or wordmark.

## Files and validation

- `scripts/build-brand.mjs` generates fan path data and public fan SVG assets. Run it from the repository root, then format `lib/brand-art.ts`; it does not generate either wordmark.
- `lib/brand-art.ts` is the generated fan geometry; `components/canwoo-brand.tsx` renders the shared accessible lockup.
- `scripts/build-latin-wordmark.py` takes the local upstream Newsreader TTF, verifies its SHA-256, and uses fontTools and uharfbuzz to generate `lib/brand-latin.json` and `public/brand/canwoo-wordmark.svg`.
- `scripts/build-han-wordmark.py` takes the local upstream Qiji `qiji.ttf` release asset, verifies its SHA-256, and uses fontTools to generate `lib/brand-han.json` and `public/brand/canwoo-han-wordmark.svg`.
- `app/brand.css` controls lockup sizing; `app/auth.css` scopes the login composition and controls.
- `public/brand/canwoo-mark.svg` and `canwoo-wordmark.svg` are reusable transparent SVGs.
- `public/icon.svg` and `public/favicon.svg` retain the eight-rib browser icon. Favicon revision: `atelier4`.

An isolated, logged-out Chrome validated desktop/mobile Chinese and English, light/dark appearance, password visibility, signup/reset mode changes, reset return, no horizontal overflow at 390px, equal form-control heights, and absence of browser exceptions. It did not submit credentials, create an account, or send reset email. Local screenshots and the validation script are in ignored `work/brand-atelier/`.

Production verification passed after deployment `7d622cc4-a3a0-4d05-9789-0ef869a7844a`: Google sign-in is visible, all four main controls measure 48px, the 390px view has no horizontal overflow, and favicon revision `atelier4` is present. TypeScript, lint and the Cloudflare build passed. This pass verified the authentication UI without submitting a login or reset request.

An earlier alignment pass adjusted the original monoline Latin and Chinese artwork. Those wordmarks have since been replaced with the Newsreader and Qiji outlines described above. The validation records in this section concern those earlier wordmark and fan revisions, not the current typeface-derived lettering.

The ten-rib follow-up was compared against the previous eight-rib compact mark at 36, 30 and 26px in light and dark. It preserves the outer silhouette, palette, pivot, strokes and lettering. The 16px favicon keeps eight ribs for clearer small-size rendering. Local comparison: `work/fan-ten/comparison.png`.

Deployed as `6a5c3013-3feb-41d2-a5b3-c193f91c0cc9`. The production header and login signature each contain exactly ten internal rib segments. TypeScript, lint and the production build passed; the isolated browser reported no page errors or horizontal overflow at 390px. Light/dark screenshots and counts are in `work/fan-ten/`.
