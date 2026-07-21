const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

async function readResponseTextWithLimit(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel?.("Upstream response is too large").catch(() => {});
        throw new Error("Upstream response is too large");
    }

    if (!response.body?.getReader) {
        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("Upstream response is too large");
        return text;
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
    readResponseTextWithLimit,
};
