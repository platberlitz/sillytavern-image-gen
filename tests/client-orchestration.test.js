import assert from "node:assert/strict";
import test from "node:test";

import {
    applyStateBeforePersistence,
    buildChatHistoryMessages,
    createAccountStorageScope,
    createAbortableSerializedRunner,
    createConversationCheckpoint,
    createLatestWinsAsyncRunner,
    createPromiseQueue,
    getCharacterProviderReferences,
    hasCharacterReferenceOverrides,
    hasStorageKey,
    isConversationCheckpointCurrent,
    isGeneratedImageMessage,
    materializeAndValidateProviderOutput,
    MAX_PROMPT_HISTORY_NEGATIVE_LENGTH,
    MAX_PROMPT_HISTORY_PROMPT_LENGTH,
    MAX_PROMPT_HISTORY_SERIALIZED_LENGTH,
    normalizeCharacterReferenceRecord,
    normalizeMessageSourceIdentity,
    normalizePromptHistory,
    persistIfCurrent,
    persistPromptHistory,
    readConstrainedNumber,
    registerConversationCheckpointInsertion,
    rethrowAfterRollbackPersistence,
    restoreMutableMessageState,
    sendIsolatedConnectionManagerRequest,
    setCharacterProviderReferences,
    snapshotMutableMessageState,
    summarizeOperationOutcomes,
    unregisterConversationCheckpointInsertion,
} from "../lib/client-orchestration.js";

test("promise queue keeps the complete critical section serialized", async () => {
    const enqueue = createPromiseQueue();
    const events = [];
    let releaseFirst;
    let markFirstStarted;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });

    const first = enqueue(async () => {
        events.push("first:prepare");
        markFirstStarted();
        await firstGate;
        events.push("first:request");
        events.push("first:restore");
    });
    const second = enqueue(async () => {
        events.push("second:prepare");
        events.push("second:request");
        events.push("second:restore");
    });

    await firstStarted;
    assert.deepEqual(events, ["first:prepare"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, [
        "first:prepare", "first:request", "first:restore",
        "second:prepare", "second:request", "second:restore",
    ]);
});

