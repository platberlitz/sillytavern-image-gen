import assert from "node:assert/strict";
import test from "node:test";

import {
    buildCustomBackendRequest,
    executeCustomBackend,
    extractCustomBackendImage,
    getCustomBackendCapabilities,
    normalizeCustomBackendConfig,
    renderCustomTemplate,
    resolveJsonPointer,
} from "../lib/custom-backend.js";

const baseConfig = {
    mode: "json",
    url: "https://images.example.test/generate",
    method: "POST",
    requestType: "json",
    authType: "header",
    authName: "X-API-Key",
    apiKey: "secret",
    requestTemplate: JSON.stringify({
        prompt: "{{prompt}}",
        negative_prompt: "{{negative}}",
        width: "{{width}}",
        seed: "{{seed}}",
    }),
    responsePath: "/result/image",
    responseType: "url",
    timeoutMs: 10_000,
};

test("resolves RFC 6901 pointers", () => {
    assert.equal(resolveJsonPointer({ a: { "b/c": [{ "~id": 4 }] } }, "/a/b~1c/0/~0id"), 4);
    assert.equal(resolveJsonPointer({}, "/missing"), undefined);
});

test("renders whitelisted request tokens without evaluating expressions", () => {
    const rendered = renderCustomTemplate({ n: "{{width}}", label: "size={{width}}", refs: "{{referenceImages}}" }, {
        width: 768,
        referenceImages: ["https://example.test/ref.png"],
    });
    assert.deepEqual(rendered, {
        n: 768,
        label: "size=768",
        refs: ["https://example.test/ref.png"],
    });
    assert.throws(() => normalizeCustomBackendConfig({
        ...baseConfig,
        requestTemplate: '{"prompt":"{{constructor}}"}',
    }), /Unsupported request token/);
});

test("derives generation capabilities from request tokens", () => {
    assert.deepEqual(getCustomBackendCapabilities('{"prompt":"{{prompt}}","size":"{{size}}","seed":"{{seed}}"}'), {
        model: false,
        width: true,
        height: true,
        size: true,
        steps: false,
        cfgScale: false,
        sampler: false,
        seed: true,
        referenceImages: false,
    });
});

test("builds authenticated JSON requests with typed generation values", async () => {
    const request = buildCustomBackendRequest(baseConfig, {
        prompt: "a lighthouse",
        negative: "fog",
        width: 768,
        height: 512,
        seed: 42,
    });
    assert.equal(request.url, baseConfig.url);
    assert.equal(request.headers["X-API-Key"], "secret");
    assert.equal(request.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request.body), {
        prompt: "a lighthouse",
        negative_prompt: "fog",
        width: 768,
        seed: 42,
    });
});

test("builds multipart requests with inline reference image files", async () => {
    const request = buildCustomBackendRequest({
        ...baseConfig,
        requestType: "multipart",
        requestTemplate: '{"prompt":"{{prompt}}","image":"{{firstReferenceImage}}"}',
    }, {
        prompt: "portrait",
        referenceImages: ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="],
    });
    assert.ok(request.body instanceof FormData);
    assert.equal(request.body.get("prompt"), "portrait");
    assert.ok(request.body.get("image") instanceof Blob);
    assert.equal(request.headers["Content-Type"], undefined);
});

test("extracts configured URL and base64 responses", () => {
    assert.equal(extractCustomBackendImage({ result: { image: "https://cdn.example.test/a.png" } }, "/result/image", "url"), "https://cdn.example.test/a.png");
    assert.equal(extractCustomBackendImage({ image: "YWJj".repeat(40) }, "/image", "base64"), `data:image/png;base64,${"YWJj".repeat(40)}`);
});

test("executes a simple JSON backend", async () => {
    const calls = [];
    const result = await executeCustomBackend(baseConfig, { prompt: "scene", width: 512, height: 512 }, {
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (calls.length === 2) {
                return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
            }
            return new Response(JSON.stringify({ result: { image: "https://cdn.example.test/result.png" } }), {
                headers: { "Content-Type": "application/json" },
            });
        },
    });
    assert.ok(result.buffer instanceof ArrayBuffer);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.redirect, "error");
});

test("resolves relative output URLs against the response and validates bytes", async () => {
    const calls = [];
    const result = await executeCustomBackend({ ...baseConfig, responsePath: "/image", responseType: "auto" }, {}, {
        fetchImpl: async (url) => {
            calls.push(url);
            if (calls.length === 1) {
                return new Response(JSON.stringify({ image: "/assets/result.jpg" }), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
        },
    });
    assert.ok(result.buffer instanceof ArrayBuffer);
    assert.equal(calls[1], "https://images.example.test/assets/result.jpg");
});

test("accepts direct image responses and rejects fake image bodies", async () => {
    const direct = await executeCustomBackend(baseConfig, {}, {
        fetchImpl: async () => new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } }),
    });
    assert.equal(direct.contentType, "image/jpeg");
    await assert.rejects(() => executeCustomBackend(baseConfig, {}, {
        fetchImpl: async () => new Response("not an image", { headers: { "Content-Type": "image/png" } }),
    }), /not a supported image format/);
});

test("extracts images from arrays and common inline-data shapes", () => {
    const encoded = "YWJj".repeat(40);
    assert.equal(extractCustomBackendImage({ output: [{ inlineData: { data: encoded } }] }), `data:image/png;base64,${encoded}`);
});

