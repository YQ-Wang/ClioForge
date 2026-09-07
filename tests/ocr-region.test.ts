import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBounds } from '../lib/ocr-region';
import { researchInput } from '../lib/inputs';

void test('OCR crops in original page coordinates before resizing, including edge rounding', () => {
  assert.deepEqual(
    cropBounds(2000, 3000, { x: 0.25, y: 0.5, width: 0.25, height: 0.5 }),
    { x: 500, y: 1500, width: 500, height: 1500 },
  );
  assert.deepEqual(cropBounds(2000, 3000), {
    x: 0,
    y: 0,
    width: 2000,
    height: 3000,
  });
  const edge = cropBounds(100, 100, {
    x: 0.9,
    y: 0.9,
    width: 0.1005,
    height: 0.1005,
  });
  assert.deepEqual(edge, { x: 90, y: 90, width: 10, height: 10 });
  assert.throws(() =>
    cropBounds(100, 100, { x: 0.9, y: 0, width: 0.5, height: 1 }),
  );
});

void test('OCR request retains bounded region provenance and rejects invalid regions', () => {
  const input = {
    id: crypto.randomUUID(),
    project_id: crypto.randomUUID(),
    model_id: crypto.randomUUID(),
    version_ids: [crypto.randomUUID()],
    kind: 'ocr',
    prompt: 'Read selected column',
    page: 1,
    region: { x: 0.2, y: 0.3, width: 0.25, height: 0.6 },
  };
  assert.deepEqual(researchInput.parse(input).region, input.region);
  assert.equal(
    researchInput.safeParse({ ...input, region: { ...input.region, width: 2 } })
      .success,
    false,
  );
});
