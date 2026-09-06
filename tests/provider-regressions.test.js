import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { MAX_IMAGE_BYTES } from "../lib/security.js";
import { MAX_BATCH_COUNT } from "../lib/generation.js";
import { embedPngMetadataBundle, readPngMetadataBundle } from "../lib/image-metadata.js";
import { createQigHarness } from "./helpers/qig-harness.js";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");
const PNG_DATA = `data:image/png;base64,${PNG_BASE64}`;
const COMFY_SETTINGS = { provider: "local", localType: "comfyui", localUrl: "http://127.0.0.1:8188" };
let harnessId = 0;

function jsonResponse(data) {
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

function pngResponse(bytes = PNG_BYTES) {
    return new Response(bytes, { headers: { "content-type": "image/png" } });
}

async function providerHarness(t, settings, fetchImpl, host = {}) {
    const commands = new Map();
    const owner = `provider-regressions-${++harnessId}`;
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: owner,
                    setupWizardSeen: true,
                    autoInsert: false,
                    saveToServer: false,
                    saveToServerEmbedMetadata: false,
                    useLastMessage: false,
                    useLLMPrompt: false,
                    confirmBeforeGenerate: false,
                    reviewBeforeGenerate: false,
                    prompt: "a red fox",
                    ...settings,
                },
            },
            addSlashCommand: command => commands.set(command.name, command),
            saveBase64AsFile: async () => "/user/images/qig/result.png",
            ...host,
        },
        localStorage: { qig_sync_cache_id: owner },
        fetch: (url, init) => {
            if (url === "/api/settings/get") {
                return jsonResponse({ settings: { extension_settings: globalThis.__QIG_TEST_HOST__.extension_settings } });
            }
            if (/^(?:blob:|data:)/.test(String(url))) return pngResponse();
            return fetchImpl(String(url), init);
        },
    });
    t.after(() => h.dispose());
    if (!globalThis.location) {
        globalThis.location = h.window.location;
        t.after(() => { delete globalThis.location; });
    }
    h.imageResponder(source => source === PNG_DATA || String(source).startsWith("blob:"), { width: 8, height: 8 });
    return {
        h,
        settings: h.host.extension_settings["quick-image-gen"],
        run: (args = {}) => commands.get("qig").callback({ mode: "direct", ...args }, "a red fox"),
        cancel: () => commands.get("qig-cancel").callback(),
    };
}

function comfyFetch(filenames, readImage) {
    return (url, init) => {
        if (init?.method === "HEAD") return new Response(null, { status: 405 });
        const parsed = new URL(url, "http://localhost:8000/");
        if (parsed.pathname.endsWith("/prompt")) {
            assert.equal(init.method, "POST");
            return jsonResponse({ prompt_id: "owned-prompt" });
        }
        if (parsed.pathname.endsWith("/history/owned-prompt")) {
            return jsonResponse({ "owned-prompt": {
                status: { completed: true, status_str: "success" },
                outputs: { "9": { images: filenames.map(filename => ({ filename })) } },
            } });
        }
        if (parsed.pathname.endsWith("/view")) return readImage(parsed.searchParams.get("filename"), url, init);
        throw new Error(`Unexpected ComfyUI request: ${url}`);
    };
}

test("an ambiguously accepted generation POST is never replayed through the CORS proxy", async t => {
    const requests = [];
    const { run } = await providerHarness(t, {
        provider: "local", localType: "a1111", localUrl: "http://127.0.0.1:7860",
    }, (url, init) => {
        requests.push({ url, method: init?.method });
        if (init?.method === "HEAD") return new Response(null, { status: 405 });
        throw new TypeError("Connection lost after accepting the job");
    });
    assert.match(await run(), /QIG failed:.*may already have been accepted/);
    assert.deepEqual(requests, [
        { url: "http://127.0.0.1:7860/sdapi/v1/txt2img", method: "HEAD" },
        { url: "http://127.0.0.1:7860/sdapi/v1/txt2img", method: "POST" },
    ]);
});

