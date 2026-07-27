import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createLifecycleScope } from "../lib/lifecycle.js";

test("lifecycle scopes remove DOM and host event handlers exactly once", () => {
    const target = new EventTarget();
    const emitter = new EventEmitter();
    const scope = createLifecycleScope();
    let domCalls = 0;
    let hostCalls = 0;

    scope.listen(target, "change", () => { domCalls += 1; });
    scope.subscribe(emitter, "message", () => { hostCalls += 1; });
    target.dispatchEvent(new Event("change"));
    emitter.emit("message");

    assert.deepEqual([domCalls, hostCalls], [1, 1]);
    assert.deepEqual(scope.dispose(), []);
    assert.deepEqual(scope.dispose(), []);
    target.dispatchEvent(new Event("change"));
    emitter.emit("message");
    assert.deepEqual([domCalls, hostCalls], [1, 1]);
    assert.equal(emitter.listenerCount("message"), 0);
});

test("lifecycle scopes immediately clean resources registered after teardown", () => {
    const scope = createLifecycleScope();
    let cleanups = 0;
    scope.dispose();
    scope.add(() => { cleanups += 1; });
    assert.equal(cleanups, 1);
});
