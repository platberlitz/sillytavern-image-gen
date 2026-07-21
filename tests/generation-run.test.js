import assert from "node:assert/strict";
import test from "node:test";

import { GenerationRunManager } from "../lib/generation-run.js";

test("generation runs own an isolated settings snapshot", () => {
    const manager = new GenerationRunManager();
    const source = { provider: "proxy", nested: { model: "one" } };
    const run = manager.start(source, { chatId: "chat-a" });

    source.provider = "local";
    source.nested.model = "two";

    assert.equal(run.settings.provider, "proxy");
    assert.equal(run.settings.nested.model, "one");
    assert.equal(run.context.chatId, "chat-a");
});

test("only the active owner can finish a generation run", () => {
    const manager = new GenerationRunManager();
    const first = manager.start({});
    assert.equal(manager.finish(first), true);

    const second = manager.start({});
    assert.equal(manager.finish(first), false);
    assert.equal(manager.active, second);
    assert.equal(manager.finish(second), true);
});

test("cancelling invalidates the active run until its owner finishes", () => {
    const manager = new GenerationRunManager();
    const run = manager.start({});

    assert.equal(manager.cancel("Chat changed"), true);
    assert.equal(run.signal.aborted, true);
    assert.throws(() => manager.assertActive(run), { name: "AbortError" });
    assert.throws(() => manager.start({}), /already active/);
    assert.equal(manager.finish(run), true);
});
