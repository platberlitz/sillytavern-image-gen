import assert from "node:assert/strict";
import test from "node:test";

import {
    persistLockedBackgroundState,
    removeInsertedMessage,
    rethrowAfterTransactionRollback,
    runDurableTransaction,
} from "../lib/chat-transaction.js";
import {
    createConversationCheckpoint,
    isConversationCheckpointCurrent,
    registerConversationCheckpointInsertion,
    unregisterConversationCheckpointInsertion,
} from "../lib/client-orchestration.js";

function deferred() {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
}

function contextMediaMessage(hidden = false) {
    return {
        name: "Assistant",
        is_user: false,
        is_system: hidden,
        send_date: "2026-07-27T00:00:00.000Z",
        mes: "",
        extra: {
            media: [{
                url: "/user/images/qig-context-media/scene.png",
                type: "image",
                title: "Scene",
                source: "context-media",
            }],
            media_display: "gallery",
            media_index: 0,
            inline_image: true,
        },
    };
}

test("locked backgrounds do not complete before immediate metadata persistence", async () => {
    const metadata = {
        custom_background: "old-css",
        chat_backgrounds: ["/old.png"],
    };
    const saveStarted = deferred();
    const saveGate = deferred();
    let durableMetadata = structuredClone(metadata);
    const context = {
        chatMetadata: metadata,
        async saveMetadata() {
            saveStarted.resolve();
            await saveGate.promise;
            durableMetadata = structuredClone(metadata);
        },
    };
    let settled = false;

    const operation = persistLockedBackgroundState(context, {
        cssUrl: "new-css",
        path: "/new.png",
    });
    operation.then(() => { settled = true; }, () => { settled = true; });
    await saveStarted.promise;

    assert.equal(settled, false);
    assert.deepEqual(metadata, {
        custom_background: "new-css",
        chat_backgrounds: ["/old.png", "/new.png"],
    });

    saveGate.resolve();
    assert.equal(await operation, true);
    assert.equal(settled, true);
    assert.deepEqual(durableMetadata, metadata);
});

test("locked backgrounds reject debounced-only persistence without changing metadata", async () => {
    const metadata = { unrelated: true };
    let debouncedCalls = 0;
    const context = {
        chatMetadata: metadata,
        saveMetadataDebounced() { debouncedCalls += 1; },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, { cssUrl: "new-css", path: "/new.png" }),
        /Immediate chat metadata persistence is unavailable/,
    );
    assert.deepEqual(metadata, { unrelated: true });
    assert.equal(debouncedCalls, 0);
});

test("locked backgrounds reject stale identities without saving or mutating metadata", async () => {
    const metadata = { custom_background: "old-css", chat_backgrounds: ["/old.png"] };
    let saveCalls = 0;
    const context = {
        chatMetadata: metadata,
        async saveMetadata() { saveCalls += 1; },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, {
            cssUrl: "new-css",
            path: "/new.png",
            isCurrent: () => false,
        }),
        error => error?.name === "AbortError",
    );
    assert.deepEqual(metadata, { custom_background: "old-css", chat_backgrounds: ["/old.png"] });
    assert.equal(saveCalls, 0);
});

test("locked-background false save results trigger rollback compensation", async () => {
    const metadata = { custom_background: "old-css" };
    let saveCalls = 0;
    let durableMetadata = structuredClone(metadata);
    const context = {
        chatMetadata: metadata,
        async saveMetadata() {
            saveCalls += 1;
            durableMetadata = structuredClone(metadata);
            return saveCalls === 1 ? false : undefined;
        },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, { cssUrl: "new-css" }),
        /persistence reported failure/,
    );
    assert.equal(saveCalls, 2);
    assert.deepEqual(metadata, { custom_background: "old-css" });
    assert.deepEqual(durableMetadata, metadata);
});

test("failed locked-background saves restore and durably compensate exact metadata", async () => {
    const previousBackgrounds = ["/old.png"];
    const metadata = {
        custom_background: "old-css",
        chat_backgrounds: previousBackgrounds,
        unrelated: { keep: true },
    };
    const originalFailure = new Error("metadata save failed after writing");
    let durableMetadata = structuredClone(metadata);
    let saveCalls = 0;
    const context = {
        chatMetadata: metadata,
        async saveMetadata() {
            saveCalls += 1;
            durableMetadata = structuredClone(metadata);
            if (saveCalls === 1) throw originalFailure;
        },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, { cssUrl: "new-css", path: "/new.png" }),
        error => error === originalFailure,
    );

    assert.equal(saveCalls, 2);
    assert.equal(metadata.custom_background, "old-css");
    assert.equal(metadata.chat_backgrounds, previousBackgrounds);
    assert.deepEqual(durableMetadata, metadata);
});

