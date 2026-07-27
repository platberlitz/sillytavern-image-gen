import assert from "node:assert/strict";
import test from "node:test";

import { GenerationRunManager, snapshotGenerationRunSettings } from "../lib/generation-run.js";

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

test("generation snapshots exclude synchronized backups without reading them", () => {
    let backupReads = 0;
    const source = {
        provider: "proxy",
        proxyRefImages: ["data:image/png;base64,AA=="],
        _syncCacheId: "account-secret",
        _charSettingsBaseState: { prompt: "private base" },
    };
    Object.defineProperty(source, "_backupCharRefImages", {
        enumerable: true,
        get() {
            backupReads += 1;
            return { huge: "x".repeat(1024) };
        },
    });

    const snapshot = snapshotGenerationRunSettings(source);
    assert.equal(backupReads, 0);
    assert.deepEqual(snapshot, {
        provider: "proxy",
        proxyRefImages: ["data:image/png;base64,AA=="],
    });
    source.proxyRefImages[0] = "changed";
    assert.equal(snapshot.proxyRefImages[0], "data:image/png;base64,AA==");
});

test("run manager accepts an already-owned settings snapshot without cloning it again", () => {
    const manager = new GenerationRunManager();
    const snapshot = { provider: "proxy" };
    const run = manager.start(snapshot, {}, { settingsSnapshot: true });
    assert.equal(run.settings, snapshot);
    assert.equal(manager.finish(run), true);
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
