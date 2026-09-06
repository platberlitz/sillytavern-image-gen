import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { nativePopupHost, PNG_BASE64, uiHarness } from "./helpers/ui-harness.js";

async function reviewHarness(t, { settings = {}, host = {}, context = {} } = {}) {
    const native = nativePopupHost();
    const commands = new Map();
    const images = [];
    const requests = [];
    const h = await uiHarness(t, {
        settings: { useLLMPrompt: true, llmPrefill: "Image prompt:", ...settings },
        context: { ...native, ...context },
        host: {
            generateRawData: async request => { requests.push(request); return "a fox beneath the trees"; },
            checkWorldInfo: async () => ({ worldInfoBefore: "Foxes have silver tails." }),
            saveBase64AsFile: async () => "/user/images/qig/review.png",
            addSlashCommand: command => commands.set(command.name, command),
            ...host,
        },
        fetch: (url, init) => {
            if (!url.endsWith("/txt2img")) return Response.json({});
            images.push(JSON.parse(init.body));
            return Response.json({ images: [PNG_BASE64] });
        },
    });
    return Object.assign(h, {
        native, images, requests,
        generate: (args = {}, prompt = "") => commands.get("qig").callback({ mode: "direct", ...args }, prompt),
        setReview(value) {
            const checkbox = h.document.getElementById("qig-review-before-generate");
            checkbox.checked = value;
            h.fireEvent(checkbox, "input");
        },
        async loadConfiguration(id) {
            const select = h.document.getElementById("qig-config-select");
            select.value = id;
            h.fireEvent(select, "change");
            await h.waitFor(() => h.host.extension_settings["quick-image-gen"].lastLoadedPresetId === id, 5000, `loaded configuration ${id}`);
        },
    });
}

test("main Text AI sends default strings or explicit role arrays with one whole expanded template", async t => {
    for (const role of ["default", "user", "system"]) {
        const h = await reviewHarness(t, {
            settings: {
                llmRequestRole: role, llmPromptStyle: "custom", preserveCharacterIdentity: false,
                llmAddQuality: false, llmAddLighting: false, llmAddArtist: false,
                llmCustomInstruction: "Rules for {{char}} and {{user}}\nSelected: {{scene}}\nOutput exactly one description.",
            },
            context: { characterId: 0, characters: [{ name: "Alice" }], name2: "Alice" },
        });
        const pending = h.generate();
        await h.waitFor(() => h.images.length, 5000, `${role} image submission`);
        await pending;
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        const prompt = role === "default" ? request.prompt : request.prompt[0].content;
        assert.equal(prompt.replace(/^\[\d+\]\n/, ""), "Rules for Alice and User\nSelected: a red fox\nOutput exactly one description.");
        if (role !== "default") assert.deepEqual(request.prompt, [{ role, content: prompt }]);
        assert.equal(request.prefill, "Image prompt:");
        assert.equal(h.native.instances.length, 0);
        assert.equal(Object.hasOwn(h.host.extension_settings["quick-image-gen"], "__qigReviewDisableRevision"), false);
        await h.dispose();
    }
});

test("separate AI keeps history and prefill roles around the selected request role", async t => {
    for (const role of ["default", "user", "system"]) {
        const sent = [];
        const h = await reviewHarness(t, {
            settings: { llmRequestRole: role, llmOverrideEnabled: true, llmOverrideProfileId: "separate", llmOverrideChatDepth: 2 },
            context: {
                chat: [{ name: "User", is_user: true, mes: "Hello" }, { name: "Character", mes: "Welcome" }],
                ConnectionManagerRequestService: {
                    getSupportedProfiles: () => [{ id: "separate", name: "Separate" }],
                    sendRequest: async (_profile, messages) => { sent.push(messages); return "a silver fox"; },
                },
            },
        });
        const pending = h.generate();
        await h.waitFor(() => h.images.length);
        await pending;
        assert.equal(h.requests.length, 0, "separate AI never falls back to the main AI");
        assert.equal(sent.length, 1);
        const messages = sent[0];
        const requestIndex = role === "system" ? 0 : 2;
        assert.equal(messages[requestIndex].role, role === "system" ? "system" : "user");
        assert.match(messages[requestIndex].content, /a red fox/);
        assert.deepEqual(messages.filter((_, index) => index !== requestIndex), [
            { role: "user", content: "User: Hello" },
            { role: "assistant", content: "Character: Welcome" },
            { role: "assistant", content: "Image prompt:" },
        ]);
        await h.dispose();
    }
});

