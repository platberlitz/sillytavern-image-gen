import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

import {
    clearGalleryRepositoryStorage,
    GalleryRepository,
    GALLERY_MANIFEST_VERSION,
} from '../lib/gallery-repository.js';
import { createAccountStorageScope } from '../lib/client-orchestration.js';

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
    manifestKey: options.manifestKey,
    legacyKey: options.legacyKey,
    createId: options.createId || (() => `entry-${++nextId}`),
    createObjectURL: options.createObjectURL || (blob => `blob:test/${blob.size}/${++nextId}`),
    revokeObjectURL: options.revokeObjectURL || (url => revoked.push(url)),
    maxEntries: options.maxEntries,
    onEvict: options.onEvict,
    lockManager: options.lockManager ?? sharedLocks,
    lockName: options.lockName,
  });
  return { repository, revoked };
}

function createLockManager() {
  const queues = new Map();
  return {
    request(name, { mode }, operation) {
      assert.equal(mode, 'exclusive');
      const result = (queues.get(name) || Promise.resolve()).then(() => operation({ name, mode }));
      queues.set(name, result.catch(() => {}));
      return result;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const sharedLocks = createLockManager();

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

test('account-scoped gallery storage never loads another account or unscoped legacy data', async () => {
  const storage = new MemoryStorage({
    qig_gallery: JSON.stringify([{ prompt: 'unowned legacy', date: 3, url: 'data:image/png;base64,old' }]),
    qig_prompt_history: JSON.stringify([{ prompt: 'unowned history' }]),
  });
  const indexedDB = new IDBFactory();
  const accountA = createAccountStorageScope('account-a');
  const accountB = createAccountStorageScope('account-b');
  const optionsFor = scope => ({
    storage,
    indexedDB,
    dbName: scope.galleryDbName,
    manifestKey: scope.galleryManifestKey,
    legacyKey: scope.galleryLegacyKey,
  });

  const first = createRepository(optionsFor(accountA)).repository;
  await first.init(assetFor);
  await first.add({ prompt: 'account A only', date: 4, url: 'https://example.com/a.png' }, assetFor);
  await first.close();

  const second = createRepository(optionsFor(accountB)).repository;
  assert.deepEqual(await second.init(assetFor), []);
  await second.close();
  assert.notEqual(storage.getItem(accountA.galleryManifestKey), null);
  assert.equal(storage.getItem(accountB.galleryManifestKey), null);
  assert.notEqual(storage.getItem('qig_gallery'), null);
  assert.notEqual(storage.getItem('qig_prompt_history'), null);

  const reloaded = createRepository(optionsFor(accountA)).repository;
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.prompt), ['account A only']);
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

test('interleaved unlocked saves cannot claim durability even when both revision checks would pass', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'unlocked-publication';
  const seed = createRepository({ storage, indexedDB, dbName }).repository;
  await seed.init(assetFor);
  await seed.add({ id: 'existing', prompt: 'existing', date: 1 }, assetFor);
  await seed.close();
  const first = createRepository({ storage, indexedDB, dbName, lockManager: false });
  const second = createRepository({ storage, indexedDB, dbName, lockManager: false });
  t.after(() => Promise.all([first.repository.close(), second.repository.close()]));
  await Promise.all([first.repository.init(assetFor), second.repository.init(assetFor)]);
  assert.equal(first.repository.list()[0].ephemeral, false);
  assert.equal(second.repository.list()[0].ephemeral, false);
  const manifestBefore = storage.getItem('qig_gallery_manifest_v2');
  const getItem = storage.getItem.bind(storage);
  let reads = 0;
  let pendingSnapshot;
  // Model both tabs reading each revision before either compare/write pair finishes.
  const readMock = t.mock.method(storage, 'getItem', key => {
    if (key !== 'qig_gallery_manifest_v2') return getItem(key);
    reads += 1;
    if (reads <= 2) return manifestBefore;
    if (reads === 3) pendingSnapshot = getItem(key);
    return reads <= 4 ? pendingSnapshot : getItem(key);
  });
  const writes = t.mock.method(storage, 'setItem', MemoryStorage.prototype.setItem);
  const originalPut = IDBObjectStore.prototype.put;
  const completions = [];
  const putMock = t.mock.method(IDBObjectStore.prototype, 'put', function (...args) {
    const complete = this.transaction.oncomplete;
    this.transaction.oncomplete = event => {
      completions.push(() => complete(event));
      if (completions.length === 2) completions.forEach(finish => finish());
    };
    return originalPut.apply(this, args);
  });
  t.after(() => completions.forEach(finish => finish()));

  const results = await Promise.all([
    first.repository.add({ id: 'first', prompt: 'first', date: 2 }, assetFor),
    second.repository.add({ id: 'second', prompt: 'second', date: 3 }, assetFor),
  ]);
  readMock.mock.restore();
  putMock.mock.restore();
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), manifestBefore);
  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), ['existing']);
  for (const entry of results) {
    assert.equal(entry.ephemeral, true);
    assert.match(entry.persistenceError, /Web Locks.*session-only/);
    assert.match(entry.url, /^blob:test\//);
  }
  await Promise.all([first.repository.close(), second.repository.close()]);
  assert.ok(first.revoked.includes(results[0].url));
  assert.ok(second.revoked.includes(results[1].url));
});

