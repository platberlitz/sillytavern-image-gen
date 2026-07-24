const PLUGIN_ID = "quick-image-gen-relay";
const PROTOCOL_VERSION = require("./package.json").version;
const REQUEST_TIMEOUT_MS = 60_000;
const { readResponseBufferWithLimit, readResponseTextWithLimit } = require("./response-limit");
const {
    MAX_ACTION_BYTES,
    MAX_API_KEY_BYTES,
    MAX_PREDICTION_ID_BYTES,
    MAX_OUTPUT_URL_BYTES,
    MAX_TOKEN_BYTES,
    createRelayConcurrencyLimiter,
    getAuthenticatedUserKey,
    requireBoundedString,
    requireJsonObject,
} = require("./relay-guards");
const {
    isPreParserConfigured,
    requirePreparsedRelayRequest,
} = require("./pre-parser");

const authenticatedConcurrency = createRelayConcurrencyLimiter({ getKey: getAuthenticatedUserKey });

const OUTPUT_AUTH_ORIGINS = Object.freeze({
    civitai: "https://orchestration.civitai.com",
    replicate: "https://api.replicate.com",
});

function sendJson(res, status, body) {
    if (res.destroyed || res.writableEnded) return false;
    res.status(status).type("application/json").send(JSON.stringify(body));
    return true;
}

function requireAuthScheme(value, expected = "Bearer") {
    const scheme = requireBoundedString(value, "authScheme", MAX_ACTION_BYTES);
    if (scheme.toLowerCase() !== expected.toLowerCase()) {
        const error = new Error(`Unsupported authorization scheme: ${scheme}`);
        error.status = 400;
        throw error;
    }
    return expected;
}

function withTimeout(signal) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    return {
        signal: controller.signal,
        abort: () => controller.abort(),
        done: () => clearTimeout(timeout),
        didTimeOut: () => timedOut,
    };
}

async function relayJson(req, res, url, authHeader, init = {}) {
    const timeout = withTimeout();
    let clientDisconnected = false;
    const abortOnDisconnect = () => {
        if (!res.writableEnded) {
            clientDisconnected = true;
            timeout.abort();
        }
    };
    req.once("aborted", abortOnDisconnect);
    res.once("close", abortOnDisconnect);
    if (req.aborted || res.destroyed) abortOnDisconnect();
    try {
        if (clientDisconnected) return;
        const upstream = await fetch(url, {
            method: init.method || "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": authHeader,
                ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: timeout.signal,
            redirect: "error",
        });

        if ([101, 204, 205, 304].includes(upstream.status)) {
            if (clientDisconnected || req.aborted || res.destroyed || res.writableEnded) return;
            res.status(upstream.status).end();
            return;
        }
        const text = await readResponseTextWithLimit(upstream);
        if (clientDisconnected || req.aborted || res.destroyed || res.writableEnded) return;
        res.status(upstream.status);
        res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
        res.send(text);
    } catch (error) {
        if (clientDisconnected || req.aborted || res.destroyed || res.writableEnded) return;
        if (error?.name === "AbortError") {
            sendJson(res, timeout.didTimeOut() ? 504 : 502, {
                error: timeout.didTimeOut()
                    ? "Quick Image Gen relay request timed out"
                    : "Quick Image Gen relay request aborted",
            });
            return;
        }
        sendJson(res, 502, { error: error?.message || "Quick Image Gen relay request failed" });
    } finally {
        timeout.done();
        req.removeListener("aborted", abortOnDisconnect);
        res.removeListener("close", abortOnDisconnect);
    }
}

function requireTrustedOutputUrl(value, provider) {
    const raw = requireBoundedString(value, "url", MAX_OUTPUT_URL_BYTES);
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        const error = new Error("Invalid provider output URL");
        error.status = 400;
        throw error;
    }
    const suffixes = provider === "replicate"
        ? ["replicate.com", "replicate.delivery"]
        : ["civitai.com", "civitai.green", "civitai.red"];
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const trusted = parsed.protocol === "https:"
        && !parsed.username
        && !parsed.password
        && suffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
    if (!trusted) {
        const error = new Error(`Untrusted ${provider} output URL`);
        error.status = 400;
        throw error;
    }
    return parsed.href;
}

