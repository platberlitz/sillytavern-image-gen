import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedInjectSource,
  compileInjectRegex,
  limitAutomaticInjectMatches,
  MAX_INJECT_REGEX_LENGTH,
  MAX_INJECT_SOURCE_LENGTH,
} from '../lib/inject-regex.js';

test('accepts normal inject patterns and bounds source text', () => {
  const patterns = [
    '<image>([\\s\\S]*?)<\\/image>',
    '<image>([\\s\\S]*?)<\\/image>|<pic\\s+prompt="([^"]+)"\\s*\\/?>',
    '^\\?(?:<image>)?([\\s\\S]*?)<\\/image>[?]$',
    '^(?=<image>)<image>(foo|bar)<\\/image>$',
    '^<image>([\\s\\S]{0,1000}?)<\\/image>$',
    '^(?:ab){2,4}$',
  ];

  for (const pattern of patterns) assert.doesNotThrow(() => compileInjectRegex(pattern), pattern);
  assert.equal(compileInjectRegex(patterns[0]).exec('<image>scene</image>')[1], 'scene');
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

test('rejects nullable nested repetition and bounded variants', () => {
  const unsafePatterns = [
    '^(a?a?)+$',
    '^(?:a?a?)+$',
    '^(a?){1000}a{1000}$',
    '^(a?){1000,1000}a{1000}$',
    '^(a?){1,1000}a{1000}$',
    '^(a?){1000,}a{1000}$',
    '^(a{0,1}){1000}a{1000}$',
    '^(a{0,1}){1000,1000}a{1000}$',
    '^((a?)?)+$',
    '^((a?){2})+$',
    '^(((a{0,1}){2,3})?)+$',
  ];

  for (const pattern of unsafePatterns) {
    assert.throws(() => compileInjectRegex(pattern), /(?:nested repetition|unsafe repeated groups)/, pattern);
  }
});

test('automatic inject processing has a single global match budget', () => {
  const matches = ['one', 'two', 'three'];
  assert.deepEqual(limitAutomaticInjectMatches(matches, true), ['one']);
  assert.deepEqual(limitAutomaticInjectMatches(matches, false), matches);
  assert.deepEqual(limitAutomaticInjectMatches(null, true), []);
});
