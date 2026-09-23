import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { replayComparison } from '../lib/platform/study-comparison';
const path = process.argv[2];
if (!path) throw new Error('Usage: npm run research:replay -- comparison.json');
if ((await fs.stat(path)).size > 20 * 1024 * 1024)
  throw new Error('Comparison exceeds 20 MiB.');
const bytes = await fs.readFile(path);
const report = replayComparison(JSON.parse(new TextDecoder().decode(bytes)));
console.log(
  JSON.stringify(
    {
      input_sha256: createHash('sha256').update(bytes).digest('hex'),
      ...report,
    },
    null,
    2,
  ),
);