test("latest-wins runner lets stale async migrations fail closed", async () => {
    const run = createLatestWinsAsyncRunner();
    let releaseFirst;
    const applied = [];
    const first = run(async isCurrent => {
        await new Promise(resolve => { releaseFirst = resolve; });
        if (isCurrent()) applied.push("first");
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = run(async isCurrent => {
        if (isCurrent()) applied.push("second");
    });
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(applied, ["second"]);
});

test("abortable serialized runner skips queued work and settles in-flight callers promptly", async () => {
    const run = createAbortableSerializedRunner();
    const events = [];
    let releaseFirst;
    let firstStarted;
    const started = new Promise(resolve => { firstStarted = resolve; });
    const first = run(async () => {
        events.push("first:start");
        firstStarted();
        await new Promise(resolve => { releaseFirst = resolve; });
        events.push("first:end");
    });
    await started;

    const queuedController = new AbortController();
    const queued = run(async () => events.push("queued:ran"), queuedController.signal);
    queuedController.abort();
    await assert.rejects(queued, error => error.name === "AbortError");

    const inFlightController = new AbortController();
    let releaseInFlight;
    const inFlightStarted = new Promise(resolve => {
        void run(async () => {
            events.push("in-flight:start");
            resolve();
            await new Promise(done => { releaseInFlight = done; });
            events.push("in-flight:end");
        }, inFlightController.signal).catch(() => {});
    });
    releaseFirst();
    await first;
    await inFlightStarted;
    inFlightController.abort();
    releaseInFlight();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(events, ["first:start", "first:end", "in-flight:start", "in-flight:end"]);
});

test("Connection Manager preset overrides use cloned request state and reject mutation-only fallbacks", async () => {
    const profile = { id: "profile", api: "chat", model: "model", preset: "base", "secret-id": "secret-2" };
    const directCalls = [];
    const directService = {
        getProfile: () => profile,
        validateProfile: () => ({ selected: "openai", source: "custom" }),
        sendRequest: () => assert.fail("cloned direct request should not use the live profile lookup"),
    };
    const context = {
        ChatCompletionService: {
            async processRequest(request, options, extractData, signal) {
                directCalls.push({ request, options, extractData, signal });
                return { content: "ok" };
            },
        },
    };
    const result = await sendIsolatedConnectionManagerRequest({
        service: directService,
        context,
        profileId: profile.id,
        messages: [{ role: "user", content: "prompt" }],
        maxTokens: 50,
        preset: "request-only",
    });
    assert.deepEqual(result, { content: "ok" });
    assert.equal(profile.preset, "base");
    assert.equal(directCalls[0].options.presetName, "request-only");
    assert.equal(directCalls[0].request.secret_id, "secret-2");

    const fallbackService = {
        getProfile: () => profile,
        sendRequest: async () => assert.fail("unsupported override must not touch the live profile"),
    };
    await assert.rejects(sendIsolatedConnectionManagerRequest({
        service: fallbackService,
        context: {},
        profileId: profile.id,
        messages: [],
        maxTokens: 10,
        preset: "temporary",
    }), /does not support an isolated preset override/);
    assert.equal(profile.preset, "base");
});

test("separate-AI chat history ends at the scene, skips filtered messages without counting them, and reads oldest first", () => {
    const chat = [
        { name: "A", mes: "one" },
        { name: "B", mes: "two", is_system: true },
        { name: "A", mes: "three" },
        { name: "B", mes: "four" },
        { name: "A", mes: "five" },
    ];
    const formatMessage = (message) => (message.is_system ? null : `${message.name}: ${message.mes}`);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: 2, throughIndex: 3, formatMessage }), ["A: three", "B: four"]);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: 2, throughIndex: 2, formatMessage }), ["A: one", "A: three"]);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: 1, formatMessage }), ["A: five"]);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: 9, throughIndex: 99, formatMessage }), ["A: one", "A: three", "B: four", "A: five"]);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: 0, formatMessage }), []);
    assert.deepEqual(buildChatHistoryMessages(chat, { depth: "3", throughIndex: 0, formatMessage }), ["A: one"]);
});