test('overlapping locked saves serialize and every durable result remains in the manifest', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'locked-publication';
  const first = createRepository({ storage, indexedDB, dbName }).repository;
  const second = createRepository({ storage, indexedDB, dbName }).repository;
  await Promise.all([first.init(assetFor), second.init(assetFor)]);
  const preparing = deferred();
  const resume = deferred();
  t.after(async () => {
    resume.resolve();
    await Promise.all([first.close(), second.close()]);
  });
  const firstSave = first.add({ id: 'first', date: 1 }, async entry => {
    preparing.resolve();
    await resume.promise;
    return assetFor(entry);
  });
  await preparing.promise;
  let secondStarted = false;
  const secondSave = second.add({ id: 'second', date: 2 }, async entry => {
    secondStarted = true;
    return assetFor(entry);
  });
  await Promise.resolve();
  assert.equal(secondStarted, false);
  resume.resolve();
  const results = await Promise.all([firstSave, secondSave]);
  assert.equal(results[0].ephemeral, false);
  assert.equal(results[1].ephemeral, true);
  assert.match(results[1].persistenceError, /another tab/);
  const ids = JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries.map(entry => entry.id);
  assert.deepEqual(ids, results.filter(entry => !entry.ephemeral).map(entry => entry.id));
  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), ids);
});

test('unlocked legacy migration is session-only and leaves both storage formats untouched', async () => {
  const legacy = JSON.stringify([{ id: 'legacy', prompt: 'legacy', date: 1 }]);
  const storage = new MemoryStorage({ qig_gallery: legacy });
  const indexedDB = new IDBFactory();
  const dbName = 'unlocked-migration';
  const { repository } = createRepository({ storage, indexedDB, dbName, lockManager: false });
  const [entry] = await repository.init(assetFor);
  assert.equal(entry.ephemeral, true);
  assert.match(entry.persistenceError, /session-only/);
  assert.match(entry.url, /^blob:test\//);
  assert.equal(storage.getItem('qig_gallery'), legacy);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), null);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  await repository.close();
});

