import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
    MAX_RELAY_REQUEST_BYTES,
    boundedJsonByteLength,
    createRelayConcurrencyLimiter,
    getAddressKey,
    getAuthenticatedUserKey,
    handleJsonParserError,
    requireBoundedString,
    requireJsonObject,
    validateRelayRequestBody,
    validateRelayRequestHeaders,
} = require("../server-plugin/relay-guards.js");

class MockRequest extends EventEmitter {
    constructor({ headers = {}, body, user = "alice", ip = "127.0.0.1", aborted = false, destroyed = false } = {}) {
        super();
        this.method = "POST";
        this.headers = headers;
        this.body = body;
        this.user = { profile: { handle: user } };
        this.ip = ip;
        this.aborted = aborted;
        this.destroyed = destroyed;
    }

    get(name) {
        return this.headers[name.toLowerCase()];
    }
}

class MockResponse extends EventEmitter {
    constructor() {
        super();
        this.destroyed = false;
        this.writableEnded = false;
        this.statusCode = 200;
        this.contentType = "";
        this.body = "";
    }

    status(value) {
        this.statusCode = value;
        return this;
    }

    type(value) {
        this.contentType = value;
        return this;
    }

    send(value) {
        this.body = value;
        this.writableEnded = true;
        this.emit("finish");
        return this;
    }
}

function runGuard(guard, req) {
    const res = new MockResponse();
    let nextValue = Symbol("not-called");
    guard(req, res, value => { nextValue = value; });
    return { res, nextValue };
}

test("relay request guards require JSON and enforce declared and parsed limits", () => {
    let outcome = runGuard(validateRelayRequestHeaders, new MockRequest({
        headers: { "content-type": "text/plain" },
        body: {},
    }));
    assert.equal(outcome.res.statusCode, 415);

    outcome = runGuard(validateRelayRequestHeaders, new MockRequest({
        headers: {
            "content-type": "application/json",
            "content-length": String(MAX_RELAY_REQUEST_BYTES + 1),
        },
        body: {},
    }));
    assert.equal(outcome.res.statusCode, 413);

    outcome = runGuard(validateRelayRequestHeaders, new MockRequest({
        headers: { "content-type": "application/problem+json; charset=utf-8" },
        body: {},
    }));
    assert.equal(outcome.nextValue, undefined);

    outcome = runGuard(validateRelayRequestBody, new MockRequest({ body: [] }));
    assert.equal(outcome.res.statusCode, 400);

    outcome = runGuard(validateRelayRequestBody, new MockRequest({
        body: { value: "x".repeat(MAX_RELAY_REQUEST_BYTES + 1) },
    }));
    assert.equal(outcome.res.statusCode, 413);
    assert.ok(boundedJsonByteLength({ ok: true }) < MAX_RELAY_REQUEST_BYTES);
});

test("relay field validators cap strings and require object payloads", () => {
    assert.equal(requireBoundedString(" value ", "field", 5), "value");
    assert.throws(() => requireBoundedString("ééé", "field", 5), /too long/);
    assert.throws(() => requireBoundedString("", "field", 5), /required/);
    assert.deepEqual(requireJsonObject({ ok: true }, "body"), { ok: true });
    assert.throws(() => requireJsonObject([], "body"), /JSON object/);
});

test("relay JSON parser errors return bounded JSON failures", () => {
    let outcome = runGuard((req, res, next) => handleJsonParserError(
        Object.assign(new Error("large"), { status: 413, type: "entity.too.large" }),
        req,
        res,
        next,
    ), new MockRequest());
    assert.equal(outcome.res.statusCode, 413);

    outcome = runGuard((req, res, next) => handleJsonParserError(
        new SyntaxError("bad JSON"),
        req,
        res,
        next,
    ), new MockRequest());
    assert.equal(outcome.res.statusCode, 400);
    assert.doesNotMatch(outcome.res.body, /bad JSON/);
});

test("relay concurrency limits per user and globally and releases on disconnect", () => {
    const limiter = createRelayConcurrencyLimiter({ globalLimit: 2, perUserLimit: 1 });
    const firstReq = new MockRequest({ user: "alice" });
    const firstRes = new MockResponse();
    let firstStarted = false;
    limiter.middleware(firstReq, firstRes, () => { firstStarted = true; });
    assert.equal(firstStarted, true);

    const sameUser = runGuard(limiter.middleware, new MockRequest({ user: "alice" }));
    assert.equal(sameUser.res.statusCode, 429);

    const secondReq = new MockRequest({ user: "bob" });
    const secondRes = new MockResponse();
    limiter.middleware(secondReq, secondRes, () => {});
    const globallyLimited = runGuard(limiter.middleware, new MockRequest({ user: "carol" }));
    assert.equal(globallyLimited.res.statusCode, 503);
    assert.equal(limiter.getActiveCounts().global, 2);

    firstReq.emit("aborted");
    assert.equal(limiter.getActiveCounts().global, 1);
    const replacementReq = new MockRequest({ user: "carol" });
    const replacementRes = new MockResponse();
    let replacementStarted = false;
    limiter.middleware(replacementReq, replacementRes, () => { replacementStarted = true; });
    assert.equal(replacementStarted, true);

    secondRes.emit("finish");
    replacementRes.emit("close");
    assert.equal(limiter.getActiveCounts().global, 0);
    assert.equal(limiter.getActiveCounts().byClient.size, 0);
});

test("relay upload and account concurrency use separate identities", () => {
    const alice = new MockRequest({ user: "alice", ip: "192.0.2.10" });
    const bob = new MockRequest({ user: "bob", ip: "192.0.2.10" });
    assert.equal(getAddressKey(alice), getAddressKey(bob));
    assert.notEqual(getAuthenticatedUserKey(alice), getAuthenticatedUserKey(bob));

    const accountLimiter = createRelayConcurrencyLimiter({
        globalLimit: 2,
        perUserLimit: 1,
        getKey: getAuthenticatedUserKey,
    });
    accountLimiter.middleware(alice, new MockResponse(), () => {});
    let bobStarted = false;
    accountLimiter.middleware(bob, new MockResponse(), () => { bobStarted = true; });
    assert.equal(bobStarted, true);
});

test("pre-aborted and pre-destroyed relay requests never acquire slots", () => {
    const limiter = createRelayConcurrencyLimiter({ globalLimit: 1, perUserLimit: 1 });
    for (const req of [new MockRequest({ aborted: true }), new MockRequest({ destroyed: true })]) {
        const res = new MockResponse();
        let started = false;
        limiter.middleware(req, res, () => { started = true; });
        assert.equal(started, false);
        assert.equal(limiter.getActiveCounts().global, 0);
    }

    const req = new MockRequest();
    const res = new MockResponse();
    res.destroyed = true;
    limiter.middleware(req, res, () => assert.fail("closed response must not continue"));
    assert.equal(limiter.getActiveCounts().global, 0);
});

test("parser failures release an already acquired relay slot", () => {
    const limiter = createRelayConcurrencyLimiter({ globalLimit: 1, perUserLimit: 1 });
    const req = new MockRequest();
    const res = new MockResponse();
    limiter.middleware(req, res, () => {
        handleJsonParserError(new SyntaxError("bad JSON"), req, res, () => assert.fail("parse error must be handled"));
    });
    assert.equal(res.statusCode, 400);
    assert.equal(limiter.getActiveCounts().global, 0);
});