test("submits and polls bounded async jobs", async () => {
    const calls = [];
    const statuses = ["running", "succeeded"];
    const result = await executeCustomBackend({
        ...baseConfig,
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://images.example.test/jobs/{{jobId}}",
        pollMethod: "GET",
        statusPath: "/status",
        successValues: "succeeded",
        failureValues: "failed,error",
        pollIntervalMs: 250,
    }, { prompt: "scene", width: 512, height: 512 }, {
        sleep: async () => {},
        fetchImpl: async (url) => {
            calls.push(url);
            if (calls.length === 1) {
                return new Response(JSON.stringify({ id: "job/1" }), { headers: { "Content-Type": "application/json" } });
            }
            if (calls.length === 4) {
                return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
            }
            const status = statuses.shift();
            return new Response(JSON.stringify({
                status,
                result: status === "succeeded" ? { image: "https://cdn.example.test/final.png" } : undefined,
            }), { headers: { "Content-Type": "application/json" } });
        },
    });
    assert.ok(result.buffer instanceof ArrayBuffer);
    assert.match(calls[1], /job%2F1/);
    assert.equal(calls.length, 4);
});

test("propagates polling cancellation and terminal failure statuses", async () => {
    const controller = new AbortController();
    await assert.rejects(() => executeCustomBackend({
        ...baseConfig,
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://images.example.test/jobs/{{jobId}}",
        statusPath: "/status",
    }, {}, {
        signal: controller.signal,
        fetchImpl: async () => new Response(JSON.stringify({ id: "1" }), { headers: { "Content-Type": "application/json" } }),
        sleep: async (_ms, signal) => {
            controller.abort();
            if (signal.aborted) throw new DOMException("aborted", "AbortError");
        },
    }), error => error?.name === "AbortError");

    let call = 0;
    await assert.rejects(() => executeCustomBackend({
        ...baseConfig,
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://images.example.test/jobs/{{jobId}}",
        statusPath: "/status",
        failureValues: "failed",
    }, {}, {
        sleep: async () => {},
        fetchImpl: async () => new Response(JSON.stringify(++call === 1 ? { id: "1" } : { status: "failed" }), {
            headers: { "Content-Type": "application/json" },
        }),
    }), /job failed with status: failed/);
});

test("rejects unsafe schema features and reports API failures", async () => {
    assert.throws(() => normalizeCustomBackendConfig({ ...baseConfig, url: "javascript:alert(1)" }), /HTTP or HTTPS/);
    assert.throws(() => normalizeCustomBackendConfig({ ...baseConfig, mode: "async", jobIdPath: "/id", statusPath: "/status", pollUrl: "https://example.test/jobs" }), /\{\{jobId\}\}/);
    assert.throws(() => normalizeCustomBackendConfig({ ...baseConfig, requestTemplate: '{"api_key":"literal-secret"}' }), /reserved for authentication/);
    await assert.rejects(() => executeCustomBackend(baseConfig, {}, {
        fetchImpl: async () => new Response("denied", { status: 403 }),
    }), /Custom API error 403: denied/);
});

test("preserves unrelated text while normalizing polling URL placeholders", () => {
    const normalized = normalizeCustomBackendConfig({
        ...baseConfig,
        authType: "none",
        apiKey: "",
        mode: "async",
        jobIdPath: "/job/id",
        pollUrl: "https://jobs.example.test/job-board/{{jobId}}?kind=job",
        statusPath: "/job/status",
    });
    assert.equal(normalized.pollUrl, "https://jobs.example.test/job-board/{{jobId}}?kind=job");
});

test("requires authenticated polling to stay on the request origin", () => {
    assert.throws(() => normalizeCustomBackendConfig({
        ...baseConfig,
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://jobs.example.test/{{jobId}}",
        statusPath: "/status",
    }), /same origin/);
    assert.throws(() => normalizeCustomBackendConfig({ ...baseConfig, url: "http://images.example.test/generate" }), /must use HTTPS/);
});

test("keeps provider-controlled job IDs out of the polling origin", () => {
    assert.throws(() => normalizeCustomBackendConfig({
        ...baseConfig,
        authType: "none",
        apiKey: "",
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://{{jobId}}/status",
        statusPath: "/status",
    }), /outside the scheme and authority/);
});

test("recognizes falsey terminal polling statuses", async () => {
    let call = 0;
    const result = await executeCustomBackend({
        ...baseConfig,
        authType: "none",
        apiKey: "",
        mode: "async",
        jobIdPath: "/id",
        pollUrl: "https://images.example.test/jobs/{{jobId}}",
        statusPath: "/status",
        successValues: "0",
        responsePath: "/image",
    }, {}, {
        sleep: async () => {},
        fetchImpl: async () => {
            call += 1;
            if (call === 1) {
                return new Response(JSON.stringify({ id: "job" }), { headers: { "Content-Type": "application/json" } });
            }
            if (call === 2) {
                return new Response(JSON.stringify({ status: 0, image: "https://images.example.test/output.png" }), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
        },
    });
    assert.ok(result.buffer instanceof ArrayBuffer);
    assert.equal(call, 3);
});

test("rejects deeply nested templates with a controlled validation error", () => {
    let nested = '"{{prompt}}"';
    for (let i = 0; i < 30; i++) nested = `{"child":${nested}}`;
    assert.throws(() => normalizeCustomBackendConfig({ ...baseConfig, requestTemplate: nested }), /nested too deeply/);
});