test('discarding a failed-save preview cannot delete a later durable image with the same ID', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'preview-cleanup-ownership';
  const first = createRepository({ storage, indexedDB, dbName, maxEntries: 1 }).repository;
  const second = createRepository({ storage, indexedDB, dbName }).repository;
  t.after(() => Promise.all([first.close(), second.close()]));
  await first.init(assetFor);
  let failCommit = true;
  t.mock.method(storage, 'setItem', function (key, value) {
    if (failCommit && JSON.parse(value).entries?.length) {
      failCommit = false;
      throw new Error('manifest write failed');
    }
    MemoryStorage.prototype.setItem.call(this, key, value);
  });
  const preview = await first.add({ id: 'shared', prompt: 'failed preview', date: 1 }, assetFor);
  assert.equal(preview.ephemeral, true);
  assert.match(preview.url, /^blob:test\//);
  await second.init(assetFor);
  assert.equal((await second.add({ id: 'shared', prompt: 'published elsewhere', date: 2 }, assetFor)).ephemeral, false);
  const committedManifest = storage.getItem('qig_gallery_manifest_v2');

  const replacement = await first.add({ id: 'replacement', date: 3 }, assetFor);
  assert.equal(replacement.ephemeral, true);
  assert.deepEqual(first.list().map(entry => entry.id), ['replacement']);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), committedManifest);
  const [stored] = await getStoredAssets(indexedDB, dbName);
  assert.equal(stored?.id, 'shared');
  assert.equal(stored.metadata.prompt, 'published elsewhere');
});

test('an unlocked init paused after reading its manifest does not delete a later tab commit', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'interleaved-init';
  const paused = deferred();
  const resume = deferred();
  const second = createRepository({ storage, indexedDB, dbName }).repository;
  await second.init(assetFor);
  const first = createRepository({
    storage,
    dbName,
    lockManager: false,
    indexedDB: {
      open(...args) {
        const request = indexedDB.open(...args);
        request.addEventListener('success', event => {
          event.stopImmediatePropagation();
          const onSuccess = request.onsuccess;
          paused.resolve();
          void resume.promise.then(() => onSuccess.call(request, event));
        }, { once: true });
        return request;
      },
    },
  }).repository;
  t.after(async () => {
    resume.resolve();
    await Promise.all([first.close(), second.close()]);
  });

  const initializing = first.init(assetFor);
  await paused.promise;
  const added = await second.add({ id: 'committed', prompt: 'other tab', date: 1 }, assetFor);
  assert.equal(added.ephemeral, false);
  const committedManifest = storage.getItem('qig_gallery_manifest_v2');
  resume.resolve();
  await initializing;

  assert.equal(storage.getItem('qig_gallery_manifest_v2'), committedManifest);
  const [asset] = await getStoredAssets(indexedDB, dbName);
  assert.equal(asset?.id, added.id);
  assert.deepEqual(Buffer.from(await asset.blob.arrayBuffer()), PNG_BYTES);
  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  t.after(() => reloaded.close());
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.id), ['committed']);
});

test('an unlocked init preserves a pending save whose bytes have not arrived yet', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'pending-before-bytes';
  const writer = createRepository({ storage, indexedDB, dbName }).repository;
  await writer.init(assetFor);
  const db = await writer.dbPromise;
  const pendingPublished = deferred();
  const resume = deferred();
  writer.dbPromise = resume.promise;
  t.mock.method(storage, 'setItem', function (key, value) {
    MemoryStorage.prototype.setItem.call(this, key, value);
    if (JSON.parse(value).pendingAssetIds?.includes('pending')) pendingPublished.resolve();
  });
  const reader = createRepository({ storage, indexedDB, dbName, lockManager: false }).repository;
  t.after(async () => {
    resume.resolve(db);
    await Promise.all([writer.close(), reader.close()]);
  });

  const writing = writer.add({ id: 'pending', prompt: 'still saving', date: 1 }, assetFor);
  await pendingPublished.promise;
  const pendingManifest = storage.getItem('qig_gallery_manifest_v2');
  assert.deepEqual(await reader.init(assetFor), []);
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), pendingManifest);
  resume.resolve(db);
  assert.equal((await writing).ephemeral, false);

  const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
  t.after(() => reloaded.close());
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.id), ['pending']);
});

