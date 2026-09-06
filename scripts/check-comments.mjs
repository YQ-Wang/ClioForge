import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

// Inspect comments, not bilingual UI strings, prompts or historical source text.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n');
const failures = [];
for (const file of new Set(files)) {
  if (!existsSync(file) || !/\.(?:[cm]?[jt]sx?|css|sql|jsonc|sh)$/.test(file))
    continue;
  const text = readFileSync(file, 'utf8');
  const comments = new Map();
  const add = (range) => comments.set(range.pos, range.end);
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      for (const range of [
        ...(ts.getLeadingCommentRanges(text, node.pos) || []),
        ...(ts.getTrailingCommentRanges(text, node.end) || []),
      ])
        add(range);
      if (ts.isJsxExpression(node) && !node.expression) {
        for (const match of node
          .getText(source)
          .matchAll(/\/\*[\s\S]*?\*\//g)) {
          const pos = node.getStart(source) + match.index;
          add({ pos, end: pos + match[0].length });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else {
    const pattern = file.endsWith('.sh')
      ? /^\s*#.*$/gm
      : /\/\*[\s\S]*?\*\/|^\s*\/\/.*$|^\s*--[^>].*$/gm;
    for (const match of text.matchAll(pattern))
      add({ pos: match.index, end: match.index + match[0].length });
  }
  for (const [start, end] of comments) {
    if (/\p{Script=Han}/u.test(text.slice(start, end)))
      failures.push(
        `${file}:${text.slice(0, start).split('\n').length}: Write code comments in English.`,
      );
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Code comments contain no Chinese text. Bilingual strings and source material are preserved.',
  );
