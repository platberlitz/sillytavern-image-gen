import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import {
  clearGalleryRepositoryStorage,
  GalleryRepository,
  GALLERY_MANIFEST_VERSION,
} from '../lib/gallery-repository.js';

const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function createRepository(options = {}) {
  let nextId = 0;
  const revoked = [];
  const repository = new GalleryRepository({
    indexedDB: options.indexedDB || new IDBFactory(),
    storage: options.storage || new MemoryStorage(),
    dbName: options.dbName || `gallery-${Math.random()}`,
    createId: options.createId || (() => `entry-${++nextId}`),
    createObjectURL: options.createObjectURL || (blob => `blob:test/${blob.size}/${++nextId}`),
    revokeObjectURL: options.revokeObjectURL || (url => revoked.push(url)),
    maxEntries: options.maxEntries,
  });
  return { repository, revoked };
}

const assetFor = async entry => ({
  blob: new Blob([PNG_BYTES], { type: 'image/png' }),
  fallbackUrl: entry.url,
});

async function getStoredAssets(indexedDB, dbName) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = db.transaction('assets', 'readonly');
    const request = transaction.objectStore('assets').getAll();
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function putStoredAsset(indexedDB, dbName, asset) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(asset);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

test('stores image bytes in IndexedDB and only metadata in localStorage', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const { repository } = createRepository({ storage, indexedDB, dbName: 'durable-gallery' });
  await repository.init(assetFor);

  const added = await repository.add({
    prompt: 'portrait',
    date: 10,
    url: 'data:image/png;base64,PRIVATE_IMAGE_BYTES',
    sourceUrl: 'https://signed.example/image.png?token=secret',
    bytes: 'image bytes',
    sourceChatId: 'chat-123',
    sourceMessageIndex: 7,
    sourceMessageId: 'message-456',
    sourceMessageSignature: 'signature-789',
    metadataSettings: {
      apiKey: 'gallery-secret',
      proxyKey: 'proxy-secret',
      localRefImage: 'data:image/png;base64,PRIVATE_REFERENCE',
      steps: 20,
      structuredMetadata: { graph: { executable: 'x'.repeat(100_000) } },
    },
    effectiveRequest: {
      provider: 'local',
      parameters: { model: 'safe-model', graph: { executable: true }, comfySourceUrl: 'https://private.example/output.png' },
      settings: {
        model: 'safe-model',
        comfyWorkflow: '{"api_key":"workflow-canary"}',
        comfyAllowLegacyInterrupt: true,
        _backupProfiles: { secret: 'backup-canary' },
      },
    },
  }, assetFor);

  assert.equal(added.ephemeral, false);
  const rawManifest = storage.getItem('qig_gallery_manifest_v2');
  const manifest = JSON.parse(rawManifest);
  assert.equal(manifest.version, GALLERY_MANIFEST_VERSION);
  assert.equal(manifest.entries.length, 1);
  assert.doesNotMatch(rawManifest, /PRIVATE_IMAGE_BYTES|PRIVATE_REFERENCE|gallery-secret|proxy-secret|signed\.example|private\.example|token=secret|image bytes|workflow-canary|backup-canary|comfyWorkflow|allowLegacyInterrupt|executable|structuredMetadata|comfySourceUrl/);
  assert.ok(rawManifest.length < 20_000);
  assert.equal(manifest.entries[0].metadataSettings.steps, 20);
  assert.deepEqual({
    sourceChatId: manifest.entries[0].sourceChatId,
    sourceMessageIndex: manifest.entries[0].sourceMessageIndex,
    sourceMessageId: manifest.entries[0].sourceMessageId,
    sourceMessageSignature: manifest.entries[0].sourceMessageSignature,
  }, {
    sourceChatId: 'chat-123',
    sourceMessageIndex: 7,
    sourceMessageId: 'message-456',
    sourceMessageSignature: 'signature-789',
  });
  const storedAssets = await getStoredAssets(indexedDB, 'durable-gallery');
  assert.equal(storedAssets[0].metadata.prompt, 'portrait');
  assert.doesNotMatch(JSON.stringify(storedAssets[0].metadata), /workflow-canary|backup-canary|comfyWorkflow|allowLegacyInterrupt/);

  await repository.close();
  const { repository: reloaded } = createRepository({ storage, indexedDB, dbName: 'durable-gallery' });
  const entries = await reloaded.init(assetFor);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].prompt, 'portrait');
  assert.equal(entries[0].sourceChatId, 'chat-123');
  assert.equal(entries[0].sourceMessageIndex, 7);
  assert.equal(entries[0].sourceMessageId, 'message-456');
  assert.equal(entries[0].sourceMessageSignature, 'signature-789');
  assert.match(entries[0].url, /^blob:test\//);
  await reloaded.close();
});

