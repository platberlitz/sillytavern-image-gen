import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  detectImageFormat,
  embedPngMetadata,
  embedPngMetadataBundle,
  MAX_PNG_METADATA_BYTES,
  parseGenerationParameters,
  parseStructuredGenerationMetadata,
  readPngMetadata,
  readPngMetadataBundle,
  sanitizeServerSubfolder,
  serializeStructuredGenerationMetadata,
  validateImageData,
} from '../lib/image-metadata.js';

const VALID_IMAGES = Object.freeze({
  avif: Buffer.from('AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACgAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgUBsAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwwMDAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAwbWRhdBIACghYAAa0BDQbhDIaGUeHhiGJpppmgAAAkD+bDGFLK02PUUVOpCA=', 'base64'),
  bmp: Buffer.from('Qk2OAAAAAAAAAIoAAAB8AAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAD/AAD/AAAAAAAA/0JHUnOPwvUoUbgeFR6F6wEzMzMTZmZmJmZmZgaZmZkJPQrXAyhcjzIAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAD/AA==', 'base64'),
  gif: Buffer.from('R0lGODlhAQABAPAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
  tiff: Buffer.from('SUkqAA4AAAD//wAAAAAPAAABAwABAAAAAQAAAAEBAwABAAAAAQAAAAIBAwADAAAAyAAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAAAoBAwABAAAAAQAAABEBBAABAAAACAAAABIBAwABAAAAAQAAABUBAwABAAAAAwAAABYBAwABAAAAAQAAABcBBAABAAAABgAAABwBAwABAAAAAQAAACkBAwACAAAAAAABAD4BBQACAAAA/gAAAD8BBQAGAAAAzgAAAAAAAAAQABAAEACF61EAAACAAMP1qAAAAAACzcxMAAAAAAHNzEwAAACAAM3MTAAAAAACj8L1AAAAABA3GqAAAAAAAiuHCgAAACAA', 'base64'),
  webp: Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=', 'base64'),
});

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
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, 1);
  headerView.setUint32(4, 1);
  header[8] = 8;
  header[9] = 6;
  const imageData = deflateSync(Uint8Array.from([0, 255, 255, 255, 255]));
  const parts = [signature, chunk('IHDR', header), ...chunks, chunk('IDAT', imageData), chunk('IEND')];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output.buffer;
}

function pngWithImageData({ width = 1, height = 1, raw = Uint8Array.from([0, 255, 255, 255, 255]) } = {}) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND')];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

test('detects real supported images and rejects header-only lookalikes', () => {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
  assert.equal(detectImageFormat(jpeg).mime, 'image/jpeg');
  assert.equal(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff])), null);
  const signatureAndEnd = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IEND')]);
  assert.equal(detectImageFormat(signatureAndEnd), null);
  assert.equal(detectImageFormat(jpeg.subarray(0, jpeg.length - 4)), null);
  assert.equal(detectImageFormat(new TextEncoder().encode('<html>not an image</html>')), null);
  for (const [ext, bytes] of Object.entries(VALID_IMAGES)) {
    assert.equal(detectImageFormat(bytes)?.ext, ext, ext);
  }
  const lookalikes = {
    avif: (() => {
      const bytes = new Uint8Array(20);
      new DataView(bytes.buffer).setUint32(0, bytes.byteLength);
      bytes.set(new TextEncoder().encode('ftypavif'), 4);
      return bytes;
    })(),
    bmp: VALID_IMAGES.bmp.subarray(0, 138),
    gif: new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;'),
    tiff: VALID_IMAGES.tiff.subarray(0, 8),
    webp: new TextEncoder().encode('RIFF\x04\x00\x00\x00WEBP'),
  };
  for (const [ext, bytes] of Object.entries(lookalikes)) {
    assert.equal(detectImageFormat(bytes), null, ext);
  }
});

test('rejects excessive dimensions and pixel counts before decoding image data', () => {
  assert.equal(detectImageFormat(pngWithImageData({ width: 16_385 })), null);
  assert.equal(detectImageFormat(pngWithImageData({ width: 10_000, height: 5_000 })), null);
});

