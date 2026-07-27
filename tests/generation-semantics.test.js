import assert from "node:assert/strict";
import test from "node:test";

import {
    captureRegenerationReferences,
    normalizeInjectInsertMode,
    parseContextualFilterSelection,
    RegenerationReferenceStore,
    shouldCleanInjectSourceTags,
} from "../lib/generation-semantics.js";

test("contextual filter selections accept only anchored none or unique in-range integers", () => {
    assert.deepEqual(parseContextualFilterSelection("none", 3), []);
    assert.deepEqual(parseContextualFilterSelection("  NONE  ", 3), []);
    assert.deepEqual(parseContextualFilterSelection("1, 3,2", 3), [1, 3, 2]);

    for (const value of [
        "",
        "none, 1",
        "none of these",
        "matches: 1,2",
        "1 and 2",
        "-1",
        "+1",
        "1.0",
        "1, 1",
        "0",
        "4",
        "1, 4",
    ]) {
        assert.equal(parseContextualFilterSelection(value, 3), null, value);
    }
});

test("regeneration captures only the active provider's private reference inputs", () => {
    const settings = {
        provider: "proxy",
        proxyRefImages: ["manual-ref"],
        customApiRefImages: ["custom-ref"],
        localRefImage: "local-ref",
    };
    const snapshot = captureRegenerationReferences(settings, { proxyRefImages: ["context-ref"] });
    settings.proxyRefImages[0] = "changed";

    assert.deepEqual(snapshot, {
        provider: "proxy",
        settings: { proxyRefImages: ["manual-ref"] },
        runtimeOptions: { proxyRefImages: ["context-ref"] },
    });
    assert.equal(JSON.stringify(snapshot).includes("custom-ref"), false);
    assert.equal(JSON.stringify(snapshot).includes("local-ref"), false);

    assert.deepEqual(captureRegenerationReferences({
        provider: "local",
        localRefImage: "img2img-ref",
        a1111ControlNetImage: "control-ref",
    }), {
        provider: "local",
        settings: {
            localRefImage: "img2img-ref",
            a1111ControlNetImage: "control-ref",
        },
        runtimeOptions: {},
    });

    for (const [provider, field] of [
        ["custom", "customApiRefImages"],
        ["nanobanana", "nanobananaRefImages"],
        ["nanogpt", "nanogptRefImages"],
    ]) {
        assert.deepEqual(captureRegenerationReferences({
            provider,
            [field]: [`${provider}-ref`],
            proxyRefImages: ["unrelated-ref"],
        }), {
            provider,
            settings: { [field]: [`${provider}-ref`] },
            runtimeOptions: {},
        });
    }
});

test("regeneration reference state follows only the active result group", () => {
    const store = new RegenerationReferenceStore({ maxResults: 2, maxReferenceChars: 100 });
    const first = {
        id: "first",
        provider: "proxy",
        sourceChatId: "chat-a",
        sourceMessageIndex: 1,
        sourceMessageSignature: "sig-a",
    };
    const references = captureRegenerationReferences({ provider: "proxy", proxyRefImages: ["private-ref"] });
    const before = JSON.stringify(first);

    const second = { ...first, id: "second" };
    store.remember([first, second], references, { scopeId: "account-a/chat-a", groupId: 1 });
    assert.equal(JSON.stringify(first), before);
    assert.deepEqual(store.lookup(first, { scopeId: "account-a/chat-a" }).references, references);
    assert.equal(store.lookup(first, { scopeId: "account-b/chat-a" }).found, false);
    assert.equal(store.lookup({ ...first, sourceMessageSignature: "changed" }, { scopeId: "account-a/chat-a" }).found, false);
    assert.equal(store.activate(second, { scopeId: "account-a/chat-a" }), true);

    const third = { ...first, id: "third" };
    store.remember(third, references, { scopeId: "account-a/chat-a", groupId: 2 });
    assert.equal(store.size, 1);
    assert.equal(store.lookup(first, { scopeId: "account-a/chat-a" }).found, false);
    assert.equal(store.lookup(third, { scopeId: "account-a/chat-a" }).found, true);

    assert.equal(store.activate(first, { scopeId: "account-a/chat-a" }), false);
    assert.equal(store.size, 0);
});

test("regeneration reference state is bounded and never attached to result metadata", () => {
    const store = new RegenerationReferenceStore({ maxResults: 2, maxReferenceChars: 100 });
    const references = captureRegenerationReferences({ provider: "proxy", proxyRefImages: ["private-ref"] });
    const entries = ["first", "second", "third"].map(id => ({ id, provider: "proxy" }));
    const before = JSON.stringify(entries);

    store.remember(entries, references, { scopeId: "scope", groupId: 1 });
    assert.equal(store.size, 2);
    assert.equal(store.lookup(entries[0], { scopeId: "scope" }).found, false);
    assert.equal(store.lookup(entries[2], { scopeId: "scope" }).found, true);
    assert.equal(JSON.stringify(entries), before);

    store.clear();
    assert.equal(store.size, 0);
});

test("oversized regeneration references record unavailability without retaining the private value", () => {
    const store = new RegenerationReferenceStore({ maxResults: 2, maxReferenceChars: 3 });
    const entry = { id: "large", provider: "local" };
    store.remember(entry, captureRegenerationReferences({
        provider: "local",
        localRefImage: "private-reference",
    }), { scopeId: "scope" });

    assert.deepEqual(store.lookup(entry, { scopeId: "scope" }), {
        found: true,
        referencesRetained: false,
        references: null,
    });
});

test("legacy inline inject delivery migrates to tagged-message attachment", () => {
    assert.equal(normalizeInjectInsertMode("replace"), "replace");
    assert.equal(normalizeInjectInsertMode("inline"), "replace");
    assert.equal(normalizeInjectInsertMode("new"), "new");
    assert.equal(normalizeInjectInsertMode("unknown"), "replace");
});

test("replace delivery always consumes its source tag", () => {
    assert.equal(shouldCleanInjectSourceTags("replace", false), true);
    assert.equal(shouldCleanInjectSourceTags("inline", false), true);
    assert.equal(shouldCleanInjectSourceTags("new", true), true);
    assert.equal(shouldCleanInjectSourceTags("new", false), false);
});