function getOutputAuthorization(req, provider, url, authHeader) {
    if (req.body?.sendOutputAuthorization !== true) return null;
    return new URL(url).origin === OUTPUT_AUTH_ORIGINS[provider] ? authHeader : null;
}

async function relayImage(req, res, url, authHeader = null, { manualRedirectProvider = null } = {}) {
    const timeout = withTimeout();
    let clientDisconnected = false;
    const abortOnDisconnect = () => {
        if (!res.writableEnded) {
            clientDisconnected = true;
            timeout.abort();
        }
    };
    req.once("aborted", abortOnDisconnect);
    res.once("close", abortOnDisconnect);
    if (req.aborted || res.destroyed) abortOnDisconnect();
    try {
        if (clientDisconnected) return;
        let upstream = await fetch(url, {
            headers: {
                Accept: "image/*,application/octet-stream",
                ...(authHeader ? { Authorization: authHeader } : {}),
            },
            signal: timeout.signal,
            redirect: manualRedirectProvider ? "manual" : "error",
        });
        if (manualRedirectProvider && [301, 302, 303, 307, 308].includes(upstream.status)) {
            const location = upstream.headers.get("location");
            await upstream.body?.cancel?.("Following validated provider output redirect").catch(() => {});
            if (!location) {
                sendJson(res, 502, { error: "Provider output redirect did not include a destination" });
                return;
            }
            const redirectedUrl = requireTrustedOutputUrl(new URL(location, url).href, manualRedirectProvider);
            upstream = await fetch(redirectedUrl, {
                headers: { Accept: "image/*,application/octet-stream" },
                signal: timeout.signal,
                redirect: "error",
            });
        }
        if (!upstream.ok) {
            const detail = await readResponseTextWithLimit(upstream).catch(() => "");
            sendJson(res, upstream.status, { error: detail.slice(0, 1000) || `Provider image request failed with HTTP ${upstream.status}` });
            return;
        }
        const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
        if (!contentType.startsWith("image/") && !contentType.startsWith("application/octet-stream")) {
            await upstream.body?.cancel?.("Provider output was not an image").catch(() => {});
            sendJson(res, 502, { error: "Provider output URL did not return an image" });
            return;
        }
        const buffer = await readResponseBufferWithLimit(upstream);
        if (clientDisconnected || req.aborted || res.destroyed || res.writableEnded) return;
        res.status(upstream.status);
        res.set("Content-Type", contentType || "application/octet-stream");
        res.send(buffer);
    } catch (error) {
        if (clientDisconnected || req.aborted || res.destroyed || res.writableEnded) return;
        if (error?.name === "AbortError") {
            sendJson(res, timeout.didTimeOut() ? 504 : 502, {
                error: timeout.didTimeOut() ? "Quick Image Gen relay request timed out" : "Quick Image Gen relay request aborted",
            });
            return;
        }
        sendJson(res, 502, { error: error?.message || "Quick Image Gen relay image request failed" });
    } finally {
        timeout.done();
        req.removeListener("aborted", abortOnDisconnect);
        res.removeListener("close", abortOnDisconnect);
    }
}