test("safe ComfyUI output retrieval can still select and reuse the CORS proxy", async t => {
    const requests = [];
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(["a.png", "b.png"], (filename, url) => {
        requests.push({ filename, proxied: url.startsWith("/proxy/") });
        if (!url.startsWith("/proxy/")) throw new TypeError("CORS blocked retrieval");
        return pngResponse();
    }));
    assert.match(await run(), /generation complete \(2 image\(s\)\)/);
    assert.deepEqual(requests, [
        { filename: "a.png", proxied: false },
        { filename: "a.png", proxied: true },
        { filename: "b.png", proxied: true },
    ]);
});

test("successful GET proxy discovery selects one POST on the same origin, never another origin", async t => {
    const requests = [];
    const firstOrigin = "http://127.0.0.1:7860";
    const secondOrigin = "http://127.0.0.2:7860";
    const { h, run, settings } = await providerHarness(t, {
        provider: "local", localType: "a1111", localUrl: firstOrigin, a1111Model: "checkpoint",
    }, (url, init = {}) => {
        const headers = new Headers(init.headers);
        requests.push({ url, method: init.method || "GET" });
        assert.equal(headers.get("Authorization"), null, "SillyTavern credentials never reach a provider");
        assert.equal(init.redirect, "error");
        if (!url.startsWith("/proxy/")) {
            assert.equal(headers.get("X-CSRF-Token"), null);
            if (url.startsWith(firstOrigin)) throw new TypeError("CORS blocked");
        }
        if (init.method === "HEAD") return new Response(null, { status: 405 });
        if (init.method === "POST") return jsonResponse({ images: [PNG_BASE64] });
        if (url.endsWith("/sd-models")) return jsonResponse([{ title: "checkpoint", model_name: "checkpoint" }]);
        if (url.includes("model_list")) return jsonResponse({ model_list: [] });
        return jsonResponse([]);
    }, { getRequestHeaders: () => ({ AUTHORIZATION: "Basic host-canary", "X-CSRF-Token": "csrf-canary" }) });
    await h.document.getElementById("qig-a1111-model-refresh").onclick();
    await h.waitFor(() => h.document.getElementById("qig-a1111-model").selectedOptions[0]?.textContent === "checkpoint", 1000, "model discovery completed");
    assert.match(await run(), /generation complete/);
    assert.deepEqual(requests.filter(request => request.method === "POST"), [
        { url: `/proxy/${firstOrigin}/sdapi/v1/txt2img`, method: "POST" },
    ]);
    assert.equal(requests.some(request => request.method === "HEAD"), false, "proven discovery avoids another probe");
    settings.localUrl = secondOrigin;
    assert.match(await run(), /generation complete/);
    assert.deepEqual(requests.filter(request => request.method === "POST").at(-1), {
        url: `${secondOrigin}/sdapi/v1/txt2img`, method: "POST",
    });
    assert.equal(requests.some(request => request.url.startsWith(`/proxy/${secondOrigin}`)), false);
});

test("an anonymous HEAD probe selects the proxy before a credentialed mutation and never replays it", async t => {
    const requests = [];
    const { run } = await providerHarness(t, CIVITAI_SETTINGS, (url, init = {}) => {
        if (url.endsWith("/healthz")) return new Response("Unavailable", { status: 404 });
        const headers = new Headers(init.headers);
        requests.push({ url, method: init.method });
        assert.equal(init.redirect, "error");
        if (init.method === "HEAD") {
            assert.equal(headers.has("Authorization"), false);
            assert.equal(url.includes("?"), false);
            if (!url.startsWith("/proxy/")) {
                assert.equal(init.credentials, "omit");
                assert.equal(headers.has("X-CSRF-Token"), false);
                throw new TypeError("CORS blocked");
            }
            return new Response(null, { status: 405 });
        }
        assert.equal(init.method, "POST");
        assert.equal(url.startsWith("/proxy/"), true);
        assert.equal(headers.get("Authorization"), "Bearer test-key");
        assert.equal(headers.get("X-CSRF-Token"), "csrf-canary");
        throw new TypeError("Connection lost after accepting the job");
    }, { getRequestHeaders: () => ({ AUTHORIZATION: "Basic host-canary", "X-CSRF-Token": "csrf-canary" }) });
    assert.match(await run(), /^QIG failed:/);
    assert.deepEqual(requests.map(request => request.method), ["HEAD", "HEAD", "POST"]);
    assert.equal(requests.filter(request => request.method === "POST").length, 1);
});