test("persisted malformed roles and legacy presets migrate to configuration defaults without rewriting legacy copies", async t => {
    for (const persistedRole of [undefined, "assistant"]) {
        const presets = [
            { id: "old", name: "Old" }, { id: "bad", name: "Bad", llmRequestRole: "assistant" },
            ...["default", "user", "system"].map(role => ({ id: role, name: role, llmRequestRole: role })),
        ];
        const h = await reviewHarness(t, {
            settings: {
                llmRequestRole: persistedRole,
                _backupGenPresets: structuredClone(presets),
            },
        });
        const settings = h.host.extension_settings["quick-image-gen"];
        assert.equal(settings.llmRequestRole, "default");
        for (const id of ["user", "old", "system", "bad", "default"]) {
            await h.loadConfiguration(id);
            assert.equal(settings.llmRequestRole, ["old", "bad"].includes(id) ? "default" : id);
            assert.equal(h.document.getElementById("qig-llm-request-role").value, settings.llmRequestRole);
        }
        assert.deepEqual(settings._backupGenPresets, presets);
        assert.equal(h.localStorage.getItem("qig_gen_presets"), null, "an absent legacy cache is not recreated");
        await h.dispose();
    }
});

test("legacy profiles and workflows gain default roles rather than inheriting the active system role", async t => {
    const profiles = { local: { Old: { localType: "a1111" }, Invalid: { localType: "a1111", llmRequestRole: "assistant" } } };
    const workflows = [{ id: "workflow", name: "Workflow", comfyModel: "old-model" }];
    const h = await reviewHarness(t, {
        settings: { llmRequestRole: "system", _backupProfiles: structuredClone(profiles), _backupComfyWorkflows: structuredClone(workflows) },
    });
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.equal(settings.llmRequestRole, "system", "migration leaves the active choice alone");
    assert.equal(settings._backupConfigurations.length, 3);
    for (const record of settings._backupConfigurations) assert.equal(record.llmRequestRole, "default", record.name);
    assert.deepEqual(settings._backupProfiles, profiles);
    assert.deepEqual(settings._backupComfyWorkflows, workflows);
});

test("configuration role survives Save As, Update, Load and the export/import round trip", async t => {
    const h = await reviewHarness(t, {
        settings: {
            llmRequestRole: "system",
            _backupConfigurations: [
                { id: "old", name: "Old configuration", provider: "local" },
                { id: "invalid", name: "Invalid configuration", provider: "local", llmRequestRole: "assistant" },
            ],
        },
    });
    const settings = h.host.extension_settings["quick-image-gen"];
    for (const id of ["old", "invalid"]) {
        await h.loadConfiguration(id);
        assert.equal(settings.llmRequestRole, "default");
        assert.equal(h.document.getElementById("qig-llm-request-role").value, "default");
    }
    const role = h.document.getElementById("qig-llm-request-role");
    role.value = "system";
    h.fireEvent(role, "input");
    globalThis.prompt = () => "Saved role";
    await h.document.getElementById("qig-config-save").onclick();
    const saved = settings._backupConfigurations.find(record => record.name === "Saved role");
    assert.equal(saved.llmRequestRole, "system");
    await h.loadConfiguration("old");
    await h.loadConfiguration(saved.id);
    assert.equal(settings.llmRequestRole, "system");

    role.value = "user";
    h.fireEvent(role, "input");
    assert.equal(settings.lastLoadedPresetId, saved.id, "editing keeps the configuration selected");
    globalThis.confirm = () => true;
    await h.document.getElementById("qig-config-update").onclick();
    assert.equal(settings._backupConfigurations.find(record => record.id === saved.id).llmRequestRole, "user");
    await h.loadConfiguration("old");
    await h.loadConfiguration(saved.id);
    assert.equal(settings.llmRequestRole, "user");

    let exportedBlob;
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = blob => { exportedBlob = blob; return "blob:role-export"; };
    t.mock.method(h.window.HTMLAnchorElement.prototype, "click", () => {});
    try {
        h.document.getElementById("qig-export-btn").click();
    } finally {
        URL.createObjectURL = createObjectURL;
    }
    const exported = JSON.parse(await exportedBlob.text());
    assert.equal(exported.activeSettings.llmRequestRole, "user");
    assert.equal(exported.generationPresets.find(record => record.id === saved.id).llmRequestRole, "user");
    assert.doesNotMatch(JSON.stringify(exported), /__qigReviewDisableRevision/);
    exported.generationPresets.find(record => record.id === saved.id).llmRequestRole = "system";
    exported.generationPresets.push({ id: "import-invalid", name: "Imported invalid", provider: "local", llmRequestRole: "assistant" });
    exported.generationPresets.push({ id: "import-old", name: "Imported old", provider: "local", llmEditPrompt: true });
    let fileInput;
    const inputClick = t.mock.method(h.window.HTMLInputElement.prototype, "click", function () { if (this.type === "file") fileInput = this; });
    h.document.getElementById("qig-import-btn").click();
    inputClick.mock.restore();
    await fileInput.onchange({ target: { files: [new Blob([JSON.stringify(exported)], { type: "application/json" })] } });
    assert.ok(h.toastrCalls.some(call => call.message === "Settings imported successfully"));
    for (const id of ["import-invalid", "import-old", saved.id]) {
        await h.loadConfiguration(id);
        assert.equal(settings.llmRequestRole, id === saved.id ? "system" : "default");
    }
    assert.equal(settings._backupConfigurations.find(record => record.id === "import-old").reviewBeforeGenerate, true);
});

