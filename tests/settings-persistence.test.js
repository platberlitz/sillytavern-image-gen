import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { confirmSettingsValues, createSettingsSaveEventConfirmer } from "../lib/host-persistence.js";

import {
    canSeedSynchronizedStoreFromLocal,
    persistSynchronizedStore,
    persistSynchronizedStores,
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
        save: async () => {
            assert.equal(storage.getItem("qig_sync_pending:qig_profiles"), "1", "a tab closed during save must retain pending local data");
            saves += 1;
        },
        acknowledge: async () => true,
    });

    assert.equal(saves, 1);
    assert.equal(result.cacheSaved, true);
    assert.equal(result.confirmed, true);
    assert.equal(storage.getItem("qig_sync_pending:qig_profiles"), null);
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
        acknowledge: async () => true,
    });

    assert.equal(saved, true);
    assert.equal(result.cacheSaved, false);
    assert.equal(result.confirmed, true);
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
        return true;
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

test("related synchronized stores commit with one acknowledgement and roll back together", async () => {
    const previousFilters = [{ id: "old-filter" }];
    const previousPools = [{ id: "old-pool" }];
    const storage = createStorage({
        qig_contextual_filters: JSON.stringify(previousFilters),
        qig_filter_pools: JSON.stringify(previousPools),
    });
    const settings = {
        _backupContextualFilters: structuredClone(previousFilters),
        _backupFilterPools: structuredClone(previousPools),
    };
    let saves = 0;

    await assert.rejects(() => persistSynchronizedStores({
        storage,
        settings,
        stores: [
            { localKey: "qig_contextual_filters", backupKey: "_backupContextualFilters", value: [{ id: "new-filter" }] },
            { localKey: "qig_filter_pools", backupKey: "_backupFilterPools", value: [{ id: "new-pool" }] },
        ],
        save: async () => {
            saves += 1;
            throw new Error("account save failed");
        },
    }), /account save failed/);

    assert.equal(saves, 2, "the original save plus the rollback compensation save");
    assert.deepEqual(settings._backupContextualFilters, previousFilters);
    assert.deepEqual(settings._backupFilterPools, previousPools);
    assert.deepEqual(JSON.parse(storage.values.get("qig_contextual_filters")), previousFilters);
    assert.deepEqual(JSON.parse(storage.values.get("qig_filter_pools")), previousPools);
});

test("an unconfirmed resolved save keeps the local cache authoritative via a pending marker", async () => {
    const storage = createStorage({ qig_profiles: JSON.stringify({ old: true }) });
    const settings = { _backupProfiles: { old: true } };
    const next = { proxy: { Shared: { model: "flux" } } };

    const result = await persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: next,
        save: async () => {},
        acknowledge: async () => false,
    });

    assert.equal(result.confirmed, false);
    assert.equal(storage.values.get("qig_sync_pending:qig_profiles"), "1");
    assert.deepEqual(settings._backupProfiles, next);
    assert.deepEqual(JSON.parse(storage.values.get("qig_profiles")), next);
});

test("a positively confirmed save clears the pending marker", async () => {
    const storage = createStorage({
        qig_profiles: JSON.stringify({ old: true }),
        "qig_sync_pending:qig_profiles": "1",
    });
    const settings = { _backupProfiles: { old: true } };
    const next = { proxy: { Shared: { model: "flux" } } };

    const result = await persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: next,
        save: async () => {},
        acknowledge: async () => true,
    });

    assert.equal(result.confirmed, true);
    assert.equal(storage.values.get("qig_sync_pending:qig_profiles"), undefined);
});

test("a thrown save with confirmed compensation rolls back without leaving a pending marker", async () => {
    const previous = { old: true };
    const storage = createStorage({ qig_profiles: JSON.stringify(previous) });
    const settings = { _backupProfiles: structuredClone(previous) };
    let saves = 0;

    await assert.rejects(() => persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { new: true },
        save: async () => { if (++saves === 1) throw new Error("boom"); },
        acknowledge: async () => true,
    }), /boom/);

    assert.equal(storage.values.get("qig_sync_pending:qig_profiles"), undefined);
    assert.equal(saves, 2);
    assert.deepEqual(JSON.parse(storage.values.get("qig_profiles")), previous);
});

