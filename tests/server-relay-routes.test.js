import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function loadWithExpressStub(request, parent, isMain) {
    if (request === "express") {
        return {
            json: () => function parseRawTestBody(req, _res, next) {
                req.body = req.rawBody;
                next();
            },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};
let plugin;
let preParser;
try {
    preParser = require("../server-plugin/pre-parser.js");
    plugin = require("../server-plugin/index.js");
} finally {
    Module._load = originalLoad;
}

class FakeRouter {
    constructor() {
        this.middleware = [];
        this.routes = new Map();
    }

    use(handler) {
        this.middleware.push(handler);
    }

    get(path, ...handlers) {
        this.routes.set(`GET ${path}`, handlers);
    }

    post(path, ...handlers) {
        this.routes.set(`POST ${path}`, handlers);
    }
}

class MockRequest extends EventEmitter {
    constructor(body, contentType = "application/json", user = "route-test-user") {
        super();
        this.method = "POST";
        this.body = undefined;
        this.rawBody = body;
        this.headers = { "content-type": contentType };
        this.user = user == null ? undefined : { profile: { handle: user } };
        this.ip = "127.0.0.1";
        this.aborted = false;
        this.destroyed = false;
    }

    get(name) {
        return this.headers[name.toLowerCase()];
    }
}

class MockResponse extends EventEmitter {
    constructor() {
        super();
        this.statusCode = 200;
        this.body = "";
        this.destroyed = false;
        this.writableEnded = false;
        this.headers = {};
    }

    status(value) {
        this.statusCode = value;
        return this;
    }

    type(value) {
        this.headers["content-type"] = value;
        return this;
    }

    set(name, value) {
        this.headers[name.toLowerCase()] = value;
        return this;
    }

    send(value) {
        this.body = value;
        this.writableEnded = true;
        this.emit("finish");
        return this;
    }

    sendStatus(value) {
        this.statusCode = value;
        return this.send("");
    }

    end() {
        this.body = "";
        this.writableEnded = true;
        this.emit("finish");
        return this;
    }
}

const hostPreParser = preParser.createRelayPreParser();

async function invoke(router, path, body, contentType = "application/json", {
    authenticatedUser = "route-test-user",
    includePreParser = true,
} = {}) {
    const req = new MockRequest(body, contentType, authenticatedUser);
    req.path = path;
    const res = new MockResponse();
    const route = router.routes.get(`POST ${path}`) || [];
    const stack = [
        ...(includePreParser ? hostPreParser : []),
        ...router.middleware,
        ...route,
    ];

    async function dispatch(index, activeError = null) {
        if (index >= stack.length || res.writableEnded) return;
        const handler = stack[index];
        if ((activeError && handler.length !== 4) || (!activeError && handler.length === 4)) {
            return dispatch(index + 1, activeError);
        }
        let nextPromise = null;
        const next = (error) => {
            nextPromise = dispatch(index + 1, error || null);
            return nextPromise;
        };
        const result = activeError ? handler(activeError, req, res, next) : handler(req, res, next);
        await result;
        if (nextPromise) await nextPromise;
    }

    await dispatch(0);
    return { req, res };
}

test("relay routes enforce guards and forward only bounded fixed-provider requests", async () => {
    const router = new FakeRouter();
    const originalLog = console.log;
    console.log = () => {};
    try {
        await plugin.init(router);
    } finally {
        console.log = originalLog;
    }

    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/output.png")) {
            return new Response(Buffer.from([137, 80, 78, 71]), {
                status: 200,
                headers: { "Content-Type": "image/png" },
            });
        }
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return new Response('{"ok":true}', {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    };
    try {
        let result = await invoke(router, "/replicate", {
            action: "createPrediction",
            apiKey: "secret",
            authScheme: "Bearer",
            body: { version: "model-version", input: { prompt: "scene" } },
        });
        assert.equal(result.res.statusCode, 201);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://api.replicate.com/v1/predictions");
        assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
        assert.deepEqual(JSON.parse(calls[0].init.body), {
            version: "model-version",
            input: { prompt: "scene" },
        });

        result = await invoke(router, "/replicate", {
            action: "createPrediction",
            apiKey: "secret",
            authScheme: "Bearer",
            body: {},
        }, "text/plain");
        assert.equal(result.res.statusCode, 415);
        assert.equal(calls.length, 1);

        result = await invoke(router, "/replicate", {
            action: "getPrediction",
            apiKey: "x".repeat(8 * 1024 + 1),
            authScheme: "Bearer",
            id: "prediction",
        });
        assert.equal(result.res.statusCode, 400);
        assert.match(result.res.body, /apiKey is too long/);
        assert.equal(calls.length, 1);

        result = await invoke(router, "/civitai", {
            action: "createWorkflow",
            apiKey: "secret",
            body: [],
        });
        assert.equal(result.res.statusCode, 400);
        assert.match(result.res.body, /body must be a JSON object/);
        assert.equal(calls.length, 1);

        result = await invoke(router, "/civitai", {
            action: "createWorkflow",
            apiKey: "secret",
            body: { steps: [{ $type: "imageGen", input: { prompt: "scene" } }] },
        });
        assert.equal(result.res.statusCode, 201);
        assert.equal(calls[1].url, "https://orchestration.civitai.com/v2/consumer/workflows?wait=0");
        assert.equal(calls[1].init.headers.Authorization, "Bearer secret");

        result = await invoke(router, "/civitai", {
            action: "cancelWorkflow",
            apiKey: "secret",
            id: "wf_01HXYZ123",
        });
        assert.equal(result.res.statusCode, 204);
        assert.equal(result.res.body, "");
        assert.equal(calls[2].url, "https://orchestration.civitai.com/v2/consumer/workflows/wf_01HXYZ123");
        assert.equal(calls[2].init.method, "DELETE");
        assert.equal(calls[2].init.headers.Authorization, "Bearer secret");

        result = await invoke(router, "/replicate", {
            action: "cancelPrediction",
            apiKey: "secret",
            authScheme: "Bearer",
            id: "prediction_123",
        });
        assert.equal(result.res.statusCode, 201);
        assert.equal(calls[3].url, "https://api.replicate.com/v1/predictions/prediction_123/cancel");
        assert.equal(calls[3].init.method, "POST");

        result = await invoke(router, "/replicate", {
            action: "getOutput",
            apiKey: "secret",
            authScheme: "Bearer",
            url: "https://evil.test/output.png",
        });
        assert.equal(result.res.statusCode, 400);
        assert.match(result.res.body, /Untrusted replicate output URL/);
        assert.equal(calls.length, 4);

        result = await invoke(router, "/replicate", {
            action: "getOutput",
            apiKey: "secret",
            authScheme: "Bearer",
            url: "https://pbxt.replicate.delivery/output.png",
        });
        assert.equal(result.res.statusCode, 200);
        assert.deepEqual(result.res.body, Buffer.from([137, 80, 78, 71]));
        assert.equal(calls[4].init.headers.Authorization, undefined);

        result = await invoke(router, "/civitai", {
            action: "getOutput",
            apiKey: "secret",
            url: "https://image.civitai.red/output.png",
        });
        assert.equal(result.res.statusCode, 200);
        assert.deepEqual(result.res.body, Buffer.from([137, 80, 78, 71]));
        assert.equal(calls[5].url, "https://image.civitai.red/output.png");
        assert.equal(calls[5].init.headers.Authorization, undefined);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("relay validates auth schemes and limits output authorization to explicit API origins", async () => {
    const router = new FakeRouter();
    const originalLog = console.log;
    console.log = () => {};
    try {
        await plugin.init(router);
    } finally {
        console.log = originalLog;
    }

    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/v2/consumer/blobs/")) {
            return new Response(null, {
                status: 308,
                headers: { Location: "https://image.civitai.red/blob-output.png" },
            });
        }
        return new Response(Buffer.from([137, 80, 78, 71]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
        });
    };
    try {
        let result = await invoke(router, "/replicate", {
            action: "getOutput",
            apiKey: "replicate-secret",
            authScheme: "Bearer",
            sendOutputAuthorization: true,
            url: "https://pbxt.replicate.delivery/output.png",
        });
        assert.equal(result.res.statusCode, 200);
        assert.equal(calls[0].init.headers.Authorization, undefined);

        result = await invoke(router, "/civitai", {
            action: "getOutput",
            apiKey: "civitai-secret",
            sendOutputAuthorization: false,
            url: "https://image.civitai.com/output.png",
        });
        assert.equal(result.res.statusCode, 200);
        assert.equal(calls[1].init.headers.Authorization, undefined);

        result = await invoke(router, "/civitai", {
            action: "getOutput",
            apiKey: "civitai-secret",
            sendOutputAuthorization: true,
            url: "https://orchestration.civitai.com/v2/consumer/blobs/blob_123",
        });
        assert.equal(result.res.statusCode, 200);
        assert.equal(calls[2].init.headers.Authorization, "Bearer civitai-secret");
        assert.equal(calls[2].init.redirect, "manual");
        assert.equal(calls[3].url, "https://image.civitai.red/blob-output.png");
        assert.equal(calls[3].init.headers.Authorization, undefined);

        result = await invoke(router, "/replicate", {
            action: "getOutput",
            apiKey: "replicate-secret",
            authScheme: "Bearer",
            sendOutputAuthorization: true,
            url: "https://api.replicate.com/v1/files/output.png",
        });
        assert.equal(result.res.statusCode, 200);
        assert.equal(calls[4].init.headers.Authorization, "Bearer replicate-secret");

        result = await invoke(router, "/replicate", {
            action: "getPrediction",
            apiKey: "secret",
            authScheme: "Basic injected",
            id: "prediction_123",
        });
        assert.equal(result.res.statusCode, 400);
        assert.match(result.res.body, /Unsupported authorization scheme/);
        assert.equal(calls.length, 5);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("relay fails closed without the early pre-parser and without authenticated host user data", async () => {
    const router = new FakeRouter();
    const originalLog = console.log;
    console.log = () => {};
    try {
        await plugin.init(router);
    } finally {
        console.log = originalLog;
    }

    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response('{}');
    };
    try {
        let result = await invoke(router, "/replicate", {
            action: "getPrediction",
            apiKey: "secret",
            authScheme: "Bearer",
            id: "prediction_123",
        }, "application/json", { includePreParser: false });
        assert.equal(result.res.statusCode, 503);
        assert.match(result.res.body, /pre-parser/);

        result = await invoke(router, "/replicate", {
            action: "getPrediction",
            apiKey: "secret",
            authScheme: "Bearer",
            id: "prediction_123",
        }, "application/json", { authenticatedUser: null });
        assert.equal(result.res.statusCode, 403);
        assert.match(result.res.body, /Authentication is required/);
        assert.equal(fetchCalled, false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("relay pre-parser rejects oversized requests before a host parser can run", async () => {
    const req = new MockRequest(undefined);
    req.path = "/civitai";
    req.headers["content-length"] = String(1024 * 1024 + 1);
    const res = new MockResponse();
    let hostParserRan = false;
    const stack = [...hostPreParser, (_req, _res, next) => {
        hostParserRan = true;
        next();
    }];

    async function dispatch(index, activeError = null) {
        if (index >= stack.length || res.writableEnded) return;
        const handler = stack[index];
        if ((activeError && handler.length !== 4) || (!activeError && handler.length === 4)) {
            return dispatch(index + 1, activeError);
        }
        const next = error => dispatch(index + 1, error || null);
        await (activeError ? handler(activeError, req, res, next) : handler(req, res, next));
    }

    await dispatch(0);
    assert.equal(res.statusCode, 413);
    assert.equal(hostParserRan, false);
});

test("relay pre-parser rejects a late mount after a host parser populated the body", async () => {
    const req = new MockRequest(undefined);
    req.path = "/replicate";
    req.body = { action: "getPrediction" };
    const res = new MockResponse();
    let continued = false;
    const [, rejectLateMount] = hostPreParser;

    rejectLateMount(req, res, () => { continued = true; });
    assert.equal(res.statusCode, 503);
    assert.match(res.body, /before the host body parser/);
    assert.equal(continued, false);
});

test("relay pre-parser installer mounts the exact host prefix only once", () => {
    const mounted = [];
    const app = {
        use(...args) { mounted.push(args); },
    };

    preParser.installRelayPreParser(app);
    assert.equal(mounted.length, 1);
    assert.equal(mounted[0][0], "/api/plugins/quick-image-gen-relay");
    assert.ok(mounted[0].length > 2);
    assert.equal(preParser.isPreParserConfigured(), true);
    assert.throws(() => preParser.installRelayPreParser(app), /already installed/);
});

test("relay upload concurrency is acquired by address before content checks and parsing", async () => {
    const router = new FakeRouter();
    const originalLog = console.log;
    console.log = () => {};
    try {
        await plugin.init(router);
    } finally {
        console.log = originalLog;
    }
    const [acquireSlot] = hostPreParser;
    const slowRequests = Array.from({ length: 4 }, () => ({ req: new MockRequest(undefined), res: new MockResponse() }));
    for (const { req, res } of slowRequests) {
        req.path = "/replicate";
        let enteredUpload = false;
        acquireSlot(req, res, () => { enteredUpload = true; });
        assert.equal(enteredUpload, true);
    }

    const competingReq = new MockRequest(undefined);
    competingReq.path = "/replicate";
    const competingRes = new MockResponse();
    acquireSlot(competingReq, competingRes, () => assert.fail("same-address upload must be limited"));
    assert.equal(competingRes.statusCode, 429);
    slowRequests.forEach(({ req }) => req.emit("aborted"));
});