test('durable gallery round-trips reverse-proxy CFG zero', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'proxy-cfg-zero';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({
    prompt: 'unguided proxy image',
    provider: 'proxy',
    date: 1,
    url: 'https://example.com/image.png',
    metadataSettings: { provider: 'proxy', cfgScale: 0 },
    effectiveRequest: {
      provider: 'proxy',
      parameters: { cfgScale: 0 },
      settings: { provider: 'proxy', proxyCfg: 0 },
    },
  }, assetFor);
  await original.close();

  const manifestEntry = JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries[0];
  assert.equal(manifestEntry.metadataSettings.cfgScale, 0);
  assert.equal(manifestEntry.effectiveRequest.parameters.cfgScale, 0);
  assert.equal(manifestEntry.effectiveRequest.settings.proxyCfg, 0);

  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  const [entry] = await reloaded.init(assetFor);
  assert.equal(entry.metadataSettings.cfgScale, 0);
  assert.equal(entry.effectiveRequest.parameters.cfgScale, 0);
  assert.equal(entry.effectiveRequest.settings.proxyCfg, 0);
  await reloaded.close();
});

test('serializes batch writes in stable order regardless of asset completion order', async () => {
  const { repository } = createRepository();
  await repository.init(assetFor);

  const entries = [
    { prompt: 'first', date: 30, url: 'https://example.com/1.png' },
    { prompt: 'second', date: 20, url: 'https://example.com/2.png' },
    { prompt: 'third', date: 10, url: 'https://example.com/3.png' },
  ];
  const delays = new Map([['first', 20], ['second', 1], ['third', 10]]);
  await repository.addMany(entries, entry => new Promise(resolve => {
    setTimeout(() => resolve({ blob: new Blob([PNG_BYTES]), fallbackUrl: entry.url }), delays.get(entry.prompt));
  }));

  assert.deepEqual(repository.list().map(entry => entry.prompt), ['first', 'second', 'third']);
  await repository.close();
});

test('clear invalidates an in-flight write so it cannot resurrect the gallery', async () => {
  const { repository } = createRepository();
  await repository.init(assetFor);

  let releaseAsset;
  const pending = repository.add(
    { prompt: 'late', date: 1, url: 'https://example.com/late.png' },
    () => new Promise(resolve => { releaseAsset = resolve; }),
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  const clearing = repository.clear();
  releaseAsset({ blob: new Blob([PNG_BYTES]), fallbackUrl: 'https://example.com/late.png' });

  await Promise.all([pending, clearing]);
  assert.deepEqual(repository.list(), []);
  await repository.close();
});

test('migrates legacy localStorage only after all image bytes are durable', async () => {
  const legacy = [
    { prompt: 'newer', date: 2, url: 'data:image/png;base64,AAA' },
    { prompt: 'older', date: 1, url: 'data:image/png;base64,BBB' },
  ];
  const storage = new MemoryStorage({ qig_gallery: JSON.stringify(legacy) });
  const { repository } = createRepository({ storage });
  const entries = await repository.init(assetFor);

  assert.deepEqual(entries.map(entry => entry.prompt), ['newer', 'older']);
  assert.equal(storage.getItem('qig_gallery'), null);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).legacyMigrated, true);
  await repository.close();
});

