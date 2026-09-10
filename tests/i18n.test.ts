import test from 'node:test';
import assert from 'node:assert/strict';
import { localeFromHeaders, resolveLocale, translate } from '../lib/i18n/core';

void test('saved language overrides browser preference; invalid cookies use supported preferences', () => {
  assert.equal(resolveLocale('en', 'zh-CN,en;q=0.8'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(resolveLocale('invalid', 'fr;q=1,zh;q=0.5,en-US;q=0.9'), 'en');
  assert.equal(resolveLocale(undefined, 'en;q=0,zh-TW;q=0.7'), 'zh-CN');
  assert.equal(resolveLocale(undefined, 'fr,en;q=invalid'), 'zh-CN');
  assert.equal(
    localeFromHeaders(
      new Headers({
        cookie: 'other=1; clioforge_locale=en',
        'accept-language': 'zh-CN',
      }),
    ),
    'en',
  );
});

void test('translation preserves source content and does not re-interpret interpolated braces', () => {
  assert.equal(translate('en', '模型与密钥'), 'Models and keys');
  assert.equal(translate('zh-CN', '模型与密钥'), '模型与密钥');
  assert.equal(
    translate('en', '港口史：1861 年的航运记录'),
    '港口史：1861 年的航运记录',
  );
  assert.equal(
    translate('en', '关联原件：{0}', { 0: '原件 {1} <script>' }),
    'Linked original: 原件 {1} <script>',
  );
  assert.equal(translate('en', '移除 {0}', { 0: undefined }), 'Remove ');
});
