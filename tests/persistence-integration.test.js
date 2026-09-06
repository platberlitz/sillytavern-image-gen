import assert from "node:assert/strict";
import test from "node:test";
import { createQigHarness } from "./helpers/qig-harness.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let harnessId = 0;

async function persistenceHarness(t, { legacy = false, settings = {}, message = {} } = {}) {
    const commands = new Map();
    const owner = `persistence-${++harnessId}`;
    const context = {
        chat: [{ name: "A", mes: "a scene", is_user: false, extra: { image: "/original.png", title: "Original", inline_image: false }, ...message }],
        chatId: "chat-a",
        characterId: 0,
        characters: [{ name: "A", avatar: "a.png", chat: "chat-a" }],
        groupId: null,
        name1: "User",
        name2: "A",
        chatMetadata: { integrity: "chat-a", custom_background: "old-css", chat_backgrounds: ["/old.png"] },
        powerUserSettings: {},
        chatCompletionSettings: {},
        persona: {},
        getPresetManager: () => null,
        getCurrentChatId: () => context.chatId,
    };
    const state = {
        failChat: false,
        failMetadata: false,
        failSettings: false,
        chatSaves: 0,
        chatSaveSnapshots: [],
        metadataSaves: 0,
        settingsSaves: 0,
        readbacks: [],
        durableChat: structuredClone(context.chat),
        durableMetadata: structuredClone(context.chatMetadata),
        durableSettings: {},
        afterChatSave: null,
        afterSettingsSave: null,
    };
    context.saveChat = async () => {
        state.chatSaves++;
        state.chatSaveSnapshots.push(structuredClone(context.chat));
        if (!state.failChat) {
            state.durableChat = JSON.parse(JSON.stringify(context.chat));
            state.durableMetadata = JSON.parse(JSON.stringify(context.chatMetadata));
        }
        await state.afterChatSave?.();
        // Baseline ST returns undefined on both success and swallowed failure.
    };
    context.saveMetadata = async () => {
        state.metadataSaves++;
        if (!state.failMetadata) state.durableMetadata = structuredClone(context.chatMetadata);
    };
    if (!legacy) context.appendMediaToMessage = () => {};

    const h = await createQigHarness({
        host: {
            getContext: () => ({ ...context }),
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: owner,
                    setupWizardSeen: true,
                    provider: "pollinations",
                    autoInsert: false,
                    saveToServer: false,
                    saveToServerEmbedMetadata: false,
                    useLastMessage: false,
                    useLLMPrompt: false,
                    confirmBeforeGenerate: false,
                    reviewBeforeGenerate: false,
                    prompt: "a red fox",
                    ...settings,
                },
            },
            saveSettings: async () => {
                const host = globalThis.__QIG_TEST_HOST__;
                state.settingsSaves++;
                if (!state.failSettings) state.durableSettings = structuredClone(host.extension_settings);
                // On failure this models a different save's uncorrelated event.
                host.eventSource.emit(host.eventTypes.SETTINGS_UPDATED);
                await state.afterSettingsSave?.();
            },
            getRequestHeaders: () => ({ "Content-Type": "application/json" }),
            saveBase64AsFile: async () => "/user/images/qig/result.png",
            addSlashCommand: command => commands.set(command.name, command),
            POPUP_TYPE: { CONFIRM: 1, TEXT: 2, INPUT: 3 },
            POPUP_RESULT: { AFFIRMATIVE: 1 },
            callGenericPopup: async (_content, type) => type === 3 ? "Saved profile" : 1,
        },
        localStorage: { qig_sync_cache_id: owner },
        fetch: async (url, init) => {
            if (url === "/api/settings/get") {
                assert.equal(init.method, "POST");
                return Response.json({ settings: JSON.stringify({ extension_settings: state.durableSettings }) });
            }
            if (url === "/api/chats/get") {
                state.readbacks.push(JSON.parse(init.body));
                assert.deepEqual(JSON.parse(init.body), { ch_name: "A", file_name: "chat-a", avatar_url: "a.png" });
                return Response.json([{ user_name: "User", character_name: "A", create_date: "host timestamp", chat_metadata: state.durableMetadata }, ...state.durableChat]);
            }
            if (/^(?:blob:|data:)/.test(String(url)) || String(url).includes("image.pollinations.ai")) {
                return new Response(PNG, { headers: { "Content-Type": "image/png" } });
            }
            throw new Error(`Unexpected request: ${url}`);
        },
    });
    t.after(() => h.dispose());
    h.imageResponder(() => true, { width: 8, height: 8 });
    const element = h.document.createElement("div");
    element.className = "mes";
    element.setAttribute("mesid", "0");
    h.document.getElementById("chat").appendChild(element);

    return {
        h,
        context,
        state,
        settings: h.host.extension_settings["quick-image-gen"],
        async showResult() {
            const result = await commands.get("qig").callback({ mode: "direct" }, "a red fox");
            assert.doesNotMatch(String(result), /QIG failed:/);
            await h.waitFor(() => h.document.getElementById("qig-insert-btn"), 5000, "result actions");
        },
        click: id => h.document.getElementById(id).onclick(new h.window.MouseEvent("click")),
        inject: () => commands.get("qig").callback({ mode: "inject" }),
        async importSettings(data) {
            const createElement = h.document.createElement.bind(h.document);
            let input;
            const create = t.mock.method(h.document, "createElement", (...args) => {
                const element = createElement(...args);
                if (args[0] === "input") input = element;
                return element;
            });
            h.document.getElementById("qig-import-btn").click();
            create.mock.restore();
            assert.equal(input.type, "file");
            const text = JSON.stringify({ version: 7, ...data });
            await input.onchange({ target: { files: [{ size: Buffer.byteLength(text), text: async () => text }] } });
        },
    };
}