test("failed transport selection sends no mutation", async t => {
    const methods = [];
    const { run } = await providerHarness(t, {
        provider: "local", localType: "a1111", localUrl: "http://127.0.0.1:7860",
    }, (url, init = {}) => {
        methods.push(init.method);
        if (!url.startsWith("/proxy/")) throw new TypeError("CORS blocked");
        return new Response("CORS proxy is disabled", { status: 404 });
    });
    assert.match(await run(), /^QIG failed:/);
    assert.deepEqual(methods, ["HEAD", "HEAD"]);
});

test("a cached proxy authentication failure never selects an unproven direct mutation", async t => {
    const mutations = [];
    const { run } = await providerHarness(t, CIVITAI_SETTINGS, (url, init = {}) => {
        if (url.endsWith("/healthz")) return new Response("Unavailable", { status: 404 });
        if (init.method === "HEAD") {
            if (!url.startsWith("/proxy/")) throw new TypeError("CORS blocked");
            return new Response(null, { status: 405 });
        }
        mutations.push(url);
        return new Response("Host authentication required", { status: 401, headers: { "www-authenticate": "Basic realm=host" } });
    });
    assert.match(await run(), /basicAuthMode/);
    assert.match(await run(), /basicAuthMode/);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].startsWith("/proxy/"), true);
});

test("NovelAI's chat proxy receives the selected NovelAI model", async t => {
    const requests = [];
    const { run } = await providerHarness(t, {
        provider: "novelai", naiModel: "nai-diffusion-4-full", naiProxyUrl: "https://nai.example/v1", naiKey: "test-key",
    }, (url, init) => {
        requests.push({ url, payload: JSON.parse(init.body) });
        return jsonResponse({ data: [{ b64_json: PNG_BASE64 }] });
    });
    assert.match(await run(), /generation complete \(1 image\(s\)\)/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://nai.example/v1/chat/completions");
    assert.equal(requests[0].payload.model, "nai-diffusion-4-full");
    assert.ok(Array.isArray(requests[0].payload.messages));
});

test("automatic proxy routing reads the pathname rather than query strings or fragments", async t => {
    const requests = [];
    const { run } = await providerHarness(t, {
        provider: "proxy", proxyUrl: "https://proxy.example/v1/chat/completions/?tenant=one#route", proxyEndpointMode: "auto",
    }, (url, init) => {
        requests.push({ url, payload: JSON.parse(init.body) });
        return jsonResponse({ data: [{ b64_json: PNG_BASE64 }] });
    });
    assert.match(await run(), /generation complete \(1 image\(s\)\)/);
    assert.equal(requests[0].url, "https://proxy.example/v1/chat/completions/?tenant=one#route");
    assert.ok(Array.isArray(requests[0].payload.messages));
    assert.equal(requests[0].payload.prompt, undefined);
});

test("relative proxy endpoints resolve against the page for JSON inline and URL results", async t => {
    const requests = [];
    let inline = true;
    const { h, run, settings } = await providerHarness(t, {
        provider: "proxy", proxyUrl: "/gateway/v1/chat/completions?tenant=one#route", proxyEndpointMode: "auto",
    }, (url, init) => {
        requests.push(url);
        if (init?.method === "POST") {
            assert.ok(JSON.parse(init.body).messages);
            return jsonResponse({ data: [inline ? { b64_json: PNG_BASE64 } : { url: "/generated/result.png" }] });
        }
        assert.equal(url, "http://localhost:8000/generated/result.png");
        return pngResponse();
    });
    h.window.history.replaceState(null, "", "/app/chat");
    assert.match(await run(), /generation complete \(1 image\(s\)\)/);
    inline = false;
    settings.proxyUrl = "gateway/v1/chat/completions?tenant=two#route";
    assert.match(await run(), /generation complete \(1 image\(s\)\)/);
    assert.deepEqual(requests, [
        "http://localhost:8000/gateway/v1/chat/completions?tenant=one#route",
        "http://localhost:8000/app/gateway/v1/chat/completions?tenant=two#route",
        "http://localhost:8000/generated/result.png",
    ]);
});

test("ComfyUI download and validation failures reach the final outcome without losing good siblings", async t => {
    const unrenderablePng = embedPngMetadataBundle(PNG_BYTES, { parameters: "no browser responder for this image" });
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(["a.png", "missing.png", "undecodable.png", "d.png"], filename => {
        if (filename === "missing.png") return new Response("Not found", { status: 404 });
        if (filename === "undecodable.png") return pngResponse(unrenderablePng);
        return pngResponse();
    }));
    assert.equal(await run(), "QIG: generated 2 image(s); 2 generation(s) failed.");
});

