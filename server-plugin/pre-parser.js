const express = require("express");
const {
    MAX_RELAY_REQUEST_BYTES,
    createRelayConcurrencyLimiter,
    getAddressKey,
    handleJsonParserError,
    validateRelayRequestBody,
    validateRelayRequestHeaders,
} = require("./relay-guards");

const PREPARSER_STARTED = Symbol.for("quick-image-gen-relay.preparser-started-v1");
const PREPARSED_RELAY_REQUEST = Symbol.for("quick-image-gen-relay.preparsed-v1");
const PREPARSER_INSTALLED = Symbol.for("quick-image-gen-relay.preparser-installed-v1");
const RELAY_PREFIX = "/api/plugins/quick-image-gen-relay";
// Authentication has not run yet, so this protects uploads by network address.
// The plugin route applies a separate authenticated-account limiter.
const relayConcurrency = createRelayConcurrencyLimiter({ getKey: getAddressKey });

function isRelayPost(req) {
    return req.method === "POST" && (req.path === "/civitai" || req.path === "/replicate");
}

function relayOnly(handler) {
    return function relayPreParserHandler(req, res, next) {
        if (!isRelayPost(req)) return next();
        return handler(req, res, next);
    };
}

function rejectLateMount(req, res, next) {
    if (req.body !== undefined) {
        res.status(503).type("application/json").send(JSON.stringify({
            error: "Quick Image Gen relay pre-parser must run before the host body parser",
        }));
        return;
    }
    req[PREPARSER_STARTED] = true;
    next();
}

function markPreparsed(req, _res, next) {
    if (req[PREPARSER_STARTED] === true) req[PREPARSED_RELAY_REQUEST] = true;
    next();
}

function createRelayPreParser() {
    const parseJson = express.json({
        limit: MAX_RELAY_REQUEST_BYTES,
        type: ["application/json", "application/*+json"],
    });
    return [
        relayOnly(relayConcurrency.middleware),
        relayOnly(rejectLateMount),
        relayOnly(validateRelayRequestHeaders),
        relayOnly(parseJson),
        handleJsonParserError,
        relayOnly(validateRelayRequestBody),
        relayOnly(markPreparsed),
    ];
}

function installRelayPreParser(app) {
    if (!app || typeof app.use !== "function") {
        throw new TypeError("installRelayPreParser requires an Express application");
    }
    if (globalThis[PREPARSER_INSTALLED] === true) {
        throw new Error("Quick Image Gen relay pre-parser is already installed");
    }
    app.use(RELAY_PREFIX, ...createRelayPreParser());
    globalThis[PREPARSER_INSTALLED] = true;
}

function requirePreparsedRelayRequest(req, res, next) {
    if (req[PREPARSED_RELAY_REQUEST] !== true) {
        res.status(503).type("application/json").send(JSON.stringify({
            error: "Quick Image Gen relay is disabled until its pre-parser is mounted before the host body parser",
        }));
        return;
    }
    next();
}

module.exports = {
    PREPARSED_RELAY_REQUEST,
    RELAY_PREFIX,
    createRelayPreParser,
    installRelayPreParser,
    isPreParserConfigured: () => globalThis[PREPARSER_INSTALLED] === true,
    requirePreparsedRelayRequest,
};
