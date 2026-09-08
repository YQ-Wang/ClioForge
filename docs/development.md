# Development

Follow the README to install dependencies, configure two local secrets and apply local migrations. Use Node.js 22.19+; the lockfile is committed for reproducible dependency resolution.

## Layout

| Directory               | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `app/`                  | Pages, research UI and authenticated HTTP routes                    |
| `components/`, `hooks/` | Shared interface components and browser state                       |
| `lib/`                  | Persistence, authentication, provenance, exports and research logic |
| `workers/research.ts`   | Background queue processing and scheduled work                      |
| `drizzle/`              | Append-only database migrations                                     |
| `tests/`                | Unit, authorization and local Worker integration tests              |
| `fixtures/`             | Small public research samples with provenance                       |
| `public/`               | Static assets and bundled third-party notices                       |
| `scripts/`              | Brand generation, comment checks and deployment validation          |

The Vite Cloudflare plugin runs the application and research worker together locally. Their D1, R2 and queue bindings must refer to the same local resources. Cron execution is not automatically simulated on its real schedule.

## Checks

`npm run check` runs the English-comment check, TypeScript and lint. `npm run format:check` enforces formatting. `npm test` includes local Worker integration tests; the emulator needs permission to open local ports. Tests use synthetic records and public fixtures, not live model services or production secrets.

The default suite restores a [frozen synthetic v1 backup](../tests/fixtures/README.md) as well as testing current export/import round trips. This compatibility regression runs in CI without private files. Setting `CANWOO_BACKUP_TEST_FILE=/absolute/path/to/backup.zip` adds a separate operator-provided archive check; never commit such an account export.

`npm run check:migrations -- origin/main` protects existing SQL from edits, removal or reordering and checks newly added migration numbers. Fetch the target branch first. `npm run audit:dependencies` queries npm's current advisory registry for production and development dependencies; it fails on moderate or higher advisories. See [maintenance](maintenance.md) for handling findings and releases.

Run `npm run build:cloudflare` and `npm run check:jobs` to validate both bundles. These commands do not deploy. Production deployments are manual and require explicit private configurations described in the deployment guide.

## Data and model boundaries

Preserve immutable source versions and the exact references attached to evidence. Changes to a source can require downstream review. Model output is a proposal until accepted, and execution state must remain distinguishable from scientific validity. Authorization, budget accounting and dependency checks belong in application code.

Internal `foliotrace` names are legacy storage and configuration identifiers. Renaming them casually can break existing sessions, backups or encrypted credentials.
