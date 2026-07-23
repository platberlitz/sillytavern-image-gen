const PLUGIN_ID = "quick-image-gen-relay";
const REQUEST_TIMEOUT_MS = 60_000;
const express = require("express");
const { readResponseTextWithLimit } = require("./response-limit");

function sendJson(res, status, body) {
    if (res.destroyed || res.writableEnded) return false;
    res.status(status).type("application/json").send(JSON.stringify(body));
    return true;
}

function requireString(value, name) {
    if (typeof value !== "string" || !value.trim()) {
        const error = new Error(`${name} is required`);
        error.status = 400;
        throw error;
    }
    return value.trim();
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
    try {
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

async function handleCivitai(req, res) {
    try {
        const action = requireString(req.body?.action, "action");
        const apiKey = requireString(req.body?.apiKey, "apiKey");

        if (action === "createJob") {
            return await relayJson(req, res, "https://civitai.com/api/v1/consumer/jobs", `Bearer ${apiKey}`, {
                method: "POST",
                body: req.body?.body,
            });
        }

        if (action === "getJobs") {
            const token = requireString(req.body?.token, "token");
            const url = new URL("https://civitai.com/api/v1/consumer/jobs");
            url.searchParams.set("token", token);
            return await relayJson(req, res, url.toString(), `Bearer ${apiKey}`);
        }

        sendJson(res, 400, { error: `Unsupported CivitAI action: ${action}` });
    } catch (error) {
        sendJson(res, error.status || 500, { error: error.message || "CivitAI relay failed" });
    }
}

async function handleReplicate(req, res) {
    try {
        const action = requireString(req.body?.action, "action");
        const apiKey = requireString(req.body?.apiKey, "apiKey");

        if (action === "createPrediction") {
            return await relayJson(req, res, "https://api.replicate.com/v1/predictions", `Token ${apiKey}`, {
                method: "POST",
                body: req.body?.body,
            });
        }

        if (action === "getPrediction") {
            const id = requireString(req.body?.id, "id");
            if (!/^[A-Za-z0-9_-]+$/.test(id)) {
                sendJson(res, 400, { error: "Invalid Replicate prediction id" });
                return;
            }
            return await relayJson(req, res, `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, `Token ${apiKey}`);
        }

        sendJson(res, 400, { error: `Unsupported Replicate action: ${action}` });
    } catch (error) {
        sendJson(res, error.status || 500, { error: error.message || "Replicate relay failed" });
    }
}

async function init(router) {
    router.use(express.json({ limit: "1mb" }));
    router.get("/healthz", (_req, res) => res.sendStatus(204));
    router.post("/civitai", handleCivitai);
    router.post("/replicate", handleReplicate);
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
        name: "Quick Image Gen Relay",
        description: "Relays CivitAI and Replicate requests for Quick Image Gen when SillyTavern basicAuthMode blocks the CORS proxy.",
    },
};