test("raw empty replies and failures never replay or use quiet fallback, incompatible roles fail before submission", async t => {
    for (const route of ["data-empty", "data-error", "raw-empty", "raw-error", "unsupported-user", "unsupported-system", "legacy-default"]) {
        const calls = [];
        const h = await reviewHarness(t, {
            settings: { llmRequestRole: route === "legacy-default" ? "default" : route.endsWith("user") ? "user" : "system" },
            host: {
                generateRawData: route.startsWith("data") ? async () => { calls.push("data"); if (route.endsWith("error")) throw new Error("failed once"); return ""; } : undefined,
                generateRaw: route.startsWith("unsupported") || route === "legacy-default" ? undefined : async () => { calls.push("raw"); if (route.endsWith("error")) throw new Error("failed once"); return ""; },
                generateQuietPrompt: async () => { calls.push("quiet"); return "a fox"; },
            },
        });
        const pending = h.generate();
        await h.waitFor(() => h.images.length);
        await pending;
        assert.deepEqual(calls, route.startsWith("unsupported") ? [] : [route === "legacy-default" ? "quiet" : route.split("-")[0]]);
        if (route.startsWith("unsupported")) assert.ok(h.toastrCalls.some(call => /cannot send an explicit Text AI message role/.test(call.message)));
        await h.dispose();
    }
});

test("World Info follows review on/off and quiet runs never open a review", async t => {
    for (const mode of ["off", "on", "quiet"]) {
        let classifiers = 0;
        const h = await reviewHarness(t, {
            settings: {
                useWorldInfo: true, reviewBeforeGenerate: mode !== "off",
                _backupContextualFilters: [{
                    id: "fox", name: "Fox", description: "A fox is visible", enabled: true,
                    scope: "global", poolIds: ["qig_pool_default_global"], matchMode: "LLM", positive: "silver tail",
                }],
            },
            host: { generateQuietPrompt: async () => { classifiers++; return "1"; } },
        });
        const pending = h.generate(mode === "quiet" ? { quiet: "true" } : {}, "a red fox");
        if (mode === "on") {
            await h.waitFor(() => h.document.getElementById("qig-review-text"));
            assert.match(h.document.getElementById("qig-review-text").value, /Foxes have silver tails/);
            h.document.getElementById("qig-review-primary").click();
            await h.waitFor(() => h.document.getElementById("qig-review-title")?.textContent === "Review Contextual Filter Request");
            h.document.getElementById("qig-review-primary").click();
            await h.waitFor(() => h.document.getElementById("qig-review-positive"));
            h.document.getElementById("qig-review-primary").click();
        }
        await h.waitFor(() => h.images.length);
        const result = await pending;
        assert.match(h.requests[0].prompt, /Foxes have silver tails/);
        assert.equal(classifiers, 1);
        assert.equal(h.native.instances.length, mode === "on" ? 3 : 0);
        if (mode === "quiet") assert.equal(result, "/user/images/qig/review.png");
        await h.dispose();
    }
});

