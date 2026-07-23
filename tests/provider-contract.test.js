import assert from "node:assert/strict";
import test from "node:test";

import {
    createEffectiveRequest,
    normalizeProviderResult,
    sanitizeReproducibleSettings,
} from "../lib/provider-contract.js";

test("reproducible settings omit credentials and private images", () => {
    const sanitized = sanitizeReproducibleSettings({
        provider: "proxy",
        proxyKey: "canary-key",
        geminiApiKey: "canary-gemini",
        proxyRefImages: ["data:image/png;base64,private"],
        localRefImage: "data:image/png;base64,private",
        model: "safe-model",
        proxyUrl: "https://user:pass@images.example/v1?model=flux&token=url-canary",
    });

    assert.deepEqual(sanitized, {
        provider: "proxy",
        model: "safe-model",
    });
    assert.doesNotMatch(JSON.stringify(sanitized), /canary|base64/);
});

test("custom API snapshots omit local trust fields and unused parameters", () => {
    const settings = {
        provider: "custom",
        customApiUrl: "https://images.example.test/generate",
        customApiPollUrl: "https://images.example.test/jobs/{{jobId}}",
        customApiKey: "custom-secret",
        customApiRefImages: ["data:image/png;base64,private"],
        customApiModel: "portrait-v2",
        customApiRequestTemplate: '{"prompt":"{{prompt}}","seed":"{{seed}}"}',
        width: 1024,
        height: 768,
        steps: 30,
        cfgScale: 6,
        sampler: "Euler",
        seed: 12,
    };
    const request = createEffectiveRequest(settings, { model: settings.customApiModel });

    assert.deepEqual(request.parameters, { seed: 12 });
    assert.equal(request.settings.customApiUrl, undefined);
    assert.equal(request.settings.customApiPollUrl, undefined);
    assert.equal(request.settings.customApiKey, undefined);
    assert.equal(request.settings.customApiRefImages, undefined);
    assert.equal(request.settings.customApiRequestTemplate, undefined);
});

test("Nanobanana records the aspect ratio and tier sent instead of configured dimensions", () => {
    const request = createEffectiveRequest({
        provider: "nanobanana",
        width: 2048,
        height: 1024,
    }, {
        model: "gemini-3-pro-image",
        parameters: { aspectRatio: "2:1", imageSize: "2K" },
    });

    assert.deepEqual(request.parameters, {
        model: "gemini-3-pro-image",
        aspectRatio: "2:1",
        imageSize: "2K",
    });
});

test("effective requests record mapped parameters and resolved seed", () => {
    const request = createEffectiveRequest({
        provider: "gptimage",
        width: 1408,
        height: 768,
        steps: 99,
        seed: 42,
    }, { model: "gpt-image-1", resolvedSeed: 7 });

    assert.deepEqual(request.parameters, {
        model: "gpt-image-1",
        width: 1536,
        height: 1024,
    });
});

test("provider results use adapter parameter overrides", () => {
    const result = normalizeProviderResult({
        url: "https://images.example/result.png",
        effectiveRequest: { parameters: { seed: 123, width: 512 } },
    }, {
        provider: "local",
        width: 1024,
        height: 1024,
        steps: 20,
        cfgScale: 7,
        sampler: "Euler",
        seed: -1,
    }, { model: "checkpoint.safetensors" });

    assert.equal(result.effectiveRequest.parameters.seed, 123);
    assert.equal(result.effectiveRequest.parameters.width, 512);
    assert.equal(result.effectiveRequest.parameters.model, "checkpoint.safetensors");
});

test("provider results preserve every image and merge shared metadata", () => {
    const results = normalizeProviderResult({
        images: [
            "https://images.example/one.png",
            { url: "https://images.example/two.png", effectiveRequest: { parameters: { outputNode: "12" } } },
        ],
        effectiveRequest: { parameters: { seed: 123 } },
    }, {
        provider: "local",
        width: 1024,
        height: 1024,
        steps: 20,
        cfgScale: 7,
        sampler: "Euler",
        seed: -1,
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].url, "https://images.example/one.png");
    assert.equal(results[0].effectiveRequest.parameters.seed, 123);
    assert.equal(results[1].effectiveRequest.parameters.outputNode, "12");
    assert.equal(results[1].effectiveRequest.parameters.seed, 123);
});

test("effective requests omit parameters that providers do not receive", () => {
    const settings = {
        width: 768,
        height: 1024,
        steps: 40,
        cfgScale: 7,
        sampler: "Euler",
        seed: 123,
    };

    assert.deepEqual(createEffectiveRequest({ ...settings, provider: "nanogpt" }).parameters, {
        model: null,
        width: 768,
        height: 1024,
    });
    assert.deepEqual(createEffectiveRequest({ ...settings, provider: "pollinations" }).parameters, {
        model: null,
        width: 768,
        height: 1024,
        seed: 123,
    });
    assert.deepEqual(createEffectiveRequest({ ...settings, provider: "together" }).parameters, {
        model: null,
        width: 768,
        height: 1024,
        steps: 40,
        cfgScale: 7,
        seed: 123,
    });
    assert.deepEqual(createEffectiveRequest({ ...settings, provider: "fal" }).parameters, {
        model: null,
        width: 768,
        height: 1024,
        steps: 40,
        cfgScale: 7,
        seed: 123,
    });
});
