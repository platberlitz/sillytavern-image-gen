import assert from "node:assert/strict";
import test from "node:test";

import {
    assertSafeConfigurableEndpoint,
    clonedResponseIncludes,
    combineAbortSignals,
    createAbortDeadline,
    getCorsFailureMessage,
    getCorsProxyStateKey,
} from "../lib/network-runtime.js";

test("abort compatibility helpers work without AbortSignal static methods", async () => {
    const anyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });

    try {
        const first = new AbortController();
        const second = new AbortController();
        const combined = combineAbortSignals([first.signal, second.signal]);
        const reason = new Error("cancelled");
        second.abort(reason);
        assert.equal(combined.aborted, true);
        assert.equal(combined.reason, reason);

        const deadline = createAbortDeadline(null, 5, "deadline reached");
        await new Promise(resolve => deadline.signal.addEventListener("abort", resolve, { once: true }));
        assert.equal(deadline.didTimeOut(), true);
        assert.equal(deadline.signal.reason?.name, "TimeoutError");
        deadline.dispose();

        const parent = new AbortController();
        const linked = createAbortDeadline(parent.signal, 10_000);
        parent.abort(reason);
        assert.equal(linked.signal.reason, reason);
        assert.equal(linked.didTimeOut(), false);
        linked.dispose();
    } finally {
        if (anyDescriptor) Object.defineProperty(AbortSignal, "any", anyDescriptor);
        else delete AbortSignal.any;
        if (timeoutDescriptor) Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
        else delete AbortSignal.timeout;
    }
});

test("CORS proxy state keys isolate origins and request classes", () => {
    const base = "https://sillytavern.example/chat";
    const ordinary = getCorsProxyStateKey("https://images.example/v1", { method: "GET" }, base);
    assert.notEqual(ordinary, getCorsProxyStateKey("https://other.example/v1", { method: "GET" }, base));
    assert.notEqual(ordinary, getCorsProxyStateKey("https://images.example/v1", { method: "POST" }, base));
    assert.notEqual(ordinary, getCorsProxyStateKey("https://images.example/v1", {
        headers: { Authorization: "Bearer secret" },
    }, base));
    assert.equal(
        getCorsProxyStateKey("https://images.example/a", { headers: { "X-Mode": "one", Accept: "image/*" } }, base),
        getCorsProxyStateKey("https://images.example/b", { headers: { Accept: "application/json", "x-mode": "two" } }, base),
    );
});

test("CORS 404 inspection leaves the original response body readable", async () => {
    const response = new Response("ordinary provider 404 body", { status: 404 });
    assert.equal(await clonedResponseIncludes(response, "CORS proxy is disabled"), false);
    assert.equal(await response.text(), "ordinary provider 404 body");
});

test("CORS guidance names the exact SillyTavern origin", () => {
    const message = getCorsFailureMessage("http://127.0.0.1:7860", "https://chat.example:8443");
    assert.match(message, /--cors-allow-origins=https:\/\/chat\.example:8443/);
    assert.doesNotMatch(message, /--cors-allow-origins=\*/);
});

test("configurable provider endpoints require HTTPS except on loopback", () => {
    assert.equal(assertSafeConfigurableEndpoint("http://127.0.0.2:7860/v1"), "http://127.0.0.2:7860/v1");
    assert.equal(assertSafeConfigurableEndpoint("http://localhost./v1"), "http://localhost./v1");
    assert.equal(
        assertSafeConfigurableEndpoint("/proxy/openai", "Proxy URL", "https://chat.example/app"),
        "/proxy/openai",
    );
    assert.throws(() => assertSafeConfigurableEndpoint("http://proxy.example/v1"), /must use HTTPS/);
    assert.throws(
        () => assertSafeConfigurableEndpoint("/proxy/openai", "Proxy URL", "http://chat.example/app"),
        /must use HTTPS/,
    );
    assert.throws(() => assertSafeConfigurableEndpoint("https://user:pass@proxy.example/v1"), /without embedded credentials/);
});
