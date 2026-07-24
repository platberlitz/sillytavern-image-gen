import assert from "node:assert/strict";
import test from "node:test";

import {
    buildA1111ADetailerUnit,
    normalizeA1111BaseUrl,
    parseFiniteFloat,
    parseFiniteInt,
} from "../lib/a1111-runtime.js";

test("finite A1111 parsers reject empty and non-finite values", () => {
    assert.equal(parseFiniteFloat("", 0.4, 0, 1), 0.4);
    assert.equal(parseFiniteFloat("Infinity", 0.3, 0, 1), 0.3);
    assert.equal(parseFiniteFloat("0.75", 0.4, 0, 1), 0.75);
    assert.equal(parseFiniteInt("12px", 4, 0, 64), 4);
    assert.equal(parseFiniteInt("5.9", 4, 0, 64), 5);
});

test("ADetailer units use finite defaults and documented ranges", () => {
    const unit = buildA1111ADetailerUnit({
        model: "face_yolov8n.pt",
        denoise: "",
        confidence: 2,
        maskBlur: -1,
        dilateErode: 500,
        inpaintPadding: "invalid",
    });

    assert.deepEqual(unit, {
        ad_model: "face_yolov8n.pt",
        ad_prompt: "",
        ad_negative_prompt: "",
        ad_denoising_strength: 0.4,
        ad_confidence: 1,
        ad_mask_blur: 0,
        ad_dilate_erode: 128,
        ad_inpaint_only_masked: true,
        ad_inpaint_only_masked_padding: 32,
    });
    assert.equal(JSON.stringify(unit).includes("null"), false);
});

test("A1111 base URLs discard every trailing slash", () => {
    assert.equal(normalizeA1111BaseUrl("http://127.0.0.1:7860/"), "http://127.0.0.1:7860");
    assert.equal(normalizeA1111BaseUrl("http://127.0.0.1:7860///"), "http://127.0.0.1:7860");
});
