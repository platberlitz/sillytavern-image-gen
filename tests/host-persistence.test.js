import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { confirmSettingsSyncCacheId, confirmSettingsValues, createChatSaveConfirmer, createSettingsSaveEventConfirmer } from "../lib/host-persistence.js";

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

test("confirmSettingsSyncCacheId accepts a server copy containing the generated id", async () => {
    const seen = [];
    const result = await confirmSettingsSyncCacheId({
        fetchImpl: async (url, init) => {
            seen.push({ url, init });
            return jsonResponse({ settings: JSON.stringify({ extension_settings: { "quick-image-gen": { _syncCacheId: "abc-123" } } }) });
        },
        getRequestHeaders: () => ({ "X-CSRF": "token" }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "abc-123",
    });

    assert.equal(result, true);
    assert.equal(seen[0].url, "/api/settings/get");
    assert.equal(seen[0].init.method, "POST");
    assert.equal(seen[0].init.cache, "no-store");
    assert.equal(seen[0].init.headers["X-CSRF"], "token");
});

test("settings confirmation accepts parsed settings but never a matching id under another key", async () => {
    const parsed = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ settings: { extension_settings: { "quick-image-gen": { _syncCacheId: "direct-id" } } } }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "direct-id",
    });
    assert.equal(parsed, true);

    const nested = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ settings: JSON.stringify({ extension_settings: { qig: { inner: { _syncCacheId: "deep-id" } } } }) }),
        settingsKey: "quick-image-gen",
        expectedSyncCacheId: "deep-id",
    });
    assert.equal(nested, false);
});

