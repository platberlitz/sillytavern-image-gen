import assert from "node:assert/strict";
import test from "node:test";

import { getGeminiCandidateFailure, isEffectivelyBlankPixels } from "../lib/generated-image.js";

test("Gemini candidate failures take precedence over placeholder image data", () => {
    const failure = getGeminiCandidateFailure({
        finishReason: "PROHIBITED_CONTENT",
        content: {
            parts: [
                { text: "The requested image was filtered." },
                { inlineData: { mimeType: "image/png", data: "placeholder" } },
            ],
        },
    });

    assert.match(failure, /PROHIBITED_CONTENT/);
    assert.match(failure, /requested image was filtered/);
    assert.equal(getGeminiCandidateFailure({ finishReason: "STOP" }), null);
    assert.equal(getGeminiCandidateFailure({}), null);
});

test("blank pixel detection rejects transparent and uniform placeholders", () => {
    assert.equal(isEffectivelyBlankPixels(new Uint8ClampedArray(4 * 16)), true);

    const white = new Uint8ClampedArray(4 * 16);
    for (let i = 0; i < white.length; i += 4) {
        white[i] = 255;
        white[i + 1] = 255;
        white[i + 2] = 255;
        white[i + 3] = 255;
    }
    assert.equal(isEffectivelyBlankPixels(white), true);

    const solidRed = new Uint8ClampedArray(4 * 16);
    for (let i = 0; i < solidRed.length; i += 4) {
        solidRed[i] = 255;
        solidRed[i + 3] = 255;
    }
    assert.equal(isEffectivelyBlankPixels(solidRed), false);

    const varied = new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
        255, 255, 255, 255,
    ]);
    assert.equal(isEffectivelyBlankPixels(varied), false);
});