test("acknowledge rejection counts as unconfirmed", async () => {
    const storage = createStorage();
    const settings = { _backupProfiles: null };

    const result = await persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { proxy: {} },
        save: async () => {},
        acknowledge: async () => { throw new Error("probe failed"); },
    });

    assert.equal(result.confirmed, false);
    assert.ok(result.confirmationError instanceof Error);
});

test("immediate store observers start inside the queue before events emitted during save", async () => {
    const storage = createStorage();
    const settings = {};
    const eventSource = new EventEmitter();
    let durable = {};
    let releaseFirst;
    let firstStarted;
    const started = new Promise(resolve => { firstStarted = resolve; });
    const gate = new Promise(resolve => { releaseFirst = resolve; });
    const observed = [];
    let saves = 0;
    const options = {
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        acknowledge: expected => {
            observed.push(structuredClone(expected));
            return createSettingsSaveEventConfirmer({
                eventSource,
                eventTypes: { SETTINGS_UPDATED: "saved" },
                timeoutMs: 500,
                confirm: async () => JSON.stringify(durable) === JSON.stringify(expected),
            })();
        },
        save: async () => {
            if (++saves === 1) {
                firstStarted();
                await gate;
            }
            durable = structuredClone(settings);
            eventSource.emit("saved");
        },
    };
    const first = persistSynchronizedStore({ ...options, value: { first: true } });
    const second = persistSynchronizedStore({ ...options, value: { second: true } });
    await started;
    assert.deepEqual(observed, [{ _backupProfiles: { first: true } }], "queued writes must not observe the previous write's event");
    releaseFirst();
    assert.equal((await first).confirmed, true);
    assert.equal((await second).confirmed, true);
    assert.deepEqual(observed, [{ _backupProfiles: { first: true } }, { _backupProfiles: { second: true } }]);
    assert.equal(eventSource.listenerCount("saved"), 0);
});

test("bulk saves without positive acknowledgement retain every local store and pending marker", async () => {
    for (const acknowledge of [undefined, async () => null, async () => undefined, async () => false]) {
        const storage = createStorage();
        const settings = {};
        const stores = [
            { localKey: "qig_char_settings", backupKey: "_backupCharSettings", value: { character: { prompt: "new" } } },
            { localKey: "qig_char_ref_images", backupKey: "_backupCharRefImages", value: { character: { localRefImage: "image" } } },
        ];
        const result = await persistSynchronizedStores({ storage, settings, stores, save: async () => {}, acknowledge });
        assert.equal(result.confirmed, false);
        for (const { localKey, backupKey, value } of stores) {
            assert.deepEqual(JSON.parse(storage.getItem(localKey)), value);
            assert.deepEqual(settings[backupKey], value);
            assert.equal(storage.getItem(`qig_sync_pending:${localKey}`), "1");
        }
    }
});

test("failed saves cancel their observer and an unconfirmed compensation preserves the original error", async () => {
    const original = new Error("lost save response");
    const storage = createStorage({ qig_profiles: "{}" });
    const settings = { _backupProfiles: {} };
    const eventSource = new EventEmitter();
    let saves = 0;
    await assert.rejects(persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { new: true },
        acknowledge: createSettingsSaveEventConfirmer({
            eventSource,
            eventTypes: { SETTINGS_UPDATED: "saved" },
            confirm: async () => false,
            timeoutMs: 20,
        }),
        save: async () => {
            if (++saves === 1) throw original;
        },
    }), error => error instanceof AggregateError && error.cause === original && error.errors[0] === original && /rollback could not be confirmed/.test(error.errors[1].message));
    assert.equal(saves, 2);
    assert.equal(eventSource.listenerCount("saved"), 0);
    assert.deepEqual(settings._backupProfiles, {});
    assert.equal(storage.getItem("qig_profiles"), "{}");
    assert.equal(storage.getItem("qig_sync_pending:qig_profiles"), "1", "an unconfirmed rollback must not let a possibly newer server copy replace restored local data");
});