test('retains legacy storage and marks entries ephemeral when migration cannot finish', async () => {
  const legacy = [{ prompt: 'remote', date: 1, url: 'https://expired.example/image.png' }];
  const storage = new MemoryStorage({ qig_gallery: JSON.stringify(legacy) });
  const { repository } = createRepository({ storage });
  const entries = await repository.init(async entry => ({
    fallbackUrl: entry.url,
    error: 'remote image expired',
  }));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].ephemeral, true);
  assert.equal(entries[0].persistenceError, 'remote image expired');
  assert.notEqual(storage.getItem('qig_gallery'), null);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), null);
  await repository.close();
});

test('keeps the visible gallery intact when the manifest cannot be written', async () => {
  class FailingManifestStorage extends MemoryStorage {
    setItem(key, value) {
      if (key === 'qig_gallery_manifest_v2') throw new Error('quota exceeded');
      super.setItem(key, value);
    }
  }

  const storage = new FailingManifestStorage();
  const { repository } = createRepository({ storage });
  await repository.init(assetFor);
  const added = await repository.add(
    { prompt: 'ephemeral', date: 1, url: 'https://example.com/image.png' },
    assetFor,
  );

  assert.equal(added.ephemeral, true);
  assert.match(added.persistenceError, /quota exceeded/);
  assert.equal(repository.list().length, 1);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), null);
  await repository.close();
});

test('restores legacy migration when runtime materialization fails', async () => {
  const legacy = [{ prompt: 'recoverable', date: 1, url: 'data:image/png;base64,AAA' }];
  const storage = new MemoryStorage({ qig_gallery: JSON.stringify(legacy) });
  const indexedDB = new IDBFactory();
  const { repository } = createRepository({
    storage,
    indexedDB,
    dbName: 'recoverable-migration',
    createObjectURL: () => { throw new Error('object URL unavailable'); },
  });
  const entries = await repository.init(assetFor);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].ephemeral, true);
  assert.notEqual(storage.getItem('qig_gallery'), null);
  await repository.close();

  const { repository: retry } = createRepository({ storage, indexedDB, dbName: 'recoverable-migration' });
  const retried = await retry.init(assetFor);
  assert.equal(retried.length, 1);
  assert.equal(retried[0].ephemeral, false);
  assert.equal(storage.getItem('qig_gallery'), null);
  await retry.close();
});

test('detects cross-tab manifest conflicts instead of losing committed entries', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const first = createRepository({
    storage,
    indexedDB,
    dbName: 'shared-gallery',
    createId: () => 'first-entry',
  }).repository;
  const second = createRepository({
    storage,
    indexedDB,
    dbName: 'shared-gallery',
    createId: () => 'second-entry',
  }).repository;
  await Promise.all([first.init(assetFor), second.init(assetFor)]);

  const committed = await first.add({ prompt: 'committed', date: 2, url: 'https://example.com/1.png' }, assetFor);
  const conflicted = await second.add({ prompt: 'conflicted', date: 1, url: 'https://example.com/2.png' }, assetFor);
  assert.equal(committed.ephemeral, false);
  assert.equal(conflicted.ephemeral, true);
  assert.match(conflicted.persistenceError, /another tab/);

  await Promise.all([first.close(), second.close()]);
  const reloaded = createRepository({ storage, indexedDB, dbName: 'shared-gallery' }).repository;
  const entries = await reloaded.init(assetFor);
  assert.deepEqual(entries.map(entry => entry.prompt), ['committed']);
  await reloaded.close();
});

