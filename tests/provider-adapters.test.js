import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGptImagePayload,
  buildNanobananaPayload,
  describeProviderImageSource,
  extractProviderErrorMessage,
  extractProviderImageSource,
  getGptImageApiUrl,
  getGptImageRouteRetryUrl,
  getNanobananaApiUrl,
  imageResponseToDataUrl,
  materializeProviderImageSource,
  requestGptImageWithRouteRetry,
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

test('GPT Image preserves exact proxy endpoints and expands only known base paths', () => {
  assert.equal(getGptImageApiUrl('/proxy/openai'), '/proxy/openai');
  assert.equal(getGptImageApiUrl('https://proxy.example/proxy/openai?route=image'), 'https://proxy.example/proxy/openai?route=image');
  assert.equal(getGptImageApiUrl('https://proxy.example/v1?token=canary'), 'https://proxy.example/v1/images/generations?token=canary');
  assert.equal(getGptImageApiUrl('/v1/#section'), '/v1/images/generations#section');
  assert.equal(getGptImageApiUrl('https://proxy.example/v1/chat/completions'), 'https://proxy.example/v1/images/generations');
});

test('GPT Image retries only wrapped missing-route errors at the standard image operation', () => {
  const missingRoute = {
    choices: [{ message: { content: '## **Proxy error (HTTP 404 Not Found)**\n\nThe requested proxy endpoint does not exist' } }],
  };
  assert.match(extractProviderErrorMessage(missingRoute), /requested proxy endpoint/);
  assert.equal(
    getGptImageRouteRetryUrl('/proxy/openai?token=canary#route', missingRoute),
    '/proxy/openai/images/generations?token=canary#route',
  );
  assert.equal(
    getGptImageRouteRetryUrl('/proxy/openai/images/generations', missingRoute),
    '',
  );
  assert.equal(
    getGptImageRouteRetryUrl('/proxy/openai', { choices: [{ message: { content: 'Ordinary assistant text' } }] }),
    '',
  );
  assert.equal(
    getGptImageRouteRetryUrl('/proxy/openai', { error: { message: 'HTTP 401 Unauthorized' } }),
    '',
  );
});

test('GPT Image route recovery retries once with the same request adapter', async () => {
  const calls = [];
  const result = await requestGptImageWithRouteRetry('/proxy/openai', async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return {
        data: { choices: [{ message: { content: 'Proxy error (HTTP 404 Not Found): The requested proxy endpoint does not exist' } }] },
      };
    }
    return { source: 'data:image/png;base64,recovered' };
  });

  assert.deepEqual(calls, ['/proxy/openai', '/proxy/openai/images/generations']);
  assert.equal(result.source, 'data:image/png;base64,recovered');

  const ordinaryCalls = [];
  await requestGptImageWithRouteRetry('/proxy/openai', async (url) => {
    ordinaryCalls.push(url);
    return { data: { choices: [{ message: { content: 'No image available' } }] } };
  });
  assert.deepEqual(ordinaryCalls, ['/proxy/openai']);
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

test('strict authenticated result retrieval preserves a safe actionable failure', async () => {
  const privateUrl = 'https://proxy.example/results/private.png?token=secret';
  await assert.rejects(materializeProviderImageSource('/results/private.png?token=secret', {
    requestUrl: 'https://proxy.example/proxy/openai',
    headers: { Authorization: 'Bearer canary-key' },
    fetchImpl: async () => { throw new TypeError(`Cannot reach ${privateUrl} (CORS proxy is disabled)`); },
    allowBrowserFallback: false,
  }), (error) => {
    assert.match(error.message, /Could not retrieve generated image from https:\/\/proxy\.example\/results\/private\.png/);
    assert.match(error.message, /CORS proxy is disabled/);
    assert.doesNotMatch(error.message, /token=secret/);
    return true;
  });

  assert.equal(
    describeProviderImageSource('https://cdn.example/image.png?token=secret#private'),
    'https://cdn.example/image.png',
  );
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
