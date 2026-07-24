import assert from "node:assert/strict";
import test from "node:test";

import {
    createEffectiveRequest,
    normalizeProviderResult,
    sanitizeEffectiveRequest,
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

test("reproducible settings are compact and exclude internal or executable state", () => {
    const sanitized = sanitizeReproducibleSettings({
        provider: "local",
        width: 768,
        height: 1024,
        steps: 28,
        localType: "comfyui",
        localModel: "flux.safetensors",
        localUrl: "http://127.0.0.1:8188",
        comfyScheduler: "normal",
        comfyWorkflow: '{"1":{"inputs":{"api_key":"workflow-secret"}}}',
        proxyComfyWorkflow: '{"executable":true}',
        comfyAllowLegacyInterrupt: true,
        a1111ControlNetImage: "data:image/png;base64,private",
        _syncCacheId: "account-owner",
        _backupProfiles: { proxy: { Home: { proxyKey: "secret" } } },
        _backupComfyWorkflows: [{ comfyWorkflow: '{"stale-secret":true}' }],
        contextMedia: { private: true },
        autoInsert: true,
    });

    assert.deepEqual(sanitized, {
        provider: "local",
        width: 768,
        height: 1024,
        steps: 28,
        localType: "comfyui",
        localModel: "flux.safetensors",
        comfyScheduler: "normal",
    });
    assert.doesNotMatch(JSON.stringify(sanitized), /secret|workflow|backup|private|localUrl|autoInsert/i);
});

test("effective requests snapshot only the selected provider recipe", () => {
    const request = createEffectiveRequest({
        provider: "proxy",
        width: 1024,
        height: 768,
        proxyModel: "flux",
        proxySteps: 20,
        proxyCfg: 5,
        proxySampler: "Euler",
        proxySeed: 42,
        proxyPayloadMode: "extended",
        proxyUrl: "https://proxy.example/v1?auth_token=secret",
        proxyKey: "secret",
        proxyComfyWorkflow: '{"executable":true}',
        comfyWorkflow: '{"unrelated":true}',
        _backupContextMedia: { media: ["private"] },
        naiModel: "unrelated-model",
    }, { model: "flux" });

    assert.deepEqual(request.settings, {
        provider: "proxy",
        width: 1024,
        height: 768,
        proxyModel: "flux",
        proxySteps: 20,
        proxyCfg: 5,
        proxySampler: "Euler",
        proxySeed: 42,
        proxyPayloadMode: "extended",
    });
    assert.doesNotMatch(JSON.stringify(request.settings), /secret|workflow|backup|unrelated/i);
});

test("effective request imports retain only bounded reproducible allowlists", () => {
    const request = sanitizeEffectiveRequest({
        version: 1,
        provider: "local",
        parameters: {
            model: "safe-model",
            width: 99_999,
            steps: 0,
            cfgScale: -5,
            seed: 99_999_999_999,
            comfySourceUrl: "https://private.example/output.png",
            graph: { node: { class_type: "SaveImage" } },
        },
        settings: {
            provider: "local",
            localType: "comfyui",
            comfyScheduler: "normal",
            comfyWorkflow: '{"1":{"class_type":"SaveImage"}}',
            comfyAllowLegacyInterrupt: true,
            apiKey: "secret",
            _backupProfiles: { private: true },
        },
    });

    assert.deepEqual(request, {
        version: 1,
        provider: "local",
        parameters: { model: "safe-model", width: 2048, steps: 1, cfgScale: 1, seed: 0xffffffff },
        settings: { provider: "local", localType: "comfyui", comfyScheduler: "normal" },
    });
});

test("reverse-proxy CFG zero survives effective request sanitization", () => {
    const importedProxy = sanitizeEffectiveRequest({
        provider: "proxy",
        parameters: { cfgScale: 0 },
        settings: { provider: "proxy", proxyCfg: 0 },
    });
    assert.equal(importedProxy.parameters.cfgScale, 0);
    assert.equal(importedProxy.settings.proxyCfg, 0);

    const createdProxy = createEffectiveRequest({
        provider: "proxy",
        proxyPayloadMode: "extended",
        proxyCfg: 0,
        width: 1024,
        height: 1024,
        steps: 20,
        seed: 1,
    });
    assert.equal(createdProxy.parameters.cfgScale, 0);
    assert.equal(createdProxy.settings.proxyCfg, 0);
    assert.equal(sanitizeEffectiveRequest({ provider: "local", parameters: { cfgScale: 0 } }).parameters.cfgScale, 1);
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
    assert.equal(request.parameters.model, undefined);
    assert.equal(request.settings.model, undefined);
});

test("effective metadata omits Custom models and redacts credential-bearing built-in models", () => {
    assert.deepEqual(sanitizeEffectiveRequest({
        provider: "custom",
        parameters: { model: "private-custom-model", seed: 3 },
        settings: { provider: "custom", model: "private-custom-model" },
    }), {
        version: 1,
        provider: "custom",
        parameters: { seed: 3 },
        settings: { provider: "custom" },
    });
    assert.equal(sanitizeEffectiveRequest({
        provider: "local",
        parameters: { model: "checkpoint?clientSecret=canary" },
    }).parameters.model, "checkpoint");
    assert.equal(sanitizeEffectiveRequest({
        provider: "local",
        parameters: { model: "auth_token=canary" },
    }).parameters.model, undefined);
    assert.equal(sanitizeEffectiveRequest({
        provider: "local",
        parameters: { model: "Bearer model-canary" },
    }).parameters.model, undefined);
    assert.equal(sanitizeEffectiveRequest({
        provider: "local",
        parameters: { model: "https://models.example/checkpoints;token=path-canary/model" },
    }).parameters.model, undefined);
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
        steps: 40,
        cfgScale: 7,
        seed: 123,
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
    assert.deepEqual(createEffectiveRequest({
        ...settings,
        provider: "routeway",
        routewayModel: "flux-1-schnell",
    }).parameters, {
        model: null,
        width: 768,
        height: 1024,
        steps: 40,
        cfgScale: 7,
        seed: 123,
    });
    assert.deepEqual(createEffectiveRequest({
        ...settings,
        provider: "fal",
        falModel: "fal-ai/flux/schnell",
    }, { model: "fal-ai/flux/schnell" }).parameters, {
        model: "fal-ai/flux/schnell",
        width: 768,
        height: 1024,
        steps: 12,
        cfgScale: 7,
        seed: 123,
    });
});
