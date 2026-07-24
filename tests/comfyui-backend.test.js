import assert from "node:assert/strict";
import test from "node:test";

import {
    buildComfyBuiltinWorkflow,
    buildComfyPromptRequest,
    buildComfyViewUrl,
    cancelComfyPrompt,
    getComfyWorkflowCapabilities,
    normalizeComfyModelLoader,
    normalizeComfySettings,
    parseComfyHistoryEntry,
    parseComfyPromptResponse,
    parseComfyWebSocketMessage,
    parseComfyWorkflow,
    pollComfyHistory,
    renderComfyWorkflow,
    selectComfyModelList,
    supportsComfyJobsCancel,
} from "../lib/comfyui-backend.js";

const baseUrl = "https://comfy.example.test/api";
const promptId = "123e4567-e89b-12d3-a456-426614174000";

function workflow(inputs = {}) {
    return {
        "3": {
            class_type: "KSampler",
            inputs,
        },
    };
}

function completedHistory(outputs = {}) {
    return {
        outputs,
        status: {
            completed: true,
            status_str: "success",
            messages: [["execution_success", { prompt_id: promptId }]],
        },
    };
}

function jsonResponse(value, init = {}) {
    return new Response(JSON.stringify(value), {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
}

function builtinOptions(overrides = {}) {
    return {
        modelLoader: "checkpoint",
        modelName: "sdxl.safetensors",
        clipSkip: 1,
        skipNegativePrompt: false,
        prompt: "a lighthouse",
        negativePrompt: "fog",
        seed: 42,
        steps: 20,
        cfgScale: 7,
        samplerName: "euler",
        schedulerName: "normal",
        denoise: 1,
        width: 1024,
        height: 1024,
        ...overrides,
    };
}

test("normalizes explicit and legacy ComfyUI model loader settings", () => {
    assert.equal(normalizeComfyModelLoader("unet"), "unet");
    assert.equal(normalizeComfyModelLoader("checkpoint"), "checkpoint");
    assert.equal(normalizeComfyModelLoader(undefined, {
        comfySkipNegativePrompt: true,
        comfyFluxClipModel1: "t5xxl.safetensors",
    }), "unet");
    assert.equal(normalizeComfyModelLoader(undefined, {
        comfySkipNegativePrompt: false,
        comfyFluxClipModel1: "t5xxl.safetensors",
    }), "checkpoint");
});

test("migrates only legacy inferred UNET settings to the shipped VAE fallback", () => {
    const legacy = {
        comfySkipNegativePrompt: true,
        comfyFluxClipModel1: "t5xxl.safetensors",
        comfyFluxVaeModel: "",
    };
    assert.deepEqual(normalizeComfySettings(legacy), {
        ...legacy,
        comfyModelLoader: "unet",
        comfyFluxVaeModel: "ae.safetensors",
    });
    assert.equal(legacy.comfyModelLoader, undefined);
    assert.equal(legacy.comfyFluxVaeModel, "");

    assert.equal(normalizeComfySettings({
        ...legacy,
        comfyModelLoader: "legacy",
    }).comfyFluxVaeModel, "ae.safetensors");
    assert.deepEqual(normalizeComfySettings({
        ...legacy,
        comfyModelLoader: "legacy",
        comfyFluxVaeModel: "custom-vae.safetensors",
    }), {
        ...legacy,
        comfyModelLoader: "unet",
        comfyFluxVaeModel: "custom-vae.safetensors",
    });
});

test("does not supply a VAE fallback for an explicit UNET configuration", () => {
    const normalized = normalizeComfySettings({
        comfyModelLoader: "unet",
        comfyFluxClipModel1: "t5xxl.safetensors",
        comfyFluxVaeModel: "",
    });
    assert.equal(normalized.comfyModelLoader, "unet");
    assert.equal(normalized.comfyFluxVaeModel, "");
    assert.throws(() => buildComfyBuiltinWorkflow(builtinOptions({
        modelLoader: normalized.comfyModelLoader,
        clipModel1: normalized.comfyFluxClipModel1,
        vaeModel: normalized.comfyFluxVaeModel,
    })), /requires a VAE Model/);
});

test("selects only models belonging to the explicit ComfyUI loader", () => {
    const catalogs = {
        checkpoints: ["sdxl.safetensors"],
        unets: ["flux-dev.safetensors"],
    };
    assert.deepEqual(selectComfyModelList(catalogs, "checkpoint"), ["sdxl.safetensors"]);
    assert.deepEqual(selectComfyModelList(catalogs, "unet"), ["flux-dev.safetensors"]);
    assert.deepEqual(selectComfyModelList({ checkpoints: [], unets: catalogs.unets }, "checkpoint"), []);
    assert.deepEqual(selectComfyModelList({ checkpoints: catalogs.checkpoints, unets: [] }, "unet"), []);
});

test("builds a checkpoint workflow with embedded CLIP and VAE outputs", () => {
    const result = buildComfyBuiltinWorkflow(builtinOptions());
    const nodes = result.workflow;

    assert.equal(result.modelLoader, "checkpoint");
    assert.deepEqual(nodes["4"], {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sdxl.safetensors" },
    });
    assert.deepEqual(nodes["3"].inputs.model, ["4", 0]);
    assert.deepEqual(nodes["6"].inputs.clip, ["4", 1]);
    assert.deepEqual(nodes["7"].inputs.clip, ["4", 1]);
    assert.deepEqual(nodes["8"].inputs.vae, ["4", 2]);
    assert.equal(nodes["11"], undefined);
});

test("requires external CLIP and VAE files for Diffusion/UNET workflows", () => {
    assert.throws(() => buildComfyBuiltinWorkflow(builtinOptions({
        modelLoader: "unet",
        vaeModel: "ae.safetensors",
    })), /requires CLIP Model 1/);
    assert.throws(() => buildComfyBuiltinWorkflow(builtinOptions({
        modelLoader: "unet",
        clipModel1: "t5xxl.safetensors",
    })), /requires a VAE Model/);
});

test("builds a single-CLIP UNET workflow with negative conditioning and CLIP skip", () => {
    const nodes = buildComfyBuiltinWorkflow(builtinOptions({
        modelLoader: "unet",
        modelName: "flux-dev.safetensors",
        clipModel1: "t5xxl.safetensors",
        vaeModel: "ae.safetensors",
        clipType: "flux2",
        clipSkip: 2,
    })).workflow;

    assert.equal(nodes["11"].class_type, "UNETLoader");
    assert.deepEqual(nodes["11"].inputs, { unet_name: "flux-dev.safetensors", weight_dtype: "default" });
    assert.deepEqual(nodes["12"], {
        class_type: "CLIPLoader",
        inputs: { clip_name: "t5xxl.safetensors", type: "flux2" },
    });
    assert.deepEqual(nodes["13"].inputs, { vae_name: "ae.safetensors" });
    assert.deepEqual(nodes["10"].inputs, { stop_at_clip_layer: -2, clip: ["12", 0] });
    assert.deepEqual(nodes["6"].inputs.clip, ["10", 0]);
    assert.deepEqual(nodes["7"].inputs, { text: "fog", clip: ["10", 0] });
    assert.deepEqual(nodes["3"].inputs.negative, ["7", 0]);
    assert.equal(nodes["4"], undefined);
});

test("builds a dual-CLIP UNET workflow that can reuse positive conditioning", () => {
    const nodes = buildComfyBuiltinWorkflow(builtinOptions({
        modelLoader: "unet",
        modelName: "flux-dev.safetensors",
        clipModel1: "t5xxl.safetensors",
        clipModel2: "clip_l.safetensors",
        vaeModel: "ae.safetensors",
        clipType: "flux",
        skipNegativePrompt: true,
    })).workflow;

    assert.deepEqual(nodes["12"], {
        class_type: "DualCLIPLoader",
        inputs: {
            clip_name1: "t5xxl.safetensors",
            clip_name2: "clip_l.safetensors",
            type: "flux",
        },
    });
    assert.deepEqual(nodes["3"].inputs.negative, ["6", 0]);
    assert.equal(nodes["7"], undefined);
});

test("parses API-format node maps and full prompt envelopes", () => {
    const root = workflow({ text: "%prompt%" });
    assert.deepEqual(parseComfyWorkflow(JSON.stringify(root)), root);

    const envelope = { prompt: root, client_id: "%client_id%", number: 4 };
    assert.deepEqual(parseComfyWorkflow(envelope), envelope);
    assert.throws(() => parseComfyWorkflow({ prompt: { nodes: [], links: [] } }), /visual workflow export/);
    assert.deepEqual(buildComfyPromptRequest(root, { prompt: "scene" }), {
        prompt: workflow({ text: "scene" }),
    });
    assert.deepEqual(buildComfyPromptRequest(envelope, { clientId: "client-1", prompt: "scene" }), {
        prompt: workflow({ text: "scene" }),
        client_id: "client-1",
        number: 4,
    });
});

test("rejects arrays, visual exports, and malformed API node maps", () => {
    assert.throws(() => parseComfyWorkflow("[]"), /object, not an array/);
    assert.throws(() => parseComfyWorkflow({ nodes: [], links: [] }), /visual workflow export/);
    assert.throws(() => parseComfyWorkflow({}), /must not be empty/);
    assert.throws(() => parseComfyWorkflow({ "1": { inputs: {} } }), /class_type/);
    assert.throws(() => parseComfyWorkflow({ "1": { class_type: "LoadImage", inputs: [] } }), /inputs object/);
    assert.throws(() => parseComfyWorkflow({ prompt: "not-an-envelope" }), /node "prompt" must be an object/);
    assert.throws(() => parseComfyWorkflow("{bad"), /valid JSON/);
});

test("bounds workflow size, nesting depth, and node count", () => {
    const oversized = `{"1":{"class_type":"X","inputs":{"text":"${"x".repeat(1024 * 1024)}"}}}`;
    assert.throws(() => parseComfyWorkflow(oversized), /too large/);

    let nested = "%prompt%";
    for (let i = 0; i < 40; i++) nested = { nested };
    assert.throws(() => parseComfyWorkflow(workflow({ nested })), /nested too deeply/);

    const manyNodes = Object.fromEntries(Array.from({ length: 1_001 }, (_value, index) => [
        String(index),
        { class_type: "TestNode", inputs: {} },
    ]));
    assert.throws(() => parseComfyWorkflow(manyNodes), /more than 1000 nodes/);
});

test("substitutes placeholders once, preserves exact types, and never changes keys", () => {
    const rendered = renderComfyWorkflow(workflow({
        "%prompt%": "object keys are unchanged",
        prompt: "%prompt%",
        mixed: "prompt=%prompt%; width=%width%; unknown=%future_token%",
        seed: "%seed%",
        stop_at_clip_layer: "%clip_stop_at_layer%",
        clip_skip: "%clip_skip%",
        first: "%reference_image%",
        second: "%reference_image_2%",
        missing: "%reference_image_3%",
        unknown: "%not_supported%",
    }), {
        prompt: "%width%",
        width: 640,
        seed: 42,
        clipSkip: 2,
        referenceImages: ["first.png", "second.png"],
        not_supported: "must not be inserted",
    });

    assert.deepEqual(rendered["3"].inputs, {
        "%prompt%": "object keys are unchanged",
        prompt: "%width%",
        mixed: "prompt=%width%; width=640; unknown=%future_token%",
        seed: 42,
        stop_at_clip_layer: -2,
        clip_skip: 2,
        first: "first.png",
        second: "second.png",
        missing: "",
        unknown: "%not_supported%",
    });
});

test("detects capabilities from known token usage only", () => {
    const capabilities = getComfyWorkflowCapabilities({
        prompt: workflow({
            text: "%prompt%",
            cfg: "%cfg%",
            clip: "%clip_stop_at_layer%",
            refs: ["%reference_image_2%"],
            output: "%filename_prefix%_%batch_index%",
            future: "%future_token%",
        }),
        client_id: "%client_id%",
    });

    assert.equal(capabilities.prompt, true);
    assert.equal(capabilities.cfgScale, true);
    assert.equal(capabilities.clipSkip, true);
    assert.equal(capabilities.referenceImages, true);
    assert.equal(capabilities.filenamePrefix, true);
    assert.equal(capabilities.batch, true);
    assert.equal(capabilities.clientId, true);
    assert.equal(capabilities.width, false);
    assert.deepEqual(capabilities.tokens, [
        "batch_index",
        "cfg",
        "client_id",
        "clip_stop_at_layer",
        "filename_prefix",
        "prompt",
        "reference_image_2",
    ]);
});

test("validates prompt submission responses and preserves queue metadata", () => {
    assert.deepEqual(parseComfyPromptResponse({
        prompt_id: promptId,
        number: 7,
        node_errors: { "3": { errors: [] } },
        ignored: true,
    }), {
        prompt_id: promptId,
        number: 7,
        node_errors: { "3": { errors: [] } },
    });
    assert.throws(() => parseComfyPromptResponse({ number: 7 }), /non-empty prompt_id/);
    assert.throws(() => parseComfyPromptResponse({ prompt_id: "  " }), /non-empty prompt_id/);
    assert.throws(() => parseComfyPromptResponse({ prompt_id: 12 }), /non-empty prompt_id/);
});

test("builds endpoints without duplicate slashes for root and path-prefixed URLs", () => {
    const image = { filename: "result one.png", subfolder: "set/a", type: "output" };
    const rootUrl = new URL(buildComfyViewUrl("http://127.0.0.1:8188/", image));
    const prefixedUrl = new URL(buildComfyViewUrl("https://comfy.example.test/api///", image));

    assert.equal(rootUrl.pathname, "/view");
    assert.equal(prefixedUrl.pathname, "/api/view");
    assert.equal(rootUrl.searchParams.get("filename"), "result one.png");
    assert.equal(prefixedUrl.searchParams.get("subfolder"), "set/a");
});

test("enumerates every output image in deterministic node and image order", () => {
    const entry = completedHistory({
        "10": {
            images: [
                { filename: "ten one.png", subfolder: "set/a", type: "temp" },
                { filename: "ten-two.png", subfolder: "", type: "output" },
            ],
        },
        "2": { images: [{ filename: "two.png", subfolder: "folder & more", type: "output" }] },
        "9": { text: ["not an image"] },
    });
    const result = parseComfyHistoryEntry(entry, { baseUrl });

    assert.equal(result.state, "success");
    assert.deepEqual(result.images.map(image => [image.nodeId, image.imageIndex, image.filename]), [
        ["2", 0, "two.png"],
        ["10", 0, "ten one.png"],
        ["10", 1, "ten-two.png"],
    ]);
    const imageUrl = new URL(result.images[0].url);
    assert.equal(imageUrl.pathname, "/api/view");
    assert.equal(imageUrl.searchParams.get("filename"), "two.png");
    assert.equal(imageUrl.searchParams.get("subfolder"), "folder & more");
    assert.equal(imageUrl.searchParams.get("type"), "output");
});

test("selects output nodes and an image index without losing image metadata", () => {
    const entry = completedHistory({
        "2": { images: [{ filename: "ignored.png", subfolder: "", type: "output" }] },
        "10": {
            images: [
                { filename: "first.png", subfolder: "a", type: "temp" },
                { filename: "selected.png", subfolder: "b/c", type: "input" },
            ],
        },
    });
    const result = parseComfyHistoryEntry(entry, {
        baseUrl,
        outputNodeIds: ["10"],
        imageIndex: 1,
    });

    assert.deepEqual(result.images[0], {
        nodeId: "10",
        imageIndex: 1,
        filename: "selected.png",
        subfolder: "b/c",
        type: "input",
        url: buildComfyViewUrl(baseUrl, { filename: "selected.png", subfolder: "b/c", type: "input" }),
    });
});

test("distinguishes pending, terminal errors, interruption, and completion without images", () => {
    assert.equal(parseComfyHistoryEntry({}).state, "pending");
    assert.equal(parseComfyHistoryEntry({ status: { status_str: "running" } }).state, "pending");
    assert.equal(parseComfyHistoryEntry({
        outputs: { "9": { images: [{ filename: "partial.png" }] } },
        status: { status_str: "running" },
    }).state, "pending");

    const executionError = parseComfyHistoryEntry({
        status: {
            status_str: "error",
            messages: [["execution_error", { exception_message: "CUDA out of memory", node_id: "3" }]],
        },
    });
    assert.equal(executionError.state, "error");
    assert.equal(executionError.message, "CUDA out of memory");
    assert.equal(executionError.messages.length, 1);

    const interrupted = parseComfyHistoryEntry({
        status: {
            status_str: "error",
            messages: [["execution_interrupted", { message: "Stopped by user" }]],
        },
    });
    assert.equal(interrupted.state, "interrupted");
    assert.equal(interrupted.message, "Stopped by user");
    assert.equal(parseComfyHistoryEntry(completedHistory()).state, "completed_no_images");
});

test("parses correlated WebSocket progress, node, and terminal envelopes", () => {
    assert.deepEqual(parseComfyWebSocketMessage(JSON.stringify({
        type: "progress",
        data: { prompt_id: promptId, value: 2, max: 10, node: "3" },
    }), promptId), {
        type: "progress",
        promptId,
        value: 2,
        max: 10,
        node: "3",
    });
    assert.equal(parseComfyWebSocketMessage({
        type: "executing",
        data: { prompt_id: promptId, node: "7" },
    }, promptId).type, "current_node");
    assert.deepEqual(parseComfyWebSocketMessage({
        type: "executing",
        data: { prompt_id: promptId, node: null },
    }, promptId), {
        type: "success",
        promptId,
        terminal: true,
        legacy: true,
    });
    assert.equal(parseComfyWebSocketMessage({
        type: "execution_success",
        data: { prompt_id: promptId },
    }, promptId).type, "success");
    assert.equal(parseComfyWebSocketMessage({
        type: "execution_error",
        data: { prompt_id: promptId, exception_message: "bad node" },
    }, promptId).message, "bad node");
    assert.equal(parseComfyWebSocketMessage({
        type: "execution_interrupted",
        data: { prompt_id: promptId },
    }, promptId).type, "interrupted");
});

test("ignores malformed and unrelated WebSocket messages", () => {
    assert.equal(parseComfyWebSocketMessage("not json", promptId), null);
    assert.equal(parseComfyWebSocketMessage({
        type: "progress",
        data: { prompt_id: "another-prompt", value: 1, max: 2 },
    }, promptId), null);
    assert.equal(parseComfyWebSocketMessage({ type: "status", data: {} }, promptId), null);
});

test("polls empty history, retries transient HTTP statuses, and returns all images", async () => {
    const calls = [];
    const sleeps = [];
    const responses = [
        new Response("busy", { status: 503 }),
        jsonResponse({}),
        jsonResponse({
            [promptId]: completedHistory({
                "9": { images: [{ filename: "result.png", subfolder: "final", type: "output" }] },
            }),
        }),
    ];
    const result = await pollComfyHistory(promptId, {
        baseUrl,
        timeoutMs: 1_000,
        pollIntervalMs: 10,
        sleep: async ms => sleeps.push(ms),
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return responses.shift();
        },
    });

    assert.equal(result.state, "success");
    assert.equal(result.images[0].filename, "result.png");
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [10, 10]);
    assert.match(calls[0].url, new RegExp(`/history/${promptId}$`));
    assert.equal(calls[0].init.redirect, "error");
});