async function handleCivitai(req, res) {
    try {
        const action = requireBoundedString(req.body?.action, "action", MAX_ACTION_BYTES);
        const apiKey = requireBoundedString(req.body?.apiKey, "apiKey", MAX_API_KEY_BYTES);

        if (action === "createWorkflow") {
            return await relayJson(req, res, "https://orchestration.civitai.com/v2/consumer/workflows?wait=0", `Bearer ${apiKey}`, {
                method: "POST",
                body: requireJsonObject(req.body?.body, "body"),
            });
        }

        if (action === "getWorkflow" || action === "cancelWorkflow") {
            const id = requireBoundedString(req.body?.id, "id", MAX_TOKEN_BYTES);
            if (!/^[A-Za-z0-9_-]+$/.test(id)) {
                sendJson(res, 400, { error: "Invalid CivitAI workflow id" });
                return;
            }
            return await relayJson(
                req,
                res,
                `https://orchestration.civitai.com/v2/consumer/workflows/${encodeURIComponent(id)}`,
                `Bearer ${apiKey}`,
                { method: action === "cancelWorkflow" ? "DELETE" : "GET" },
            );
        }

        if (action === "getOutput") {
            const url = requireTrustedOutputUrl(req.body?.url, "civitai");
            const authHeader = getOutputAuthorization(req, "civitai", url, `Bearer ${apiKey}`);
            return await relayImage(req, res, url, authHeader, {
                manualRedirectProvider: authHeader ? "civitai" : null,
            });
        }

        sendJson(res, 400, { error: `Unsupported CivitAI action: ${action}` });
    } catch (error) {
        sendJson(res, error.status || 500, { error: error.message || "CivitAI relay failed" });
    }
}

function requireAuthenticatedUser(req, res, next) {
    const handle = req.user?.profile?.handle;
    if ((typeof handle !== "string" && typeof handle !== "number") || !String(handle).trim()) {
        sendJson(res, 403, { error: "Authentication is required for the Quick Image Gen relay" });
        return;
    }
    next();
}

async function handleReplicate(req, res) {
    try {
        const action = requireBoundedString(req.body?.action, "action", MAX_ACTION_BYTES);
        const apiKey = requireBoundedString(req.body?.apiKey, "apiKey", MAX_API_KEY_BYTES);
        const authHeader = `${requireAuthScheme(req.body?.authScheme)} ${apiKey}`;

        if (action === "createPrediction") {
            return await relayJson(req, res, "https://api.replicate.com/v1/predictions", authHeader, {
                method: "POST",
                body: requireJsonObject(req.body?.body, "body"),
            });
        }

        if (action === "getPrediction") {
            const id = requireBoundedString(req.body?.id, "id", MAX_PREDICTION_ID_BYTES);
            if (!/^[A-Za-z0-9_-]+$/.test(id)) {
                sendJson(res, 400, { error: "Invalid Replicate prediction id" });
                return;
            }
            return await relayJson(req, res, `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, authHeader);
        }

        if (action === "cancelPrediction") {
            const id = requireBoundedString(req.body?.id, "id", MAX_PREDICTION_ID_BYTES);
            if (!/^[A-Za-z0-9_-]+$/.test(id)) {
                sendJson(res, 400, { error: "Invalid Replicate prediction id" });
                return;
            }
            return await relayJson(req, res, `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}/cancel`, authHeader, {
                method: "POST",
            });
        }

        if (action === "getOutput") {
            const url = requireTrustedOutputUrl(req.body?.url, "replicate");
            return await relayImage(req, res, url, getOutputAuthorization(req, "replicate", url, authHeader));
        }

        sendJson(res, 400, { error: `Unsupported Replicate action: ${action}` });
    } catch (error) {
        sendJson(res, error.status || 500, { error: error.message || "Replicate relay failed" });
    }
}

async function init(router) {
    const relayRequestHandlers = [
        requirePreparsedRelayRequest,
        requireAuthenticatedUser,
        authenticatedConcurrency.middleware,
    ];
    router.get("/healthz", (_req, res) => {
        if (!isPreParserConfigured()) {
            sendJson(res, 503, { error: "Quick Image Gen relay pre-parser is not configured" });
            return;
        }
        res.sendStatus(204);
    });
    router.post("/civitai", ...relayRequestHandlers, handleCivitai);
    router.post("/replicate", ...relayRequestHandlers, handleReplicate);
    console.log("Quick Image Gen relay plugin loaded");
}

async function exit() {
    return Promise.resolve();
}

module.exports = {
    init,
    exit,
    info: {
        id: PLUGIN_ID,
        protocolVersion: PROTOCOL_VERSION,
        name: "Quick Image Gen Relay",
        description: "Relays CivitAI and Replicate requests for Quick Image Gen when SillyTavern basicAuthMode blocks the CORS proxy.",
    },
};