test("missing-tag requests use the chosen role and World Info without forcing review", async t => {
    for (const review of [false, true]) {
        const taggedRequests = [];
        const h = await reviewHarness(t, {
            settings: { useLLMPrompt: false, useWorldInfo: true, reviewBeforeGenerate: review, llmRequestRole: "system" },
            host: { generateRaw: async request => { taggedRequests.push(request); return "<image>a silver fox</image>"; } },
        });
        const pending = h.generate({ mode: "inject" });
        if (review) {
            await h.waitFor(() => h.document.getElementById("qig-review-title")?.textContent === "Review Image Tag Request");
            h.document.getElementById("qig-review-primary").click();
            await h.waitFor(() => h.document.getElementById("qig-review-positive"));
            h.document.getElementById("qig-review-primary").click();
        }
        await h.waitFor(() => h.images.length);
        await pending;
        assert.equal(taggedRequests.length, 1);
        assert.equal(taggedRequests[0].prompt.length, 1);
        assert.equal(taggedRequests[0].prompt[0].role, "system");
        assert.match(taggedRequests[0].prompt[0].content, /Foxes have silver tails/);
        assert.equal(h.native.instances.length, review ? 2 : 0);
        await h.dispose();
    }
});

test("off/on during a pending Text AI reply suppresses its unopened final review", async t => {
    let release;
    const h = await reviewHarness(t, {
        settings: { reviewBeforeGenerate: true },
        host: { generateRawData: () => new Promise(resolve => { release = resolve; }) },
    });
    const pending = h.generate();
    await h.waitFor(() => h.document.getElementById("qig-review-text"));
    h.document.getElementById("qig-review-primary").click();
    await h.waitFor(() => release);
    h.setReview(false);
    h.setReview(true);
    release("a silver fox");
    await h.waitFor(() => h.images.length);
    await pending;
    assert.equal(h.native.instances.length, 1);
});

test("rapid configuration off/on with a character override retains the open editor and suppresses later reviews", async t => {
    const h = await reviewHarness(t, {
        settings: {
            reviewBeforeGenerate: true, llmRequestRole: "system",
            _backupCharSettings: { "card:alice.png": { prompt: "character fox" } },
            _backupConfigurations: [false, true].map(review => ({
                id: review ? "on" : "off", name: review ? "On" : "Off", provider: "local", localType: "a1111",
                reviewBeforeGenerate: review, llmRequestRole: "user", useLLMPrompt: true,
            })),
        },
        context: { characterId: "alice", characters: { alice: { name: "Alice", avatar: "alice.png" } }, name2: "Alice" },
    });
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.equal(settings.prompt, "character fox", "the character override is active");
    const pending = h.generate();
    await h.waitFor(() => h.document.getElementById("qig-review-text"));
    const editor = h.document.getElementById("qig-review-text");
    editor.value = "Keep this exact approved request.";
    const select = h.document.getElementById("qig-config-select");
    for (const id of ["off", "on"]) {
        select.value = id;
        h.fireEvent(select, "change");
    }
    await h.waitFor(() => settings.lastLoadedPresetId === "on");
    assert.equal(settings.llmRequestRole, "user");
    assert.equal(settings.reviewBeforeGenerate, true);
    assert.equal(editor.isConnected, true);
    assert.equal(editor.value, "Keep this exact approved request.");
    assert.equal(h.requests.length, 0);
    h.document.getElementById("qig-review-primary").click();
    await h.waitFor(() => h.images.length);
    await pending;
    assert.equal(h.native.instances.length, 1);
    assert.deepEqual(h.requests[0].prompt, [{ role: "system", content: "Keep this exact approved request." }], "the active request keeps its captured role");
});