test("post-save locked-background invalidation rolls back the durable metadata", async () => {
    const metadata = { custom_background: "old-css" };
    const invalidated = new DOMException("chat changed", "AbortError");
    let durableMetadata = structuredClone(metadata);
    let saveCalls = 0;
    const context = {
        chatMetadata: metadata,
        async saveMetadata() {
            saveCalls += 1;
            durableMetadata = structuredClone(metadata);
        },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, {
            cssUrl: "new-css",
            path: "/new.png",
            validate: () => { throw invalidated; },
        }),
        error => error === invalidated,
    );

    assert.equal(saveCalls, 2);
    assert.deepEqual(metadata, { custom_background: "old-css" });
    assert.deepEqual(durableMetadata, metadata);
});

test("locked-background rollback persistence and CSS rollback failures are surfaced", async () => {
    const originalFailure = new Error("metadata save failed");
    const compensationFailure = new Error("metadata rollback save failed");
    const metadata = { custom_background: "old-css" };
    let saveCalls = 0;
    const context = {
        chatMetadata: metadata,
        async saveMetadata() {
            saveCalls += 1;
            throw saveCalls === 1 ? originalFailure : compensationFailure;
        },
    };

    await assert.rejects(
        persistLockedBackgroundState(context, { cssUrl: "new-css" }),
        error => error instanceof AggregateError
            && error.cause === originalFailure
            && error.errors[0] === originalFailure
            && error.errors[1] === compensationFailure,
    );
    assert.deepEqual(metadata, { custom_background: "old-css" });

    const cssFailure = new Error("CSS rollback failed");
    await assert.rejects(
        rethrowAfterTransactionRollback(originalFailure, {
            rollback: () => { throw cssFailure; },
            message: "background rollback failed",
        }),
        error => error instanceof AggregateError
            && error.message === "background rollback failed"
            && error.cause === originalFailure
            && error.errors[1] === cssFailure,
    );
});

test("new and hidden Context Media insertions fail closed on an external append", async () => {
    for (const hidden of [false, true]) {
        const source = { mes: "source", is_user: false };
        const external = { mes: "external", is_user: true };
        const chat = [source];
        const checkpoint = createConversationCheckpoint(chat);
        const inserted = contextMediaMessage(hidden);
        const messageIndex = chat.length;
        const saveStarted = deferred();
        const saveGate = deferred();
        const rendered = [source];
        let durableChat = structuredClone(chat);
        let saveCalls = 0;
        let registered = false;

        const saveChat = async () => {
            saveCalls += 1;
            if (saveCalls === 1) {
                saveStarted.resolve();
                await saveGate.promise;
            }
            durableChat = structuredClone(chat);
        };
        const operation = runDurableTransaction({
            mutate: () => {
                chat.push(inserted);
                registered = registerConversationCheckpointInsertion(checkpoint, inserted);
                assert.equal(registered, true);
                rendered.push(inserted);
            },
            persist: saveChat,
            validate: () => {
                if (!isConversationCheckpointCurrent(checkpoint, chat)
                    || chat.length !== messageIndex + 1
                    || chat[messageIndex] !== inserted) {
                    throw new DOMException("conversation advanced", "AbortError");
                }
            },
            rollback: () => {
                if (registered) unregisterConversationCheckpointInsertion(checkpoint, inserted);
                removeInsertedMessage(chat, inserted, messageIndex);
                removeInsertedMessage(rendered, inserted, messageIndex);
            },
            rollbackFailureMessage: "Context Media rollback failed",
        });

        await saveStarted.promise;
        chat.push(external);
        rendered.push(external);
        saveGate.resolve();

        await assert.rejects(operation, error => error?.name === "AbortError");
        assert.equal(saveCalls, 2);
        assert.deepEqual(chat, [source, external]);
        assert.deepEqual(rendered, [source, external]);
        assert.deepEqual(durableChat, [source, external]);
        assert.equal(inserted.is_system, hidden);
        assert.deepEqual(inserted.extra, {
            media: [{
                url: "/user/images/qig-context-media/scene.png",
                type: "image",
                title: "Scene",
                source: "context-media",
            }],
            media_display: "gallery",
            media_index: 0,
            inline_image: true,
        });
    }
});