test("cancels transient history response bodies before retrying", async () => {
    let cancelled = false;
    let calls = 0;
    const transientBody = new ReadableStream({
        cancel() {
            cancelled = true;
        },
    });
    const result = await pollComfyHistory(promptId, {
        baseUrl,
        pollIntervalMs: 1,
        sleep: async () => assert.equal(cancelled, true),
        fetchImpl: async () => {
            calls += 1;
            if (calls === 1) return new Response(transientBody, { status: 503 });
            return jsonResponse({
                [promptId]: completedHistory({
                    "9": { images: [{ filename: "result.png" }] },
                }),
            });
        },
    });

    assert.equal(result.state, "success");
    assert.equal(cancelled, true);
    assert.equal(calls, 2);
});

test("propagates authentication failures without retrying", async () => {
    let calls = 0;
    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        sleep: async () => {},
        fetchImpl: async () => {
            calls += 1;
            return new Response("denied", { status: 401, statusText: "Unauthorized" });
        },
    }), /HTTP 401 Unauthorized: denied/);
    assert.equal(calls, 1);
});

test("surfaces malformed, oversized, and protocol-invalid history immediately", async () => {
    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        fetchImpl: async () => new Response("<html>not json</html>"),
    }), /malformed JSON/);

    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        maxResponseBytes: 100,
        fetchImpl: async () => jsonResponse({ [promptId]: { padding: "x".repeat(1_000) } }),
    }), /response size limit/);

    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        fetchImpl: async () => jsonResponse({ "different-prompt": {} }),
    }), /missing entry/);
});

