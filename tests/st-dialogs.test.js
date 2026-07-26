import assert from "node:assert/strict";
import test from "node:test";

import { createDialogHost, DEFAULT_DIALOG_TITLE } from "../lib/st-dialogs.js";

const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 };
const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: null };

function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function host(overrides = {}) {
    const calls = [];
    const dialogs = createDialogHost({
        callGenericPopup: (content, type, inputValue, options) => {
            calls.push({ content, type, inputValue, options });
            return Promise.resolve(POPUP_RESULT.AFFIRMATIVE);
        },
        popupType: POPUP_TYPE,
        popupResult: POPUP_RESULT,
        escapeHtml,
        ...overrides,
    });
    return { dialogs, calls };
}

test("confirm uses the SillyTavern confirm popup and resolves true only on affirmative", async () => {
    const { dialogs, calls } = host();
    assert.equal(await dialogs.confirmDialog("Delete pool?"), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, POPUP_TYPE.CONFIRM);
    assert.match(calls[0].content, /Delete pool\?/);
});

test("negative and cancelled popup results leave the action undone", async () => {
    for (const result of [POPUP_RESULT.NEGATIVE, POPUP_RESULT.CANCELLED, undefined]) {
        const { dialogs } = host({ callGenericPopup: () => Promise.resolve(result) });
        assert.equal(await dialogs.confirmDialog("Clear gallery?"), false, `result ${String(result)} must not confirm`);
    }
});

test("interpolated values are escaped so user data cannot inject markup", async () => {
    const { dialogs, calls } = host();
    await dialogs.confirmDialog('Delete "<img src=x onerror=alert(1)>"?', { title: "<b>Pools</b>" });
    assert.doesNotMatch(calls[0].content, /<img/);
    assert.doesNotMatch(calls[0].content, /<b>Pools<\/b>/);
    assert.match(calls[0].content, /&lt;img src=x/);
    assert.match(calls[0].content, /&lt;b&gt;Pools/);
});

test("a title renders as a heading and is omitted when absent", async () => {
    const { dialogs, calls } = host();
    await dialogs.confirmDialog("Question", { title: DEFAULT_DIALOG_TITLE });
    assert.match(calls[0].content, /<h3 class="qig-dialog-title">Quick Image Gen<\/h3>/);
    await dialogs.confirmDialog("Question");
    assert.doesNotMatch(calls[1].content, /qig-dialog-title/);
});

test("custom button labels reach the popup options", async () => {
    const { dialogs, calls } = host();
    await dialogs.confirmDialog("Overwrite?", { okButton: "Overwrite", cancelButton: "Keep" });
    assert.equal(calls[0].options.okButton, "Overwrite");
    assert.equal(calls[0].options.cancelButton, "Keep");
});

test("message dialog uses the text popup and hides the cancel button", async () => {
    const { dialogs, calls } = host();
    await dialogs.messageDialog("Scan report\nline two");
    assert.equal(calls[0].type, POPUP_TYPE.TEXT);
    assert.equal(calls[0].options.cancelButton, false);
    assert.match(calls[0].content, /line two/);
});

test("without a usable popup API both dialogs fall back to the browser equivalents", async () => {
    const seen = [];
    const dialogs = createDialogHost({
        callGenericPopup: null,
        nativeConfirm: (message) => { seen.push(["confirm", message]); return true; },
        nativeAlert: (message) => { seen.push(["alert", message]); },
    });
    assert.equal(dialogs.supportsPopup(), false);
    assert.equal(await dialogs.confirmDialog("Proceed?"), true);
    await dialogs.messageDialog("Notice");
    assert.deepEqual(seen, [["confirm", "Proceed?"], ["alert", "Notice"]]);
});

test("a popup that throws falls back to the browser dialog and reports the error", async () => {
    const errors = [];
    const seen = [];
    const dialogs = createDialogHost({
        callGenericPopup: () => Promise.reject(new Error("popup layer detached")),
        popupType: POPUP_TYPE,
        popupResult: POPUP_RESULT,
        nativeConfirm: (message) => { seen.push(message); return true; },
        nativeAlert: (message) => { seen.push(message); },
        onError: (error) => errors.push(error.message),
    });
    assert.equal(await dialogs.confirmDialog("Proceed?"), true);
    await dialogs.messageDialog("Notice");
    assert.deepEqual(seen, ["Proceed?", "Notice"]);
    assert.deepEqual(errors, ["popup layer detached", "popup layer detached"]);
});

