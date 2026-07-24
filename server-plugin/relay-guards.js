const MAX_RELAY_REQUEST_BYTES = 1024 * 1024;
const MAX_ACTION_BYTES = 64;
const MAX_API_KEY_BYTES = 8 * 1024;
const MAX_TOKEN_BYTES = 8 * 1024;
const MAX_PREDICTION_ID_BYTES = 256;
const MAX_OUTPUT_URL_BYTES = 8 * 1024;
const DEFAULT_GLOBAL_CONCURRENCY = 16;
const DEFAULT_PER_USER_CONCURRENCY = 4;

function sendJson(res, status, body) {
    if (res.destroyed || res.writableEnded) return false;
    res.status(status).type("application/json").send(JSON.stringify(body));
    return true;
}

function requireBoundedString(value, name, maxBytes) {
    if (typeof value !== "string" || !value.trim()) {
        const error = new Error(`${name} is required`);
        error.status = 400;
        throw error;
    }
    const normalized = value.trim();
    if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
        const error = new Error(`${name} is too long`);
        error.status = 400;
        throw error;
    }
    return normalized;
}

function requireJsonObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        const error = new Error(`${name} must be a JSON object`);
        error.status = 400;
        throw error;
    }
    return value;
}

function getHeader(req, name) {
    if (typeof req.get === "function") return req.get(name);
    return req.headers?.[name.toLowerCase()];
}

function isJsonMediaType(value) {
    const mediaType = String(value || "").split(";", 1)[0].trim().toLowerCase();
    return mediaType === "application/json" || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
}

function validateRelayRequestHeaders(req, res, next) {
    if (req.method !== "POST") return next();
    if (!isJsonMediaType(getHeader(req, "content-type"))) {
        sendJson(res, 415, { error: "Relay requests must use application/json" });
        return;
    }
    const rawLength = getHeader(req, "content-length");
    if (rawLength != null && rawLength !== "") {
        const declaredLength = Number(rawLength);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RELAY_REQUEST_BYTES) {
            sendJson(res, 413, { error: "Relay request body is too large" });
            return;
        }
    }
    next();
}

function jsonStringBytes(value, remaining) {
    const source = String(value);
    if (source.length > remaining) return remaining + 1;
    return Buffer.byteLength(JSON.stringify(source), "utf8");
}

function boundedJsonByteLength(value, maxBytes = MAX_RELAY_REQUEST_BYTES) {
    let total = 0;
    const stack = [value];
    const seen = new WeakSet();
    while (stack.length) {
        const current = stack.pop();
        if (current == null) total += 4;
        else if (typeof current === "string") total += jsonStringBytes(current, maxBytes - total);
        else if (typeof current === "number") total += Number.isFinite(current) ? String(current).length : 4;
        else if (typeof current === "boolean") total += current ? 4 : 5;
        else if (Array.isArray(current)) {
            if (seen.has(current)) return maxBytes + 1;
            seen.add(current);
            total += 2 + Math.max(0, current.length - 1);
            for (const item of current) stack.push(item);
        } else if (typeof current === "object") {
            if (seen.has(current)) return maxBytes + 1;
            seen.add(current);
            const entries = Object.entries(current);
            total += 2 + Math.max(0, entries.length - 1) + entries.length;
            for (const [key, item] of entries) {
                total += jsonStringBytes(key, maxBytes - total);
                stack.push(item);
                if (total > maxBytes) break;
            }
        } else return maxBytes + 1;
        if (total > maxBytes) return total;
    }
    return total;
}

function validateRelayRequestBody(req, res, next) {
    if (req.method !== "POST") return next();
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        sendJson(res, 400, { error: "Relay request body must be a JSON object" });
        return;
    }
    if (boundedJsonByteLength(req.body) > MAX_RELAY_REQUEST_BYTES) {
        sendJson(res, 413, { error: "Relay request body is too large" });
        return;
    }
    next();
}

function handleJsonParserError(error, _req, res, next) {
    if (error?.type === "entity.too.large" || error?.status === 413) {
        sendJson(res, 413, { error: "Relay request body is too large" });
        return;
    }
    if (error instanceof SyntaxError || error?.type === "entity.parse.failed") {
        sendJson(res, 400, { error: "Relay request body must be valid JSON" });
        return;
    }
    next(error);
}

function getClientKey(req) {
    const candidates = [
        req.user?.profile?.handle,
        req.user?.handle,
        req.session?.user?.profile?.handle,
        req.session?.user?.handle,
    ];
    for (const candidate of candidates) {
        if ((typeof candidate === "string" || typeof candidate === "number") && String(candidate).trim()) {
            return `user:${String(candidate).trim().slice(0, 256)}`;
        }
    }
    const address = req.ip || req.socket?.remoteAddress || "unknown";
    return `address:${String(address).slice(0, 256)}`;
}

function getAddressKey(req) {
    const address = req.ip || req.socket?.remoteAddress || "unknown";
    return `address:${String(address).slice(0, 256)}`;
}

function getAuthenticatedUserKey(req) {
    const handle = req.user?.profile?.handle;
    return `user:${String(handle).trim().slice(0, 256)}`;
}

function createRelayConcurrencyLimiter({
    globalLimit = DEFAULT_GLOBAL_CONCURRENCY,
    perUserLimit = DEFAULT_PER_USER_CONCURRENCY,
    getKey = getClientKey,
} = {}) {
    let activeGlobal = 0;
    const activeByClient = new Map();

    function middleware(req, res, next) {
        if (req.aborted || req.destroyed || res.destroyed || res.writableEnded) return;
        const clientKey = getKey(req);
        const activeForClient = activeByClient.get(clientKey) || 0;
        if (activeGlobal >= globalLimit) {
            sendJson(res, 503, { error: "Quick Image Gen relay is busy" });
            return;
        }
        if (activeForClient >= perUserLimit) {
            sendJson(res, 429, { error: "Too many concurrent Quick Image Gen relay requests" });
            return;
        }

        activeGlobal += 1;
        activeByClient.set(clientKey, activeForClient + 1);
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            activeGlobal = Math.max(0, activeGlobal - 1);
            const remaining = (activeByClient.get(clientKey) || 1) - 1;
            if (remaining > 0) activeByClient.set(clientKey, remaining);
            else activeByClient.delete(clientKey);
            req.removeListener?.("aborted", release);
            res.removeListener?.("finish", release);
            res.removeListener?.("close", release);
        };
        req.once?.("aborted", release);
        res.once?.("finish", release);
        res.once?.("close", release);
        if (req.aborted || req.destroyed || res.destroyed || res.writableEnded) {
            release();
            return;
        }
        try {
            next();
        } catch (error) {
            release();
            throw error;
        }
    }

    return {
        middleware,
        getActiveCounts: () => ({ global: activeGlobal, byClient: new Map(activeByClient) }),
    };
}

module.exports = {
    DEFAULT_GLOBAL_CONCURRENCY,
    DEFAULT_PER_USER_CONCURRENCY,
    MAX_ACTION_BYTES,
    MAX_API_KEY_BYTES,
    MAX_PREDICTION_ID_BYTES,
    MAX_OUTPUT_URL_BYTES,
    MAX_RELAY_REQUEST_BYTES,
    MAX_TOKEN_BYTES,
    boundedJsonByteLength,
    createRelayConcurrencyLimiter,
    getAddressKey,
    getAuthenticatedUserKey,
    handleJsonParserError,
    isJsonMediaType,
    requireBoundedString,
    requireJsonObject,
    validateRelayRequestBody,
    validateRelayRequestHeaders,
};