test('does not delete assets when an empty clear manifest cannot be written', async () => {
  class ClearFailingStorage extends MemoryStorage {
    setItem(key, value) {
      if (key === 'qig_gallery_manifest_v2' && JSON.parse(value).cleared === true) {
        throw new Error('clear manifest blocked');
      }
      super.setItem(key, value);
    }
  }

  const storage = new ClearFailingStorage();
  const indexedDB = new IDBFactory();
  const { repository } = createRepository({ storage, indexedDB, dbName: 'failed-clear' });
  await repository.init(assetFor);
  await repository.add({ prompt: 'keep me', date: 1, url: 'https://example.com/image.png' }, assetFor);

  await assert.rejects(() => repository.clear(), /clear manifest blocked/);
  assert.deepEqual(repository.list().map(entry => entry.prompt), ['keep me']);
  await repository.close();

  const reloaded = createRepository({ storage, indexedDB, dbName: 'failed-clear' }).repository;
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.prompt), ['keep me']);
  await reloaded.close();
});

test('rolls back durable writes when runtime URL materialization fails', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  let objectUrlCalls = 0;
  const { repository } = createRepository({
    storage,
    indexedDB,
    dbName: 'failed-materialization',
    createObjectURL(blob) {
      objectUrlCalls += 1;
      if (objectUrlCalls === 2) throw new Error('object URL failed');
      return `blob:test/${blob.size}/${objectUrlCalls}`;
    },
  });
  await repository.init(assetFor);
  const results = await repository.addMany([
    { prompt: 'first', date: 2, url: 'https://example.com/1.png' },
    { prompt: 'second', date: 1, url: 'https://example.com/2.png' },
  ], assetFor);

  assert.equal(results.every(entry => entry.ephemeral), true);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2') || '{"entries":[]}').entries.length, 0);
  await repository.close();

  const reloaded = createRepository({ storage, indexedDB, dbName: 'failed-materialization' }).repository;
  assert.deepEqual(await reloaded.init(assetFor), []);
  await reloaded.close();
});

test('recovers durable entries and repairs a malformed or unsupported manifest', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'manifest-recovery';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'recover me', date: 4, url: 'https://example.com/recover.png' }, assetFor);
  await original.close();

  for (const brokenManifest of ['{not-json', JSON.stringify({ version: 999, revision: 12, entries: [] })]) {
    storage.setItem('qig_gallery_manifest_v2', brokenManifest);
    const recoveredRepository = createRepository({ storage, indexedDB, dbName }).repository;
    const recovered = await recoveredRepository.init(assetFor);
    assert.deepEqual(recovered.map(entry => entry.prompt), ['recover me']);
    const repaired = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
    assert.equal(repaired.version, GALLERY_MANIFEST_VERSION);
    assert.equal(repaired.entries.length, 1);
    await recoveredRepository.close();
  }
});

test('recovers an asset committed before its manifest entry', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'orphan-recovery';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'interrupted save', date: 8, url: 'https://example.com/orphan.png' }, assetFor);
  await original.close();

  const manifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
  storage.setItem('qig_gallery_manifest_v2', JSON.stringify({
    ...manifest,
    revision: manifest.revision + 1,
    pendingAssetIds: [manifest.entries[0].assetId],
    entries: [],
  }));

  const recoveredRepository = createRepository({ storage, indexedDB, dbName }).repository;
  const recovered = await recoveredRepository.init(assetFor);
  assert.deepEqual(recovered.map(entry => entry.prompt), ['interrupted save']);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries.length, 1);
  await recoveredRepository.close();
});

test('a valid manifest does not restore committed assets removed by trimming', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'failed-trim-delete';
  const original = createRepository({ storage, indexedDB, dbName, maxEntries: 1 }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'trimmed', date: 1, url: 'https://example.com/old.png' }, assetFor);
  const [trimmedAsset] = await getStoredAssets(indexedDB, dbName);
  await original.add({ prompt: 'retained', date: 2, url: 'https://example.com/new.png' }, assetFor);

  // Reinsert the removed record to model a failed IndexedDB delete after the manifest commit.
  await putStoredAsset(indexedDB, dbName, trimmedAsset);
  await original.close();

  const reloaded = createRepository({ storage, indexedDB, dbName, maxEntries: 1 }).repository;
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.prompt), ['retained']);
  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.metadata.prompt), ['retained']);
  await reloaded.close();
});