test("simple Comfy proxy saves never claim unsupported model, size or diffusion controls", async t => {
    const saved = [];
    const requests = [];
    const { run, settings } = await providerHarness(t, {
        provider: "proxy", proxyUrl: "https://comfy.example", proxyComfyMode: true,
        proxyModel: "not-sent", proxyCfg: 0, saveToServerEmbedMetadata: true,
    }, (url, init) => {
        requests.push({ url, init });
        return pngResponse();
    }, {
        saveBase64AsFile: async base64 => {
            saved.push(base64);
            return "/user/images/qig/saved.png";
        },
    });
    assert.equal(await run({ quiet: true }), "/user/images/qig/saved.png");
    settings.proxyComfyWorkflow = '{"3":{"class_type":"KSampler","inputs":{"seed":42}}}';
    assert.equal(await run({ quiet: true }), "/user/images/qig/saved.png");
    assert.equal(requests[0].init.method, undefined);
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.body, settings.proxyComfyWorkflow);
    for (const base64 of saved) {
        const metadata = await readPngMetadataBundle(Buffer.from(base64, "base64"));
        assert.deepEqual(metadata.structured.data.effectiveRequest.parameters, {});
    }
});

test("quiet runs return only confirmed server saves and never deliver a result dialog or chat image", async t => {
    let saveResult = null;
    let saveCalls = 0;
    const { h, run } = await providerHarness(t, { provider: "arliai", arliKey: "test-key", autoInsert: true }, () => (
        jsonResponse({ data: [{ b64_json: PNG_BASE64 }] })
    ), {
        saveBase64AsFile: async () => {
            saveCalls++;
            if (saveResult instanceof Error) throw saveResult;
            return saveResult;
        },
    });
    const originalChat = structuredClone(h.host.getContext().chat);
    for (const result of [null, "", "https://images.example/original.png", PNG_DATA, new Error("disk full")]) {
        saveResult = result;
        assert.match(await run({ quiet: true }), /^QIG failed:/);
    }
    saveResult = "/user/images/John Doe/saved.png";
    assert.equal(await run({ quiet: true }), "/user/images/John%20Doe/saved.png");
    assert.equal(saveCalls, 6);
    assert.equal(h.document.getElementById("qig-popup"), null);
    assert.equal(h.document.getElementById("qig-batch-popup"), null);
    assert.deepEqual(h.host.getContext().chat, originalChat);
});

test("cancelling a NanoGPT generation stops its waiter but preserves shared discovery", async t => {
    let finishDiscovery;
    let discoverySignal;
    let discoveryCalls = 0;
    let generationCalls = 0;
    const { h, run, cancel } = await providerHarness(t, {
        provider: "nanogpt", nanogptModel: "shared-discovery-model", nanogptKey: "test-key",
    }, (url, init) => {
        if (url.endsWith("/endpoints")) {
            discoveryCalls++;
            discoverySignal = init.signal;
            return new Promise(resolve => { finishDiscovery = resolve; });
        }
        assert.equal(url, "https://nano-gpt.com/api/v1/images");
        generationCalls++;
        return jsonResponse({ data: [{ b64_json: PNG_BASE64 }] });
    });
    t.after(() => finishDiscovery?.(jsonResponse({ endpoints: [] })));
    h.fireEvent(h.document.getElementById("qig-nanogpt-model"), "change");
    await h.waitFor(() => finishDiscovery, 1000, "background discovery");
    let cancelledResult;
    void run({ quiet: true }).then(result => { cancelledResult = result; });
    await nextTurn();
    await cancel();
    await h.waitFor(() => cancelledResult, 1000, "cancelled discovery waiter");
    assert.equal(cancelledResult, "QIG: generation cancelled.");
    assert.equal(discoverySignal.aborted, false);
    assert.equal(generationCalls, 0);
    finishDiscovery(jsonResponse({ endpoints: [{ supported_parameters: { sampler: {}, scheduler: {} } }] }));
    await nextTurn();
    assert.equal(await run({ quiet: true }), "/user/images/qig/result.png");
    assert.equal(discoveryCalls, 1);
    assert.equal(generationCalls, 1);
});