test("queued direct and tagged runs cannot regain review after checkbox or configuration off/on", async t => {
    for (const injectEnabled of [false, true]) {
        for (const change of ["checkbox", "configuration"]) {
            const h = await reviewHarness(t, {
                settings: {
                    autoGenerate: true, autoGenerateDelayMs: 150, reviewBeforeGenerate: true, injectEnabled,
                    _backupConfigurations: [false, true].map(review => ({
                        id: review ? "on" : "off", name: review ? "On" : "Off", provider: "local", localType: "a1111",
                        reviewBeforeGenerate: review, useLLMPrompt: true, injectEnabled,
                    })),
                },
                context: { chat: [{ name: "Character", mes: "<image>a red fox</image>" }] },
            });
            h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, 0);
            if (change === "checkbox") {
                h.setReview(false); h.setReview(false); h.setReview(true);
                await h.waitFor(() => h.images.length, 5000, `queued ${injectEnabled ? "tagged" : "direct"} image`);
                await h.waitFor(() => h.document.getElementById("qig-input-btn").getAttribute("aria-label").startsWith("Generate image"));
            } else {
                await h.loadConfiguration("off");
                await h.loadConfiguration("off");
                await h.loadConfiguration("on");
                await delay(250);
                assert.equal(h.images.length, 0, "loading a configuration cancels the old queued job");
                assert.equal(h.requests.length, 0);
            }
            assert.equal(h.native.instances.length, 0);
            assert.equal(h.host.extension_settings["quick-image-gen"].reviewBeforeGenerate, true);
            const fresh = h.generate();
            await h.waitFor(() => h.document.getElementById("qig-review-text"), 5000, "new run reviews again");
            h.document.getElementById("qig-review-cancel").click();
            await fresh;
            await h.dispose();
        }
    }
});

test("turning review on while queued or during a request applies only to subsequent runs", async t => {
    for (const queued of [false, true]) {
        let release;
        const h = await reviewHarness(t, {
            settings: { autoGenerate: queued, autoGenerateDelayMs: 100, reviewBeforeGenerate: false },
            context: { chat: [{ name: "Character", mes: "a fox" }] },
            host: { generateRawData: () => new Promise(resolve => { release = resolve; }) },
        });
        const pending = queued ? null : h.generate();
        if (queued) h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, 0);
        else await h.waitFor(() => release);
        h.setReview(true);
        await h.waitFor(() => release);
        release("a fox");
        await h.waitFor(() => h.images.length);
        await pending;
        await h.waitFor(() => h.document.getElementById("qig-generate-btn").getAttribute("aria-label") === "Generate");
        assert.equal(h.native.instances.length, 0);
        await h.dispose();
    }
});

test("off/on retains each open editor and suppresses every later active review stage", async t => {
    const titles = ["Review Scene Summary Request", "Review Scene Summary", "Review Image Prompt Request", "Review Image Prompt"];
    for (let stopAt = 0; stopAt < titles.length; stopAt++) {
        const h = await reviewHarness(t, {
            settings: { useLastMessage: true, twoStepPrompt: true, reviewBeforeGenerate: true, useWorldInfo: true, llmRequestRole: "system" },
            context: { chat: [{ name: "Character", mes: "a fox" }] },
        });
        const pending = h.generate();
        for (let stage = 0; stage <= stopAt; stage++) {
            await h.waitFor(() => h.document.getElementById("qig-review-title")?.textContent === titles[stage], 5000, titles[stage]);
            if (stage < stopAt) h.document.getElementById("qig-review-primary").click();
        }
        const editor = h.document.querySelector("#qig-review-text, #qig-review-positive");
        editor.value = "edited silver fox";
        h.setReview(false);
        h.setReview(true);
        await delay(30);
        assert.equal(editor.isConnected, true, "off/on must not dismiss or submit the open editor");
        assert.equal(editor.value, "edited silver fox");
        assert.equal(h.images.length, 0);
        h.document.getElementById("qig-review-primary").click();
        await h.waitFor(() => h.images.length);
        await pending;
        assert.equal(h.native.instances.length, stopAt + 1);
        assert.equal(h.requests.length, 2);
        assert.ok(h.requests.every(request => request.prompt.length === 1 && request.prompt[0].role === "system"));
        if (stopAt === 0 || stopAt === 2) assert.equal(h.requests[stopAt === 0 ? 0 : 1].prompt[0].content, "edited silver fox");
        if (stopAt === 1) assert.match(h.requests[1].prompt[0].content, /edited silver fox/);
        if (stopAt === 3) assert.equal(h.images[0].prompt, "edited silver fox");
        await h.dispose();
    }
});