for (const afterClear of [false, true]) {
  test(`a locked restart recovers a committed pending image${afterClear ? ' after a clear, excluding old orphans' : ''}`, async t => {
    const storage = new MemoryStorage();
    const indexedDB = new IDBFactory();
    const dbName = `recovered-before-failure-${afterClear}`;
    let failUrls = false;
    const writer = createRepository({
      storage,
      indexedDB,
      dbName,
      createObjectURL() {
        if (failUrls) throw new Error('object URL failed');
        return 'blob:test/writer';
      },
    }).repository;
    await writer.init(assetFor);
    if (afterClear) {
      await writer.add({ id: 'old-entry', prompt: 'old entry', date: 100 }, assetFor);
      await putStoredAsset(indexedDB, dbName, {
        id: 'old-orphan',
        blob: new Blob([PNG_BYTES]),
        metadata: { prompt: 'old orphan', date: 200, pending: true },
      });
      const oldAssets = await getStoredAssets(indexedDB, dbName);
      await writer.clear();
      assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).cleared, true);
      // Model records left by an interrupted or historical deferred clear.
      for (const asset of oldAssets) await putStoredAsset(indexedDB, dbName, asset);
      assert.equal((await getStoredAssets(indexedDB, dbName)).length, 2);
    }

    const committed = deferred();
    const resume = deferred();
    const originalPut = IDBObjectStore.prototype.put;
    let paused = false;
    t.mock.method(IDBObjectStore.prototype, 'put', function (...args) {
      if (!paused && this.transaction.db.name === dbName && args[0].id === 'new-entry') {
        paused = true;
        const onComplete = this.transaction.oncomplete;
        this.transaction.oncomplete = event => {
          committed.resolve();
          void resume.promise.then(() => onComplete(event));
        };
      }
      return originalPut.apply(this, args);
    });
    t.after(async () => {
      resume.resolve();
      await writer.close();
    });

    failUrls = true;
    const writing = writer.add({ id: 'new-entry', prompt: 'new image', date: 1, url: 'https://example.com/new.png' }, assetFor);
    await committed.promise;
    const pendingManifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
    assert.equal(pendingManifest.cleared, false);
    assert.deepEqual(pendingManifest.pendingAssetIds, ['new-entry']);

    // A restart gets the crash-point storage snapshot, not the live writer's lock.
    const restartStorage = new MemoryStorage({ qig_gallery_manifest_v2: JSON.stringify(pendingManifest) });
    const restartDB = new IDBFactory();
    const assets = await getStoredAssets(indexedDB, dbName);
    assert.equal(assets.length, afterClear ? 3 : 1);
    for (const asset of assets) await putStoredAsset(restartDB, dbName, asset);

    resume.resolve();
    const failed = await writing;
    assert.equal(failed.ephemeral, true);
    assert.equal(failed.url, 'https://example.com/new.png');
    assert.match(failed.persistenceError, /object URL failed/);

    const reloaded = createRepository({ storage: restartStorage, indexedDB: restartDB, dbName }).repository;
    t.after(() => reloaded.close());
    const recovered = await reloaded.init(assetFor);
    assert.deepEqual(recovered.map(entry => entry.id), ['new-entry']);
    assert.equal(recovered[0].ephemeral, false);
    assert.deepEqual(JSON.parse(restartStorage.getItem('qig_gallery_manifest_v2')).pendingAssetIds, []);
    const [stored] = await getStoredAssets(restartDB, dbName);
    assert.equal((await getStoredAssets(restartDB, dbName)).length, 1);
    assert.deepEqual(Buffer.from(await stored.blob.arrayBuffer()), PNG_BYTES);
  });
}

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

for (const exclusive of [false, true]) {
  test(`URL materialization failure ${exclusive ? 'rolls back owned bytes' : 'keeps unlocked saves session-only'}`, async () => {
    const storage = new MemoryStorage();
    const indexedDB = new IDBFactory();
    let objectUrlCalls = 0;
    const { repository } = createRepository({
      storage,
      indexedDB,
      dbName: 'failed-materialization',
      lockManager: exclusive ? createLockManager() : false,
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
    const manifest = JSON.parse(storage.getItem('qig_gallery_manifest_v2'));
    if (exclusive) {
      assert.deepEqual(manifest.entries, []);
      assert.deepEqual(manifest.pendingAssetIds, []);
    } else {
      assert.equal(manifest, null);
      assert.ok(results.every(entry => /session-only/.test(entry.persistenceError)));
    }
    assert.deepEqual(await getStoredAssets(indexedDB, 'failed-materialization'), []);
    await repository.close();

    const reloaded = createRepository({ storage, indexedDB, dbName: 'failed-materialization' }).repository;
    assert.deepEqual(await reloaded.init(assetFor), []);
    await reloaded.close();
  });
}

test('a malformed or unsupported manifest stops recovery without changing stored data', async () => {
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
    await assert.rejects(recoveredRepository.init(assetFor), /Invalid gallery manifest/);
    assert.deepEqual(recoveredRepository.list(), []);
    assert.equal(storage.getItem('qig_gallery_manifest_v2'), brokenManifest);
    assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.metadata.prompt), ['recover me']);
    await recoveredRepository.close();
  }
});