test("NanoGPT discovery has an independent deadline and does not cache late results", async t => {
    let finishDiscovery;
    let discoverySignal;
    let discoveryCalls = 0;
    const bodies = [];
    const { h, run, settings } = await providerHarness(t, {
        provider: "pollinations", nanogptModel: "deadline-discovery-model", nanogptKey: "test-key", steps: 30,
    }, (url, init) => {
        if (url.endsWith("/endpoints")) {
            discoveryCalls++;
            if (discoveryCalls === 1) {
                discoverySignal = init.signal;
                return new Promise(resolve => { finishDiscovery = resolve; });
            }
            return jsonResponse({ endpoints: [{ supported_parameters: { steps: {}, sampler: {}, scheduler: {} } }] });
        }
        assert.equal(url, "https://nano-gpt.com/api/v1/images");
        bodies.push(JSON.parse(init.body));
        return jsonResponse({ data: [{ b64_json: PNG_BASE64 }] });
    });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const provider = h.document.getElementById("qig-provider");
    provider.value = "nanogpt";
    h.fireEvent(provider, "change");
    await nextTurn();
    assert.equal(discoveryCalls, 1);
    t.mock.timers.tick(10_000);
    await nextTurn();
    assert.equal(discoverySignal.aborted, true);
    h.fireEvent(h.document.getElementById("qig-nanogpt-model"), "change");
    await nextTurn();
    assert.equal(discoveryCalls, 2, "expired discovery was removed from the shared in-flight map");
    finishDiscovery(jsonResponse({ endpoints: [{ supported_parameters: { seed: {} } }] }));
    await nextTurn();
    assert.equal(settings.provider, "nanogpt");
    assert.equal(await run({ quiet: true }), "/user/images/qig/result.png");
    assert.equal(bodies[0].steps, 30);
    assert.equal(bodies[0].seed, undefined, "late discovery did not overwrite current metadata");
    assert.equal(bodies[0].sampler, undefined);
    assert.equal(bodies[0].scheduler, undefined);
});

test("ComfyUI reports output count limits and does not download the omitted outputs", async t => {
    const downloaded = [];
    const filenames = Array.from({ length: MAX_BATCH_COUNT + 2 }, (_, index) => `${index}.png`);
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(filenames, filename => {
        downloaded.push(filename);
        return pngResponse();
    }));
    assert.equal(await run(), `QIG: generated ${MAX_BATCH_COUNT} image(s); 2 generation(s) failed.`);
    assert.deepEqual(downloaded, filenames.slice(0, MAX_BATCH_COUNT));
});

test("ComfyUI enforces a cumulative download budget before reading the next declared image", async t => {
    const downloaded = [];
    let cancelled = false;
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(["small.png", "large.png", "later.png"], filename => {
        downloaded.push(filename);
        if (filename === "small.png") return pngResponse();
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
            headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES) },
        });
    }));
    assert.equal(await run(), "QIG: generated 1 image(s); 2 generation(s) failed.");
    assert.deepEqual(downloaded, ["small.png", "large.png"]);
    assert.equal(cancelled, true);
});

