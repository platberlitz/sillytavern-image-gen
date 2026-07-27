import assert from "node:assert/strict";
import test from "node:test";

import {
    appendWorldInfoToRequest,
    createPromptPipelineState,
    getPromptPipelineResult,
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
