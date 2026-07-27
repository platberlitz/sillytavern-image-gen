import assert from "node:assert/strict";
import test from "node:test";

import {
    buildA1111ADetailerUnit,
    isCurrentA1111ModelRefresh,
    materializeA1111ReferenceBase64,
    normalizeA1111BaseUrl,
    parseFiniteFloat,
    parseFiniteInt,
} from "../lib/a1111-runtime.js";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

test("A1111 HTTP references are materialized and format-validated before payload use", async () => {
    const controller = new AbortController();
    let captured;
    const encoded = await materializeA1111ReferenceBase64("https://images.example/reference.png", {
        signal: controller.signal,
        readImage: async (url, options) => {
            captured = { url, options };
            return { buffer: Buffer.from(PNG_BASE64, "base64") };
        },
    });

    assert.equal(encoded, PNG_BASE64);
    assert.equal(captured.url, "https://images.example/reference.png");
    assert.equal(captured.options.signal, controller.signal);
    assert.ok(captured.options.maxBytes > 0);

    await assert.rejects(materializeA1111ReferenceBase64(
        `data:image/png;base64,${Buffer.from("not an image payload").toString("base64")}`,
    ), /supported image format/);
});

test("A1111 model refresh guards reject stale requests and changed base URLs", () => {
    const current = {
        requestId: 4,
        latestRequestId: 4,
        baseUrl: "http://127.0.0.1:7860/",
        settings: { localType: "a1111", localUrl: "http://127.0.0.1:7860" },
    };
    assert.equal(isCurrentA1111ModelRefresh(current), true);
    assert.equal(isCurrentA1111ModelRefresh({ ...current, latestRequestId: 5 }), false);
    assert.equal(isCurrentA1111ModelRefresh({
        ...current,
        settings: { localType: "a1111", localUrl: "http://127.0.0.1:7861" },
    }), false);
    assert.equal(isCurrentA1111ModelRefresh({
        ...current,
        settings: { localType: "comfyui", localUrl: "http://127.0.0.1:7860" },
    }), false);
});