for (const legacy of [false, true]) {
    test(`${legacy ? "legacy" : "modern"} insertion rejects a swallowed save and restores the previous attachment`, async t => {
        const { h, context, state, showResult, click } = await persistenceHarness(t, { legacy });
        const before = structuredClone(context.chat);
        state.failChat = true;
        await showResult();
        await click("qig-insert-btn");
        assert.deepEqual(context.chat, before);
        assert.deepEqual(state.durableChat, before);
        assert.equal(state.chatSaves, 2, "one insert and one verified rollback, without duplicate compensation");
        assert.equal(state.readbacks.length, 2);
        assert.ok(h.toastrCalls.some(call => call.type === "error" && /Failed to insert image/.test(call.message)));
        assert.equal(h.toastrCalls.some(call => typeof call.options?.onclick === "function"), false, "no undo is offered for an unconfirmed insert");
    });
}

test("legacy undo restores original image and title, preserves later edits and survives an unconfirmed undo", async t => {
    const { h, context, state, showResult, click } = await persistenceHarness(t, { legacy: true });
    const original = structuredClone(context.chat[0].extra);
    await showResult();
    await click("qig-insert-btn");
    const inserted = structuredClone(context.chat[0].extra);
    assert.notEqual(inserted.image, original.image);
    assert.deepEqual(state.durableChat, context.chat, "undefined success was positively read back");
    const undo = h.toastrCalls.find(call => typeof call.options?.onclick === "function").options.onclick;

    state.failChat = true;
    undo();
    await h.waitFor(() => h.toastrCalls.some(call => call.type === "error" && /Could not undo/.test(call.message)), 5000, "unconfirmed undo failure");
    assert.deepEqual(context.chat[0].extra, inserted);
    assert.deepEqual(state.durableChat, context.chat);

    state.failChat = false;
    undo();
    await h.waitFor(() => h.toastrCalls.some(call => call.type === "info" && /Image removed/.test(call.message)), 5000, "undo retry");
    assert.deepEqual(context.chat[0].extra, original);
    assert.deepEqual(state.durableChat, context.chat);

    await click("qig-insert-btn");
    const latestUndo = h.toastrCalls.filter(call => typeof call.options?.onclick === "function").at(-1).options.onclick;
    context.chat[0].extra.title = "Later title edit";
    context.chat[0].extra.other = "unrelated edit";
    const saves = state.chatSaves;
    latestUndo();
    await h.waitFor(() => state.chatSaves > saves && state.durableChat[0].extra.image === original.image, 5000, "conditional legacy restoration");
    assert.equal(context.chat[0].extra.image, original.image);
    assert.equal(context.chat[0].extra.title, "Later title edit");
    assert.equal(context.chat[0].extra.other, "unrelated edit");
});

