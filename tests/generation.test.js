import assert from "node:assert/strict";
import test from "node:test";

import {
    accountGenerationOutputBytes,
    attachResultFailures,
    clampChatMessageIndex,
    collectBatchResults,
    collectSequentialResults,
    createResultFailureError,
    getResultFailures,
    limitGenerationOutputResponse,
    MAX_BATCH_COUNT,
    normalizeBatchCount,
    formatQuietSlashResult,
    getQuietSlashOverrides,
    reserveGenerationOutput,
} from "../lib/generation.js";
import { MAX_IMAGE_BYTES, readResponseArrayBuffer } from "../lib/security.js";

test("a generation output budget reserves at most ten outputs without blocking reserved siblings", () => {
    const budget = { count: 0, bytes: 0, error: null };
    const outputs = Array.from({ length: MAX_BATCH_COUNT }, () => reserveGenerationOutput(budget));
    assert.throws(() => reserveGenerationOutput(budget), { code: "GENERATION_OUTPUT_LIMIT" });
    for (const output of outputs) accountGenerationOutputBytes(output, 12);
    assert.equal(budget.bytes, MAX_BATCH_COUNT * 12);
    accountGenerationOutputBytes(outputs[0], 12);
    assert.equal(budget.bytes, MAX_BATCH_COUNT * 12, "data/blob conversion does not count an image twice");
});

test("one output byte budget covers multiple responses and stops all new reservations after overflow", async () => {
    const budget = { count: 0, bytes: MAX_IMAGE_BYTES - 5, error: null };
    const first = reserveGenerationOutput(budget);
    await readResponseArrayBuffer(limitGenerationOutputResponse(new Response(new Uint8Array(3)), first));
    const second = reserveGenerationOutput(budget);
    let cancelled = false;
    const tooLarge = new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
        headers: { "content-length": "3" },
    });
    assert.throws(() => limitGenerationOutputResponse(tooLarge, second), { code: "GENERATION_OUTPUT_LIMIT" });
    assert.equal(cancelled, true);
    assert.throws(() => reserveGenerationOutput(budget), { code: "GENERATION_OUTPUT_LIMIT" });
    accountGenerationOutputBytes(first, 3);
    assert.equal(budget.bytes, MAX_IMAGE_BYTES - 2, "completed sibling remains accounted after a later failure");
});

test("an exhausted run reports every skipped invocation when an entire later batch fails", async () => {
    const budget = { count: MAX_BATCH_COUNT, bytes: 0, error: null };
    await assert.rejects(collectBatchResults(3, async () => reserveGenerationOutput(budget)), {
        code: "GENERATION_OUTPUT_LIMIT",
        failedCount: 3,
    });
});

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

test("quiet results reject transient sources and unsafe saved paths", () => {
    for (const url of ["data:image/png;base64,AAAA", "blob:test", "https://images.example/a.png", "/user/images/../a.png"]) {
        assert.match(formatQuietSlashResult({ status: "success", urls: [url] }), /^QIG failed:/);
    }
    assert.equal(formatQuietSlashResult({ status: "partial", urls: ["blob:test", "/user/images/John Doe/a.png"] }), "/user/images/John%20Doe/a.png");
    assert.match(formatQuietSlashResult({ status: "failed", urls: ["/user/images/qig/a.png"] }), /^QIG failed:/);
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

test("ordinary all-failed batches preserve every indexed failure without mutating the original error", async () => {
    const failures = Array.from({ length: 3 }, (_, index) => Object.freeze(new Error(`download ${index} failed`)));
    await assert.rejects(collectBatchResults(3, async index => { throw failures[index]; }), error => {
        assert.equal(error.failedCount, 3);
        assert.equal(error.cause, failures[0]);
        assert.deepEqual(error.errors, failures);
        assert.deepEqual(getResultFailures(error), failures.map((failure, index) => ({ index, error: failure })));
        return true;
    });
});

test("all-failed finalisation errors retain original output indices through the outer batch", async () => {
    const failures = [0, 2, 4].map(index => ({ index, error: new Error(`save ${index} failed`) }));
    const finalisationError = createResultFailureError(failures);
    assert.equal(finalisationError.failedCount, 3);
    assert.deepEqual(getResultFailures(finalisationError), failures);
    await assert.rejects(collectBatchResults(1, async () => { throw finalisationError; }), error => {
        assert.equal(error.failedCount, 3);
        assert.deepEqual(getResultFailures(error), failures.map(({ index, error: cause }) => ({ index: 0, outputIndex: index, error: cause })));
        return true;
    });
});

test("all failed outputs in one batch remain separate failures when a later batch succeeds", async () => {
    const failures = [0, 1, 2].map(index => ({ index, error: new Error(`download ${index} failed`) }));
    const outcome = await collectBatchResults(2, async index => {
        if (index === 0) throw createResultFailureError(failures);
        return ["saved"];
    });
    assert.deepEqual(outcome.results, ["saved"]);
    assert.deepEqual(outcome.errors.map(({ index, outputIndex }) => [index, outputIndex]), [[0, 0], [0, 1], [0, 2]]);
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

test("sequential failures keep original output indices after earlier outputs were removed", async () => {
    const outcome = await collectSequentialResults([{ outputIndex: 2 }, { outputIndex: 4 }], async item => {
        if (item.outputIndex === 4) throw new Error("validation failed");
        return item;
    });
    assert.deepEqual(outcome.results, [{ outputIndex: 2 }]);
    assert.equal(outcome.errors[0].index, 4);
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