test('legacy numeric-only source targets are not materialized as safe targets', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'legacy-numeric-source';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'legacy target', date: 1, url: 'https://example.com/image.png' }, assetFor);
  await original.close();

  const manifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
  manifest.entries[0].sourceMessageIndex = 9;
  delete manifest.entries[0].sourceMessageId;
  delete manifest.entries[0].sourceMessageSignature;
  storage.setItem('qig_gallery_manifest_v2', JSON.stringify(manifest));

  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  const [entry] = await reloaded.init(assetFor);
  assert.equal(entry.sourceMessageIndex, null);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries[0].sourceMessageIndex, null);
  await reloaded.close();
});

test('recovery deletes malformed referenced blobs and oversized orphan blobs', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'corrupt-recovery-assets';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'referenced', date: 2, url: 'https://example.com/image.png' }, assetFor);
  await original.close();

  const [referenced] = await getStoredAssets(indexedDB, dbName);
  await putStoredAsset(indexedDB, dbName, {
    ...referenced,
    blob: new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
  });
  await putStoredAsset(indexedDB, dbName, {
    id: 'oversized-orphan',
    blob: new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'image/png' }),
    thumbnailBlob: null,
    metadata: { id: 'oversized-orphan', assetId: 'oversized-orphan', prompt: 'oversized', date: 1, pending: true },
  });
  const manifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
  manifest.pendingAssetIds = ['oversized-orphan'];
  storage.setItem('qig_gallery_manifest_v2', JSON.stringify(manifest));

  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  assert.deepEqual(await reloaded.init(assetFor), []);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  assert.deepEqual(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries, []);
  await reloaded.close();
});

test('clear removes unreferenced assets as well as manifest assets', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'clear-all-assets';
  const { repository } = createRepository({ storage, indexedDB, dbName });
  await repository.init(assetFor);
  await repository.add({ prompt: 'manifest asset', date: 2, url: 'https://example.com/one.png' }, assetFor);
  await putStoredAsset(indexedDB, dbName, {
    id: 'unreferenced-asset',
    blob: new Blob([PNG_BYTES], { type: 'image/png' }),
    thumbnailBlob: null,
    metadata: { id: 'unreferenced-asset', assetId: 'unreferenced-asset', prompt: 'orphan', date: 1 },
  });
  assert.equal((await getStoredAssets(indexedDB, dbName)).length, 2);

  await repository.clear();
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  await repository.close();
});

test('drops an invalid generated thumbnail while retaining the valid original', async () => {
  const revoked = [];
  let calls = 0;
  const { repository } = createRepository({
    createObjectURL() {
      calls += 1;
      if (calls === 2) throw new Error('thumbnail URL failed');
      return 'blob:test/original';
    },
    revokeObjectURL: url => revoked.push(url),
  });
  await repository.init(assetFor);

  const added = await repository.add({ prompt: 'thumbnail failure', date: 1, url: 'https://example.com/image.png' }, async entry => ({
    blob: new Blob([PNG_BYTES], { type: 'image/png' }),
    thumbnailBlob: new Blob(['thumbnail'], { type: 'image/jpeg' }),
    fallbackUrl: entry.url,
  }));

  assert.equal(added.ephemeral, false);
  assert.equal(added.thumbnail, added.url);
  assert.equal(calls, 1);
  assert.deepEqual(revoked, []);
  await repository.close();
});