test("hidden reply insertion and undo confirm the full message array", async t => {
    const { h, context, state, showResult, click } = await persistenceHarness(t, { settings: { insertAsHiddenReply: true } });
    const original = structuredClone(context.chat);
    await showResult();
    state.failChat = true;
    await click("qig-insert-btn");
    assert.deepEqual(context.chat, original);
    assert.deepEqual(state.durableChat, original);
    assert.equal(h.toastrCalls.some(call => typeof call.options?.onclick === "function"), false);

    state.failChat = false;
    await click("qig-insert-btn");
    assert.equal(context.chat.length, 2);
    assert.equal(context.chat[1].is_system, true);
    assert.deepEqual(state.durableChat, context.chat);
    const undo = h.toastrCalls.find(call => typeof call.options?.onclick === "function").options.onclick;
    state.failChat = true;
    undo();
    await h.waitFor(() => h.toastrCalls.some(call => call.type === "error" && /Could not undo/.test(call.message)), 5000, "hidden undo failure");
    assert.equal(context.chat.length, 2);
    assert.deepEqual(state.durableChat, context.chat);
    state.failChat = false;
    undo();
    await h.waitFor(() => h.toastrCalls.some(call => call.type === "info" && /Image removed/.test(call.message)), 5000, "hidden undo retry");
    assert.deepEqual(context.chat, original);
    assert.deepEqual(state.durableChat, original);
});

for (const insertMode of ["new", "replace"]) {
    test(`${insertMode} inject insertion failure leaves the tag unconsumed and makes no cleanup save`, async t => {
        const { h, context, state, inject } = await persistenceHarness(t, {
            message: { mes: "A scene <pic>red fox</pic>" },
            settings: {
                autoInsert: true,
                injectEnabled: true,
                injectRegex: "<pic>(.*?)</pic>",
                injectInsertMode: insertMode,
                injectAutoClean: true,
            },
        });
        state.failChat = true;
        const original = structuredClone(context.chat);
        await inject();
        assert.ok(h.toastrCalls.some(call => /could not be inserted/.test(call.message)));
        assert.deepEqual(context.chat, original);
        assert.deepEqual(state.durableChat, original);
        assert.equal(state.chatSaves, 2, "only insertion and compensation, never a tag-consumption save");
        assert.equal(context.chat[0].extra.qig_inject_consumed, undefined);
        assert.equal(state.chatSaveSnapshots[0].length, insertMode === "new" ? 2 : 1);
        assert.deepEqual(state.chatSaveSnapshots[1], original);
        assert.equal(h.toastrCalls.some(call => typeof call.options?.onclick === "function"), false);
    });
}

test("automatic inject retains failed tags for a confirmed manual retry", async t => {
    const { h, context, state, inject } = await persistenceHarness(t, {
        message: { mes: "A scene <pic>red fox</pic>" },
        settings: { autoGenerate: true, autoGenerateDelayMs: 0, autoInsert: true, injectEnabled: true, injectRegex: "<pic>(.*?)</pic>", injectInsertMode: "replace" },
    });
    state.failChat = true;
    const original = structuredClone(context.chat);
    h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, 0);
    await h.waitFor(() => state.chatSaves === 2 && !h.document.getElementById("qig-input-btn").classList.contains("fa-spinner"), 5000, "automatic insert rollback");
    assert.deepEqual(context.chat, original);
    assert.deepEqual(state.durableChat, original);
    state.failChat = false;
    await inject();
    assert.equal(state.chatSaves, 4, "retry confirms insertion and cleanup separately");
    assert.equal(context.chat[0].mes, "A scene");
    assert.deepEqual(context.chat[0].extra.qig_inject_consumed.prompts, ["red fox"]);
    assert.deepEqual(state.durableChat, context.chat);
});