test('clear A, save B, then corrupt the manifest never resurrects retained A', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'clear-boundary-corruption';
  const first = createRepository({ storage, indexedDB, dbName }).repository;
  await first.init(assetFor);
  assert.equal((await first.add({ id: 'A', prompt: 'cleared A', date: 1 }, assetFor)).ephemeral, false);
  await first.close();
  const clearMock = t.mock.method(IDBObjectStore.prototype, 'clear', () => { throw new Error('deletion unavailable'); });
  const deleteMock = t.mock.method(IDBObjectStore.prototype, 'delete', () => { throw new Error('deletion unavailable'); });
  const cleared = await clearGalleryRepositoryStorage({ storage, indexedDB, dbName, lockManager: sharedLocks });
  assert.equal(cleared.marker.cleared, true);
  assert.equal(cleared.assetsCleared, false);
  const second = createRepository({ storage, indexedDB, dbName }).repository;
  assert.deepEqual(await second.init(assetFor), []);
  assert.equal((await second.add({ id: 'B', prompt: 'new B', date: 2 }, assetFor)).ephemeral, false);
  await second.close();
  clearMock.mock.restore();
  deleteMock.mock.restore();
  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), ['A', 'B']);
  assert.deepEqual(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries.map(entry => entry.id), ['B']);

  storage.setItem('qig_gallery_manifest_v2', '{corrupt');
  for (const lockManager of [false, sharedLocks]) {
    const reloaded = createRepository({ storage, indexedDB, dbName, lockManager }).repository;
    await assert.rejects(reloaded.init(assetFor), /Invalid gallery manifest/);
    assert.deepEqual(reloaded.list(), []);
    assert.equal(storage.getItem('qig_gallery_manifest_v2'), '{corrupt');
    assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), ['A', 'B']);
    await reloaded.close();
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
  assert.equal((await getStoredAssets(indexedDB, dbName)).length, 1);

  // Unreferenced bytes can survive deferred or failed deletion after the manifest commit.
  await putStoredAsset(indexedDB, dbName, trimmedAsset);
  await original.close();

  const reloaded = createRepository({ storage, indexedDB, dbName, maxEntries: 1, lockManager: false }).repository;
  assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.prompt), ['retained']);
  assert.equal((await getStoredAssets(indexedDB, dbName)).length, 2);
  await reloaded.close();

  const exclusive = createRepository({ storage, indexedDB, dbName, maxEntries: 1, lockManager: createLockManager() }).repository;
  assert.deepEqual((await exclusive.init(assetFor)).map(entry => entry.prompt), ['retained']);
  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.metadata.prompt), ['retained']);
  await exclusive.close();
});

