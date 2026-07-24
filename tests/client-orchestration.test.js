import assert from "node:assert/strict";
import test from "node:test";

import {
    applyStateBeforePersistence,
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
    normalizeCharacterReferenceRecord,
    normalizeMessageSourceIdentity,
    normalizePromptHistory,
    readConstrainedNumber,
    registerConversationCheckpointInsertion,
    rethrowAfterRollbackPersistence,
    sendIsolatedConnectionManagerRequest,
    setCharacterProviderReferences,
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
    assert.deepEqual(normalizePromptHistory([
        null,
        { prompt: "" },
        { prompt: "one", negative: 4, time: null },
        { prompt: "two", negative: "no", time: "now" },
    ], 1), [{ prompt: "one", negative: "", time: "" }]);
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

test("conversation checkpoints detect append-only advancement and generated image messages", () => {
    const chat = [{ mes: "reply", is_user: false }];
    const checkpoint = createConversationCheckpoint(chat);
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), true);
    chat.push({ mes: "next", is_user: true });
    assert.equal(isConversationCheckpointCurrent(checkpoint, chat), false);
    assert.equal(isGeneratedImageMessage({ is_user: false, extra: { inline_image: true } }), true);
    assert.equal(isGeneratedImageMessage({ is_user: false, mes: "normal reply" }), false);
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