test("a popup failure with no browser fallback refuses the action instead of assuming yes", async () => {
    const dialogs = createDialogHost({
        callGenericPopup: () => Promise.reject(new Error("no layer")),
        popupType: POPUP_TYPE,
        popupResult: POPUP_RESULT,
    });
    assert.equal(await dialogs.confirmDialog("Delete everything?"), false);
});

test("input dialog passes the default value through and returns the entered text", async () => {
    const { dialogs, calls } = host({ callGenericPopup: (...args) => { calls.push(args); return Promise.resolve("Sunsets"); } });
    assert.equal(await dialogs.inputDialog("Folder name", { defaultValue: "Untitled" }), "Sunsets");
    assert.equal(calls[0][1], POPUP_TYPE.INPUT);
    assert.equal(calls[0][2], "Untitled");
});

test("input dialog keeps a deliberate empty answer distinct from a dismissal", async () => {
    const empty = createDialogHost({ callGenericPopup: () => Promise.resolve(""), popupType: POPUP_TYPE, popupResult: POPUP_RESULT, escapeHtml });
    assert.equal(await empty.inputDialog("Description"), "");
    for (const dismissed of [false, null, undefined]) {
        const cancelled = createDialogHost({ callGenericPopup: () => Promise.resolve(dismissed), popupType: POPUP_TYPE, popupResult: POPUP_RESULT, escapeHtml });
        assert.equal(await cancelled.inputDialog("Description"), null, `result ${String(dismissed)} must read as cancelled`);
    }
});

test("input dialog falls back to the browser prompt with its default value", async () => {
    const seen = [];
    const dialogs = createDialogHost({ nativePrompt: (message, value) => { seen.push([message, value]); return "typed"; } });
    assert.equal(await dialogs.inputDialog("Preset name", { defaultValue: "Default" }), "typed");
    assert.deepEqual(seen, [["Preset name", "Default"]]);
});

test("choice dialog offers buttons and maps the result back to an option index", async () => {
    const { dialogs, calls } = host({ callGenericPopup: (...args) => { calls.push(args); return Promise.resolve(3); } });
    assert.equal(await dialogs.choiceDialog("Clear which filters?", ["All", "Global only", "This card"]), 1);
    assert.deepEqual(calls[0][3].customButtons, ["All", "Global only", "This card"]);
    assert.equal(calls[0][3].okButton, false);
});

test("choice dialog treats cancel and out-of-range results as no choice", async () => {
    for (const result of [POPUP_RESULT.CANCELLED, POPUP_RESULT.NEGATIVE, 99]) {
        const dialogs = createDialogHost({ callGenericPopup: () => Promise.resolve(result), popupType: POPUP_TYPE, popupResult: POPUP_RESULT, escapeHtml });
        assert.equal(await dialogs.choiceDialog("Pick", ["A", "B"]), null, `result ${String(result)} must not pick an option`);
    }
});

test("choice dialog with no options resolves to no choice without opening a popup", async () => {
    const { dialogs, calls } = host();
    assert.equal(await dialogs.choiceDialog("Pick", []), null);
    assert.equal(calls.length, 0);
});

test("choice dialog falls back to a numbered browser prompt and validates the answer", async () => {
    const build = (answer) => createDialogHost({ nativePrompt: () => answer });
    assert.equal(await build("2").choiceDialog("Pick", ["A", "B", "C"]), 1);
    assert.equal(await build("1").choiceDialog("Pick", ["A", "B", "C"]), 0);
    for (const bad of ["0", "4", "banana", null]) {
        assert.equal(await build(bad).choiceDialog("Pick", ["A", "B", "C"]), null, `answer ${String(bad)} must not pick an option`);
    }
});

test("a partially loaded popup module is treated as unusable", async () => {
    const seen = [];
    const dialogs = createDialogHost({
        callGenericPopup: () => Promise.resolve(POPUP_RESULT.AFFIRMATIVE),
        popupType: { CONFIRM: 2 },
        popupResult: POPUP_RESULT,
        nativeConfirm: (message) => { seen.push(message); return false; },
    });
    assert.equal(dialogs.supportsPopup(), false);
    assert.equal(await dialogs.confirmDialog("Proceed?"), false);
    assert.deepEqual(seen, ["Proceed?"]);
});