test("unconfirmed inject cleanup restores tag fields without invalidating the inserted image undo", async t => {
    const tag = "A scene <pic>red fox</pic>";
    const { h, context, state, inject } = await persistenceHarness(t, {
        message: { mes: tag, swipes: [tag], swipe_id: 0, extra: { display_text: tag, reasoning: tag, reasoning_display_text: tag } },
        settings: { autoInsert: true, injectEnabled: true, injectRegex: "<pic>(.*?)</pic>", injectInsertMode: "replace" },
    });
    let inserted;
    state.afterChatSave = () => {
        if (state.chatSaves !== 1) return;
        inserted = context.chat[0].extra.media[0];
        state.failChat = true;
    };
    await inject();
    assert.equal(state.chatSaves, 3);
    assert.equal(context.chat[0].mes, tag);
    assert.equal(context.chat[0].swipes[0], tag);
    assert.equal(context.chat[0].extra.display_text, tag);
    assert.equal(context.chat[0].extra.reasoning, tag);
    assert.equal(context.chat[0].extra.reasoning_display_text, tag);
    assert.equal(context.chat[0].extra.qig_inject_consumed, undefined);
    assert.equal(context.chat[0].extra.media[0], inserted, "cleanup rollback preserves the actual attachment object owned by undo");
    assert.deepEqual(state.durableChat, context.chat);
    state.failChat = false;
    h.toastrCalls.find(call => typeof call.options?.onclick === "function").options.onclick();
    await h.waitFor(() => h.toastrCalls.some(call => /Image removed/.test(call.message)), 5000, "undo after cleanup rollback");
    assert.equal(context.chat[0].extra.media, undefined);
    assert.deepEqual(state.durableChat, context.chat);
});

test("inject cleanup compensates only the original chat and never reloads a newly active chat", async t => {
    const tag = "A scene <pic>red fox</pic>";
    const { context, state, inject } = await persistenceHarness(t, {
        message: { mes: tag },
        settings: { autoInsert: true, injectEnabled: true, injectRegex: "<pic>(.*?)</pic>", injectInsertMode: "replace" },
    });
    const original = context.chat;
    const replacement = [{ mes: "different chat" }];
    let reloads = 0;
    context.reloadCurrentChat = () => { reloads++; };
    state.afterChatSave = () => {
        if (state.chatSaves !== 2) return;
        context.chat = replacement;
        context.chatId = "chat-b";
        context.chatMetadata = {};
    };
    await inject();
    assert.equal(state.chatSaves, 2, "stale compensation never reaches the active-chat host save");
    assert.equal(original[0].mes, tag);
    assert.equal(original[0].extra.qig_inject_consumed, undefined);
    assert.deepEqual(context.chat, [{ mes: "different chat" }]);
    assert.equal(reloads, 0);
});

test("a chat switch after saving cannot trigger a compensation save against the new chat", async t => {
    const { h, context, state, showResult, click } = await persistenceHarness(t);
    await showResult();
    const originalChat = context.chat;
    const originalExtra = structuredClone(originalChat[0].extra);
    const replacement = [{ mes: "another chat", extra: { image: "/other.png" } }];
    state.afterChatSave = () => {
        context.chatId = "chat-b";
        context.chat = replacement;
        context.chatMetadata = {};
    };
    await click("qig-insert-btn");
    assert.equal(state.chatSaves, 1);
    assert.deepEqual(context.chat, replacement);
    assert.deepEqual(originalChat[0].extra, originalExtra);
    assert.ok(h.toastrCalls.some(call => call.type === "error" && /Chat changed/.test(call.message)));
});

