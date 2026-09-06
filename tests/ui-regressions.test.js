import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { nativePopupHost, PNG_BASE64, uiHarness } from "./helpers/ui-harness.js";

function key(h, target, keyName, modifiers = {}) {
    const event = new h.window.KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true, ...modifiers });
    target.dispatchEvent(event);
    return event;
}

test("cached windows keep paint order and focus without overriding the CSS viewport", async t => {
    const h = await uiHarness(t);
    const viewport = Object.assign(new h.window.EventTarget(), { height: 420, offsetTop: 12 });
    let viewportBindings = 0;
    viewport.addEventListener = () => { viewportBindings++; };
    Object.defineProperty(h.window, "visualViewport", { value: viewport, configurable: true });
    const launcher = h.document.querySelector(".qig-logs-btn");
    launcher.focus();
    launcher.click();
    const logs = h.document.getElementById("qig-logs-popup");
    assert.equal(logs.style.getPropertyValue("--qig-viewport-height"), "");
    logs.querySelector(".qig-close-btn").click();
    await delay(80);
    assert.equal(h.document.activeElement, launcher, "closed popup cannot regain focus from a queued task");
    viewport.height = 280;
    viewport.dispatchEvent(new h.window.Event("resize"));
    assert.equal(logs.style.getPropertyValue("--qig-viewport-height"), "");

    h.document.getElementById("qig-prompt-history-btn").click();
    launcher.click();
    await delay(80);
    assert.equal([...h.document.querySelectorAll(".qig-popup")].at(-1), logs, "reused window paints last");
    assert.equal(h.document.activeElement, logs.querySelector(".qig-popup-title"));
    assert.equal(logs.querySelector(".qig-resize-handle"), null, "logs have no non-functional resize control");
    assert.equal(viewportBindings, 0, "ordinary popups need no visualViewport listeners");
    key(h, h.document.activeElement, "Escape");
    assert.equal(logs.style.display, "none");
    assert.equal(h.document.activeElement.closest(".qig-popup")?.id, "qig-prompt-history-popup");

    h.document.getElementById("qig-plain-desc-btn").click();
    h.mod.teardownQuickImageGen();
    await delay(80);
    assert.equal(h.document.querySelector(".qig-popup, .qig-native-review, #qig-settings, #qig-status"), null);
});