test("throws immediately when completed history has no selected images", async () => {
    let calls = 0;
    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        outputNodeIds: ["99"],
        sleep: async () => assert.fail("completed history must not be retried"),
        fetchImpl: async () => {
            calls += 1;
            return jsonResponse({
                [promptId]: completedHistory({
                    "9": { images: [{ filename: "unselected.png", subfolder: "", type: "output" }] },
                }),
            });
        },
    }), /completed without images matching/);
    assert.equal(calls, 1);
});

test("honors an aborted polling signal before making a request", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        signal: controller.signal,
        fetchImpl: async () => assert.fail("fetch must not run after abort"),
    }), error => error?.name === "AbortError");
});

test("enforces its timeout when a supplied fetch implementation ignores abort", async () => {
    await assert.rejects(() => pollComfyHistory(promptId, {
        baseUrl,
        timeoutMs: 10,
        pollIntervalMs: 1,
        fetchImpl: async () => new Promise(() => {}),
    }), error => {
        assert.match(error.message, /timed out after 10 ms/);
        assert.equal(error.code, "COMFY_HISTORY_TIMEOUT");
        return true;
    });
});

test("detects jobs cancellation support and prefers a supplied cancel implementation", async () => {
    assert.equal(supportsComfyJobsCancel({ supports_jobs_cancel: true }), true);
    assert.equal(supportsComfyJobsCancel({ jobs: { cancel: true } }), true);
    assert.equal(supportsComfyJobsCancel({ jobs: { cancel: false } }), false);

    let suppliedCall;
    const result = await cancelComfyPrompt(promptId, {
        baseUrl,
        cancelJob: async (id, context) => {
            suppliedCall = { id, context };
            return { cancelled: true };
        },
        fetchImpl: async () => assert.fail("the supplied implementation should be preferred"),
    });
    assert.equal(result.strategy, "supplied-jobs-cancel");
    assert.equal(suppliedCall.id, promptId);
    assert.equal(suppliedCall.context.baseUrl, baseUrl);
});

