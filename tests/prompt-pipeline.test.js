import assert from "node:assert/strict";
import test from "node:test";

import {
    appendWorldInfoToRequest,
    createPromptPipelineState,
    dedupePromptTags,
    getPromptPipelineResult,
    looksLikeTagList,
    setAuthoritativeFinalPrompt,
    updatePromptPipelineState,
} from "../lib/prompt-pipeline.js";

test("World Info is appended as a visible labelled request block", () => {
    assert.equal(
        appendWorldInfoToRequest("Describe the scene", "=== World Info ===\n[Before]\nA lighthouse"),
        "Describe the scene\n\nQIG MATCHED WORLD INFO (editable context; use only when relevant):\n\n=== World Info ===\n[Before]\nA lighthouse",
    );
    assert.equal(appendWorldInfoToRequest("Describe the scene", ""), "Describe the scene");
});

test("pipeline state records each user-visible stage without mutating earlier state", () => {
    const initial = createPromptPipelineState({ sourceText: " scene ", worldInfoText: " lore " });
    const next = updatePromptPipelineState(initial, {
        summaryRequest: "request",
        summaryResult: "result",
        promptRequest: "prompt request",
    });
    assert.equal(initial.summaryRequest, "");
    assert.deepEqual(next, {
        sourceText: "scene",
        worldInfoText: "lore",
        summaryRequest: "request",
        summaryResult: "result",
        promptRequest: "prompt request",
        promptResult: "",
        positive: "",
        negative: "",
        finalPromptEdited: false,
    });
});

test("an edited final prompt is marked authoritative", () => {
    const state = updatePromptPipelineState(createPromptPipelineState(), {
        positive: "styled original",
        negative: "bad anatomy",
    });
    const edited = setAuthoritativeFinalPrompt(state, {
        positive: " user final ",
        negative: " user negative ",
    });
    assert.deepEqual(getPromptPipelineResult(edited), {
        prompt: "user final",
        negative: "user negative",
        finalPromptEdited: true,
    });
    assert.equal(state.positive, "styled original");
});

test("empty final prompts are rejected", () => {
    assert.throws(() => setAuthoritativeFinalPrompt(createPromptPipelineState(), { positive: "  " }), /cannot be empty/);
    assert.throws(() => getPromptPipelineResult(createPromptPipelineState()), /cannot be empty/);
});

test("dedupePromptTags drops exact repeats and keeps first occurrence", () => {
    assert.equal(
        dedupePromptTags("best quality, absurdres, masterpiece, masterpiece, best quality, sharp focus"),
        "best quality, absurdres, masterpiece, sharp focus",
    );
    assert.equal(dedupePromptTags("Lowres, bad hands, lowres, BAD HANDS"), "Lowres, bad hands");
    assert.equal(dedupePromptTags("(masterpiece:1.2), masterpiece"), "(masterpiece:1.2), masterpiece");
    assert.equal(dedupePromptTags("  a,  , b , a "), "a, b");
    assert.equal(dedupePromptTags(""), "");
    assert.equal(dedupePromptTags(null), "");
});

test("dedupePromptTags leaves prose clauses and multi-line prompts untouched", () => {
    const prose = "A red door stands beside a blue door, and a red door stands beside it again, in the late afternoon light of a quiet street.";
    assert.equal(dedupePromptTags(prose), prose);
    const multiline = "masterpiece,\nbest quality,\nmasterpiece";
    assert.equal(dedupePromptTags(multiline), multiline);
    assert.equal(dedupePromptTags("single tag"), "single tag");
    assert.equal(looksLikeTagList("masterpiece, best quality, 1girl"), true);
    assert.equal(looksLikeTagList(prose), false);
});

test("dedupePromptTags removes repeated tags around a long scene phrase without touching the phrase", () => {
    const mixed = "best quality, masterpiece, masterpiece, best quality, a stone lighthouse on a rocky cliff at dusk, crashing waves, oil painting style";
    assert.equal(
        dedupePromptTags(mixed),
        "best quality, masterpiece, a stone lighthouse on a rocky cliff at dusk, crashing waves, oil painting style",
    );
    // A repeated long clause is prose and is kept both times.
    const repeatedClause = "soft light, a woman reading by the window in the rain, a woman reading by the window in the rain";
    assert.equal(dedupePromptTags(repeatedClause), repeatedClause);
});
