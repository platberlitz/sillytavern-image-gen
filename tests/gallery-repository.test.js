import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { GalleryRepository, GALLERY_MANIFEST_VERSION } from '../lib/gallery-repository.js';

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
  });
  return { repository, revoked };
}

const assetFor = async entry => ({
  blob: new Blob([entry.bytes || entry.prompt], { type: 'image/png' }),
  fallbackUrl: entry.url,
});

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
    metadataSettings: {
      apiKey: 'gallery-secret',
      proxyKey: 'proxy-secret',
      localRefImage: 'data:image/png;base64,PRIVATE_REFERENCE',
      steps: 20,
    },
  }, assetFor);

  assert.equal(added.ephemeral, false);
  const rawManifest = storage.getItem('qig_gallery_manifest_v2');
  const manifest = JSON.parse(rawManifest);
  assert.equal(manifest.version, GALLERY_MANIFEST_VERSION);
  assert.equal(manifest.entries.length, 1);
  assert.doesNotMatch(rawManifest, /PRIVATE_IMAGE_BYTES|PRIVATE_REFERENCE|gallery-secret|proxy-secret|signed\.example|token=secret|image bytes/);
  assert.equal(manifest.entries[0].metadataSettings.steps, 20);

  await repository.close();
  const { repository: reloaded } = createRepository({ storage, indexedDB, dbName: 'durable-gallery' });
  const entries = await reloaded.init(assetFor);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].prompt, 'portrait');
  assert.match(entries[0].url, /^blob:test\//);
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
    setTimeout(() => resolve({ blob: new Blob([entry.prompt]), fallbackUrl: entry.url }), delays.get(entry.prompt));
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
  releaseAsset({ blob: new Blob(['late']), fallbackUrl: 'https://example.com/late.png' });

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
      if (key === 'qig_gallery_manifest_v2' && JSON.parse(value).entries.length === 0) {
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
