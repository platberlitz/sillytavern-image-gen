import assert from "node:assert/strict";
import test from "node:test";

import { createNotifier, DEFAULT_THROTTLE_MS } from "../lib/notifications.js";

function fakeToastr() {
    const calls = [];
    const record = (severity) => (message, title, options) => calls.push({ severity, message, title, options });
    return {
        calls,
        success: record("success"),
        info: record("info"),
        warning: record("warning"),
        error: record("error"),
    };
}

function harness({ clock = { t: 0 }, ...overrides } = {}) {
    const toastr = fakeToastr();
    const logged = [];
    const notifier = createNotifier({
        getToastr: () => toastr,
        log: (message) => logged.push(message),
        now: () => clock.t,
        ...overrides,
    });
    return { notifier, toastr, logged, clock };
}

test("each severity reaches the matching toastr method", () => {
    const { notifier, toastr } = harness();
    notifier.success("saved");
    notifier.info("heads up");
    notifier.warning("careful");
    notifier.error("broken");
    assert.deepEqual(toastr.calls.map(c => c.severity), ["success", "info", "warning", "error"]);
    assert.deepEqual(toastr.calls.map(c => c.message), ["saved", "heads up", "careful", "broken"]);
});

test("the signature mirrors toastr so existing call shapes migrate by rename", () => {
    const { notifier, toastr } = harness();
    notifier.warning("bare message");
    notifier.error("with title", "Quick Image Gen");
    notifier.info("with options", "", { timeOut: 5000 });
    assert.deepEqual(toastr.calls.map(c => [c.message, c.title]), [
        ["bare message", ""],
        ["with title", "Quick Image Gen"],
        ["with options", ""],
    ]);
    assert.equal(toastr.calls[2].options.timeOut, 5000);
});

test("escaping is on unless a caller explicitly opts out", () => {
    const { notifier, toastr } = harness();
    notifier.error('Failed: <img src=x onerror=alert(1)>');
    assert.equal(toastr.calls[0].options.escapeHtml, true);
    notifier.info("owned markup", "", { escapeHtml: false });
    assert.equal(toastr.calls[1].options.escapeHtml, false);
});

test("a site that already passed escapeHtml true keeps working", () => {
    const { notifier, toastr } = harness();
    notifier.error("boom", "", { timeOut: 0, closeButton: true, escapeHtml: true });
    assert.deepEqual(toastr.calls[0].options, { escapeHtml: true, timeOut: 0, closeButton: true });
});

test("throttleKey and logMessage never leak through to toastr", () => {
    const { notifier, toastr } = harness();
    notifier.warning("msg", "", { throttleKey: "k", logMessage: true, throttleMs: 10, timeOut: 3000 });
    assert.deepEqual(Object.keys(toastr.calls[0].options).sort(), ["escapeHtml", "timeOut"]);
});

test("a missing or unusable toastr global is a no-op, not a throw", () => {
    for (const getToastr of [null, () => undefined, () => null, () => { throw new ReferenceError("toastr is not defined"); }]) {
        const notifier = createNotifier({ getToastr });
        assert.equal(notifier.isAvailable(), false);
        assert.equal(notifier.warning("still fine"), false, "must report that nothing was shown");
    }
});

test("a toastr that throws mid-call is reported to the log and does not propagate", () => {
    const logged = [];
    const notifier = createNotifier({
        getToastr: () => ({ error: () => { throw new Error("toast container detached"); } }),
        log: (message) => logged.push(message),
    });
    assert.equal(notifier.error("boom"), false);
    assert.match(logged.at(-1), /Notification failed: toast container detached/);
});

test("throttleKey suppresses repeats inside the window and allows them after", () => {
    const clock = { t: 0 };
    const { notifier, toastr } = harness({ clock });
    assert.equal(notifier.warning("could not save", "", { throttleKey: "save" }), true);
    clock.t = DEFAULT_THROTTLE_MS - 1;
    assert.equal(notifier.warning("could not save", "", { throttleKey: "save" }), false);
    clock.t = DEFAULT_THROTTLE_MS;
    assert.equal(notifier.warning("could not save", "", { throttleKey: "save" }), true);
    assert.equal(toastr.calls.length, 2);
});

test("different throttle keys do not suppress each other", () => {
    const { notifier, toastr } = harness();
    notifier.warning("a", "", { throttleKey: "one" });
    notifier.warning("b", "", { throttleKey: "two" });
    assert.equal(toastr.calls.length, 2);
});

test("untracked notifications are never throttled", () => {
    const { notifier, toastr } = harness();
    for (let i = 0; i < 5; i++) notifier.info("no key");
    assert.equal(toastr.calls.length, 5);
});

test("notifyOnce collapses a per-iteration failure into a single toast", () => {
    const { notifier, toastr } = harness();
    for (let i = 0; i < 8; i++) {
        notifier.notifyOnce("inject-failed", "error", `Inject generation failed: item ${i}`, "", { timeOut: 0 });
    }
    assert.equal(toastr.calls.length, 1, "a loop must not stack sticky toasts");
    assert.match(toastr.calls[0].message, /item 0/);
});

test("notifyOnce falls back to the message when no key is given", () => {
    const { notifier, toastr } = harness();
    notifier.notifyOnce("", "warning", "same text");
    notifier.notifyOnce("", "warning", "same text");
    notifier.notifyOnce("", "warning", "different text");
    assert.equal(toastr.calls.length, 2);
});

test("reset clears throttle history so a new run can notify again", () => {
    const { notifier, toastr } = harness();
    notifier.notifyOnce("run", "error", "failed");
    notifier.notifyOnce("run", "error", "failed");
    notifier.reset();
    notifier.notifyOnce("run", "error", "failed");
    assert.equal(toastr.calls.length, 2);
});

test("an unknown severity is refused rather than passed to toastr", () => {
    const { notifier, toastr } = harness();
    assert.equal(notifier.notify("critical", "nope"), false);
    assert.equal(toastr.calls.length, 0);
});

test("logMessage mirrors the text to the log, and is off by default", () => {
    const { notifier, logged } = harness();
    notifier.warning("quiet");
    assert.deepEqual(logged, []);
    notifier.warning("noisy", "", { logMessage: true });
    assert.deepEqual(logged, ["noisy"]);
});

test("the log still records a throttled message even when no toast is shown", () => {
    const clock = { t: 0 };
    const { notifier, logged, toastr } = harness({ clock });
    notifier.warning("could not save to server", "", { throttleKey: "server", logMessage: true });
    notifier.warning("could not save to server", "", { throttleKey: "server", logMessage: true });
    assert.equal(toastr.calls.length, 1);
    assert.equal(logged.length, 2, "suppressing a toast must not suppress the log record");
});

test("null and undefined messages become empty strings rather than the literal words", () => {
    const { notifier, toastr } = harness();
    notifier.info(null);
    notifier.info(undefined);
    assert.deepEqual(toastr.calls.map(c => c.message), ["", ""]);
    assert.deepEqual(toastr.calls.map(c => c.title), ["", ""]);
});
