import assert from "node:assert/strict";
import test from "node:test";
import { materializeProviderImageSource } from "../lib/provider-adapters.js";

import {
    abortableSleep,
    buildNovelAIProxyRequestUrl,
    buildCivitaiWorkflowBody,
    extractCivitaiFailureReason,
    fetchCivitaiOutput,
    findEmbeddedPngRange,
    getCivitaiWorkflowImageUrls,
    inferCivitaiEcosystem,
    isTransientProviderStatus,
    isTrustedProviderOutputUrl,
    looksLikeSsePayload,
    mapCivitaiSdcppSampler,
    parseCivitaiLoras,
    readSseDataStream,
} from "../lib/hosted-provider.js";
import {
    getFalEffectiveSteps,
    getFalEffectiveGuidance,
    getNanoGptEffectiveResolution,
    getNanoGptModelCapabilities,
    getNanoGptReferenceConstraints,
    getNanoGptResolution,
    getGlmImageResolution,
    getProviderGenerationCapabilities,
    pollinationsModelRequiresAuth,
    registerPollinationsModelMetadata,
    validateReplicateSdxlVersion,
} from "../lib/provider-capabilities.js";

test("CivitAI v2 workflow payload follows the mandatory imageGen contract", () => {
    const body = buildCivitaiWorkflowBody({
        model: "urn:air:sdxl:checkpoint:civitai:123@456",
        prompt: "a lighthouse",
        negativePrompt: "fog",
        sampler: "DPM++ 2M Karras",
        steps: 28,
        cfgScale: 6.5,
        width: 1024,
        height: 768,
        seed: 42,
        loras: parseCivitaiLoras("urn:air:sdxl:lora:civitai:7@8:0.75"),
    });

    assert.deepEqual(body, {
        steps: [{
            $type: "imageGen",
            input: {
                engine: "sdcpp",
                ecosystem: "sdxl",
                operation: "createImage",
                model: "urn:air:sdxl:checkpoint:civitai:123@456",
                prompt: "a lighthouse",
                negativePrompt: "fog",
                sampleMethod: "dpm++2m",
                schedule: "karras",
                steps: 28,
                cfgScale: 6.5,
                width: 1024,
                height: 768,
                seed: 42,
                loras: { "urn:air:sdxl:lora:civitai:7@8": 0.75 },
                quantity: 1,
            },
        }],
    });
    assert.equal("clipSkip" in body.steps[0].input, false);
    assert.equal(inferCivitaiEcosystem("urn:air:sd1:checkpoint:civitai:1@2"), "sd1");
    assert.deepEqual(parseCivitaiLoras("urn:air:sd1:lora:civitai:7@8"), {
        "urn:air:sd1:lora:civitai:7@8": 1,
    });
    assert.throws(() => mapCivitaiSdcppSampler("DPM++ SDE Karras"), /Unsupported CivitAI sampler/);
    assert.throws(() => inferCivitaiEcosystem("urn:air:pony:checkpoint:civitai:1@2"), /Unsupported CivitAI AIR ecosystem/);
});

test("CivitAI workflow output extraction reads every step image", () => {
    assert.deepEqual(getCivitaiWorkflowImageUrls({
        steps: [
            { output: { images: [{ url: "https://image.civitai.com/a.png" }] } },
            { output: { images: [{ url: "https://image.civitai.com/b.png" }, {}] } },
        ],
    }), ["https://image.civitai.com/a.png", "https://image.civitai.com/b.png"]);
});

test("incremental SSE parsing joins multiline data and keeps the final image", async () => {
    const encoder = new TextEncoder();
    const chunks = [
        'data: {"status":"processing",\n',
        'data: "image":"https://fal.media/preview.png"}\n\n',
        'data: {"status":"completed",\n',
        'data: "image":"https://fal.media/final.png"}\n\n',
        'data: {"status":"completed","image":"https://fal.media/ignored.png"}\n\n',
    ];
    const response = new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    }), { headers: { "content-type": "text/event-stream" } });

    const result = await readSseDataStream(response, data => {
        const parsed = JSON.parse(data);
        return {
            value: parsed.image,
            terminal: parsed.status === "completed",
        };
    });
    assert.equal(result.value, "https://fal.media/final.png");
    assert.equal(result.eventCount, 2);
    assert.equal(result.provisionalOnly, false);
});

