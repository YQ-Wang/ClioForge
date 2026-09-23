# Franklin metadata benchmark

Unmodified CSVs from Claire Rydell Arcenas and Caroline Winterer (2016), **Correspondence Network of Benjamin Franklin During the London Years: Letters, People, Places**, Stanford Digital Repository: <https://purl.stanford.edu/wb524rz2367>.

These dataset files are licensed **CC BY 4.0**, not under this repository's software license: <https://creativecommons.org/licenses/by/4.0/>. The source metadata expressly records the license at <https://purl.stanford.edu/wb524rz2367.mods>. Retain attribution when redistributing. Download URLs and SHA-256 hashes are in `manifest.json`; the snapshot was obtained on 2026-09-12. No linked Yale letter transcriptions or images are included or licensed by this fixture.

`expected.json` is ClioForge's derived descriptive audit, not a historical ground-truth annotation. Run `npm run research:benchmark` offline. It freezes 3,443 document records, date-string precision, missing endpoints and exact-versus-coauthor counting rules. A day-shaped date need not be an exact historical date. This dataset also contains items other than letters.

This benchmark tests reproducibility, scope and missing-data handling. It does not measure OCR, model quality, human review accuracy or research productivity. The synthetic extraction tests separately exercise application contracts.
