const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_IN_FLIGHT_RESPONSE_BYTES = 4 * MAX_IMAGE_RESPONSE_BYTES;

function createResponseByteBudget(maxBytes = MAX_IN_FLIGHT_RESPONSE_BYTES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new TypeError("Response byte budget must be a positive safe integer");
    }

    let reservedBytes = 0;
    function tryReserve(bytes) {
        if (!Number.isSafeInteger(bytes) || bytes <= 0) {
            throw new TypeError("Response byte reservation must be a positive safe integer");
        }
        if (bytes > maxBytes - reservedBytes) return null;

        reservedBytes += bytes;
        let released = false;
        return function release() {
            if (released) return;
            released = true;
            reservedBytes = Math.max(0, reservedBytes - bytes);
        };
    }

    return { tryReserve };
}

async function readResponseBufferWithLimit(response, maxBytes = MAX_IMAGE_RESPONSE_BYTES) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel?.("Upstream response is too large").catch(() => {});
        throw new Error("Upstream response is too large");
    }
    if (!response.body?.getReader) {
        throw new Error("Upstream response body is not streamable; size limit cannot be enforced");
    }

    const reader = response.body.getReader();
    let total = 0;
    // ponytail: with a truthful content-length we can fill one preallocated buffer (single
    // copy, no concat). Unknown lengths fall back to referenced chunks with one final concat.
    let direct = Number.isFinite(declaredLength) && declaredLength >= 0 ? Buffer.allocUnsafe(declaredLength) : null;
    let chunks = direct ? null : [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel("Upstream response is too large");
                throw new Error("Upstream response is too large");
            }
            if (direct) {
                if (total <= direct.length) {
                    direct.set(value, total - value.byteLength);
                    continue;
                }
                // The upstream understated its content-length; switch to the chunk path.
                chunks = [direct.subarray(0, total - value.byteLength), value];
                direct = null;
            } else {
                chunks.push(value);
            }
        }
    } finally {
        reader.releaseLock();
    }
    if (direct) return direct.subarray(0, total);
    return chunks.length ? Buffer.concat(chunks, total) : Buffer.alloc(0);
}

async function readResponseTextWithLimit(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel?.("Upstream response is too large").catch(() => {});
        throw new Error("Upstream response is too large");
    }

    if (!response.body?.getReader) {
        throw new Error("Upstream response body is not streamable; size limit cannot be enforced");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let result = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel("Upstream response is too large");
                throw new Error("Upstream response is too large");
            }
            result += decoder.decode(value, { stream: true });
        }
        return result + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

module.exports = {
    DEFAULT_MAX_RESPONSE_BYTES,
    MAX_IMAGE_RESPONSE_BYTES,
    MAX_IN_FLIGHT_RESPONSE_BYTES,
    createResponseByteBudget,
    readResponseBufferWithLimit,
    readResponseTextWithLimit,
};