test("uses feature-detected jobs cancellation before legacy routes", async () => {
    let request;
    const result = await cancelComfyPrompt(promptId, {
        baseUrl,
        features: { api: { jobs: { cancel: true } } },
        fetchImpl: async (url, init) => {
            request = { url, init };
            return jsonResponse({ cancelled: true });
        },
    });

    assert.equal(result.strategy, "jobs-api");
    assert.match(request.url, new RegExp(`/api/jobs/${promptId}/cancel$`));
    assert.equal(request.init.method, "POST");
});

test("deletes pending work from the queue when targeted jobs cancellation is unavailable", async () => {
    let request;
    const result = await cancelComfyPrompt(promptId, {
        baseUrl,
        pending: true,
        fetchImpl: async (url, init) => {
            request = { url, init };
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(result.strategy, "queue-delete");
    assert.equal(result.cancelled, true);
    assert.match(request.url, /\/api\/queue$/);
    assert.deepEqual(JSON.parse(request.init.body), { delete: [promptId] });
});

test("probes the jobs cancellation route with the real prompt before queue fallback", async () => {
    const requests = [];
    const result = await cancelComfyPrompt(promptId, {
        baseUrl: "http://127.0.0.1:8188/",
        tryJobsCancel: true,
        fetchImpl: async (url, init) => {
            requests.push({ url, init });
            if (url.includes("/api/jobs/")) return jsonResponse({ cancelled: true });
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(result.strategy, "jobs-api");
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, new RegExp(`/api/jobs/${promptId}/cancel$`));
});

test("falls back to queue deletion when the jobs cancellation route is unavailable", async () => {
    const requests = [];
    const result = await cancelComfyPrompt(promptId, {
        baseUrl: "http://127.0.0.1:8188/",
        tryJobsCancel: true,
        fetchImpl: async (url, init) => {
            requests.push({ url, init });
            if (url.includes("/api/jobs/")) return new Response(null, { status: 404 });
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(result.strategy, "queue-delete");
    assert.equal(result.cancelled, false);
    assert.match(result.reason, /prompt state was unknown/);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[1].url).pathname, "/queue");
    assert.deepEqual(JSON.parse(requests[1].init.body), { delete: [promptId] });
});

test("uses explicit queued and running states for safe legacy cancellation", async () => {
    const queued = await cancelComfyPrompt(promptId, {
        baseUrl,
        state: "queued",
        allowLegacyInterrupt: true,
        fetchImpl: async url => {
            assert.equal(new URL(url).pathname, "/api/queue");
            return new Response(null, { status: 200 });
        },
    });
    assert.deepEqual(queued, { strategy: "queue-delete", cancelled: true });

    const running = await cancelComfyPrompt(promptId, {
        baseUrl,
        promptState: "running",
        fetchImpl: async () => assert.fail("running work must not use queue deletion"),
    });
    assert.equal(running.strategy, "none");
    assert.equal(running.cancelled, false);
});

test("uses only an explicit targeted legacy interrupt and never sends it bodyless", async () => {
    let request;
    const result = await cancelComfyPrompt(promptId, {
        baseUrl,
        pending: false,
        allowLegacyInterrupt: true,
        fetchImpl: async (url, init) => {
            request = { url, init };
            return new Response(null, { status: 200 });
        },
    });

    assert.deepEqual(result, { strategy: "legacy-interrupt", cancelled: true, targeted: true });
    assert.match(request.url, /\/api\/interrupt$/);
    assert.deepEqual(JSON.parse(request.init.body), { prompt_id: promptId });

    let called = false;
    const safeResult = await cancelComfyPrompt(promptId, {
        baseUrl,
        pending: false,
        fetchImpl: async () => {
            called = true;
            return new Response(null, { status: 200 });
        },
    });
    assert.equal(safeResult.strategy, "none");
    assert.equal(called, false);
});