test("locked backgrounds restore metadata and visible CSS when the baseline host swallows failure", async t => {
    const { h, context, state, showResult, click } = await persistenceHarness(t, { settings: { backgroundMode: "locked" } });
    const background = h.document.getElementById("bg1");
    background.style.backgroundImage = 'url("/old.png")';
    const originalCss = background.style.backgroundImage;
    const originalMetadata = structuredClone(context.chatMetadata);
    await showResult();
    state.failMetadata = true;
    await click("qig-background-btn");
    assert.deepEqual(context.chatMetadata, originalMetadata);
    assert.equal(background.style.backgroundImage, originalCss);
    assert.equal(state.metadataSaves, 2);
    assert.ok(h.toastrCalls.some(call => call.type === "error" && /Failed to set background/.test(call.message)));

    state.failMetadata = false;
    await click("qig-background-btn");
    assert.notEqual(background.style.backgroundImage, originalCss);
    assert.deepEqual(context.chatMetadata, state.durableMetadata);
    assert.ok(context.chatMetadata.chat_backgrounds.includes("/user/images/qig/result.png"));
});

test("single and bulk entrypoint saves retain pending local values until an exact settings readback", async t => {
    const { h, state, settings, click } = await persistenceHarness(t);
    state.failSettings = true;
    await click("qig-profile-save");
    assert.ok(JSON.parse(h.localStorage.getItem("qig_profiles")).pollinations["Saved profile"]);
    assert.equal(h.localStorage.getItem("qig_sync_pending:qig_profiles"), "1");
    assert.equal(state.durableSettings["quick-image-gen"]._backupProfiles.pollinations?.["Saved profile"], undefined);

    settings.prompt = "new character prompt";
    await click("qig-save-char-btn");
    for (const key of ["qig_char_settings", "qig_char_ref_images"]) {
        assert.equal(h.localStorage.getItem(`qig_sync_pending:${key}`), "1");
    }
    assert.equal(JSON.parse(h.localStorage.getItem("qig_char_settings"))["card:a.png"].prompt, "new character prompt");
    assert.equal(state.durableSettings["quick-image-gen"]._backupCharSettings["card:a.png"], undefined);

    state.failSettings = false;
    await click("qig-profile-save");
    await click("qig-save-char-btn");
    for (const key of ["qig_profiles", "qig_char_settings", "qig_char_ref_images"]) {
        assert.equal(h.localStorage.getItem(`qig_sync_pending:${key}`), null);
    }
    assert.deepEqual(state.durableSettings["quick-image-gen"]._backupProfiles, settings._backupProfiles);
    assert.deepEqual(state.durableSettings["quick-image-gen"]._backupCharSettings, settings._backupCharSettings);
});

test("settings imports reject swallowed saves, preserve previous pending caches and succeed only after readback", async t => {
    const { h, state, settings, importSettings } = await persistenceHarness(t);
    const previous = structuredClone(settings);
    const previousLocal = h.localStorage.getItem("qig_char_settings");
    h.localStorage.setItem("qig_sync_pending:qig_char_settings", "1");
    const data = { activeSettings: { width: 832 }, charSettings: { alice: { prompt: "imported" } } };
    state.failSettings = true;
    state.afterSettingsSave = () => { state.failSettings = false; state.afterSettingsSave = null; };
    const saves = state.settingsSaves;
    await importSettings(data);
    assert.equal(state.settingsSaves, saves + 2);
    assert.deepEqual(settings, previous);
    assert.deepEqual(state.durableSettings["quick-image-gen"], previous);
    assert.equal(h.localStorage.getItem("qig_char_settings"), previousLocal);
    assert.equal(h.localStorage.getItem("qig_sync_pending:qig_char_settings"), "1");
    assert.ok(h.toastrCalls.some(call => call.type === "error" && /Settings save could not be confirmed/.test(call.message)));
    assert.equal(h.toastrCalls.some(call => /Settings imported successfully/.test(call.message)), false);

    state.failSettings = false;
    await importSettings(data);
    assert.equal(settings.width, 832);
    assert.equal(settings._backupCharSettings.alice.prompt, "imported");
    assert.equal(JSON.parse(h.localStorage.getItem("qig_char_settings")).alice.prompt, "imported");
    assert.equal(h.localStorage.getItem("qig_sync_pending:qig_char_settings"), null);
    assert.ok(h.toastrCalls.some(call => /Settings imported successfully/.test(call.message)));
});