test("ComfyUI stops streamed output downloads as soon as their combined bytes exceed the budget", async t => {
    const downloaded = [];
    let cancelled = false;
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(["small.png", "stream.png", "later.png"], filename => {
        downloaded.push(filename);
        if (filename === "small.png") return pngResponse();
        return new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES)); },
            cancel() { cancelled = true; },
        }), { headers: { "content-type": "image/png" } });
    }));
    assert.equal(await run(), "QIG: generated 1 image(s); 2 generation(s) failed.");
    assert.deepEqual(downloaded, ["small.png", "stream.png"]);
    assert.equal(cancelled, true);
});

test("ComfyUI counts bytes received from interrupted downloads against the same budget", async t => {
    const downloaded = [];
    let cancelled = false;
    const { run } = await providerHarness(t, COMFY_SETTINGS, comfyFetch(["small.png", "interrupted.png", "large.png", "later.png"], filename => {
        downloaded.push(filename);
        if (filename === "small.png") return pngResponse();
        if (filename === "interrupted.png") {
            let sent = false;
            return new Response(new ReadableStream({
                pull(controller) {
                    if (sent) controller.error(new Error("Connection interrupted"));
                    else {
                        sent = true;
                        controller.enqueue(new Uint8Array(64));
                    }
                },
            }));
        }
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
            headers: { "content-length": String(MAX_IMAGE_BYTES - PNG_BYTES.length) },
        });
    }));
    assert.equal(await run(), "QIG: generated 1 image(s); 3 generation(s) failed.");
    assert.deepEqual(downloaded, ["small.png", "interrupted.png", "large.png"]);
    assert.equal(cancelled, true);
});

test("the ComfyUI count budget spans workflows, blocks later submissions and resets for regeneration", async t => {
    let submissions = 0;
    const downloaded = [];
    const fetchOutput = comfyFetch(Array.from({ length: 6 }, (_, index) => `${index}.png`), filename => {
        downloaded.push(`${submissions}:${filename}`);
        return pngResponse();
    });
    const { h, run, settings } = await providerHarness(t, { ...COMFY_SETTINGS, batchCount: 3 }, (url, init) => {
        if (url.endsWith("/prompt") && init?.method === "POST") submissions++;
        return fetchOutput(url, init);
    });
    assert.equal(await run(), "QIG: generated 10 image(s); 3 generation(s) failed.");
    assert.equal(submissions, 2, "third workflow was never submitted");
    assert.equal(downloaded.length, 10);
    assert.equal(downloaded.at(-1), "2:3.png");
    const toastCount = h.toastrCalls.length;
    h.document.getElementById("qig-batch-regenerate").click();
    await h.waitFor(() => h.toastrCalls.slice(toastCount).some(call => /3 images failed; 10 successful/.test(call.message)), 3000, "bounded regeneration");
    assert.equal(submissions, 4, "regeneration has its own allowance, shared across its workflows");
    assert.equal(downloaded.length, 20);
    assert.equal(settings.batchCount, 3);
    assert.equal(Object.hasOwn(settings, "outputBudget"), false);
});

test("the ComfyUI byte budget survives between workflows and blocks the next submission", async t => {
    let submissions = 0;
    let downloads = 0;
    const fetchOutput = comfyFetch(["a.png", "b.png"], () => {
        downloads++;
        return submissions === 2
            ? new Response(PNG_BYTES, { headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES) } })
            : pngResponse();
    });
    const { run } = await providerHarness(t, { ...COMFY_SETTINGS, batchCount: 3 }, (url, init) => {
        if (url.endsWith("/prompt") && init?.method === "POST") submissions++;
        return fetchOutput(url, init);
    });
    assert.equal(await run(), "QIG: generated 2 image(s); 3 generation(s) failed.");
    assert.equal(submissions, 2);
    assert.equal(downloads, 3);
});

test("direct binary provider responses share the run byte budget before conversion", async t => {
    let requests = 0;
    const { run } = await providerHarness(t, {
        provider: "proxy", proxyComfyMode: true, proxyUrl: "https://comfy.example", batchCount: 3,
    }, () => {
        requests++;
        return requests === 2
            ? new Response(PNG_BYTES, { headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES) } })
            : pngResponse();
    });
    assert.equal(await run(), "QIG: generated 1 image(s); 2 generation(s) failed.");
    assert.equal(requests, 2, "no third generation request after the byte limit");
});