test("existing-message Context Media rollback preserves a newly active chat DOM", async () => {
    const previousExtra = { display_text: "source", nested: { keep: true } };
    const message = { mes: "source", extra: previousExtra };
    const originalChat = [message];
    const replacementChat = [{ mes: "replacement" }];
    const saveStarted = deferred();
    const saveGate = deferred();
    let currentChat = originalChat;
    let activeDom = ["source-dom"];
    let durableOriginalChat = structuredClone(originalChat);
    let saveCalls = 0;

    const saveChat = async () => {
        saveCalls += 1;
        if (saveCalls === 1) {
            saveStarted.resolve();
            await saveGate.promise;
        }
        durableOriginalChat = structuredClone(originalChat);
    };
    const operation = runDurableTransaction({
        mutate: () => {
            message.extra = {
                ...structuredClone(message.extra),
                media: [{ source: "context-media", url: "/scene.png", type: "image" }],
                inline_image: true,
            };
            activeDom = ["context-media-dom"];
        },
        persist: saveChat,
        validate: () => {
            if (currentChat !== originalChat) throw new DOMException("chat changed", "AbortError");
        },
        rollback: () => {
            message.extra = previousExtra;
            if (currentChat === originalChat) activeDom = ["source-dom"];
        },
    });

    await saveStarted.promise;
    currentChat = replacementChat;
    activeDom = ["replacement-dom"];
    saveGate.resolve();

    await assert.rejects(operation, error => error?.name === "AbortError");
    assert.equal(saveCalls, 2);
    assert.equal(message.extra, previousExtra);
    assert.deepEqual(durableOriginalChat, originalChat);
    assert.deepEqual(activeDom, ["replacement-dom"]);
});

test("existing-message Context Media insertion preserves an external append on rollback", async () => {
    const previousExtra = { display_text: "source" };
    const message = { mes: "source", extra: previousExtra };
    const external = { mes: "external", is_user: true };
    const chat = [message];
    const initialLength = chat.length;
    const checkpoint = createConversationCheckpoint(chat);
    const saveStarted = deferred();
    const saveGate = deferred();
    let renderedMedia = [];
    let durableChat = structuredClone(chat);
    let saveCalls = 0;

    const saveChat = async () => {
        saveCalls += 1;
        if (saveCalls === 1) {
            saveStarted.resolve();
            await saveGate.promise;
        }
        durableChat = structuredClone(chat);
    };
    const operation = runDurableTransaction({
        mutate: () => {
            message.extra = {
                ...structuredClone(message.extra),
                media: [{ source: "context-media", url: "/scene.png", type: "image" }],
                inline_image: true,
            };
            renderedMedia = [...message.extra.media];
        },
        persist: saveChat,
        validate: () => {
            if (!isConversationCheckpointCurrent(checkpoint, chat) || chat.length !== initialLength) {
                throw new DOMException("conversation advanced", "AbortError");
            }
        },
        rollback: () => {
            message.extra = previousExtra;
            renderedMedia = [];
        },
    });

    await saveStarted.promise;
    chat.push(external);
    saveGate.resolve();

    await assert.rejects(operation, error => error?.name === "AbortError");
    assert.equal(saveCalls, 2);
    assert.equal(message.extra, previousExtra);
    assert.deepEqual(chat, [message, external]);
    assert.deepEqual(renderedMedia, []);
    assert.deepEqual(durableChat, chat);
});

test("rejected Context Media chat saves restore memory, DOM, and durable state", async () => {
    const message = { mes: "source" };
    const chat = [message];
    const originalFailure = new Error("chat save rejected after writing");
    let renderedMedia = [];
    let durableChat = structuredClone(chat);
    let saveCalls = 0;

    const saveChat = async () => {
        saveCalls += 1;
        durableChat = structuredClone(chat);
        if (saveCalls === 1) throw originalFailure;
    };

    await assert.rejects(runDurableTransaction({
        mutate: () => {
            message.extra = {
                media: [{ source: "context-media", url: "/scene.png", type: "image" }],
                media_display: "gallery",
                media_index: 0,
                inline_image: true,
            };
            renderedMedia = [...message.extra.media];
        },
        persist: saveChat,
        rollback: () => {
            delete message.extra;
            renderedMedia = [];
        },
        rollbackFailureMessage: "Context Media rollback failed",
    }), error => error === originalFailure);

    assert.equal(saveCalls, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(message, "extra"), false);
    assert.deepEqual(renderedMedia, []);
    assert.deepEqual(durableChat, [{ mes: "source" }]);
});