test("slow settings saves get fresh bounded readback after the early observer expires", async () => {
    for (const readbackTimesOut of [false, true]) {
        const storage = createStorage();
        const settings = {};
        const eventSource = new EventEmitter();
        let observation;
        let saved = false;
        let aborted = false;
        let saves = 0;
        let reads = 0;
        const result = await persistSynchronizedStore({
            storage,
            settings,
            localKey: "qig_profiles",
            backupKey: "_backupProfiles",
            value: { next: true },
            acknowledge: expectedValues => {
                observation = createSettingsSaveEventConfirmer({
                    eventSource,
                    eventTypes: { SETTINGS_UPDATED: "saved" },
                    timeoutMs: 10,
                    confirm: () => confirmSettingsValues({
                        settingsKey: "qig",
                        expectedValues,
                        timeoutMs: 10,
                        fetchImpl: async (_url, { signal }) => {
                            assert.equal(saved, true, "readback must follow the slow host save");
                            reads++;
                            if (readbackTimesOut) return new Promise((_resolve, reject) => {
                                signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
                            });
                            return Response.json({ settings: JSON.stringify({ extension_settings: { qig: settings } }) });
                        },
                    }),
                })();
                return observation;
            },
            save: async () => {
                saves++;
                assert.equal(eventSource.listenerCount("saved"), 1, "observation starts before save");
                assert.equal(await observation, false, "host save outlasts the event deadline");
                assert.equal(eventSource.listenerCount("saved"), 0);
                eventSource.emit("saved");
                saved = true;
            },
        });
        assert.equal(saves, 1, "a slow successful save must not provoke compensation");
        assert.equal(reads, 1, "expired observations still get a fresh readback");
        assert.equal(result.confirmed, !readbackTimesOut);
        assert.equal(aborted, readbackTimesOut);
        assert.equal(eventSource.listenerCount("saved"), 0);
        assert.equal(storage.getItem("qig_sync_pending:qig_profiles"), readbackTimesOut ? "1" : null);
    }
});

test("an early positive settings event cannot replace fresh post-save verification", async () => {
    const eventSource = new EventEmitter();
    let observation;
    let durable = { _backupProfiles: { next: true } };
    let reads = 0;
    const storage = createStorage();
    const result = await persistSynchronizedStore({
        storage,
        settings: {},
        localKey: "qig_profiles",
        backupKey: "_backupProfiles",
        value: { next: true },
        acknowledge: expectedValues => {
            observation = createSettingsSaveEventConfirmer({
                eventSource,
                eventTypes: { SETTINGS_UPDATED: "saved" },
                confirm: () => confirmSettingsValues({
                    settingsKey: "qig",
                    expectedValues,
                    fetchImpl: async () => {
                        reads++;
                        return Response.json({ settings: { extension_settings: { qig: durable } } });
                    },
                }),
            })();
            return observation;
        },
        save: async () => {
            eventSource.emit("saved");
            assert.equal(await observation, true);
            durable = { _backupProfiles: { stale: true } };
        },
    });
    assert.equal(reads, 2);
    assert.equal(result.confirmed, false);
    assert.equal(storage.getItem("qig_sync_pending:qig_profiles"), "1");
    assert.equal(eventSource.listenerCount("saved"), 0);
});

test("configuration records and their active selection are confirmed and compensated together", async () => {
    const old = [{ id: "old" }];
    const storage = createStorage({ qig_configurations: JSON.stringify(old) });
    const settings = { _backupConfigurations: old, lastLoadedPresetId: "old" };
    const eventSource = new EventEmitter();
    const original = new Error("lost configuration save response");
    const saved = [];
    const operation = persistSynchronizedStore({
        storage,
        settings,
        localKey: "qig_configurations",
        backupKey: "_backupConfigurations",
        value: [{ id: "new" }],
        settingsChanges: { lastLoadedPresetId: "new" },
        acknowledge: expectedValues => createSettingsSaveEventConfirmer({
            eventSource,
            eventTypes: { SETTINGS_UPDATED: "saved" },
            confirm: () => JSON.stringify(saved.at(-1)) === JSON.stringify(expectedValues),
        })(),
        save: async () => {
            saved.push(structuredClone(settings));
            if (saved.length === 1) throw original;
            eventSource.emit("saved");
        },
    });
    assert.equal(settings.lastLoadedPresetId, "old", "the selection is staged inside the serialized operation");
    await assert.rejects(operation, error => error === original);
    assert.deepEqual(saved, [
        { _backupConfigurations: [{ id: "new" }], lastLoadedPresetId: "new" },
        { _backupConfigurations: [{ id: "old" }], lastLoadedPresetId: "old" },
    ]);
    assert.deepEqual(settings, saved[1]);
    assert.equal(storage.getItem("qig_configurations"), JSON.stringify(old));
    assert.equal(eventSource.listenerCount("saved"), 0);
});
