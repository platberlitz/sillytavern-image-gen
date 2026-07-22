import assert from "node:assert/strict";
import test from "node:test";

import { mergeSTStylePrompts, resolveSTStyleSettings } from "../lib/st-style.js";

function context(overrides = {}) {
    return {
        characterId: 0,
        groupId: null,
        name2: "Alice",
        characters: [{
            name: "Alice",
            avatar: "Alice.Card.png",
            data: { extensions: {} },
        }],
        ...overrides,
    };
}

test("resolves official character prompts by avatar stem, including character zero", () => {
    const style = resolveSTStyleSettings({
        prompt_prefix: "global positive",
        negative_prompt: "global negative",
        character_prompts: { "Alice.Card": "card positive", Alice: "legacy positive" },
        character_negative_prompts: { "Alice.Card": "card negative", Alice: "legacy negative" },
    }, context());

    assert.deepEqual(style, {
        prefix: "global positive",
        negative: "global negative",
        charPositive: "card positive",
        charNegative: "card negative",
    });
});

test("uses shareable card prompts before legacy display-name entries", () => {
    const ctx = context();
    ctx.characters[0].data.extensions.sd_character_prompt = {
        positive: "shared positive",
        negative: "shared negative",
    };
    const style = resolveSTStyleSettings({
        character_prompts: { Alice: "legacy positive" },
        character_negative_prompts: { Alice: "legacy negative" },
    }, ctx);

    assert.equal(style.charPositive, "shared positive");
    assert.equal(style.charNegative, "shared negative");
});

test("uses legacy display-name and object entries as a final fallback", () => {
    const style = resolveSTStyleSettings({
        character_prompts: { Alice: { positive: "legacy positive", negative: "legacy negative" } },
    }, context());

    assert.equal(style.charPositive, "legacy positive");
    assert.equal(style.charNegative, "legacy negative");
});

test("groups retain common style but exclude character prompts", () => {
    const style = resolveSTStyleSettings({
        prompt_prefix: "global positive",
        negative_prompt: "global negative",
        character_prompts: { "Alice.Card": "card positive" },
    }, context({ groupId: 0 }));

    assert.deepEqual(style, {
        prefix: "global positive",
        negative: "global negative",
        charPositive: "",
        charNegative: "",
    });
});

test("merges in SillyTavern order and avoids empty separators", () => {
    assert.deepEqual(mergeSTStylePrompts("scene", "base negative", {
        prefix: "global positive",
        charPositive: "card positive",
        negative: "global negative",
        charNegative: "card negative",
    }), {
        prompt: "global positive, card positive, scene",
        negative: "base negative, global negative, card negative",
    });

    assert.deepEqual(mergeSTStylePrompts("scene", "", {}), {
        prompt: "scene",
        negative: "",
    });
});

test("honors the first prompt marker and resolves macros after merging", () => {
    const result = mergeSTStylePrompts("scene", "", {
        prefix: "{{char}} portrait, {prompt}, cinematic",
        charPositive: "blue coat",
    }, value => value.replaceAll("{{char}}", "Alice"));

    assert.equal(result.prompt, "Alice portrait, scene, cinematic, blue coat");
    assert.equal(result.prompt.includes("{prompt}"), false);
});
