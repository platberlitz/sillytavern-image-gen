import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_NATURAL_INSTRUCTION_TEMPLATE,
    DEFAULT_TAGS_INSTRUCTION_TEMPLATE,
    DEFAULT_TWO_STEP_INSTRUCTION_TEMPLATE,
    getDefaultInstructionTemplate,
} from "../lib/prompt-defaults.js";

const TEMPLATES = {
    tags: DEFAULT_TAGS_INSTRUCTION_TEMPLATE,
    natural: DEFAULT_NATURAL_INSTRUCTION_TEMPLATE,
    twoStep: DEFAULT_TWO_STEP_INSTRUCTION_TEMPLATE,
};

test("every default template embeds the scene macro so it is not appended twice", () => {
    for (const [name, template] of Object.entries(TEMPLATES)) {
        assert.match(template, /\{\{scene\}\}/, `${name} template must reference {{scene}}`);
        assert.match(template, /\{\{charDesc\}\}/, `${name} template must reference {{charDesc}}`);
        assert.match(template, /\{\{userDesc\}\}/, `${name} template must reference {{userDesc}}`);
    }
});

test("instruction templates keep the cache-busting entropy anchors", () => {
    // generateLLMPrompt injects entropy after a scene label and before the trailing output label.
    assert.match(DEFAULT_TAGS_INSTRUCTION_TEMPLATE, /scene:/i);
    assert.match(DEFAULT_TAGS_INSTRUCTION_TEMPLATE, /Tags:\s*$/);
    assert.match(DEFAULT_NATURAL_INSTRUCTION_TEMPLATE, /CURRENT SCENE:/);
    assert.match(DEFAULT_NATURAL_INSTRUCTION_TEMPLATE, /Prompt:\s*$/);
    assert.match(DEFAULT_TWO_STEP_INSTRUCTION_TEMPLATE, /Plain visual description:\s*$/);
});

test("style lookup returns the natural template only for the natural style", () => {
    assert.equal(getDefaultInstructionTemplate("natural"), DEFAULT_NATURAL_INSTRUCTION_TEMPLATE);
    assert.equal(getDefaultInstructionTemplate("tags"), DEFAULT_TAGS_INSTRUCTION_TEMPLATE);
    assert.equal(getDefaultInstructionTemplate("custom"), DEFAULT_TAGS_INSTRUCTION_TEMPLATE);
    assert.equal(getDefaultInstructionTemplate(undefined), DEFAULT_TAGS_INSTRUCTION_TEMPLATE);
});