test("inline outputs are checked against the remaining run bytes before base64 decoding", async t => {
    let requests = 0;
    const { run } = await providerHarness(t, { provider: "arliai", arliKey: "test-key", batchCount: 3 }, () => {
        requests++;
        return jsonResponse({ data: [{ b64_json: requests === 2 ? "AAAA".repeat(Math.floor(MAX_IMAGE_BYTES / 3)) : PNG_BASE64 }] });
    });
    const decode = globalThis.atob;
    t.mock.method(globalThis, "atob", encoded => {
        assert.ok(encoded.length < 1000, "over-budget inline data must not be decoded");
        return decode(encoded);
    });
    assert.equal(await run(), "QIG: generated 1 image(s); 2 generation(s) failed.");
    assert.equal(requests, 2, "no new job after an inline result exceeds the run allowance");
});

function civitaiFetchForTest(outputCount, readImage) {
    let submissions = 0;
    return {
        get submissions() { return submissions; },
        fetch(url, init) {
            if (init?.method === "HEAD") return new Response(null, { status: 405 });
            if (url.endsWith("/healthz")) return new Response("Unavailable", { status: 404 });
            if (url.startsWith("https://image.civitai.com/")) return readImage(url);
            if (init?.method === "POST") return jsonResponse({ id: `workflow-${++submissions}` });
            return jsonResponse({ status: "succeeded", steps: [{ output: {
                images: Array.from({ length: outputCount }, (_, index) => ({ url: `https://image.civitai.com/${submissions}/${index}.png` })),
            } }] });
        },
    };
}

const CIVITAI_SETTINGS = {
    provider: "civitai", civitaiKey: "test-key", civitaiModel: "urn:air:sdxl:checkpoint:civitai:123@456", civitaiScheduler: "DPM++ 2M Karras",
};

test("non-Comfy multi-output batches reserve a run-wide count before downloading", async t => {
    const downloaded = [];
    const provider = civitaiFetchForTest(6, url => {
        downloaded.push(url);
        return pngResponse();
    });
    const { run } = await providerHarness(t, { ...CIVITAI_SETTINGS, batchCount: 3 }, provider.fetch);
    assert.equal(await run(), "QIG: generated 10 image(s); 3 generation(s) failed.");
    assert.equal(provider.submissions, 2);
    assert.equal(downloaded.length, 10);
    assert.equal(downloaded.at(-1), "https://image.civitai.com/2/3.png");
});

test("non-Comfy output byte overflow preserves siblings and prevents later downloads and jobs", async t => {
    const downloaded = [];
    const provider = civitaiFetchForTest(3, url => {
        downloaded.push(url);
        return url.endsWith("/1.png")
            ? new Response(PNG_BYTES, { headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES) } })
            : pngResponse();
    });
    const { run } = await providerHarness(t, { ...CIVITAI_SETTINGS, batchCount: 2 }, provider.fetch);
    assert.equal(await run(), "QIG: generated 1 image(s); 3 generation(s) failed.");
    assert.equal(provider.submissions, 1);
    assert.deepEqual(downloaded, ["https://image.civitai.com/1/0.png", "https://image.civitai.com/1/1.png"]);
});

for (const phase of ["download", "download and finalisation"]) {
    test(`all three ordinary ${phase} failures remain counted when the next workflow succeeds`, async t => {
        let submissions = 0;
        const fetchOutput = comfyFetch(["0.png", "1.png", "2.png"], filename => {
            if (submissions === 1 && (phase === "download" || filename === "0.png")) return new Response("Missing", { status: 404 });
            return pngResponse();
        });
        const { run } = await providerHarness(t, { ...COMFY_SETTINGS, batchCount: 2, saveToServer: true }, (url, init) => {
            if (url.endsWith("/prompt") && init?.method === "POST") submissions++;
            return fetchOutput(url, init);
        }, {
            saveBase64AsFile: async () => submissions === 1 ? "invalid-save-path" : "/user/images/qig/saved.png",
        });
        assert.equal(await run(), "QIG: generated 3 image(s); 3 generation(s) failed.");
    });
}

