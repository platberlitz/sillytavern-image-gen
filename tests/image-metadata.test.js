import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  detectImageFormat,
  embedPngMetadata,
  MAX_PNG_METADATA_BYTES,
  parseGenerationParameters,
  readPngMetadata,
  sanitizeServerSubfolder,
} from '../lib/image-metadata.js';

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  return result;
}

function png(...chunks) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, ...chunks, chunk('IEND')];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output.buffer;
}

test('detects supported image signatures and rejects MIME-shaped non-images', () => {
  assert.equal(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).mime, 'image/jpeg');
  assert.equal(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff])), null);
  assert.equal(detectImageFormat(new TextEncoder().encode('<html>not an image</html>')), null);
  const avif = new Uint8Array(20);
  new DataView(avif.buffer).setUint32(0, avif.byteLength);
  avif.set(new TextEncoder().encode('ftypavif'), 4);
  assert.equal(detectImageFormat(avif).ext, 'avif');
});

test('does not invent absent diffusion parameters', () => {
  const parsed = parseGenerationParameters('mapped prompt\nNegative prompt: none\nSize: 1536x1024, Provider: gptimage, Model: gpt-image-1');
  assert.equal(parsed.prompt, 'mapped prompt');
  assert.equal(parsed.negativePrompt, 'none');
  assert.equal(parsed.width, 1536);
  assert.equal(parsed.height, 1024);
  assert.equal(parsed.provider, 'gptimage');
  assert.equal(parsed.steps, undefined);
  assert.equal(parsed.cfgScale, undefined);
  assert.equal(parsed.seed, undefined);
});

test('enforces metadata and final PNG size boundaries', () => {
  const source = png();
  assert.throws(() => embedPngMetadata(source, 'x'.repeat(MAX_PNG_METADATA_BYTES)), /metadata exceeds/);
});

test('writes UTF-8 iTXt, replaces stale parameters, and reads the newest value', async () => {
  const old = new TextEncoder().encode('parameters\0old prompt');
  const source = png(chunk('tEXt', old));
  const embedded = embedPngMetadata(source, '新しい prompt\nSteps: 20');
  assert.equal(await readPngMetadata(embedded), '新しい prompt\nSteps: 20');
  assert.equal(new TextDecoder().decode(embedded).includes('old prompt'), false);
  assert.equal(new TextDecoder().decode(embedded).includes('iTXt'), true);
});

test('reads bounded compressed zTXt and rejects decompression bombs', async () => {
  const compressed = deflateSync(Buffer.from('compressed prompt'));
  const data = new Uint8Array(10 + 2 + compressed.length);
  data.set(new TextEncoder().encode('parameters'));
  data[10] = 0;
  data[11] = 0;
  data.set(compressed, 12);
  assert.equal(await readPngMetadata(png(chunk('zTXt', data))), 'compressed prompt');

  const bomb = deflateSync(Buffer.alloc(MAX_PNG_METADATA_BYTES + 1, 65));
  const bombData = new Uint8Array(12 + bomb.length);
  bombData.set(new TextEncoder().encode('parameters'));
  bombData[10] = 0;
  bombData[11] = 0;
  bombData.set(bomb, 12);
  await assert.rejects(() => readPngMetadata(png(chunk('zTXt', bombData))), /exceeds/);
});

test('clamps imported parameters and sanitizes server subfolders', () => {
  const parsed = parseGenerationParameters('prompt\nSteps: 99999, CFG scale: -20, Seed: 999999999999, Size: 1x99999, Provider: local');
  assert.deepEqual({ steps: parsed.steps, cfg: parsed.cfgScale, seed: parsed.seed, width: parsed.width, height: parsed.height }, {
    steps: 150, cfg: 1, seed: 0xffffffff, width: 256, height: 2048,
  });
  assert.equal(sanitizeServerSubfolder('../bad/name\0'), '_bad_name_');
});