test('recovery independently drops an invalid thumbnail and retains its original', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'invalid-recovery-thumbnail';
  const metadata = {
    id: 'valid-original',
    assetId: 'valid-original',
    prompt: 'keep original',
    date: 1,
  };
  await putStoredAsset(indexedDB, dbName, {
    id: metadata.id,
    blob: new Blob([PNG_BYTES], { type: 'image/png' }),
    thumbnailBlob: new Blob(['not an image'], { type: 'image/png' }),
    metadata: { ...metadata, pending: false, legacy: false },
  });
  storage.setItem('qig_gallery_manifest_v2', JSON.stringify({
    version: GALLERY_MANIFEST_VERSION,
    revision: 1,
    legacyMigrated: true,
    cleared: false,
    pendingAssetIds: [],
    entries: [metadata],
  }));

  const { repository } = createRepository({ storage, indexedDB, dbName });
  const [entry] = await repository.init(assetFor);
  assert.equal(entry.prompt, 'keep original');
  assert.equal(entry.thumbnail, entry.url);
  const [stored] = await getStoredAssets(indexedDB, dbName);
  assert.equal(stored.thumbnailBlob, null);
  await repository.close();
});

test('recovery validates stored assets sequentially', async () => {
  const storage = new MemoryStorage({ qig_gallery_manifest_v2: '{broken' });
  const indexedDB = new IDBFactory();
  const dbName = 'sequential-recovery';
  for (let index = 0; index < 4; index++) {
    await putStoredAsset(indexedDB, dbName, {
      id: `asset-${index}`,
      blob: new Blob([PNG_BYTES], { type: 'image/png' }),
      thumbnailBlob: null,
      metadata: { id: `asset-${index}`, assetId: `asset-${index}`, prompt: `asset ${index}`, date: index },
    });
  }

  const originalArrayBuffer = Blob.prototype.arrayBuffer;
  let active = 0;
  let peak = 0;
  Blob.prototype.arrayBuffer = async function trackedArrayBuffer() {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 1));
      return await originalArrayBuffer.call(this);
    } finally {
      active -= 1;
    }
  };
  try {
    const { repository } = createRepository({ storage, indexedDB, dbName });
    assert.equal((await repository.init(assetFor)).length, 4);
    assert.equal(peak, 1);
    await repository.close();
  } finally {
    Blob.prototype.arrayBuffer = originalArrayBuffer;
  }
});

test('startup completes an interrupted clear instead of resurrecting orphaned images', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'interrupted-clear';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'do not restore', date: 1, url: 'https://example.com/image.png' }, assetFor);
  await original.close();

  const manifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
  storage.setItem('qig_gallery_manifest_v2', JSON.stringify({
    ...manifest,
    revision: manifest.revision + 1,
    legacyMigrated: true,
    cleared: true,
    entries: [],
  }));

  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  assert.deepEqual(await reloaded.init(assetFor), []);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  await reloaded.close();
});

test('rejects malformed image blobs instead of committing gallery assets', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'malformed-gallery-image';
  const { repository } = createRepository({ storage, indexedDB, dbName });
  await repository.init(assetFor);

  const entry = await repository.add({ prompt: 'truncated', date: 1, url: 'https://example.com/bad.jpg' }, async source => ({
    blob: new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
    fallbackUrl: source.url,
  }));

  assert.equal(entry, null);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  await repository.close();
});

test('recovery clear marks the gallery before clearing assets when initialization is unavailable', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'recovery-clear';
  await putStoredAsset(indexedDB, dbName, {
    id: 'stale-asset',
    blob: new Blob([PNG_BYTES], { type: 'image/png' }),
    thumbnailBlob: null,
    metadata: { id: 'stale-asset', assetId: 'stale-asset', prompt: 'stale', date: 1 },
  });
  storage.setItem('qig_gallery', JSON.stringify([{ prompt: 'legacy', url: 'data:image/png;base64,old' }]));

  const result = await clearGalleryRepositoryStorage({ storage, indexedDB, dbName });

  assert.equal(result.assetsCleared, true);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).cleared, true);
  assert.equal(storage.getItem('qig_gallery'), null);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
});
