import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  normalizeImageSource,
  redactUrlCredentials,
  readResponseArrayBuffer,
  readResponseJson,
  readResponseText,
  replaceSelectOptions,
} from '../lib/security.js';

test('normalizeImageSource rejects executable and malformed sources', () => {
  assert.equal(normalizeImageSource('javascript:alert(1)'), null);
  assert.equal(normalizeImageSource('data:text/html;base64,PGgxPkJvb208L2gxPg=='), null);
  assert.equal(normalizeImageSource('x" onerror="alert(1)'), null);
  assert.equal(normalizeImageSource('https://example.com/image.png'), 'https://example.com/image.png');
  assert.equal(normalizeImageSource('/user/images/a.png', { baseUrl: 'https://example.com/chat' }), 'https://example.com/user/images/a.png');
});

test('normalizeImageSource accepts bounded raster data URLs', () => {
  const value = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(normalizeImageSource(value), value);
  assert.equal(normalizeImageSource(value, { maxInlineBytes: 2 }), null);
  assert.equal(normalizeImageSource('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), null);
  assert.equal(normalizeImageSource('data:image/jpg;base64,iVBORw0KGgo='), 'data:image/jpeg;base64,iVBORw0KGgo=');
  assert.equal(normalizeImageSource('data:image/png;base64,iVBORw0KGgo-\r\n'), 'data:image/png;base64,iVBORw0KGgo+');
});

test('normalizeImageSource can reject private provider destinations', () => {
  const options = { allowHttp: false, allowRelative: false, blockPrivateHosts: true };
  assert.equal(normalizeImageSource('https://127.0.0.1/image.png', options), null);
  assert.equal(normalizeImageSource('https://[::1]/image.png', options), null);
  assert.equal(normalizeImageSource('https://[::ffff:127.0.0.1]/image.png', options), null);
  assert.equal(normalizeImageSource('https://169.254.169.254/latest/meta-data', options), null);
  assert.equal(normalizeImageSource('https://images.example/result.png', options), 'https://images.example/result.png');
});

test('replaceSelectOptions treats backend names as text', () => {
  const dom = new JSDOM('<select></select>');
  const select = dom.window.document.querySelector('select');
  replaceSelectOptions(select, [{ value: 'bad" value', label: '<img src=x onerror=alert(1)>' }], 'bad" value');

  assert.equal(select.options.length, 1);
  assert.equal(select.options[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(select.querySelector('img'), null);
  assert.equal(select.value, 'bad" value');
});

test('readResponseArrayBuffer enforces declared and streamed limits', async () => {
  const declared = new Response('12345', { headers: { 'content-length': '5' } });
  await assert.rejects(readResponseArrayBuffer(declared, 4), /limit/);

  const streamed = new Response('12345');
  await assert.rejects(readResponseArrayBuffer(streamed, 4), /too large/);

  const accepted = await readResponseArrayBuffer(new Response('1234'), 4);
  assert.equal(new TextDecoder().decode(accepted), '1234');
});

test('readResponseArrayBuffer cancels declared oversized response bodies', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const response = new Response(body, { headers: { 'content-length': '5' } });

  await assert.rejects(readResponseArrayBuffer(response, 4), /limit/);
  assert.equal(cancelled, true);
});

test('bounded text and JSON readers reject oversized provider envelopes', async () => {
  assert.equal(await readResponseText(new Response('hello'), 5), 'hello');
  assert.deepEqual(await readResponseJson(new Response('{"ok":true}'), 20), { ok: true });
  await assert.rejects(readResponseJson(new Response('{"value":"oversized"}'), 8), /too large/);
});

test('URL credential redaction removes userinfo and sensitive query values', () => {
  const redacted = redactUrlCredentials('https://user:pass@example.com/v1?model=flux&api_key=canary&token=secret');
  assert.equal(redacted, 'https://example.com/v1?model=flux');
  assert.equal(
    redactUrlCredentials('/proxy?route=image&X-Amz-Security-Token=canary#token=fragment'),
    '/proxy?route=image',
  );
  assert.equal(redactUrlCredentials('//user:pass@example.com/image?api_key=canary'), '//example.com/image');
  assert.equal(redactUrlCredentials('not a URL?token=kept'), 'not a URL?token=kept');
});
