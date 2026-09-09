import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBibliography,
  exportBibliography,
  footnote,
} from '../lib/bibliography';
import type { BibliographyEntry } from '../lib/workbench-types';

const letter = {
  type: 'personal_communication',
  title: 'Abigail Adams to John Adams, 7 May 1776',
  author: [{ family: 'Adams', given: 'Abigail' }],
  issued: { 'date-parts': [[1776, 5, 7]] },
  URL: 'https://founders.archives.gov/documents/Adams/04-01-02-0259',
};

void test('standard CSL letters, maps and interviews survive import and citation export', () => {
  const imported = parseBibliography(
    JSON.stringify([
      letter,
      { ...letter, type: 'map' },
      { ...letter, type: 'interview' },
    ]),
    'csl',
  );
  assert.deepEqual(
    imported.map((entry) => entry.type),
    ['personal_communication', 'map', 'interview'],
  );
  const entry = { id: 'letter-1776', csl: imported[0] } as BibliographyEntry;
  const exported = parseBibliography(
    exportBibliography([entry], 'csl'),
    'csl',
  )[0];
  assert.equal(exported.type, 'personal_communication');
  assert.deepEqual(exported.author, letter.author);
  assert.deepEqual(exported.issued, letter.issued);
  assert.equal(exported.URL, letter.URL);
  assert.match(footnote(entry, '402'), /Abigail Adams/);
  assert.match(footnote(entry, '402'), /402/);
});

void test('legacy ClioForge letter records export a standard CSL type', () => {
  const entry = {
    id: 'old-letter',
    csl: { ...letter, type: 'letter' },
  } as BibliographyEntry;
  assert.equal(
    JSON.parse(exportBibliography([entry], 'csl'))[0].type,
    'personal_communication',
  );
  assert.equal(entry.csl.type, 'letter');
});

void test('an invalid bibliography row reports its position instead of a generic form error', () => {
  assert.throws(
    () =>
      parseBibliography(
        JSON.stringify([letter, { ...letter, type: 'not-a-type' }]),
        'csl',
      ),
    /第 2 条.*文献类型/,
  );
  assert.throws(
    () => parseBibliography(JSON.stringify([{ ...letter, title: '' }]), 'csl'),
    /第 1 条.*标题/,
  );
});