test('validates PNG compressed scanlines with bounded decoder output', async () => {
  assert.equal((await validateImageData(pngWithImageData()))?.mime, 'image/png');
  assert.equal(await validateImageData(pngWithImageData({ raw: Uint8Array.from([0]) })), null);
  assert.equal(await validateImageData(pngWithImageData({ raw: Uint8Array.from([5, 0, 0, 0, 0]) })), null);

  const checksumCorrupt = pngWithImageData();
  const idatLength = new DataView(checksumCorrupt.buffer).getUint32(33);
  const idatDataStart = 41;
  checksumCorrupt[idatDataStart + idatLength - 1] ^= 0xff;
  const repairedIdat = chunk('IDAT', checksumCorrupt.subarray(idatDataStart, idatDataStart + idatLength));
  checksumCorrupt.set(repairedIdat, 33);
  assert.equal(await validateImageData(checksumCorrupt), null);
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

test('retains empty imported prompts by property presence', () => {
  const parsed = parseGenerationParameters('prompt\nNegative prompt: \nSteps: 20');
  assert.equal(Object.hasOwn(parsed, 'negativePrompt'), true);
  assert.equal(parsed.negativePrompt, '');
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
  assert.equal(parseGenerationParameters('prompt\nCFG scale: 0, Provider: proxy').cfgScale, 0);
  assert.equal(parseGenerationParameters('prompt\nCFG scale: 0, Provider: local').cfgScale, 1);
});

test('decodes standards-compliant zTXt text as Latin-1', async () => {
  const compressed = deflateSync(Buffer.from('café', 'latin1'));
  const data = new Uint8Array(12 + compressed.length);
  data.set(new TextEncoder().encode('parameters'));
  data[10] = 0;
  data[11] = 0;
  data.set(compressed, 12);

  assert.equal(await readPngMetadata(png(chunk('zTXt', data))), 'café');
});

test('round-trips versioned structured metadata without private or executable fields', async () => {
  const embedded = embedPngMetadataBundle(png(), {
    parameters: 'portrait\nSteps: 20, Provider: local',
    structured: {
      provider: 'local',
      effectiveRequest: { parameters: { model: 'safe-model', steps: 20 } },
      settings: {
        localType: 'comfyui',
        comfyScheduler: 'normal',
        comfyWorkflow: '{"api_key":"workflow-secret"}',
        comfyAllowLegacyInterrupt: true,
        localUrl: 'http://127.0.0.1:8188',
        apiKey: 'credential-secret',
        _backupProfiles: { secret: true },
      },
    },
  });

  const bundle = await readPngMetadataBundle(embedded);
  assert.equal(bundle.parameters, 'portrait\nSteps: 20, Provider: local');
  assert.deepEqual(bundle.structured, {
    version: 1,
    data: {
      provider: 'local',
      effectiveRequest: { parameters: { model: 'safe-model', steps: 20 } },
      settings: { localType: 'comfyui', comfyScheduler: 'normal' },
    },
  });
  assert.doesNotMatch(JSON.stringify(bundle.structured), /secret|workflow|localUrl|backup|allowLegacyInterrupt/i);

  const replacedParameters = embedPngMetadata(embedded, 'updated prompt');
  const replacedBundle = await readPngMetadataBundle(replacedParameters);
  assert.equal(replacedBundle.parameters, 'updated prompt');
  assert.deepEqual(replacedBundle.structured, bundle.structured);
});

test('structured metadata helpers enforce versions, bounds, and safe fields', () => {
  const serialized = serializeStructuredGenerationMetadata({
    provider: 'proxy',
    model: 'flux',
    proxyKey: 'secret',
    proxyComfyWorkflow: '{"executable":true}',
    _syncCacheId: 'owner',
    preview: 'data:image/png;base64,private',
  });
  assert.deepEqual(parseStructuredGenerationMetadata(serialized), {
    version: 1,
    data: { provider: 'proxy', model: 'flux' },
  });
  assert.throws(() => parseStructuredGenerationMetadata('{"version":2,"data":{}}'), /Unsupported/);
  assert.throws(() => parseStructuredGenerationMetadata('not-json'), /valid JSON/);
  assert.throws(() => embedPngMetadataBundle(png(), {
    parameters: 'x'.repeat(MAX_PNG_METADATA_BYTES),
    structured: { provider: 'local' },
  }), /metadata exceeds/);
});

test('structured proxy metadata preserves CFG zero', () => {
  const serialized = serializeStructuredGenerationMetadata({
    effectiveRequest: {
      provider: 'proxy',
      parameters: { cfgScale: 0 },
      settings: { provider: 'proxy', proxyCfg: 0 },
    },
  });
  assert.deepEqual(parseStructuredGenerationMetadata(serialized).data.effectiveRequest, {
    provider: 'proxy',
    parameters: { cfgScale: 0 },
    settings: { provider: 'proxy', proxyCfg: 0 },
  });
});

test('Custom and credential-bearing models do not cross metadata trust boundaries', () => {
  const custom = serializeStructuredGenerationMetadata({
    provider: 'custom',
    model: 'private-custom-model',
    effectiveRequest: { provider: 'custom', parameters: { model: 'private-effective-model', seed: 1 } },
  });
  assert.doesNotMatch(custom, /private-.*-model/);
  assert.deepEqual(parseStructuredGenerationMetadata(custom).data, {
    provider: 'custom',
    effectiveRequest: { provider: 'custom', parameters: { seed: 1 } },
  });

  const parsedCustom = parseGenerationParameters('prompt\nProvider: custom, Model: local-private-model');
  assert.equal(parsedCustom.model, undefined);
  const parsedSafe = parseGenerationParameters('prompt\nProvider: local, Model: checkpoint.safetensors');
  assert.equal(parsedSafe.model, 'checkpoint.safetensors');
  const parsedCredential = parseGenerationParameters('prompt\nProvider: local, Model: endpoint?auth_token=canary');
  assert.equal(parsedCredential.model, 'endpoint');

  const embedded = embedPngMetadata(png(), 'prompt\nProvider: Custom, Model: local-private-model');
  assert.doesNotMatch(new TextDecoder().decode(embedded), /local-private-model/);
});