test("confirmSettingsSyncCacheId fails closed on errors and mismatches", async () => {
    const mismatch = await confirmSettingsSyncCacheId({
        fetchImpl: async () => jsonResponse({ settings: JSON.stringify({ extension_settings: { "quick-image-gen": { _syncCacheId: "other-id" } } }) }),
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

test("settings save event confirmer requires positive value confirmation after SETTINGS_UPDATED", async () => {
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
        confirm: async () => true,
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
        confirm: async () => true,
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

test("unrelated settings events cannot acknowledge stale values and do not consume the observer", async () => {
    const eventSource = new EventEmitter();
    const expectedValues = { _backupProfiles: { next: true }, _backupCharSettings: {} };
    let storedValues = { _backupProfiles: { old: true }, _backupCharSettings: {} };
    const confirmation = createSettingsSaveEventConfirmer({
        eventSource,
        eventTypes: { SETTINGS_UPDATED: "saved" },
        timeoutMs: 500,
        confirm: () => confirmSettingsValues({
            settingsKey: "quick-image-gen",
            expectedValues,
            fetchImpl: async () => jsonResponse({ settings: JSON.stringify({ extension_settings: { "quick-image-gen": storedValues } }) }),
        }),
    })();

    eventSource.emit("saved");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(eventSource.listenerCount("saved"), 1);
    storedValues = expectedValues;
    eventSource.emit("saved");
    assert.equal(await confirmation, true);
    assert.equal(eventSource.listenerCount("saved"), 0);
});

test("cancelled settings confirmation removes the observer immediately", async () => {
    const eventSource = new EventEmitter();
    const confirmation = createSettingsSaveEventConfirmer({
        eventSource,
        eventTypes: { SETTINGS_UPDATED: "saved" },
        confirm: async () => true,
    })();
    confirmation.cancel();
    assert.equal(await confirmation, false);
    assert.equal(eventSource.listenerCount("saved"), 0);
});

test("chat confirmation snapshots the exact character, filename and message values before saving", async () => {
    const context = {
        chatId: "chat-a",
        characterId: 0,
        characters: [{ name: "A", avatar: "a.png" }],
        chat: [{ mes: "scene", extra: { image: "/new.png" } }],
    };
    let durableChat = structuredClone(context.chat);
    const confirm = createChatSaveConfirmer({
        context,
        fetchImpl: async (url, init) => {
            assert.equal(url, "/api/chats/get");
            assert.equal(init.method, "POST");
            assert.deepEqual(JSON.parse(init.body), { ch_name: "A", avatar_url: "a.png", file_name: "chat-a" });
            return jsonResponse([{ chat_metadata: {} }, ...durableChat]);
        },
    });
    context.chatId = "chat-b";
    context.characters[0].avatar = "b.png";
    context.chat[0].extra.image = "/later.png";
    assert.equal(await confirm(), true, "readback uses the pre-save target and values, not the live context");
    durableChat = [{ mes: "scene" }];
    assert.equal(await confirm(), false, "a swallowed save with old server data is not success");
});

test("group chat and metadata confirmation use their distinct persisted stores", async () => {
    const context = {
        groupId: "group-a",
        chatId: "group-chat-a",
        chat: [{ is_group: true, mes: "scene" }],
        chatMetadata: { custom_background: "new-css" },
    };
    const confirmChat = createChatSaveConfirmer({
        context,
        fetchImpl: async (url, init) => {
            assert.equal(url, "/api/chats/group/get");
            assert.deepEqual(JSON.parse(init.body), { id: "group-chat-a" });
            return jsonResponse(context.chat);
        },
    });
    assert.equal(await confirmChat(), true);
    let durableChatId = "another-chat";
    const confirmMetadata = createChatSaveConfirmer({
        context,
        metadataOnly: true,
        fetchImpl: async (url) => {
            assert.equal(url, "/api/groups/all");
            return jsonResponse([{ id: "group-a", chat_id: durableChatId, chat_metadata: context.chatMetadata }]);
        },
    });
    assert.equal(await confirmMetadata(), false, "a different chat in the same group cannot acknowledge the save");
    durableChatId = "group-chat-a";
    assert.equal(await confirmMetadata(), true);
});

test("baseline chat JSON round-trips generated metadata without comparing generated header fields", async () => {
    const context = {
        chatId: "chat-a",
        characterId: 0,
        characters: [{ name: "A", avatar: "a.png" }],
        chat: [{
            name: "A",
            send_date: new Date("2026-09-06T12:00:00Z"),
            mes: "Generated image",
            extra: {
                media: [{ url: "/new.png", type: "image", source: "generated", title: "Scene" }],
                qig_generation: { seed: -1, model: "flux", optional: undefined },
            },
        }],
    };
    // script.js JSON-serialises the payload; chats.js writes and reads JSONL records.
    const payload = JSON.parse(JSON.stringify([
        { user_name: "User", character_name: "A", create_date: "host timestamp", chat_metadata: { integrity: "host-generated" } },
        ...context.chat,
    ]));
    const stored = payload.map(JSON.stringify).join("\n").split("\n").map(line => JSON.parse(line));
    const confirm = createChatSaveConfirmer({ context, fetchImpl: async () => jsonResponse(stored) });
    assert.equal(await confirm(), true);
    stored[0].chat_metadata.generated = "another host field";
    stored[0].create_date = "another timestamp";
    assert.equal(await confirm(), true);
    stored[1].extra.media[0].url = "/wrong.png";
    assert.equal(await confirm(), false, "real attachment changes still invalidate confirmation");
});

test("chat readback fails closed on unavailable targets, errors and a bounded timeout", async () => {
    const context = { chatId: "chat", characterId: 0, characters: [{ avatar: "a.png" }], chat: [{ mes: "new" }] };
    for (const payload of [{}, [], [{ chat_metadata: {} }, { mes: "old" }]]) {
        assert.equal(await createChatSaveConfirmer({ context, fetchImpl: async () => jsonResponse(payload) })(), false);
    }
    assert.equal(await createChatSaveConfirmer({ context, fetchImpl: async () => jsonResponse({}, 500) })(), false);
    assert.equal(await createChatSaveConfirmer({ context: { ...context, chatId: undefined } })(), false);
    let aborted = false;
    assert.equal(await createChatSaveConfirmer({
        context,
        timeoutMs: 20,
        fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
                aborted = true;
                reject(signal.reason);
            }, { once: true });
        }),
    })(), false);
    assert.equal(aborted, true);
});

test("40 MiB accumulated inline chats and their metadata have a chat-sized UTF-8 readback budget", async () => {
    const image = `data:image/png;base64,${"A".repeat(10 * 1024 * 1024)}`;
    const context = {
        chatId: "large-chat",
        characterId: 0,
        characters: [{ name: "A", avatar: "a.png" }],
        chat: Array.from({ length: 4 }, () => ({ mes: "Generated image", extra: { image } })),
        chatMetadata: { notes: "\u754c".repeat(700_000), custom_background: "new-css" },
    };
    assert.ok(Buffer.byteLength(JSON.stringify(context.chat)) > 36 * 1024 * 1024);
    const payload = JSON.stringify([{ chat_metadata: context.chatMetadata }, ...context.chat]);
    for (const metadataOnly of [false, true]) {
        const confirm = createChatSaveConfirmer({
            context,
            metadataOnly,
            fetchImpl: async () => new Response(payload),
        });
        assert.equal(await confirm(), true, "both message saves and metadata saves read the complete chat file");
    }
});

test("chat readback still rejects streamed data beyond the expected envelope allowance", async () => {
    const context = { chatId: "small-chat", characterId: 0, characters: [{ avatar: "a.png" }], chat: [], chatMetadata: {} };
    const confirm = createChatSaveConfirmer({
        context,
        fetchImpl: async () => jsonResponse([{ chat_metadata: { unexpected: "x".repeat(2 * 1024 * 1024) } }]),
    });
    assert.equal(await confirm(), false, "matching messages do not permit an unbounded metadata response");
});

test("group metadata readback accounts for the known group-list envelope", async () => {
    const context = {
        chatId: "group-chat",
        groupId: "group",
        chatMetadata: { custom_background: "new-css" },
        groups: [{ id: "group", chat_id: "group-chat", description: "x".repeat(2 * 1024 * 1024) }],
    };
    const confirm = createChatSaveConfirmer({
        context,
        metadataOnly: true,
        fetchImpl: async () => jsonResponse([{ ...context.groups[0], chat_metadata: context.chatMetadata }]),
    });
    assert.equal(await confirm(), true);
});
