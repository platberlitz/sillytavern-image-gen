import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { readResponseBufferWithLimit, readResponseTextWithLimit } = require('../server-plugin/response-limit.js');

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

test('relay response reader fails closed when streaming is unavailable', async () => {
  let buffered = false;
  const response = {
    headers: { get: () => null },
    body: null,
    async text() {
      buffered = true;
      return 'oversized';
    },
  };

  await assert.rejects(readResponseTextWithLimit(response, 4), /not streamable/);
  assert.equal(buffered, false);
});

test('relay image reader preserves bounded binary bytes', async () => {
  const bytes = Buffer.from([0, 1, 2, 255]);
  const result = await readResponseBufferWithLimit(new Response(bytes), 4);
  assert.deepEqual(result, bytes);
  await assert.rejects(readResponseBufferWithLimit(new Response(bytes), 3), /too large/);
});
