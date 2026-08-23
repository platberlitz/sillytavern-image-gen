import assert from "node:assert/strict";
import test from "node:test";

import {
    attachResultFailures,
    clampChatMessageIndex,
    collectBatchResults,
    collectSequentialResults,
    getResultFailures,
    normalizeBatchCount,
    formatQuietSlashResult,
    getQuietSlashOverrides,
} from "../lib/generation.js";

test("a quiet slash run is one saved image from the prompt with nothing in the chat", () => {
    const overrides = getQuietSlashOverrides("a lighthouse at dusk");
    assert.equal(overrides.prompt, "a lighthouse at dusk");
    assert.equal(overrides.useLastMessage, false);
    assert.equal(overrides.autoInsert, false);
    assert.equal(overrides.confirmBeforeGenerate, false);
    assert.equal(overrides.enableParagraphPicker, false);
    assert.equal(overrides.batchCount, 1);
    assert.equal(overrides.saveToServer, true);
    assert.equal(overrides.__qigQuiet, true);
});

test("a quiet slash run hands back the saved path, or says why not", () => {
    assert.equal(formatQuietSlashResult({ status: "success", urls: ["/user/images/qig/a.png"] }), "/user/images/qig/a.png");
    assert.equal(formatQuietSlashResult({ status: "partial", urls: ["", "/user/images/qig/b.png"] }), "/user/images/qig/b.png");
    assert.equal(formatQuietSlashResult({ status: "busy" }), "QIG: generation is already running.");
    assert.equal(formatQuietSlashResult({ status: "cancelled" }), "QIG: generation cancelled.");
    assert.equal(formatQuietSlashResult({ status: "failed", message: "provider said no" }), "QIG failed: provider said no");
    assert.equal(formatQuietSlashResult({ status: "success", urls: [] }), "QIG failed: no image was produced");
});

test("nullable message indices remain unresolved", () => {
    assert.equal(clampChatMessageIndex(null, 3), null);
    assert.equal(clampChatMessageIndex(undefined, 3), null);
    assert.equal(clampChatMessageIndex("", 3), null);
    assert.equal(clampChatMessageIndex("  ", 3), null);
    assert.equal(clampChatMessageIndex("0", 3), 0);
    assert.equal(clampChatMessageIndex(99, 3), 2);
});

test("batch count is clamped at runtime", () => {
    assert.equal(normalizeBatchCount(-1), 1);
    assert.equal(normalizeBatchCount("3"), 3);
    assert.equal(normalizeBatchCount(1000), 10);
    assert.equal(normalizeBatchCount("invalid"), 1);
});

test("batch collection preserves successes around ordinary failures", async () => {
    const failures = [];
    const outcome = await collectBatchResults(3, async (index) => {
        if (index === 1) throw new Error("provider failed");
        return `image-${index}`;
    }, (error, index) => failures.push({ message: error.message, index }));

    assert.deepEqual(outcome.results, ["image-0", "image-2"]);
    assert.deepEqual(failures, [{ message: "provider failed", index: 1 }]);
    assert.equal(outcome.errors.length, 1);
});

test("batch collection flattens multiple provider outputs", async () => {
    const outcome = await collectBatchResults(2, async (index) => [
        `image-${index}-a`,
        `image-${index}-b`,
    ]);

    assert.deepEqual(outcome.results, ["image-0-a", "image-0-b", "image-1-a", "image-1-b"]);
});

test("batch collection retains failures from partially valid provider outputs", async () => {
    const outputError = new Error("second output failed");
    const outcome = await collectBatchResults(1, async () =>
        attachResultFailures(["image-a"], [{ index: 1, error: outputError }])
    );

    assert.deepEqual(outcome.results, ["image-a"]);
    assert.equal(outcome.errors.length, 1);
    assert.equal(outcome.errors[0].outputIndex, 1);
    assert.equal(outcome.errors[0].error, outputError);
    assert.equal(getResultFailures(outcome.results).length, 0);
});

test("batch collection propagates cancellation", async () => {
    await assert.rejects(
        collectBatchResults(3, async (index) => {
            if (index === 1) throw new DOMException("cancelled", "AbortError");
            return index;
        }),
        { name: "AbortError" },
    );
});

test("batch collection throws when every item fails", async () => {
    await assert.rejects(
        () => collectBatchResults(2, async () => { throw new Error("provider unavailable"); }),
        /provider unavailable/,
    );
});

test("sequential collection preserves valid siblings and their source indices", async () => {
    const outcome = await collectSequentialResults(["one", "bad", "three"], async (item) => {
        if (item === "bad") throw new Error("invalid output");
        return item.toUpperCase();
    });

    assert.deepEqual(outcome.results, ["ONE", "THREE"]);
    assert.equal(outcome.errors.length, 1);
    assert.equal(outcome.errors[0].index, 1);
    assert.match(outcome.errors[0].error.message, /invalid output/);
});

test("sequential collection propagates cancellation", async () => {
    await assert.rejects(
        collectSequentialResults([1, 2], async item => {
            if (item === 2) throw new DOMException("cancelled", "AbortError");
            return item;
        }),
        { name: "AbortError" },
    );
});