test("Connection Manager cancellation waits for abort-ignoring official work to settle", async () => {
    const profile = { id: "profile", preset: "base" };
    let finish;
    const service = {
        getProfile: () => profile,
        sendRequestWithProfile: async () => new Promise(resolve => { finish = resolve; }),
        sendRequest: async () => assert.fail("preset override should use the cloned profile path"),
    };
    const controller = new AbortController();
    const request = sendIsolatedConnectionManagerRequest({
        service,
        context: {},
        profileId: profile.id,
        messages: [],
        maxTokens: 10,
        preset: "temporary",
        signal: controller.signal,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    let settled = false;
    request.finally(() => { settled = true; }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(settled, false);
    assert.equal(profile.preset, "base");
    finish("late result");
    await assert.rejects(request, error => error.name === "AbortError");
    assert.equal(profile.preset, "base");
});

test("prompt history rejects malformed stores and bounds validated entries", () => {
    assert.deepEqual(normalizePromptHistory({ prompt: "bad" }), []);
    assert.deepEqual(normalizePromptHistory([{ prompt: "none" }], 0), []);
    assert.deepEqual(normalizePromptHistory([
        null,
        { prompt: "" },
        { prompt: "one", negative: 4, time: null },
        { prompt: "two", negative: "no", time: "now" },
    ], 1), [{ prompt: "one", negative: "", time: "" }]);

    const oversized = normalizePromptHistory(Array.from({ length: 50 }, (_, index) => ({
        prompt: `${index}${"\0".repeat(MAX_PROMPT_HISTORY_PROMPT_LENGTH + 100)}`,
        negative: "\0".repeat(MAX_PROMPT_HISTORY_NEGATIVE_LENGTH + 100),
        time: "t".repeat(500),
    })));
    assert.ok(oversized.length > 0);
    assert.ok(oversized.every(entry => entry.prompt.length <= MAX_PROMPT_HISTORY_PROMPT_LENGTH));
    assert.ok(oversized.every(entry => entry.negative.length <= MAX_PROMPT_HISTORY_NEGATIVE_LENGTH));
    assert.ok(JSON.stringify(oversized).length <= MAX_PROMPT_HISTORY_SERIALIZED_LENGTH);
});

test("account browser-storage names are isolated and require an identity", () => {
    const first = createAccountStorageScope("account-a");
    const second = createAccountStorageScope("account-b");
    assert.equal(createAccountStorageScope(""), null);
    assert.notEqual(first.galleryDbName, second.galleryDbName);
    assert.notEqual(first.galleryManifestKey, second.galleryManifestKey);
    assert.notEqual(first.promptHistoryKey, second.promptHistoryKey);
    assert.notEqual(first.galleryDbName, "qig-gallery");
    assert.notEqual(first.galleryManifestKey, "qig_gallery_manifest_v2");
    assert.notEqual(first.promptHistoryKey, "qig_prompt_history");
});

test("prompt history quota failure never erases the previously stored history", () => {
    const key = "scoped-history";
    const previous = JSON.stringify([{ prompt: "previous", negative: "", time: "then" }]);
    const values = new Map([[key, previous]]);
    const attempts = [];
    const storage = {
        getItem: name => values.get(name) ?? null,
        setItem(name, value) {
            attempts.push(value);
            if (value.length > 100) throw new DOMException("full", "QuotaExceededError");
            values.set(name, value);
        },
    };
    const next = [
        { prompt: "n".repeat(200), negative: "", time: "now" },
        { prompt: "previous", negative: "", time: "then" },
    ];

    const result = persistPromptHistory(storage, key, next);

    assert.equal(result.saved, false);
    assert.equal(storage.getItem(key), previous);
    assert.equal(attempts.includes("[]"), false);
    assert.equal(result.history[0].prompt, "n".repeat(200));
});

test("prompt history quota recovery drops oldest entries before the newest", () => {
    const key = "scoped-history";
    const newest = { prompt: "new", negative: "", time: "now" };
    const oldest = { prompt: "old", negative: "", time: "then" };
    const newestSerialized = JSON.stringify([newest]);
    const storage = {
        value: "",
        setItem(name, value) {
            assert.equal(name, key);
            if (value.length > newestSerialized.length) {
                throw new DOMException("full", "QuotaExceededError");
            }
            this.value = value;
        },
    };

    const result = persistPromptHistory(storage, key, [newest, oldest]);

    assert.equal(result.saved, true);
    assert.deepEqual(result.history, [newest]);
    assert.equal(storage.value, newestSerialized);
});

test("character references remain owned by their provider", () => {
    const migrated = normalizeCharacterReferenceRecord(["legacy"], "proxy");
    const withLocal = setCharacterProviderReferences(migrated, "local", "local-image");
    const withNano = setCharacterProviderReferences(withLocal, "nanobanana", ["nano-image"]);

    assert.deepEqual(getCharacterProviderReferences(withNano, "proxy"), ["legacy"]);
    assert.deepEqual(getCharacterProviderReferences(withNano, "nanobanana"), ["nano-image"]);
    assert.equal(getCharacterProviderReferences(withNano, "local"), "local-image");
    assert.deepEqual(getCharacterProviderReferences(withNano, "custom"), []);
    assert.equal(hasCharacterReferenceOverrides(withNano), true);
    assert.equal(hasCharacterReferenceOverrides({}), false);
});

test("legacy numeric-only gallery identities do not target a chat message", () => {
    assert.deepEqual(normalizeMessageSourceIdentity({ sourceMessageIndex: 7 }), {
        sourceMessageIndex: null,
        sourceChatId: "",
        sourceMessageId: "",
        sourceMessageSignature: "",
    });
    assert.deepEqual(normalizeMessageSourceIdentity({
        sourceMessageIndex: 7,
        sourceChatId: "chat-a",
        sourceMessageSignature: "signature",
    }), {
        sourceMessageIndex: 7,
        sourceChatId: "chat-a",
        sourceMessageId: "",
        sourceMessageSignature: "signature",
    });
});

test("storage probes fall back cleanly and state rolls back when persistence fails", async () => {
    assert.equal(hasStorageKey({ getItem: () => { throw new Error("denied"); } }, "key"), false);
    const state = { value: "override" };
    const saved = await applyStateBeforePersistence({
        apply: () => { state.value = "base"; },
        persist: async () => {
            assert.equal(state.value, "base");
            return false;
        },
        rollback: () => { state.value = "override"; },
    });
    assert.equal(saved, false);
    assert.equal(state.value, "override");
});

test("identity-bound persistence rejects failed saves and skips stale compensation", async () => {
    let current = false;
    let calls = 0;
    const persist = async () => { calls += 1; };

    assert.equal(await persistIfCurrent({ persist, isCurrent: () => current, skipIfStale: true }), false);
    assert.equal(calls, 0);
    await assert.rejects(
        persistIfCurrent({ persist, isCurrent: () => current, staleMessage: "chat changed" }),
        error => error?.name === "AbortError" && error.message === "chat changed",
    );

    current = true;
    await assert.rejects(
        persistIfCurrent({ persist: async () => false, isCurrent: () => current, failureMessage: "save failed" }),
        /save failed/,
    );
    await assert.rejects(
        persistIfCurrent({
            persist: async () => { current = false; },
            isCurrent: () => current,
            staleMessage: "chat changed after save",
        }),
        error => error?.name === "AbortError" && error.message === "chat changed after save",
    );
});

test("rollback persistence preserves the original failure and aggregates compensation failures", async () => {
    const original = new DOMException("commit cancelled", "AbortError");
    let persisted = 0;
    await assert.rejects(rethrowAfterRollbackPersistence(original, async () => { persisted += 1; }), error => error === original);
    assert.equal(persisted, 1);

    const rollback = new Error("rollback save failed");
    await assert.rejects(
        rethrowAfterRollbackPersistence(original, async () => { throw rollback; }, "insert rollback failed"),
        error => error instanceof AggregateError
            && error.message === "insert rollback failed"
            && error.cause === original
            && error.errors[0] === original
            && error.errors[1] === rollback,
    );
});

test("mutable message state is restored exactly after a failed persistence attempt", () => {
    const message = {
        mes: "<image>keep me</image>",
        extra: { display_text: "display", nested: { value: 1 } },
        swipes: ["first", "<image>current</image>"],
        swipe_id: 1,
        untouched: "preserved",
    };
    const snapshot = snapshotMutableMessageState(message);

    message.mes = "";
    message.extra.display_text = "";
    message.extra.consumed = true;
    message.swipes[1] = "";
    delete message.swipe_id;
    message.untouched = "newer unrelated value";

    assert.equal(restoreMutableMessageState(message, snapshot), true);
    assert.deepEqual(message, {
        mes: "<image>keep me</image>",
        extra: { display_text: "display", nested: { value: 1 } },
        swipes: ["first", "<image>current</image>"],
        swipe_id: 1,
        untouched: "newer unrelated value",
    });
});

test("conversation checkpoints detect append-only advancement and generated image messages", () => {
    const chat = [{ mes: "reply", is_user: false }];
    const checkpoint = createConversationCheckpoint(chat);
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), true);
    chat.push({ mes: "next", is_user: true });
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), false);
    assert.equal(isGeneratedImageMessage({ is_user: false, extra: { inline_image: true } }), true);
    assert.equal(isGeneratedImageMessage({ is_user: false, mes: "normal reply" }), false);
});