test("SSE parsing supports CR, CRLF, provisional previews, and terminal failures", async () => {
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"status":"processing","image":"preview"}\r'));
            controller.enqueue(encoder.encode('\n\r\ndata: {"status":"completed","image":"final"}\r\r'));
            controller.close();
        },
    }));
    const result = await readSseDataStream(response, data => {
        const event = JSON.parse(data);
        return {
            value: event.image,
            provisional: event.status === "processing",
            terminal: event.status === "completed",
        };
    });
    assert.equal(result.value, "final");
    assert.equal(result.eventCount, 2);

    const failed = new Response('data: {"status":"expired","reason":"job expired"}\n\n');
    await assert.rejects(readSseDataStream(failed, data => {
        const event = JSON.parse(data);
        if (["expired", "timeout", "canceled"].includes(event.status)) throw new Error(event.reason);
        return {};
    }), /job expired/);
    assert.equal(looksLikeSsePayload("https://cdn.example/final.png"), false);
    assert.equal(looksLikeSsePayload("data: https://cdn.example/final.png\r\n\r\n"), true);
});

test("NovelAI endpoint path edits preserve query strings and fragments", () => {
    assert.equal(
        buildNovelAIProxyRequestUrl("https://proxy.example/v1?token=x#route", "chat"),
        "https://proxy.example/v1/chat/completions?token=x#route",
    );
    assert.equal(
        buildNovelAIProxyRequestUrl("https://proxy.example/generate?token=x#route", "generate"),
        "https://proxy.example/generate?token=x#route",
    );
    assert.equal(
        buildNovelAIProxyRequestUrl("https://proxy.example/v1/chat/completions?token=x", "generate"),
        "https://proxy.example/v1/generate?token=x",
    );
});

test("CivitAI failures include nested step and job reasons", () => {
    assert.equal(extractCivitaiFailureReason({
        steps: [{ jobs: [{ blockedReason: "content policy" }] }],
    }), "content policy");
});

