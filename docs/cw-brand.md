# Canwoo — folded paper identity

The September 6 refinement pairs an original gold-paper fan with original lowercase vector lettering. It takes the restraint and folded construction of a Ming-style fan as its starting point, without tracing a historical object or another company's logo.

## Mark and lettering

The display mark has eleven paper folds and ten internal ribs, excluding the two guard sticks. Each crown has a small angular rise, each fold has two flat planes, and a curved inner hem leaves the lower ribs exposed. Two guard sticks converge at a compact pivot. The fan's own structure carries the suggested W; there is no separately superimposed letter. The header and login signature use the same ten-rib structure with larger openings and stronger ribs. Only the tiny browser icon retains a nine-fold, eight-rib optical variant.

The wordmark is drawn as SVG paths, rather than ordinary text with a new font applied. It uses an open c, a single-storey a, a narrow n, a broad w with softened lower joins, and two slightly squared o counters. Spacing and proportions are fixed across operating systems. The surrounding bilingual brand has an accessible name; the internal artwork is decorative to assistive technology.

The Han brand label uses matching, original monoline vector lettering with open counters and rounded joins, enlarged to roughly the same visible height as the Latin wordmark. Interface text continues to use Geist and system Chinese sans-serif fallbacks. Historical source-reading typography is unchanged.

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

- `scripts/build-brand.mjs` generates shared path data and public SVG assets. Run it from the repository root, then format `lib/brand-art.ts`.
- `lib/brand-art.ts` is the generated geometry; `components/canwoo-brand.tsx` renders the shared accessible lockup.
- `app/brand.css` controls lockup sizing; `app/auth.css` scopes the login composition and controls.
- `public/brand/canwoo-mark.svg` and `canwoo-wordmark.svg` are reusable transparent SVGs.
- `public/icon.svg` and `public/favicon.svg` retain the eight-rib browser icon. Favicon revision: `atelier4`.

An isolated, logged-out Chrome validated desktop/mobile Chinese and English, light/dark appearance, password visibility, signup/reset mode changes, reset return, no horizontal overflow at 390px, equal form-control heights, and absence of browser exceptions. It did not submit credentials, create an account, or send reset email. Local screenshots and the validation script are in ignored `work/brand-atelier/`.

Production verification passed after deployment `7d622cc4-a3a0-4d05-9789-0ef869a7844a`: Google sign-in is visible, all four main controls measure 48px, the 390px view has no horizontal overflow, and favicon revision `atelier4` is present. TypeScript, lint and the Cloudflare build passed. This pass verified the authentication UI without submitting a login or reset request.

The follow-up alignment pass extends the straight a/n stems to the shared baseline and adjusts the w terminals. Raster measurements at 10x scale put all six letters between 4.0–4.3 at the top and 37.3–37.5 at the bottom in the 42-unit artwork. At 118px wide, the largest difference is under 0.2px. The 参伍 paths use a 2.35-unit stroke in a 64×32 viewBox and display at 47×26px.

The ten-rib follow-up was compared against the previous eight-rib compact mark at 36, 30 and 26px in light and dark. It preserves the outer silhouette, palette, pivot, strokes and lettering. The 16px favicon keeps eight ribs for clearer small-size rendering. Local comparison: `work/fan-ten/comparison.png`.

Deployed as `6a5c3013-3feb-41d2-a5b3-c193f91c0cc9`. The production header and login signature each contain exactly ten internal rib segments. TypeScript, lint and the production build passed; the isolated browser reported no page errors or horizontal overflow at 390px. Light/dark screenshots and counts are in `work/fan-ten/`.
