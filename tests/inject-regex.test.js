import assert from 'node:assert/strict';
import test from 'node:test';

import { boundedInjectSource, compileInjectRegex, MAX_INJECT_REGEX_LENGTH, MAX_INJECT_SOURCE_LENGTH } from '../lib/inject-regex.js';

test('accepts normal inject patterns and bounds source text', () => {
  const regex = compileInjectRegex('<image>([\\s\\S]*?)<\\/image>');
  assert.equal(regex.exec('<image>scene</image>')[1], 'scene');
  assert.equal(boundedInjectSource('x'.repeat(MAX_INJECT_SOURCE_LENGTH + 10)).length, MAX_INJECT_SOURCE_LENGTH);
});

test('rejects oversized and common catastrophic regex structures', () => {
  assert.throws(() => compileInjectRegex('x'.repeat(MAX_INJECT_REGEX_LENGTH + 1)), /exceeds/);
  assert.throws(() => compileInjectRegex('(a+)+$'), /nested repetition/);
  assert.throws(() => compileInjectRegex('(.*)*$'), /nested repetition/);
  assert.throws(() => compileInjectRegex('(a|aa)+$'), /unsafe repeated groups/);
  assert.throws(() => compileInjectRegex('((a+))+$'), /unsafe repeated groups/);
  assert.throws(() => compileInjectRegex('(a)\\1'), /backreferences/);
});
