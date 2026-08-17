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
const RELAY_BODY_DEADLINE_CLEAR = Symbol.for("quick-image-gen-relay.body-deadline-clear-v1");
const RELAY_PREFIX = "/api/plugins/quick-image-gen-relay";
const DEFAULT_BODY_READ_TIMEOUT_MS = 30_000;
// Authentication has not run yet, so this protects uploads by network address.
// The plugin route applies a separate authenticated-account limiter.
const relayConcurrency = createRelayConcurrencyLimiter({ getKey: getAddressKey });

function isRelayPost(req) {
    // This middleware is mounted on RELAY_PREFIX, so cover every POST that can
    // reach the plugin, including Express case/trailing-slash route aliases.
    return req.method === "POST";
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

// A client that drips (or stalls) its JSON body holds a concurrency slot for as long
// as the host request timeout allows. Bound the read instead: on timeout answer 408,
// which ends the response and releases the limiter slot, then drop the socket once the
// answer has flushed.
function createBodyReadDeadline(options = {}) {
    const timeoutMs = Number.isSafeInteger(options.bodyReadTimeoutMs) && options.bodyReadTimeoutMs > 0
        ? options.bodyReadTimeoutMs
        : DEFAULT_BODY_READ_TIMEOUT_MS;
    return function relayBodyReadDeadline(req, res, next) {
        let cleared = false;
        let timer = null;
        const clear = () => {
            if (cleared) return;
            cleared = true;
            if (timer) clearTimeout(timer);
        };
        const arm = () => {
            if (cleared) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                cleared = true;
                if (!res.headersSent) {
                    res.status(408).type("application/json").send(JSON.stringify({
                        error: "Relay request body timed out",
                    }));
                }
                res.once("finish", () => req.socket?.destroy?.());
                res.once("close", () => req.socket?.destroy?.());
            }, timeoutMs);
            timer.unref?.();
        };
        res.once("finish", clear);
        res.once("close", clear);
        req.once("close", clear);
        req.once("aborted", clear);
        // Activity watchdog: every chunk re-arms the deadline, so only a client
        // that stalls (or drips slower than the window) is cut off. The body
        // parser consumes the stream, so these events fire during parseJson.
        req.on("data", arm);
        req.once("end", clear);
        req[RELAY_BODY_DEADLINE_CLEAR] = clear;
        arm();
        next();
    };
}

function markPreparsed(req, _res, next) {
    if (req[PREPARSER_STARTED] === true) req[PREPARSED_RELAY_REQUEST] = true;
    if (typeof req[RELAY_BODY_DEADLINE_CLEAR] === "function") {
        req[RELAY_BODY_DEADLINE_CLEAR]();
        delete req[RELAY_BODY_DEADLINE_CLEAR];
    }
    next();
}

function createRelayPreParser(options = {}) {
    const parseJson = express.json({
        limit: MAX_RELAY_REQUEST_BYTES,
        type: ["application/json", "application/*+json"],
    });
    return [
        relayOnly(relayConcurrency.middleware),
        relayOnly(rejectLateMount),
        relayOnly(createBodyReadDeadline(options)),
        relayOnly(validateRelayRequestHeaders),
        relayOnly(parseJson),
        handleJsonParserError,
        relayOnly(validateRelayRequestBody),
        relayOnly(markPreparsed),
    ];
}

function installRelayPreParser(app, options = {}) {
    if (!app || typeof app.use !== "function") {
        throw new TypeError("installRelayPreParser requires an Express application");
    }
    if (globalThis[PREPARSER_INSTALLED] === true) {
        throw new Error("Quick Image Gen relay pre-parser is already installed");
    }
    app.use(RELAY_PREFIX, ...createRelayPreParser(options));
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
    DEFAULT_BODY_READ_TIMEOUT_MS,
    PREPARSED_RELAY_REQUEST,
    RELAY_PREFIX,
    createRelayPreParser,
    installRelayPreParser,
    isPreParserConfigured: () => globalThis[PREPARSER_INSTALLED] === true,
    requirePreparsedRelayRequest,
};
