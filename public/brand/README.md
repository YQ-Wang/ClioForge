# Canwoo brand assets

The current bilingual wordmark uses self-hosted Google Sans Flex (weight 500) for `canwoo` and a self-hosted Noto Sans SC SemiBold subset for `参伍`. The Latin subset is 2,768 bytes; the Han subset is 2,080 bytes. The Chinese label is secondary at 14px on desktop and 13px on mobile. The rest of the UI continues to use Geist with system Chinese sans-serif fallbacks; source transcription retains its reading typeface.

- Google Sans Flex: https://design.google/library/google-sans-flex-font — SIL OFL 1.1, see GoogleSans-OFL.txt. The wordmark subset is served locally as canwoo-google-sans.ttf. The official Google Fonts download manifest is retained in work/brand-soft/font-manifest.json.
- Geist: https://github.com/google/fonts/tree/main/ofl/geist — SIL OFL 1.1, see Geist-OFL.txt. Bundled by next/font at build time.
- Noto Sans SC: https://github.com/google/fonts/tree/main/ofl/notosanssc — SIL OFL 1.1, see NotoSansSC-OFL.txt. The two-character weight-600 subset is served locally as canwoo-han-sans.ttf.
- The original mark uses two open curves to form a soft W, with a viewBox of `6 9 52 44`. Authored in components/canwoo-brand.tsx; transparent vector in canwoo-mark.svg; matching blue app icons in public/icon.svg and public/favicon.svg. It replaces the earlier angular CW monogram.

Earlier assets, including Manrope and Noto Serif subsets, remain available for cached clients with their original licenses; current brand styles no longer request those fonts. Visitors make no Google Fonts requests for the brand or UI. Font attribution identifies the source of the typeface, not a brand affiliation.
