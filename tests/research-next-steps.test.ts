import assert from 'node:assert/strict';
import test from 'node:test';
import {
  researchNextSteps,
  nextStepQuestion,
} from '../lib/research-next-steps';
import { resultSchema } from '../lib/platform/types';

void test('saved bilingual reports offer only the next-evidence section, without mutating their citation basis', () => {
  for (const heading of ['Next evidence to seek', '下一步优先查证的材料']) {
    const result = resultSchema.parse({
      summary: `An interpretation [1].\n\n**${heading}**\n\n1. Read the reply [1].\n2. Consult the register.\n\n**Limits of this reading**\n\n1. Not evidence of absence.`,
    });
    const before = JSON.stringify(result);
    assert.deepEqual(researchNextSteps(result), [
      'Read the reply [1].',
      'Consult the register.',
    ]);
    assert.equal(JSON.stringify(result), before);
    const question = nextStepQuestion(researchNextSteps(result)[0], 'en');
    assert.match(question, /only the sources selected/);
    assert.match(question, /Do not claim to have searched/);
    assert.ok(question.startsWith('Read the reply.\n\n'));
    assert.doesNotMatch(question, /\[1\]/);
    assert.ok(question.length <= 2000);
  }
});

void test('ordinary numbered prose is never treated as a research plan and suggestions stay bounded', () => {
  assert.deepEqual(researchNextSteps(null), []);
  assert.deepEqual(
    researchNextSteps(
      resultSchema.parse({ summary: '1. A statement.\n2. Another claim.' }),
    ),
    [],
  );
  const result = resultSchema.parse({
    summary:
      '**下一步优先查证的材料**\n\n1. 同一条\n2. 同一条\n3. ' +
      'x'.repeat(1001) +
      '\n4. 第二条\n5. 第三条\n6. 第四条',
  });
  assert.deepEqual(researchNextSteps(result), ['同一条', '第二条', '第三条']);
  assert.match(nextStepQuestion('核查信件 [9]。', 'zh-CN'), /不要声称已经检索/);
});