test("Comfy choice overrides keep run limits and failures without recording displaced panel controls", async t => {
    const workflow = { "3": { class_type: "Selector", inputs: {
        model: "%model%", sampler: "%sampler%", scheduler: "%scheduler%", steps: "%steps%", prompt: "%prompt%",
    } } };
    const overrides = { version: 1, entries: [
        ["model", "chosen.safetensors"], ["sampler", "heun"], ["scheduler", "karras"],
    ].map(([inputName, value]) => ({ nodeId: "3", classType: "Selector", inputName, rawValue: `%${inputName}%`, value, verified: true })) };
    const requests = [];
    const saved = [];
    const downloads = [];
    const fetchOutput = comfyFetch(Array.from({ length: 6 }, (_, index) => `${index}.png`), filename => {
        downloads.push(filename);
        return filename === "1.png" ? new Response("Missing", { status: 404 }) : pngResponse();
    });
    const { run, settings } = await providerHarness(t, {
        ...COMFY_SETTINGS, batchCount: 3, localModel: "panel.safetensors", comfyScheduler: "normal",
        comfyWorkflow: JSON.stringify(workflow), comfyWorkflowComponentOverrides: overrides,
        saveToServer: true, saveToServerEmbedMetadata: true,
    }, (url, init) => {
        if (init?.method === "POST" && url.endsWith("/prompt")) requests.push(JSON.parse(init.body));
        return fetchOutput(url, init);
    }, { saveBase64AsFile: async base64 => { saved.push(base64); return "/user/images/qig/override.png"; } });
    assert.equal(await run(), "QIG: generated 8 image(s); 5 generation(s) failed.");
    assert.equal(requests.length, 2);
    assert.equal(downloads.length, 10);
    assert.equal(requests[0].prompt["3"].inputs.model, "chosen.safetensors");
    assert.equal(requests[0].prompt["3"].inputs.sampler, "heun");
    assert.equal(requests[0].prompt["3"].inputs.scheduler, "karras");
    const metadata = await readPngMetadataBundle(Buffer.from(saved[0], "base64"));
    const parameters = metadata.structured.data.effectiveRequest.parameters;
    assert.equal(parameters.model, undefined);
    assert.equal(parameters.sampler, undefined);
    assert.equal(parameters.schedule, undefined);
    assert.equal(parameters.steps, 25);
    assert.doesNotMatch(metadata.parameters, /Model:|Sampler:|Scheduler:/);
    settings.comfyWorkflowComponentOverrides = { version: 1, entries: [] };
    settings.batchCount = 1;
    saved.length = 0;
    assert.equal(await run(), "QIG: generated 5 image(s); 1 generation(s) failed.");
    const unoverridden = await readPngMetadataBundle(Buffer.from(saved[0], "base64"));
    assert.equal(unoverridden.structured.data.effectiveRequest.parameters.model, "panel.safetensors");
    assert.equal(unoverridden.structured.data.effectiveRequest.parameters.schedule, "normal");
});

test("A1111 effective metadata never falls back to an inactive Comfy model", async t => {
    let saved;
    const { run } = await providerHarness(t, {
        provider: "local", localType: "a1111", localUrl: "http://127.0.0.1:7860",
        a1111Model: "", localModel: "inactive-comfy.safetensors", saveToServerEmbedMetadata: true,
    }, (_url, init) => {
        if (init?.method === "HEAD") return new Response(null, { status: 405 });
        assert.equal(JSON.parse(init.body).override_settings?.sd_model_checkpoint, undefined);
        return jsonResponse({ images: [PNG_BASE64] });
    }, { saveBase64AsFile: async base64 => { saved = base64; return "/user/images/qig/a1111.png"; } });
    assert.equal(await run({ quiet: true }), "/user/images/qig/a1111.png");
    const metadata = await readPngMetadataBundle(Buffer.from(saved, "base64"));
    assert.equal(metadata.structured.data.effectiveRequest.parameters.model, null);
    assert.doesNotMatch(JSON.stringify(metadata), /inactive-comfy/);
});