test("hosted retry, trust, auth, and capability policies are conservative", async () => {
    assert.equal(isTransientProviderStatus(408), true);
    assert.equal(isTransientProviderStatus(429), true);
    assert.equal(isTransientProviderStatus(503), true);
    assert.equal(isTransientProviderStatus(401), false);
    assert.equal(isTrustedProviderOutputUrl("replicate", "https://pbxt.replicate.delivery/out.png"), true);
    assert.equal(isTrustedProviderOutputUrl("replicate", "https://replicate.delivery.evil.test/out.png"), false);
    assert.equal(isTrustedProviderOutputUrl("zai", "https://sfile.chatglm.cn/out.png"), true);
    assert.equal(isTrustedProviderOutputUrl("zai", "https://cdn.bigmodel.cn/out.png"), true);
    assert.equal(isTrustedProviderOutputUrl("civitai", "https://image.civitai.red/out.png"), true);
    assert.equal(isTrustedProviderOutputUrl("custom", "https://proxy.example/v1/out.png", "https://proxy.example/v1/generate"), true);
    assert.equal(isTrustedProviderOutputUrl("custom", "https://cdn.api.proxy.example/out.png", "https://api.proxy.example/v1/generate", { allowRequestSubdomains: true }), true);
    assert.equal(isTrustedProviderOutputUrl("custom", "https://arbitrary.example/out.png", "https://api.proxy.example/v1/generate", { allowRequestSubdomains: true }), false);
    assert.equal(pollinationsModelRequiresAuth("gptimage"), true);
    assert.equal(pollinationsModelRequiresAuth("gptimage-large"), true);
    assert.equal(pollinationsModelRequiresAuth("qwen-image"), true);
    assert.equal(pollinationsModelRequiresAuth("wan-image"), true);
    registerPollinationsModelMetadata([{ name: "discovered-paid", paid_only: true }]);
    assert.equal(pollinationsModelRequiresAuth("discovered-paid"), true);
    assert.equal(getFalEffectiveSteps("fal-ai/flux/schnell", 40), 12);
    assert.equal(getFalEffectiveGuidance("fal-ai/flux/schnell", 0), 1);
    assert.equal(getFalEffectiveGuidance("fal-ai/flux/schnell", 40), 20);
    assert.equal(getProviderGenerationCapabilities("navy").seed, false);
    assert.equal(getProviderGenerationCapabilities("routeway").cfgScale, true);
    assert.deepEqual(getNanoGptModelCapabilities("flux-schnell"), {
        steps: false,
        cfgScale: false,
        sampler: false,
        seed: false,
        sequentialSeeds: false,
        referenceImages: false,
    });
    assert.equal(getNanoGptModelCapabilities("edit-model", {
        architecture: { input_modalities: ["text", "image"] },
        supported_parameters: { steps: {}, guidance_scale: {}, seed: {} },
    }).referenceImages, true);
    assert.equal(getNanoGptResolution(512, 512), "1024x1024");
    assert.equal(getNanoGptResolution(768, 1024), "768x1024");
    assert.deepEqual(getNanoGptReferenceConstraints({
        endpoints: [{ input_reference_constraints: { max_images: 2, formats: [".png", "image/jpeg"] } }],
    }), { maxImages: 2, mimeTypes: ["image/png", "image/jpeg"], maxBytes: null });
    assert.equal(getNanoGptResolution(1000, 700, {
        supported_parameters: { resolution: { values: ["640x640", "1280x768"] } },
    }), "1280x768");
    assert.equal(getNanoGptResolution(1600, 900, {
        supported_parameters: { resolution: { values: ["square_hd", "landscape_16_9", "portrait_16_9"] } },
    }), "landscape_16_9");
    assert.equal(getNanoGptResolution(900, 1600, {
        supported_parameters: { resolution: { values: ["1:1", "16:9", "9:16"] } },
    }), "9:16");
    assert.equal(getNanoGptResolution(1900, 1200, {
        supported_parameters: { resolution: { values: ["1k", "2k", "4k"] } },
    }), "2k");
    assert.equal(getNanoGptResolution(1024, 1024, {
        supported_parameters: { resolution: { values: ["provider_native"] } },
    }), "provider_native");
    assert.deepEqual(getNanoGptEffectiveResolution(1000, 700, {
        supported_parameters: { resolution: { values: ["640x640", "1280x768"] } },
    }), { resolution: "1280x768", width: 1280, height: 768 });
    assert.deepEqual(getNanoGptEffectiveResolution(1600, 900, {
        supported_parameters: { resolution: { values: ["square_hd", "landscape_16_9"] } },
    }), { resolution: "landscape_16_9" });
    assert.deepEqual(getNanoGptEffectiveResolution(2048, 1200, {
        endpoints: [{ supported_parameters: { resolutions: ["1k", "2k", "4k"] } }],
    }), { resolution: "2k" });
    assert.deepEqual(getNanoGptReferenceConstraints({
        endpoints: [{
            input_reference_constraints: {
                max_items: 40,
                route: { formats: ["png", "webp"], max_bytes: 123456 },
            },
        }],
    }), { maxImages: 15, mimeTypes: ["image/png", "image/webp"], maxBytes: 123456 });
    assert.equal(getGlmImageResolution(1000, 1500), "864x1152");

    const controller = new AbortController();
    const waiting = abortableSleep(10_000, controller.signal);
    controller.abort();
    await assert.rejects(waiting, error => error.name === "AbortError");
});

test("Replicate accepts only explicit SDXL version contracts", () => {
    const version = "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";
    assert.equal(validateReplicateSdxlVersion(`stability-ai/sdxl:${version}`), `stability-ai/sdxl:${version}`);
    assert.throws(
        () => validateReplicateSdxlVersion(`black-forest-labs/flux-schnell:${"a".repeat(64)}`),
        /supports only.*stability-ai\/sdxl.*Flux/i,
    );
    assert.throws(() => validateReplicateSdxlVersion(`stability-ai/sdxl:${"a".repeat(64)}`), /unverified SDXL versions/);
});