test("generated-image predicate retains text-bearing replies with attachments and drops only media-only messages", () => {
    assert.equal(isGeneratedImageMessage({
        is_user: false,
        mes: "A thoughtful roleplay reply with words",
        extra: { inline_image: true },
    }), false);
    assert.equal(isGeneratedImageMessage({
        is_user: false,
        mes: "A thoughtful roleplay reply with words",
        extra: { media: [{ url: "blob:gen", source: "generated" }] },
    }), false);
    assert.equal(isGeneratedImageMessage({ is_user: false, mes: "", extra: { inline_image: true } }), true);
    assert.equal(isGeneratedImageMessage({ is_user: false, mes: "   ", extra: { inline_image: true } }), true);
    assert.equal(isGeneratedImageMessage({
        is_user: false,
        mes: "Generated image",
        extra: { inline_image: true },
    }), true);
    assert.equal(isGeneratedImageMessage({
        is_user: false,
        mes: "Generated image",
        extra: { media: [{ url: "blob:gen", source: "generated" }] },
    }), true);
    assert.equal(isGeneratedImageMessage({ is_user: true, extra: { inline_image: true } }), false);
    assert.equal(isGeneratedImageMessage({ is_user: false, mes: "reply with a linked upload", extra: { media: [{ url: "blob:up", source: "upload" }] } }), false);
});