test('notifies observers when the retention limit evicts gallery entries', async () => {
  const evictions = [];
  const { repository } = createRepository({
    maxEntries: 2,
    onEvict: event => evictions.push(event),
  });
  await repository.init(assetFor);

  await repository.addMany([
    { prompt: 'newest', date: 3, url: 'https://example.com/newest.png' },
    { prompt: 'middle', date: 2, url: 'https://example.com/middle.png' },
    { prompt: 'evicted', date: 1, url: 'https://example.com/evicted.png' },
  ], assetFor);

  assert.deepEqual(repository.list().map(entry => entry.prompt), ['newest', 'middle']);
  assert.equal(evictions.length, 1);
  assert.equal(evictions[0].reason, 'retention-limit');
  assert.equal(evictions[0].limit, 2);
  assert.deepEqual(evictions[0].entries.map(entry => entry.prompt), ['evicted']);
  await repository.close();
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

test('recovery excludes corrupt blobs and defers deletion until it has exclusive ownership', async () => {
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

  const reloaded = createRepository({ storage, indexedDB, dbName, lockManager: false }).repository;
  assert.deepEqual(await reloaded.init(assetFor), []);
  assert.equal((await getStoredAssets(indexedDB, dbName)).length, 2);
  assert.deepEqual(JSON.parse(storage.getItem('qig_gallery_manifest_v2')), manifest);
  await reloaded.close();

  const exclusive = createRepository({ storage, indexedDB, dbName, lockManager: createLockManager() }).repository;
  assert.deepEqual(await exclusive.init(assetFor), []);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
  await exclusive.close();
});

test('clear removes unreferenced assets as well as manifest assets under an exclusive lock', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'clear-all-assets';
  const { repository } = createRepository({ storage, indexedDB, dbName, lockManager: createLockManager() });
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

  const { repository } = createRepository({ storage, indexedDB, dbName, lockManager: false });
  const [entry] = await repository.init(assetFor);
  assert.equal(entry.prompt, 'keep original');
  assert.equal(entry.thumbnail, entry.url);
  const [stored] = await getStoredAssets(indexedDB, dbName);
  assert.ok(stored.thumbnailBlob instanceof Blob);
  await repository.close();

  const exclusive = createRepository({ storage, indexedDB, dbName, lockManager: createLockManager() }).repository;
  assert.equal((await exclusive.init(assetFor))[0].prompt, 'keep original');
  assert.equal((await getStoredAssets(indexedDB, dbName))[0].thumbnailBlob, null);
  await exclusive.close();
});

test('startup enumerates keys and loads a retained manifest blob only once', async () => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'key-first-recovery';
  const original = createRepository({ storage, indexedDB, dbName }).repository;
  await original.init(assetFor);
  await original.add({ prompt: 'retained', date: 10, url: 'https://example.com/retained.png' }, assetFor);
  await original.close();

  const retainedId = JSON.parse(storage.getItem('qig_gallery_manifest_v2')).entries[0].assetId;
  for (let index = 0; index < 3; index++) {
    const id = `stale-${index}`;
    await putStoredAsset(indexedDB, dbName, {
      id,
      blob: new Blob([PNG_BYTES], { type: 'image/png' }),
      thumbnailBlob: null,
      metadata: { id, assetId: id, prompt: id, date: index },
    });
  }

  const originalGet = IDBObjectStore.prototype.get;
  const originalGetAll = IDBObjectStore.prototype.getAll;
  const originalArrayBuffer = Blob.prototype.arrayBuffer;
  const loadedKeys = [];
  let getAllCalls = 0;
  let validationCalls = 0;
  IDBObjectStore.prototype.get = function trackedGet(...args) {
    loadedKeys.push(args[0]);
    return originalGet.apply(this, args);
  };
  IDBObjectStore.prototype.getAll = function trackedGetAll(...args) {
    getAllCalls += 1;
    return originalGetAll.apply(this, args);
  };
  Blob.prototype.arrayBuffer = async function trackedArrayBuffer() {
    validationCalls += 1;
    return originalArrayBuffer.call(this);
  };

  let reloaded;
  try {
    reloaded = createRepository({ storage, indexedDB, dbName, lockManager: createLockManager() }).repository;
    assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.prompt), ['retained']);
    assert.deepEqual(loadedKeys, [retainedId]);
    assert.equal(validationCalls, 1);
    assert.equal(getAllCalls, 0);
  } finally {
    IDBObjectStore.prototype.get = originalGet;
    IDBObjectStore.prototype.getAll = originalGetAll;
    Blob.prototype.arrayBuffer = originalArrayBuffer;
    await reloaded?.close();
  }

  assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), [retainedId]);
});