test("CivitAI orchestration blobs follow one validated 308 without forwarding credentials", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
            return new Response(null, {
                status: 308,
                headers: { location: "https://image.civitai.red/output.png" },
            });
        }
        return new Response(Uint8Array.of(1), { headers: { "content-type": "image/png" } });
    };
    const response = await fetchCivitaiOutput(
        "https://orchestration.civitai.com/v2/consumer/blobs/blob_123",
        "canary",
        { fetchImpl },
    );
    assert.equal(response.ok, true);
    assert.deepEqual(calls.map(call => ({
        url: call.url,
        authorization: call.init.headers.Authorization,
        redirect: call.init.redirect,
    })), [
        {
            url: "https://orchestration.civitai.com/v2/consumer/blobs/blob_123",
            authorization: "Bearer canary",
            redirect: "manual",
        },
        {
            url: "https://image.civitai.red/output.png",
            authorization: undefined,
            redirect: "error",
        },
    ]);
});

test("CivitAI output redirects reject untrusted locations without a second request", async () => {
    let calls = 0;
    await assert.rejects(fetchCivitaiOutput(
        "https://orchestration.civitai.com/v2/consumer/blobs/blob_123",
        "canary",
        {
            fetchImpl: async () => {
                calls += 1;
                return new Response(null, { status: 308, headers: { location: "https://civitai.com.evil.test/out.png" } });
            },
        },
    ), /untrusted host/);
    assert.equal(calls, 1);
});

test("CivitAI browser-opaque redirects fail with the exact relay requirement", async () => {
    await assert.rejects(fetchCivitaiOutput(
        "https://orchestration.civitai.com/v2/consumer/blobs/blob_123",
        "canary",
        { fetchImpl: async () => ({ type: "opaqueredirect", status: 0 }) },
    ), /relay must expose and validate the 308 Location/);
});

test("embedded PNG extraction follows chunk boundaries and accepts zero-length IEND", () => {
    const chunk = (type, data = new Uint8Array()) => {
        const bytes = new Uint8Array(12 + data.length);
        new DataView(bytes.buffer).setUint32(0, data.length, false);
        bytes.set(new TextEncoder().encode(type), 4);
        bytes.set(data, 8);
        return bytes;
    };
    const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const ihdr = chunk("IHDR", new Uint8Array(13));
    const idat = chunk("IDAT", new TextEncoder().encode("noiseIENDnoise"));
    const iend = chunk("IEND");
    const prefix = Uint8Array.of(9, 8, 7);
    const bytes = new Uint8Array(prefix.length + signature.length + ihdr.length + idat.length + iend.length + 2);
    bytes.set(prefix);
    bytes.set(signature, prefix.length);
    bytes.set(ihdr, prefix.length + signature.length);
    bytes.set(idat, prefix.length + signature.length + ihdr.length);
    bytes.set(iend, prefix.length + signature.length + ihdr.length + idat.length);
    assert.deepEqual(findEmbeddedPngRange(bytes), {
        start: prefix.length,
        end: bytes.length - 2,
    });

    const truncated = bytes.slice(0, bytes.length - 7);
    assert.equal(findEmbeddedPngRange(truncated), null);
});

test("SSE completion never promotes a provisional namespaced image", async () => {
    const response = new Response('data: {"type":"image_generation.partial_image","image":"preview"}\n\ndata: [DONE]\n\n');
    const result = await readSseDataStream(response, data => {
        const event = JSON.parse(data);
        return { value: event.image, provisional: event.type.endsWith(".partial_image") };
    });
    assert.equal(result.value, undefined);
    assert.equal(result.provisionalOnly, true);
});

test("hosted output credentials stay on the exact authenticated result origin", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, headers: init.headers });
        return new Response(Uint8Array.of(1, 2, 3), { headers: { "content-type": "image/png" } });
    };
    await materializeProviderImageSource("https://pbxt.replicate.delivery/out.png", {
        requestUrl: "https://api.replicate.com/v1/predictions",
        headers: { Authorization: "Bearer canary" },
        forceFetch: true,
        allowedHostSuffixes: ["replicate.delivery"],
        credentialHostSuffixes: [],
        fetchImpl,
        materializeBytes: bytes => bytes,
    });
    await materializeProviderImageSource("https://pbxt.replicate.delivery/private.png", {
        requestUrl: "https://pbxt.replicate.delivery/private.png",
        headers: { Authorization: "Bearer canary" },
        forceFetch: true,
        allowedHostSuffixes: ["replicate.delivery"],
        credentialHostSuffixes: [],
        fetchImpl,
        materializeBytes: bytes => bytes,
    });
    assert.deepEqual(calls.map(call => call.headers.Authorization), [undefined, "Bearer canary"]);
});
