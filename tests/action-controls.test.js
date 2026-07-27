import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
    createAccessibleIconButton,
    resolveMainGenerationControlState,
    shouldBlockGenerationStart,
} from "../lib/action-controls.js";

test("icon actions are native named buttons", () => {
    const dom = new JSDOM();
    const button = createAccessibleIconButton(dom.window.document, {
        className: "mes_button qig-message-generate",
        label: "Generate image from message 3",
    });

    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.type, "button");
    assert.equal(button.getAttribute("aria-label"), "Generate image from message 3");
});

test("the main generation control remains an enabled Cancel action without a palette", () => {
    const hiddenPalette = resolveMainGenerationControlState({
        active: true,
        paletteAvailable: false,
        manageBusyState: true,
    });
    assert.equal(hiddenPalette.action, "cancel");
    assert.equal(hiddenPalette.label, "Cancel");
    assert.equal(hiddenPalette.disabled, false);

    const visiblePalette = resolveMainGenerationControlState({
        active: true,
        paletteAvailable: true,
        manageBusyState: true,
    });
    assert.equal(visiblePalette.action, "busy");
    assert.equal(visiblePalette.disabled, true);
});

test("post-cancel debounce blocks only new starts, never cancellation of an active run", () => {
    assert.equal(shouldBlockGenerationStart({ active: false, now: 100, blockedUntil: 200 }), true);
    assert.equal(shouldBlockGenerationStart({ active: false, now: 200, blockedUntil: 200 }), false);
    assert.equal(shouldBlockGenerationStart({ active: true, now: 100, blockedUntil: 200 }), false);
});
