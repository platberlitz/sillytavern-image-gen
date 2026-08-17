import assert from "node:assert/strict";
import test from "node:test";

import { confirmSettingsSyncCacheId, createSettingsSaveEventConfirmer } from "../lib/host-persistence.js";

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

test("confirmSettingsSyncCacheId accepts a server copy containing the generated id", async () => {
    const seen = [];
    const result = await confirmSettingsSyncCacheId({
        fetchImpl: async (url, init) => {
            seen.push({ url, init });
            return jsonResponse({ settings: { "quick-image-gen": { _syncCacheId: "abc-123" } } });
        },
        getRequestHeaders: () => ({ "X-CSRF": "token" }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });

    assert.equal(result, true);
    assert.equal(seen[0].url, "/api/settings/get");
    assert.equal(seen[0].init.headers["X-CSRF"], "token");
});

test("confirmSettingsSyncCacheId tolerates a bare payload and string fallback", async () => {
    const bare = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ "quick-image-gen": { _syncCacheId: "direct-id" } }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "direct-id",
    });
    assert.equal(bare, true);

    const nested = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ settings: { qig: { inner: { _syncCacheId: "deep-id" } } } }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "deep-id",
    });
    assert.equal(nested, true);
});

test("confirmSettingsSyncCacheId fails closed on errors and mismatches", async () => {
    const mismatch = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ settings: { "quick-image-gen": { _syncCacheId: "other-id" } } }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });
    assert.equal(mismatch, false);

    const httpError = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({}, 500),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });
    assert.equal(httpError, false);

    const networkError = await confirmSettingsSyncCacheId({
        fetchImpl: async () => { throw new Error("offline"); },
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });
    assert.equal(networkError, false);

    const noFetch = await confirmSettingsSyncCacheId({
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });
    assert.equal(noFetch, false);
});

test("settings save event confirmer resolves true on the next SETTINGS_UPDATED", async () => {
    const listeners = [];
    const eventSource = {
        on: (type, handler) => {
            const entry = { type, handler };
            listeners.push(entry);
            return () => {
                const index = listeners.indexOf(entry);
                if (index >= 0) listeners.splice(index, 1);
            };
        },
        off: (type, handler) => {
            const index = listeners.findIndex(entry => entry.type === type && entry.handler === handler);
            if (index >= 0) listeners.splice(index, 1);
        },
    };
    const confirmation = createSettingsSaveEventConfirmer({
        eventSource,
        eventTypes: { SETTINGS_UPDATED: "settings_updated" },
        timeoutMs: 1000,
    })();

    queueMicrotask(() => listeners[0].handler());
    const result = await confirmation;
    assert.equal(result, true);
    assert.equal(listeners.length, 0, "listener removed after confirmation");
});

test("settings save event confirmer resolves false when no event arrives", async () => {
    const confirmation = createSettingsSaveEventConfirmer({
        eventSource: { on: () => () => {} },
        eventTypes: { SETTINGS_UPDATED: "settings_updated" },
        timeoutMs: 25,
    })();
    assert.equal(await confirmation, false);
});

test("settings save event confirmer resolves null when the host offers no signal", async () => {
    const withoutSource = await createSettingsSaveEventConfirmer({
        eventSource: null,
        eventTypes: { SETTINGS_UPDATED: "settings_updated" },
        timeoutMs: 25,
    })();
    assert.equal(withoutSource, null);

    const withoutType = await createSettingsSaveEventConfirmer({
        eventSource: { on: () => () => {} },
        eventTypes: {},
        timeoutMs: 25,
    })();
    assert.equal(withoutType, null);
});