test("preset overrides reject profiles whose endpoint cannot be isolated", async () => {
    const profile = { id: "proxy-profile", api: "openai", model: "model", preset: "base", "api-url": "https://proxy.example/v1" };
    const service = {
        getProfile: () => profile,
        validateProfile: () => ({ selected: "openai", source: "openai" }),
        sendRequest: async () => assert.fail("endpoint-isolated override must not reach the live service"),
    };
    await assert.rejects(sendIsolatedConnectionManagerRequest({
        service,
        context: { ChatCompletionService: { processRequest: async () => assert.fail("endpoint-isolated override must not reach the host service") } },
        profileId: profile.id,
        messages: [{ role: "user", content: "prompt" }],
        maxTokens: 10,
        preset: "temporary",
    }), /cannot be isolated for a preset override/);
    assert.equal(profile.preset, "base");
});

test("conversation checkpoints accept only registered contiguous owned insertions", () => {
    const source = { mes: "reply", is_user: false };
    const chat = [source];
    const checkpoint = createConversationCheckpoint(chat);
    const firstImage = { extra: { inline_image: true } };
    chat.push(firstImage);
    assert.equal(registerConversationCheckpointInsertion(checkpoint, firstImage), true);
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), true);

    const secondImage = { extra: { inline_image: true } };
    chat.push(secondImage);
    assert.equal(registerConversationCheckpointInsertion(checkpoint, secondImage), true);
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), true);

    chat.push({ mes: "external message", is_user: true });
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), false);
    assert.equal(registerConversationCheckpointInsertion(checkpoint, chat.at(-1)), false);
    assert.equal(unregisterConversationCheckpointInsertion(checkpoint, secondImage), true);
});

test("numeric constraints reject integer and fractional step mismatches", () => {
    assert.deepEqual(readConstrainedNumber("7", { previousValue: 3, min: 1, max: 10, step: 1 }), { valid: true, value: 7 });
    assert.deepEqual(readConstrainedNumber("7.5", { previousValue: 3, min: 1, max: 10, step: 1 }), { valid: false, value: 3 });
    assert.deepEqual(readConstrainedNumber("0", { previousValue: 6, min: 0, max: 30, step: 0.5 }), { valid: true, value: 0 });
    assert.deepEqual(readConstrainedNumber("1.25", { previousValue: 6, min: 0, max: 30, step: 0.5 }), { valid: false, value: 6 });
});

test("materialized transient output is released when normalization or verification fails", async () => {
    const released = [];
    await assert.rejects(materializeAndValidateProviderOutput({ url: "remote" }, {
        materialize: async () => "blob:transient",
        normalize: value => value,
        verify: async () => { throw new Error("decode failed"); },
        release: value => released.push(value),
    }), /decode failed/);
    assert.deepEqual(released, ["blob:transient", "remote"]);
});

test("operation outcomes report partial failures without inflating success counts", () => {
    assert.deepEqual(summarizeOperationOutcomes([
        { success: true },
        { success: false, error: new Error("failed") },
        null,
    ]), { succeeded: 1, failed: 2, total: 3 });
});