test('recovery validates pending stored assets sequentially', async () => {
  const storage = new MemoryStorage({
    qig_gallery_manifest_v2: JSON.stringify({
      version: GALLERY_MANIFEST_VERSION,
      revision: 1,
      pendingAssetIds: ['asset-0', 'asset-1', 'asset-2', 'asset-3'],
      entries: [],
    }),
  });
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
  let calls = 0;
  Blob.prototype.arrayBuffer = async function trackedArrayBuffer() {
    calls += 1;
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
    assert.equal(calls, 4);
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

  const reloaded = createRepository({ storage, indexedDB, dbName, lockManager: createLockManager() }).repository;
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

  const result = await clearGalleryRepositoryStorage({ storage, indexedDB, dbName, lockManager: createLockManager() });

  assert.equal(result.assetsCleared, true);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).cleared, true);
  assert.equal(storage.getItem('qig_gallery'), null);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
});

for (const mode of ['repository', 'recovery']) {
  test(`unlocked ${mode} clear rejects without disturbing an active durable save`, async t => {
    const storage = new MemoryStorage();
    const indexedDB = new IDBFactory();
    const dbName = `interleaved-clear-${mode}`;
    const writer = createRepository({ storage, indexedDB, dbName }).repository;
    await writer.init(assetFor);
    await writer.add({ id: 'old', prompt: 'old', date: 1 }, assetFor);
    const unlocked = createRepository({ storage, indexedDB, dbName, lockManager: false }).repository;
    await unlocked.init(assetFor);
    const preparing = deferred();
    const resume = deferred();
    t.after(async () => {
      resume.resolve();
      await Promise.all([writer.close(), unlocked.close()]);
    });

    const writing = writer.add({ id: 'new', prompt: 'new', date: 2 }, async entry => {
      preparing.resolve();
      await resume.promise;
      return assetFor(entry);
    });
    await preparing.promise;
    const previousManifest = storage.getItem('qig_gallery_manifest_v2');
    await assert.rejects(mode === 'repository'
      ? unlocked.clear()
      : clearGalleryRepositoryStorage({ storage, indexedDB, dbName, lockManager: false }), /Web Locks/);
    assert.equal(storage.getItem('qig_gallery_manifest_v2'), previousManifest);
    assert.deepEqual(unlocked.list().map(entry => entry.id), ['old']);
    resume.resolve();
    assert.equal((await writing).ephemeral, false);
    assert.deepEqual((await getStoredAssets(indexedDB, dbName)).map(asset => asset.id), ['new', 'old']);

    const reloaded = createRepository({ storage, indexedDB, dbName }).repository;
    t.after(() => reloaded.close());
    assert.deepEqual((await reloaded.init(assetFor)).map(entry => entry.id), ['new', 'old']);
  });
}

test('recovery clear shares the repository lock and waits for an active save', async t => {
  const storage = new MemoryStorage();
  const indexedDB = new IDBFactory();
  const dbName = 'exclusive-recovery-clear';
  const lockManager = createLockManager();
  const writer = createRepository({ storage, indexedDB, dbName, lockManager }).repository;
  await writer.init(assetFor);
  const preparing = deferred();
  const resume = deferred();
  t.after(async () => {
    resume.resolve();
    await writer.close();
  });

  const writing = writer.add({ id: 'before-clear', date: 1 }, async entry => {
    preparing.resolve();
    await resume.promise;
    return assetFor(entry);
  });
  await preparing.promise;
  const clearing = clearGalleryRepositoryStorage({ storage, indexedDB, dbName, lockManager });
  assert.equal(storage.getItem('qig_gallery_manifest_v2'), null);
  resume.resolve();
  assert.equal((await writing).ephemeral, false);
  assert.equal((await clearing).assetsCleared, true);
  assert.equal(JSON.parse(storage.getItem('qig_gallery_manifest_v2')).cleared, true);
  assert.deepEqual(await getStoredAssets(indexedDB, dbName), []);
});
