import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGptImagePayload,
  buildNanobananaPayload,
  extractProviderImageSource,
  getNanobananaApiUrl,
  imageResponseToDataUrl,
  materializeProviderImageSource,
} from '../lib/provider-adapters.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8Dwn4GBgYGJAQoAHgQCAZ7uX1EAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

test('GPT Image payload always sends the prompt in the OpenAI image schema', () => {
  assert.deepEqual(buildGptImagePayload({
    model: 'gpt-image-2',
    prompt: 'a lighthouse',
    negative: 'fog',
    size: '1024x1024',
    quality: 'high',
    outputFormat: 'webp',
    background: 'transparent',
    moderation: 'low',
  }), {
    model: 'gpt-image-2',
    prompt: 'a lighthouse\n\nAvoid in the image: fog',
    size: '1024x1024',
    n: 1,
    quality: 'high',
    output_format: 'webp',
    background: 'transparent',
    moderation: 'low',
  });
});

test('Nanobanana keeps native Gemini payloads for generateContent endpoints', () => {
  const parts = [{ text: 'Generate an image: a lighthouse' }];
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } };
  const safetySettings = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }];
  assert.deepEqual(buildNanobananaPayload({
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
    model: 'gemini',
    parts,
    generationConfig,
    safetySettings,
  }), {
    contents: [{ role: 'user', parts }],
    generationConfig,
    safetySettings,
  });
});

test('Nanobanana uses model and messages for OpenAI chat completions', () => {
  const payload = buildNanobananaPayload({
    endpointUrl: 'https://proxy.example/v1/chat/completions',
    model: 'gemini-3-pro-image',
    parts: [
      { inlineData: { mimeType: 'image/png', data: PNG_BASE64 } },
      { text: 'Generate an image: a lighthouse' },
    ],
    generationConfig: { imageConfig: { aspectRatio: '16:9', imageSize: '2K' } },
    safetySettings: [],
  });

  assert.equal(payload.model, 'gemini-3-pro-image');
  assert.equal(payload.contents, undefined);
  assert.deepEqual(payload.modalities, ['text', 'image']);
  assert.deepEqual(payload.image_config, { aspect_ratio: '16:9', image_size: '2K' });
  assert.equal(payload.messages[0].content[0].image_url.url, `data:image/png;base64,${PNG_BASE64}`);
  assert.equal(payload.messages[0].content[1].text, 'Generate an image: a lighthouse');
});

test('Nanobanana uses string content for text-only OpenAI requests', () => {
  const payload = buildNanobananaPayload({
    endpointUrl: 'https://proxy.example/v1/chat/completions',
    model: 'gemini-3-pro-image',
    parts: [{ text: 'Generate an image: a lighthouse' }],
    generationConfig: { imageConfig: { aspectRatio: '1:1' } },
    safetySettings: [],
  });

  assert.equal(payload.messages[0].content, 'Generate an image: a lighthouse');
});

test('Nanobanana does not put proxy credentials in chat completion URLs', () => {
  assert.equal(
    getNanobananaApiUrl('https://proxy.example/v1/chat/completions', 'gemini-image', 'canary-key'),
    'https://proxy.example/v1/chat/completions',
  );
  assert.equal(
    getNanobananaApiUrl('https://proxy.example', 'gemini-image', 'canary-key'),
    'https://proxy.example/v1beta/models/gemini-image:generateContent?key=canary-key',
  );
});

test('provider image extraction accepts OpenAI and Gemini response envelopes', () => {
  assert.equal(
    extractProviderImageSource({ choices: [{ message: { images: [{ image_url: { url: '/result.png' } }] } }] }),
    '/result.png',
  );
  assert.equal(
    extractProviderImageSource({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }] } }] }),
    `data:image/png;base64,${PNG_BASE64}`,
  );
});

test('direct image responses are bounded and converted to validated data URLs', async () => {
  const response = new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } });
  assert.equal(await imageResponseToDataUrl(response), `data:image/png;base64,${PNG_BASE64}`);

  const binaryResponse = new Response(PNG_BYTES, { headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(await imageResponseToDataUrl(binaryResponse), `data:image/png;base64,${PNG_BASE64}`);
});

test('same-origin result URLs are fetched with provider credentials and materialized', async () => {
  let captured;
  const source = await materializeProviderImageSource('../results/image.png', {
    requestUrl: 'https://proxy.example/v1/images/generations',
    responseUrl: 'https://proxy.example/v1/images/generations',
    headers: {
      Authorization: 'Bearer canary-key',
      'x-goog-api-key': 'google-canary',
      'X-Unsafe-Header': 'must-not-forward',
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(PNG_BYTES, { headers: { 'content-type': 'application/octet-stream; charset=binary' } });
    },
  });

  assert.equal(source, `data:image/png;base64,${PNG_BASE64}`);
  assert.equal(captured.url, 'https://proxy.example/v1/results/image.png');
  assert.deepEqual(captured.options.headers, {
    Authorization: 'Bearer canary-key',
    'x-goog-api-key': 'google-canary',
  });
  assert.equal(captured.options.redirect, 'error');
});

test('relative endpoints resolve results without forcing unauthenticated fetches', async () => {
  let fetched = false;
  const source = await materializeProviderImageSource('../results/image.png', {
    requestUrl: '/api/v1/images/generations',
    responseUrl: 'https://sillytavern.example/api/v1/images/generations',
    fetchImpl: async () => {
      fetched = true;
      throw new Error('must not fetch');
    },
  });

  assert.equal(source, 'https://sillytavern.example/api/v1/results/image.png');
  assert.equal(fetched, false);
});

test('authenticated result fetches fall back to browser loading after CORS failures', async () => {
  const source = await materializeProviderImageSource('/results/image.png', {
    requestUrl: 'https://proxy.example/v1/images/generations',
    headers: { Authorization: 'Bearer canary-key' },
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
  });

  assert.equal(source, 'https://proxy.example/results/image.png');
});

test('cross-origin result URLs never receive provider credentials', async () => {
  let fetched = false;
  const source = await materializeProviderImageSource('https://cdn.example/image.png', {
    requestUrl: 'https://proxy.example/v1/images/generations',
    headers: { Authorization: 'Bearer canary-key' },
    fetchImpl: async () => {
      fetched = true;
      throw new Error('must not fetch');
    },
  });

  assert.equal(source, 'https://cdn.example/image.png');
  assert.equal(fetched, false);
});

test('materialization reports authenticated URL and corrupt image failures', async () => {
  await assert.rejects(materializeProviderImageSource('/private.png', {
    requestUrl: 'https://proxy.example/v1/images/generations',
    headers: { Authorization: 'Bearer canary-key' },
    fetchImpl: async () => new Response('', { status: 401 }),
  }), /HTTP 401/);

  await assert.rejects(materializeProviderImageSource('/not-image', {
    requestUrl: 'https://proxy.example/v1/images/generations',
    headers: { Authorization: 'Bearer canary-key' },
    fetchImpl: async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }),
  }), /text\/html: <html>login<\/html>/);

  await assert.rejects(materializeProviderImageSource('data:image/png;base64,not-valid-base64', {
    requestUrl: 'https://proxy.example/v1/images/generations',
  }), /malformed|empty or incomplete/);
});
