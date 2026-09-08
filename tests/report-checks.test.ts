import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReportChecks from '../app/report-checks';
import { I18nProvider } from '../lib/i18n/provider';

void test('failed checks remain visible while repeated passed checks are grouped behind details', () => {
  const html = renderToStaticMarkup(
    createElement(I18nProvider, {
      initialLocale: 'en',
      // oxlint-disable-next-line react/no-children-prop -- Node test files use typed createElement calls instead of JSX.
      children: createElement(ReportChecks, {
        sourceLabel: () => 'April 27 letter',
        checks: [
          {
            name: 'citation:source:1',
            passed: true,
            detail: 'Exact text and version verified',
          },
          {
            name: 'citation:source:1',
            passed: true,
            detail: 'Exact text and version verified',
          },
          {
            name: 'source_validation',
            passed: false,
            detail: 'Original source changed. <script>untrusted</script>',
          },
        ],
      }),
    }),
  );
  assert.match(html, /1 check needs review · 2 automatic checks passed/);
  assert.ok(
    html.indexOf('Original source changed') < html.indexOf('<details>'),
  );
  assert.match(html, /&lt;script&gt;untrusted&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /April 27 letter/);
  assert.match(html, /2 passed/);
  assert.equal((html.match(/<li>/g) || []).length, 1);
  assert.doesNotMatch(html, /<details open/);
});