test("settings-only imports also require positive server confirmation", async t => {
    const { h, state, settings, importSettings } = await persistenceHarness(t);
    const width = settings.width;
    state.failSettings = true;
    state.afterSettingsSave = () => { state.failSettings = false; state.afterSettingsSave = null; };
    await importSettings({ activeSettings: { width: 832 } });
    assert.equal(settings.width, width);
    assert.equal(state.durableSettings["quick-image-gen"].width, width);
    assert.equal(h.toastrCalls.some(call => /Settings imported successfully/.test(call.message)), false);
    assert.ok(h.toastrCalls.some(call => /Failed to import/.test(call.message)));
});

test("a settings import saved after the 2.5-second observation window succeeds without compensation", async t => {
    const { h, state, settings, importSettings } = await persistenceHarness(t);
    const save = h.host.saveSettings;
    h.host.saveSettings = async () => {
        await new Promise(resolve => setTimeout(resolve, 2600));
        return save();
    };
    const saves = state.settingsSaves;
    await importSettings({ activeSettings: { width: 832 } });
    assert.equal(state.settingsSaves, saves + 1, "slow success must not run rollback persistence");
    assert.equal(settings.width, 832);
    assert.equal(state.durableSettings["quick-image-gen"].width, 832);
    assert.ok(h.toastrCalls.some(call => /Settings imported successfully/.test(call.message)));
    assert.equal(h.toastrCalls.some(call => /Failed to import/.test(call.message)), false);
});

test("an unconfirmed import compensation retains the restored cache as pending", async t => {
    const { h, state, settings, importSettings } = await persistenceHarness(t);
    const previous = structuredClone(settings._backupCharSettings);
    const previousLocal = h.localStorage.getItem("qig_char_settings");
    state.afterSettingsSave = () => {
        state.afterSettingsSave = null;
        state.failSettings = true;
        throw new Error("lost import response");
    };
    await importSettings({ charSettings: { alice: { prompt: "imported" } } });
    assert.deepEqual(settings._backupCharSettings, previous);
    assert.equal(h.localStorage.getItem("qig_char_settings"), previousLocal);
    assert.equal(state.durableSettings["quick-image-gen"]._backupCharSettings.alice.prompt, "imported");
    assert.equal(h.localStorage.getItem("qig_sync_pending:qig_char_settings"), "1");
    assert.ok(h.toastrCalls.some(call => /could not be fully rolled back/.test(call.message)));
    assert.equal(h.toastrCalls.some(call => /Settings imported successfully/.test(call.message)), false);
});

test("unconfirmed startup saves do not delete the legacy settings they were migrating", async t => {
    const legacy = JSON.stringify([{ name: "Legacy", trigger: "cat", replacement: "fox" }]);
    const h = await createQigHarness({
        host: {
            extension_settings: { "quick-image-gen": { _syncCacheId: "migration-owner", _replacementMapsMigrated: false } },
            saveSettings: async () => {},
        },
        localStorage: { qig_sync_cache_id: "migration-owner", qig_prompt_replacements: legacy },
    });
    t.after(() => h.dispose());
    assert.equal(h.localStorage.getItem("qig_prompt_replacements"), legacy);
    assert.ok(h.host.extension_settings["quick-image-gen"]._backupContextualFilters.some(filter => filter.positive === "fox"));
    assert.ok(h.toastrCalls.some(call => call.type === "warning" && /could not be saved/.test(call.message)));
});