test("history and paragraph picker have shrinkable scroll bodies and separate picker actions", async t => {
    const h = await uiHarness(t, {
        settings: { useLastMessage: true, enableParagraphPicker: true },
        context: { chat: [{ name: "Character", is_user: false, mes: Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: a fox beneath the trees.`).join("\n\n") }] },
    });
    const stylesheet = h.document.createElement("style");
    stylesheet.textContent = readFileSync(new URL("../style.css", import.meta.url), "utf8");
    h.document.head.append(stylesheet);
    h.document.getElementById("qig-prompt-history-btn").click();
    const history = h.document.getElementById("qig-prompt-history-content");
    assert.equal(h.window.getComputedStyle(history).overflowY, "auto");
    assert.equal(Number.parseFloat(h.window.getComputedStyle(history).minHeight), 0);
    h.document.querySelector("#qig-prompt-history-popup .qig-close-btn").click();

    h.document.getElementById("qig-generate-btn").click();
    const picker = await h.waitFor(() => h.document.getElementById("qig-paragraph-picker-popup"));
    const body = picker.querySelector(".qig-editor-body");
    const actions = picker.querySelector(".qig-dialog-actions");
    assert.equal(h.window.getComputedStyle(body).overflowY, "auto");
    assert.equal(Number.parseFloat(h.window.getComputedStyle(body).minHeight), 0);
    assert.equal(h.window.getComputedStyle(actions).flexShrink, "0");
    assert.equal(body.contains(actions), false);
    assert.ok(actions.contains(h.document.getElementById("qig-para-cancel")));
    assert.ok(actions.contains(h.document.getElementById("qig-para-use")));
    h.document.getElementById("qig-para-deselect-all").click();
    assert.equal(picker.querySelectorAll("input:checked").length, 0);
    h.document.getElementById("qig-para-select-all").click();
    assert.equal(picker.querySelectorAll("input:checked").length, 30);
    h.document.getElementById("qig-para-cancel").click();
    assert.equal(picker.style.display, "none");
});

test("a native dialog prevents delayed custom-window focus from taking over", async t => {
    const h = await uiHarness(t);
    h.document.querySelector(".qig-logs-btn").click();
    const native = h.document.createElement("dialog");
    native.setAttribute("open", "");
    const button = h.document.createElement("button");
    native.append(button);
    h.document.body.append(native);
    button.focus();
    await delay(80);
    assert.equal(h.document.activeElement, button);
    key(h, button, "Escape");
    assert.equal(h.document.getElementById("qig-logs-popup").style.display, "flex");
    native.remove();
});

test("settings search finds loose review and World Info fields and moved controls collapse", async t => {
    const h = await uiHarness(t);
    h.document.getElementById("qig-setup-toggle").click();
    const search = h.document.getElementById("qig-settings-search");
    for (const [query, id] of [["review", "qig-review-before-generate"], ["world info", "qig-use-world-info"]]) {
        search.value = query;
        h.fireEvent(search, "input");
        assert.equal(h.document.getElementById(id).closest("[hidden], .qig-search-hidden"), null, `${query} is visible, not just counted`);
        assert.doesNotMatch(h.document.getElementById("qig-settings-search-status").textContent, /^No settings/);
    }
    h.document.getElementById("qig-settings-search-clear").click();
    for (const [contentId, movedId] of [["qig-section-automation-content", "qig-delivery-settings"], ["qig-section-create-content", "qig-text-ai-routing"]]) {
        const content = h.document.getElementById(contentId);
        assert.ok(content.contains(h.document.getElementById(movedId)));
        assert.equal(content.hidden, true, "clearing search restores the saved collapsed section");
    }
});

test("Configuration and Prompting Tools keep the merged controls and labelled Sampling group", async t => {
    const h = await uiHarness(t);
    const select = h.document.getElementById("qig-config-select");
    assert.equal(select.labels[0].textContent, "Configuration");
    assert.ok(select.closest(".qig-essentials"));
    for (const [id, label] of [["qig-config-save", "Save As"], ["qig-config-update", "Update"], ["qig-config-del", "Delete"]]) {
        const button = h.document.getElementById(id);
        assert.equal(button.querySelector(".qig-sr-label").textContent, label, "icon control retains its accessible name");
        assert.equal(button.disabled, id !== "qig-config-save", "selection-dependent actions start disabled");
        assert.equal(typeof button.onclick, "function");
    }
    assert.equal(h.document.querySelector("#qig-save-preset, #qig-preset-select, .qig-preset-chip, #qig-profile-select"), null);
    assert.equal(h.document.getElementById("qig-input-btn").getAttribute("aria-label"), "Generate image; right-click for configurations");
    assert.equal(h.document.getElementById("qig-prompt-heading").textContent, "Prompting Tools");
    assert.ok(h.document.getElementById("qig-plain-desc-btn").closest("#qig-section-create-content"));
    const sampling = h.document.querySelector("#qig-output-settings .qig-sampling");
    assert.equal(sampling.querySelector("legend").textContent, "Sampling");
    for (const id of ["qig-sampler", "qig-a1111-scheduler", "qig-comfy-scheduler"]) {
        const control = h.document.getElementById(id);
        assert.ok(sampling.contains(control));
        assert.equal(control.labels.length, 1);
    }
    const search = h.document.getElementById("qig-settings-search");
    search.value = "kl_optimal";
    h.fireEvent(search, "input");
    assert.match(h.document.getElementById("qig-settings-search-status").textContent, /^No settings/, "the inactive backend's schedule is not a search result");
    assert.equal(h.document.getElementById("qig-comfy-scheduler-wrap").hidden, true);
});

test("cancelling an optional folder or context description keeps both name and description", async t => {
    const library = { version: 1, profiles: [{ id: "profile", label: "Scenes", folders: [{
        id: "folder", label: "Fighting", description: "Original folder description", media: [],
        subfolders: [{ id: "context", label: "Sparring", description: "Original context description", media: [] }],
    }] }], chatMap: {} };
    const h = await uiHarness(t, { settings: { _backupContextMedia: library } });
    for (const action of ["edit-folder", "edit-subfolder", "add-subfolder"]) {
        h.document.getElementById("qig-context-media-manage").click();
        const root = h.document.getElementById("qig-context-media-library");
        const answers = ["Changed name", null];
        globalThis.prompt = () => answers.shift();
        await root.onclick({ target: root.querySelector(`[data-action="${action}"]`) });
        h.document.querySelector("#qig-context-media-manager .qig-close-btn").click();
        h.document.getElementById("qig-context-media-manage").click();
        const text = h.document.getElementById("qig-context-media-library").textContent;
        assert.match(text, /Original folder description/);
        assert.match(text, /Original context description/);
        assert.doesNotMatch(text, /Changed name/);
    }
    const root = h.document.getElementById("qig-context-media-library");
    const addingLinks = root.onclick({ target: root.querySelector('[data-action="add-url"]') });
    const input = h.document.getElementById("qig-context-media-url-input");
    assert.equal(input.labels[0].textContent, "Direct media links");
    assert.equal(h.document.getElementById("qig-context-media-url-cancel").closest(".qig-editor-body"), null, "actions are outside the scrolling editor");
    h.document.getElementById("qig-context-media-url-cancel").click();
    await addingLinks;
});

test("filter moves, toggles, deletion and editor saves preserve accessible state and drafts", async t => {
    const poolId = "qig_pool_default_global";
    const filters = ["A", "B", "C"].map((name, index) => ({
        id: name, name, enabled: true, scope: "global", poolIds: [poolId],
        priority: 0, sortOrder: index, matchMode: "OR", keywords: "fox", positive: name, negative: "",
    }));
    const h = await uiHarness(t, { settings: { _backupContextualFilters: filters } });
    h.window.showContextualFilterManager();
    const rows = () => [...h.document.querySelectorAll(".qig-manager-row[data-filter-id]")].map(row => row.dataset.filterId);
    const move = h.document.querySelector('[data-qig-action="move-filter"][data-qig-id="A"][data-qig-value="down"]');
    assert.equal(h.document.querySelector('[data-qig-action="move-filter"][data-qig-id="A"][data-qig-value="up"]').disabled, true);
    move.focus();
    move.click();
    await h.waitFor(() => rows().join() === "B,A,C", 5000, "filter reordered");
    assert.equal(h.document.activeElement.dataset.qigAction, "move-filter");
    assert.equal(h.document.activeElement.dataset.qigId, "A");

    const toggle = h.document.querySelector(`[data-qig-action="toggle-pool"][data-qig-id="${poolId}"]`);
    toggle.focus();
    toggle.click();
    await h.waitFor(() => !toggle.isConnected, 5000, "pool controls rebuilt");
    assert.equal(h.document.activeElement.getAttribute("aria-pressed"), "false");
    assert.match(h.document.activeElement.getAttribute("aria-label"), /Default/);

    await h.window.deleteContextualFilter("B");
    assert.ok(rows().includes("B"), "dismissed confirmation preserves the filter");
    globalThis.confirm = () => true;
    await h.window.deleteContextualFilter("B");
    assert.ok(!rows().includes("B"));

    const editing = h.window.editContextualFilter("A");
    h.document.getElementById("qig-fd-positive").value = "kept after hiding";
    h.document.getElementById("qig-fd-save").click();
    await editing;
    const reopened = h.window.editContextualFilter("A");
    assert.equal(h.document.getElementById("qig-fd-positive").value, "kept after hiding", "hiding does not remove fields before the save caller reads them");
    h.document.getElementById("qig-fd-cancel").click();
    await reopened;
});

test("native review keeps edits literal, validates inline and submits only once with Cmd+Enter", async t => {
    const native = nativePopupHost();
    const requests = [];
    const h = await uiHarness(t, {
        context: native,
        settings: { reviewBeforeGenerate: true, disablePaletteButton: true },
        fetch: (url, init) => {
            if (!url.endsWith("/txt2img")) return Response.json({});
            requests.push(JSON.parse(init.body));
            return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }));
        },
    });
    const generate = h.document.getElementById("qig-generate-btn");
    generate.focus();
    generate.click();
    await h.waitFor(() => native.instances.length, 5000, "native final review");
    const popup = native.instances[0];
    assert.equal(popup.options.wider, true);
    assert.equal(popup.options.allowVerticalScrolling, true);
    assert.equal(popup.options.signal, undefined, "abort is bridged rather than passed to an unsupported native option");
    assert.equal(h.document.activeElement.id, "qig-review-title");
    assert.equal(h.document.querySelector('[aria-current="step"]').textContent, "Image prompt");
    assert.equal(generate.getAttribute("aria-label"), "Cancel");
    const positive = h.document.getElementById("qig-review-positive");
    const initial = positive.value;
    positive.value = "";
    h.document.getElementById("qig-review-primary").click();
    assert.equal(positive.getAttribute("aria-invalid"), "true");
    assert.equal(h.document.getElementById(positive.getAttribute("aria-describedby")).hidden, false);
    assert.equal(requests.length, 0);
    h.document.getElementById("qig-review-reset").click();
    assert.equal(positive.value, initial);
    assert.equal(positive.hasAttribute("aria-invalid"), false);

    positive.value = "fox </textarea><img id='prompt-injection'>";
    positive.focus();
    let bubbledEnter = 0;
    popup.dlg.addEventListener("keydown", () => { bubbledEnter++; });
    assert.equal(key(h, positive, "Enter").defaultPrevented, false, "ordinary Enter remains a newline");
    assert.equal(bubbledEnter, 0, "ordinary Enter cannot reach the host submit handler");
    assert.equal(h.document.getElementById("prompt-injection"), null);
    key(h, positive, "Enter", { metaKey: true });
    h.document.getElementById("qig-review-primary").click();
    await h.waitFor(() => requests.length, 5000, "approved image request");
    assert.equal(popup.closeCalls, 1);
    assert.match(requests[0].prompt, /prompt-injection/);
    assert.doesNotMatch(h.document.getElementById("qig-status").textContent, /Waiting for your review/);
    generate.click();
    await h.waitFor(() => generate.getAttribute("aria-label") === "Generate", 5000, "Cancel name restored");
});

test("native review cancellation and teardown send no image request", async t => {
    for (const dismiss of ["escape", "abort", "teardown"]) {
        const native = nativePopupHost();
        let requests = 0;
        const h = await uiHarness(t, {
            context: native, settings: { reviewBeforeGenerate: true },
            fetch: url => { if (url.endsWith("/txt2img")) requests++; return Response.json({}); },
        });
        h.document.getElementById("qig-generate-btn").click();
        await h.waitFor(() => native.instances.length, 5000, `${dismiss} review opened`);
        assert.equal(h.document.getElementById("qig-input-btn").getAttribute("aria-label"), "Cancel generation");
        if (dismiss === "escape") native.instances[0].dlg.dispatchEvent(new h.window.Event("cancel", { cancelable: true }));
        else if (dismiss === "abort") h.document.getElementById("qig-input-btn").click();
        else h.mod.teardownQuickImageGen();
        await h.waitFor(() => !h.document.querySelector(".qig-native-review"), 5000, `${dismiss} native lifecycle completed`);
        await delay(20);
        assert.equal(requests, 0);
        assert.notEqual(h.document.getElementById("qig-status")?.style.display, "block", "cancellation cannot restore a stale generating status");
        if (dismiss !== "teardown") assert.equal(h.document.getElementById("qig-input-btn").getAttribute("aria-label"), "Generate image; right-click for configurations");
        await h.dispose();
    }
});

test("Text AI review resets prefill and reruns the approved request without a second request editor", async t => {
    const native = nativePopupHost();
    const llmRequests = [];
    const h = await uiHarness(t, {
        context: native, settings: { useLLMPrompt: true, reviewBeforeGenerate: true, llmPrefill: "Image prompt:" },
        host: { generateRawData: async request => { llmRequests.push(request); return "a fox under a tree"; } },
    });
    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => h.document.getElementById("qig-review-text"), 5000, "Text AI request review");
    const request = h.document.getElementById("qig-review-text");
    const prefill = h.document.getElementById("qig-review-prefill");
    const initialPrefill = prefill.value;
    prefill.value = "edited";
    h.document.getElementById("qig-review-reset").click();
    assert.equal(prefill.value, initialPrefill);
    request.value = "Describe one fox.";
    key(h, request, "Enter", { ctrlKey: true });
    await h.waitFor(() => h.document.getElementById("qig-review-positive"), 5000, "final image prompt review");
    h.document.getElementById("qig-review-back").click();
    await h.waitFor(() => llmRequests.length === 2 && h.document.getElementById("qig-review-positive"), 5000, "Text AI rerun");
    assert.equal(llmRequests[0].prompt, "Describe one fox.");
    assert.equal(llmRequests[1].prompt, "Describe one fox.");
    assert.equal(native.instances.length, 3, "request, final, then final again");
    h.document.getElementById("qig-review-cancel").click();
});

test("batch navigation retains per-image prompt drafts and Reset only resets the selected image", async t => {
    const h = await uiHarness(t, {
        settings: { batchCount: 2 },
        fetch: url => Response.json(url.endsWith("/txt2img") ? { images: [PNG_BASE64] } : {}),
    });
    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => h.document.getElementById("qig-batch-popup"), 10000, "batch result viewer");
    const prompt = h.document.getElementById("qig-batch-preview-prompt");
    const negative = h.document.getElementById("qig-batch-preview-negative");
    const original = prompt.value;
    prompt.value = "first draft";
    negative.value = "first negative";
    h.document.getElementById("qig-batch-next").click();
    prompt.value = "second draft";
    h.document.getElementById("qig-batch-prev").click();
    assert.equal(prompt.value, "first draft");
    assert.equal(negative.value, "first negative");
    h.document.getElementById("qig-batch-reset-prompt").click();
    assert.equal(prompt.value, original);
    h.document.getElementById("qig-batch-next").click();
    assert.equal(prompt.value, "second draft");
    h.document.getElementById("qig-batch-prev").click();
    assert.equal(prompt.value, original);
});

test("configuration controls retain status reuse, selection state and destructive confirmations after Quick Setup", async t => {
    const h = await uiHarness(t);
    const configurationCount = () => h.document.getElementById("qig-config-select").options.length - 1;
    const initialCount = configurationCount();
    let configurationNumber = 0;
    globalThis.prompt = () => `UI configuration ${++configurationNumber}`;
    await h.document.getElementById("qig-config-save").onclick();
    const status = h.document.getElementById("qig-status");
    assert.ok(status);
    assert.equal(configurationCount(), initialCount + 1);
    const firstId = h.document.getElementById("qig-config-select").value;
    assert.ok(firstId);
    h.document.querySelector(".qig-wizard-btn").click();
    const provider = h.document.getElementById("qig-wizard-provider");
    provider.value = "pollinations";
    h.fireEvent(provider, "change");
    h.document.getElementById("qig-wizard-save").click();
    assert.equal(h.document.getElementById("qig-provider").value, "pollinations");
    await h.document.getElementById("qig-config-save").onclick();
    assert.equal(configurationCount(), initialCount + 2);
    assert.equal(h.document.querySelectorAll("#qig-status").length, 1);
    assert.equal(h.document.getElementById("qig-status"), status);
    const select = h.document.getElementById("qig-config-select");
    assert.notEqual(select.value, firstId);
    assert.match(select.selectedOptions[0].textContent, /UI configuration 2.*Pollinations/);
    const deleteButton = h.document.getElementById("qig-config-del");
    const updateButton = h.document.getElementById("qig-config-update");
    assert.equal(deleteButton.disabled, false);
    assert.equal(updateButton.disabled, false);
    const questions = [];
    globalThis.confirm = message => { questions.push(message); return false; };
    await updateButton.onclick();
    assert.match(questions.at(-1), /Overwrite "UI configuration 2"/);
    await deleteButton.onclick();
    assert.match(questions.at(-1), /Delete configuration "UI configuration 2"/);
    assert.equal(configurationCount(), initialCount + 2, "dismissal preserves the selected configuration");
    globalThis.confirm = () => true;
    await deleteButton.onclick();
    assert.equal(configurationCount(), initialCount + 1);
    assert.equal(select.value, "");
    assert.equal(deleteButton.disabled, true);
    assert.equal(updateButton.disabled, true);
});
