# Canwoo visual refinement · 2026-09-05

The interface uses a single sans-serif voice: bundled Geist for Latin UI and wordmark; Noto Sans SC SemiBold for the two Chinese brand characters. The former serif wordmark has been retired. The current mark is an original CW monogram, replacing the folded ribbons. See [CW brand details](cw-brand.md).

Design references: [OpenAI](https://openai.com/) and [Google Design](https://design.google/). Canwoo uses its own icon and open-source typefaces. The resulting direction favors neutral surfaces, clear text hierarchy, restrained blue action color, compact navigation, and consistent controls.

Changes cover the shared button/input primitives, page headings, sidebar selection, project cards, search fields, overview panels, account settings, login page, and both appearance modes. Research transcription keeps its reading typography and originals are not modified. Error and review status colors remain distinct. Controls preserve focus treatment, and reduced-motion users avoid decorative transitions.

An empty invitation error no longer renders a large “you are invited” card or simultaneously claims that there are no invitations. Feedback remains visible in a compact status message. Successful refresh clears stale errors; the invitation acceptance and verification rules are unchanged.

Validation: TypeScript, lint and Cloudflare production build; browser checks in English and Chinese, light and dark modes, project overview, account settings, login, desktop and mobile layouts. No new service or paid model calls were needed.

Published version: `b023a711-30ef-4d11-af91-ac0548e119de`. Live font, CSS, icon, and workspace assets match the build; appearance cookies render correctly and unauthenticated workspace access returns 401. Evidence: `work/saas-polish/live-checks.json`.
