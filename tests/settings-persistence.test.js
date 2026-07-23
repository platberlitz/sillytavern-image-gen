import assert from "node:assert/strict";
import test from "node:test";

import {
    canSeedSynchronizedStoreFromLocal,
    persistSynchronizedStore,
    reconcileSynchronizedStore,
} from "../lib/settings-persistence.js";

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        values,
    };
}

test("server state replaces stale and empty local caches", () => {
    const serverProfiles = { proxy: { Shared: { proxyModel: "server-model" } } };
    const stale = reconcileSynchronizedStore({
        serverValue: serverProfiles,
        localValue: { proxy: { Old: { proxyModel: "local-model" } } },
        fallback: {},
        expectedType: "object",
    });
    const empty = reconcileSynchronizedStore({
        serverValue: [{ id: "server-preset" }],
        localValue: [],
        fallback: [],
        expectedType: "array",
    });

    assert.equal(stale.source, "server");
    assert.equal(stale.serverNeedsUpdate, false);
    assert.deepEqual(stale.value, serverProfiles);
    assert.deepEqual(empty.value, [{ id: "server-preset" }]);
});

test("first-device local state seeds a missing server store", () => {
    const local = [{ id: "local-workflow" }];
    const result = reconcileSynchronizedStore({
        serverValue: null,
        localValue: local,
        fallback: [],
        expectedType: "array",
    });

    assert.equal(result.source, "local");
    assert.equal(result.serverNeedsUpdate, true);
    assert.deepEqual(result.value, local);
});

test("local state is reusable only when it belongs to the server cache owner", () => {
    assert.equal(canSeedSynchronizedStoreFromLocal({
        serverCacheId: "",
        localCacheId: "",
    }), false);
    assert.equal(canSeedSynchronizedStoreFromLocal({
        serverCacheId: "account-two",
        localCacheId: "account-one",
    }), false);
    assert.equal(canSeedSynchronizedStoreFromLocal({
        serverCacheId: "account-one",
        localCacheId: "account-one",
    }), true);
});

test("malformed server and local values are repaired from the expected default", () => {
    const result = reconcileSynchronizedStore({
        serverValue: "not-an-object",
        localValue: [],
        fallback: {},
        expectedType: "object",
    });

    assert.equal(result.source, "default");
    assert.equal(result.serverNeedsUpdate, true);
    assert.deepEqual(result.value, {});
});

test("reconciled server values do not alias extension settings", () => {
    const server = { proxy: { Shared: { model: "one" } } };
    const result = reconcileSynchronizedStore({
        serverValue: server,
        localValue: {},
        fallback: {},
        expectedType: "object",
    });

    result.value.proxy.Shared.model = "two";
    assert.equal(server.proxy.Shared.model, "one");
});

test("immediate persistence updates the account and local cache with independent values", async () => {
    const storage = createStorage({ qig_profiles: JSON.stringify({ old: true }) });
    const settings = { _backupProfiles: { old: true } };
    const next = { proxy: { Shared: { model: "flux" } } };
    let saves = 0;

    const result = await persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: next,
        save: async () => { saves += 1; },
    });

    assert.equal(saves, 1);
    assert.equal(result.cacheSaved, true);
    assert.deepEqual(JSON.parse(storage.values.get("qig_profiles")), next);
    assert.deepEqual(settings._backupProfiles, next);
    result.value.proxy.Shared.model = "changed";
    assert.equal(settings._backupProfiles.proxy.Shared.model, "flux");
});

test("failed account save rolls back the local cache and extension setting", async () => {
    const previous = { proxy: { Old: { model: "old" } } };
    const storage = createStorage({ qig_profiles: JSON.stringify(previous) });
    const settings = { _backupProfiles: structuredClone(previous) };

    await assert.rejects(() => persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { proxy: { New: { model: "new" } } },
        save: async () => { throw new Error("server unavailable"); },
    }), /server unavailable/);

    assert.deepEqual(JSON.parse(storage.values.get("qig_profiles")), previous);
    assert.deepEqual(settings._backupProfiles, previous);
});

test("local cache failure does not block an authoritative server save", async () => {
    const storage = createStorage();
    storage.setItem = () => { throw new Error("quota exceeded"); };
    const settings = { _backupProfiles: null };
    let saved = false;

    const result = await persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { proxy: {} },
        save: async () => { saved = true; },
    });

    assert.equal(saved, true);
    assert.equal(result.cacheSaved, false);
    assert.match(result.cacheError.message, /quota/);
    assert.deepEqual(settings._backupProfiles, { proxy: {} });
});

test("immediate saves are serialized so a failed write cannot roll back a later success", async () => {
    const storage = createStorage({ qig_profiles: JSON.stringify({ original: true }) });
    const settings = { _backupProfiles: { original: true } };
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    let saveCalls = 0;
    const save = async () => {
        saveCalls += 1;
        if (saveCalls === 1) {
            await firstGate;
            throw new Error("first save failed");
        }
    };

    const first = persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { first: true },
        save,
    });
    const second = persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { second: true },
        save,
    });
    releaseFirst();

    await assert.rejects(first, /first save failed/);
    await second;
    assert.deepEqual(settings._backupProfiles, { second: true });
    assert.deepEqual(JSON.parse(storage.values.get("qig_profiles")), { second: true });
});
