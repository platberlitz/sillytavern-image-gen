import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { readResponseTextWithLimit } = require('../server-plugin/response-limit.js');

test('relay response reader rejects oversized responses', async () => {
  await assert.rejects(
    readResponseTextWithLimit(new Response('12345', { headers: { 'content-length': '5' } }), 4),
    /too large/,
  );
  await assert.rejects(readResponseTextWithLimit(new Response('12345'), 4), /too large/);
});

test('relay response reader cancels declared oversized bodies', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() { cancelled = true; },
  });
  const response = new Response(body, { headers: { 'content-length': '5' } });
  await assert.rejects(readResponseTextWithLimit(response, 4), /too large/);
  assert.equal(cancelled, true);
});

test('relay response reader preserves bounded UTF-8 text', async () => {
  const text = await readResponseTextWithLimit(new Response('{"ok":"✓"}'), 64);
  assert.equal(text, '{"ok":"✓"}');
});
