# Contributing to Canwoo

Start with a real research task: describe the material, the researcher's next action, and the obstacle. Small improvements to source fidelity, accessibility and recovery are more useful than adding unexplained controls.

## Working on a change

1. Open an issue for a substantial feature or architecture change. A focused bug fix can go straight to a pull request.
2. Follow the local setup in the README. Use a branch and synthetic or openly licensed fixtures, never a researcher's private collection.
3. Keep code comments and maintenance documentation in English. Preserve bilingual user-facing copy and the original language of source material.
4. Use the existing components, spacing and theme tokens. Check English and Chinese, light and dark themes, keyboard navigation and a narrow viewport for UI changes.
5. Add tests for meaningful behavior changes, especially access control, provenance, versioning, budgets and recovery. Do not call paid model APIs or send email in the automated suite.
6. Run `npm run format`, `npm run check`, `npm run format:check`, `npm test`, `npm run build:cloudflare` and `npm run check:jobs`.
7. Explain the problem, resulting behavior and verification in the pull request. Mention any untested integration or migration requirement.

Do not commit credentials, local deployment files, account exports or private screenshots. Do not rewrite existing migrations already used by deployments; add a new migration. Keep old document and citation formats readable or provide an explicit migration.

AI-assisted contributions are welcome. Contributors remain responsible for understanding the change, checking licenses and validating behavior. Do not submit generated research claims as verified source material.

By submitting a contribution, you agree that your contribution is distributed under this project's AGPL-3.0-only license, unless an existing file explicitly uses a different license. Retain upstream notices and obtain permission for any material you contribute.
