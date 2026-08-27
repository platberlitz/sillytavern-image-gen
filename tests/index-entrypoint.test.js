import test from "node:test";
import assert from "node:assert/strict";
import { createQigHarness } from "./helpers/qig-harness.js";

test("boots against a fake SillyTavern host and builds the settings UI", async (t) => {
    const h = await createQigHarness();
    t.after(() => h.dispose());

    assert.ok(h.document.getElementById("qig-settings"), "settings panel exists");
    assert.equal(h.mod.extensionName, "quick-image-gen");
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.ok(settings, "settings published to extension_settings");
    assert.equal(typeof settings.autoGenerate, "boolean", "defaults normalized to typed values");

    const controls = h.document.querySelectorAll("#qig-settings button, #qig-settings input, #qig-settings select");
    assert.ok(controls.length > 10, "settings UI has interactive controls");
});

test("registers slash commands and subscribes to host events", async (t) => {
    const commands = [];
    const h = await createQigHarness({
        host: { addSlashCommand: (command) => commands.push(command) },
    });
    t.after(() => h.dispose());

    assert.equal(commands.length, 3, "/qig, /qig-auto, and /qig-cancel registered");
    assert.ok(h.host.eventSource.listenerCount >= 3, "host events subscribed");
    const names = commands.map((command) => command.name);
    assert.ok(names.includes("qig"), names.join(", "));
    const qig = commands.find((command) => command.name === "qig");
    assert.ok(qig.namedArgumentList.some((argument) => argument.name === "quiet"), "/qig advertises quiet=true, which other extensions look for");
});

test("first boot claims a durable account sync identity when the server confirms it", async (t) => {
    const h = await createQigHarness({
        fetch: async (url) => {
            assert.equal(url, "/api/settings/get");
            const id = globalThis.__QIG_TEST_HOST__.extension_settings["quick-image-gen"]?._syncCacheId ?? "";
            return new Response(JSON.stringify({
                settings: { "quick-image-gen": { _syncCacheId: id } },
            }), { status: 200, headers: { "content-type": "application/json" } });
        },
    });
    t.after(() => h.dispose());

    const settings = h.host.extension_settings["quick-image-gen"];
    assert.ok(settings._syncCacheId, "sync cache id generated");
    assert.equal(h.localStorage.getItem("qig_sync_cache_id"), settings._syncCacheId, "ownership marker written after confirmed claim");
});

test("first boot stays session-only when the server never confirms the sync identity", async (t) => {
    const h = await createQigHarness({
        host: {
            saveSettings: async () => {
                // HTTP failure is swallowed by real SillyTavern: no event, no rejection.
            },
        },
    });
    t.after(() => h.dispose());

    const settings = h.host.extension_settings["quick-image-gen"];
    assert.ok(settings._syncCacheId, "sync cache id generated");
    assert.equal(h.localStorage.getItem("qig_sync_cache_id"), null, "ownership marker withheld");
    assert.equal(h.localStorage.getItem("qig_prompt_history"), null, "no account-scoped stores touched");
});

test("teardown releases host subscriptions and message-action bindings", async (t) => {
    const h = await createQigHarness();
    t.after(() => h.dispose());

    assert.ok(h.host.eventSource.listenerCount >= 3, "subscribed before teardown");
    const wasDelegated = () => h.document.querySelector("#chat").dispatchEvent(new h.window.MouseEvent("click", { bubbles: true })) === true;

    h.mod.teardownQuickImageGen();
    assert.equal(h.host.eventSource.listenerCount, 0, "event subscriptions disposed");
    assert.equal(typeof wasDelegated(), "boolean", "click dispatch does not throw after teardown");
    assert.equal(h.document.querySelectorAll(".qig-message-generate").length, 0, "message action buttons removed");
});

test("quarantines an unsupported future Context Media library instead of resetting it", async (t) => {
    const futureLibrary = { version: 2, profiles: [{ id: "future-profile", label: "Future", folders: [] }], chatMap: { "chat-1": "future-profile" } };
    const rawLocal = JSON.stringify(futureLibrary);
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupContextMedia: futureLibrary,
                },
            },
        },
        localStorage: { qig_context_media: rawLocal, qig_sync_cache_id: "owner-1" },
    });
    t.after(() => h.dispose());

    assert.equal(h.localStorage.getItem("qig_context_media"), rawLocal, "raw local library preserved byte-for-byte");
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.equal(settings._backupContextMedia, futureLibrary, "account copy untouched");
    assert.deepEqual(settings._syncCacheId, "owner-1");
    const quarantine = JSON.parse(h.localStorage.getItem("qig_context_media_quarantined"));
    assert.ok(quarantine, "quarantine record written");
    assert.equal(quarantine.reason, "Unsupported Context Media library version: 2");
    assert.equal(quarantine.localRaw, rawLocal);
    assert.ok(h.toastrCalls.some((call) => call.type === "error" && /quarantined/.test(call.message)), "quarantine toast shown");
});

test("legacy character reference arrays survive on an unmapped provider", async (t) => {
    const legacyRefs = ["data:image/png;base64,legacy-one"];
    const h = await createQigHarness({
        host: {
            getContext: () => ({
                chat: [],
                characters: { "char-key": { name: "Char", avatar: "char-key.png" } },
                characterId: "char-key",
                name1: "Char",
                name2: "You",
                groupId: null,
                chatId: "qig-test-chat",
                chatMetadata: {},
                saveChat: async () => {},
                powerUserSettings: {},
                persona: {},
                getPresetManager: () => null,
                chatCompletionSettings: {},
            }),
            extension_settings: {
                "quick-image-gen": {
                    provider: "pollinations",
                    _syncCacheId: "owner-1",
                },
            },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_char_ref_images: JSON.stringify({ "card:char-key.png": legacyRefs }),
        },
    });
    t.after(() => h.dispose());

    const stored = JSON.parse(h.localStorage.getItem("qig_char_ref_images"));
    assert.deepEqual(stored["card:char-key.png"], { __legacyRefImages: legacyRefs }, "legacy array preserved instead of deleted");
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.deepEqual(settings.provider, "pollinations");
    assert.equal(settings.proxyRefImages.length, 0, "no misassigned provider references");
});

test("auto-generation ignores system messages", async (t) => {
    const fetchCalls = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    autoGenerate: true,
                    autoGenerateDelayMs: 50,
                    autoInsert: false,
                    provider: "pollinations",
                },
            },
        },
        fetch: async (url) => {
            fetchCalls.push(String(url));
            return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        },
    });
    t.after(() => h.dispose());

    h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, {
        is_user: false,
        is_system: true,
        mes: "hidden tool output that must never reach a provider",
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(fetchCalls.length, 0, "system messages never trigger provider work");
    assert.equal(h.host.getContext().chat.length, 0, "no chat mutation");
});

async function createA1111Harness(t, { settings = {}, fetch }) {
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "local",
                    localType: "a1111",
                    localUrl: "http://127.0.0.1:7860",
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                    disablePaletteButton: true,
                    ...settings,
                },
            },
        },
        fetch,
    });
    t.after(() => h.dispose());
    return h;
}

function hangUntilAborted(url, init) {
    return new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(new DOMException("aborted", "AbortError"));
        else signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        void url;
    });
}

test("A1111 cancellation before submission never interrupts the shared server", async (t) => {
    const fetchCalls = [];
    const h = await createA1111Harness(t, {
        settings: { localRefImage: "http://127.0.0.1:7860/slow-ref.png" },
        fetch: async (url, init) => {
            fetchCalls.push(String(url));
            if (String(url).includes("/slow-ref.png")) return hangUntilAborted(url, init);
            return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
        },
    });

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => fetchCalls.some((url) => url.includes("/slow-ref.png")), 5000, "reference materialization started");
    assert.ok(!fetchCalls.some((url) => url.includes("/sdapi/v1/txt2img")), "not submitted yet");

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => !h.document.getElementById("qig-generate-btn").innerHTML.includes("Cancel"), 5000, "generation cancelled");
    assert.ok(!fetchCalls.some((url) => url.includes("/sdapi/v1/interrupt")), "no global server interrupt before submission");
    assert.ok(!fetchCalls.some((url) => url.includes("/sdapi/v1/txt2img")), "no generation request was ever submitted");
});

test("A1111 cancellation after submission skips the global interrupt unless the opt-in is enabled", async (t) => {
    const fetchCalls = [];
    const h = await createA1111Harness(t, {
        fetch: async (url, init) => {
            fetchCalls.push(String(url));
            if (String(url).includes("/sdapi/v1/txt2img")) return hangUntilAborted(url, init);
            return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
        },
    });

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => fetchCalls.some((url) => url.includes("/sdapi/v1/txt2img")), 5000, "generation request submitted");
    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => !h.document.getElementById("qig-generate-btn").innerHTML.includes("Cancel"), 5000, "generation cancelled");
    assert.ok(!fetchCalls.some((url) => url.includes("/sdapi/v1/interrupt")), "shared-server interrupt stays off by default");
});

test("A1111 cancellation after submission interrupts the server when the user opted in", async (t) => {
    const fetchCalls = [];
    const h = await createA1111Harness(t, {
        settings: { a1111InterruptServer: true },
        fetch: async (url, init) => {
            fetchCalls.push(String(url));
            if (String(url).includes("/sdapi/v1/txt2img")) return hangUntilAborted(url, init);
            if (String(url).includes("/sdapi/v1/interrupt")) {
                assert.ok(init.signal, "interrupt request carries the bounded timeout signal");
                return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
        },
    });

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => fetchCalls.some((url) => url.includes("/sdapi/v1/txt2img")), 5000, "generation request submitted");
    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => fetchCalls.some((url) => url.includes("/sdapi/v1/interrupt")), 5000, "owned interrupt sent");
});

test("separate-AI profile failures never leak the request to the main chat AI", async (t) => {
    const quietPromptCalls = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    llmOverrideEnabled: true,
                    llmOverrideProfileId: "broken-profile",
                    useLLMPrompt: true,
                    autoInsert: false,
                    provider: "pollinations",
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
            generateQuietPrompt: async (...args) => {
                quietPromptCalls.push(args);
                return "main-ai-answer";
            },
            getContext: () => ({
                chat: [],
                characters: {},
                characterId: null,
                name1: "Char",
                name2: "You",
                groupId: null,
                chatId: "qig-test-chat",
                chatMetadata: {},
                saveChat: async () => {},
                powerUserSettings: {},
                persona: {},
                getPresetManager: () => null,
                chatCompletionSettings: {},
                ConnectionManagerRequestService: {
                    getProfile: () => ({ id: "broken-profile", api: "openai", model: "model", preset: "base" }),
                    sendRequest: async () => {
                        throw new Error("connection refused");
                    },
                },
            }),
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => h.toastrCalls.some((call) => ["warning", "error"].includes(call.type) && /NOT sent to the main chat AI/.test(call.message)), 5000, "fail-closed error surfaced");
    assert.equal(quietPromptCalls.length, 0, "main chat AI never received the prompt");
});

import zlib from "node:zlib";

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(width, height) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        const offset = y * (width * 3 + 1);
        raw[offset] = 0;
        for (let x = 0; x < width; x++) {
            raw[offset + 1 + x * 3] = 220 + (x * 7) % 35;
            raw[offset + 2 + x * 3] = 40 + (y * 17) % 60;
            raw[offset + 3 + x * 3] = 60 + (x + y) % 90;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", zlib.deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

const GENERATED_PNG = makePng(8, 8);

function pngResponse() {
    return {
        ok: true,
        status: 200,
        headers: { get: (key) => {
            const normalized = String(key).toLowerCase();
            if (normalized === "content-type") return "image/png";
            if (normalized === "content-length") return String(GENERATED_PNG.length);
            return null;
        } },
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(GENERATED_PNG));
                controller.close();
            },
        }),
    };
}

function pollinationsFetch(url) {
    if (String(url).startsWith("blob:")) return pngResponse();
    if (String(url).includes("image.pollinations.ai")) return pngResponse();
    throw new Error(`unexpected fetch: ${url}`);
}

function seedChatDom(h, chat) {
    const container = h.document.getElementById("chat");
    container.replaceChildren();
    chat.forEach((message, index) => {
        const element = h.document.createElement("div");
        element.className = "mes";
        element.setAttribute("mesid", String(index));
        container.appendChild(element);
    });
    h.imageResponder((src) => String(src).startsWith("blob:"), { width: 8, height: 8 });
    h.imageResponder((src) => String(src).startsWith("data:image/"), { width: 8, height: 8 });
}

function assistantMessage(text) {
    return { name: "You", mes: text, is_user: false, is_system: false };
}

function userMessage(text) {
    return { name: "Char", mes: text, is_user: true, is_system: false };
}

test("cross-chat insert fails closed instead of writing into the wrong chat", async (t) => {
    const chatA = [assistantMessage("scene in chat a")];
    const chatB = [assistantMessage("unrelated chat b message")];
    let currentChat = chatA;
    const ctxState = {
        chat: currentChat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "chat-a",
        chatMetadata: {},
        saveChat: async () => {},
        appendMediaToMessage: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => ctxState.chatId,
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: false,
                    insertAsHiddenReply: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
            getContext: () => ctxState,
        },
        fetch: pollinationsFetch,
    });
    t.after(() => h.dispose());
    seedChatDom(h, chatA);

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => h.document.getElementById("qig-popup"), 10000, "result popup shown in chat a");

    // The user moves to another chat before clicking Insert.
    currentChat = chatB;
    ctxState.chat = chatB;
    ctxState.chatId = "chat-b";
    seedChatDom(h, chatB);

    h.document.getElementById("qig-insert-btn").click();
    await h.waitFor(() => h.toastrCalls.some((call) => call.type === "error" && /belongs to a different chat/.test(call.message)), 5000, "cross-chat refusal surfaced");
    assert.deepEqual(chatB[0].extra, undefined, "chat B message unchanged");
    assert.equal(h.document.querySelectorAll(".mes").length, 1, "no extra message rendered");
});

test("panel auto-insert honors manualInsertTarget instead of the scene's last message", async (t) => {
    const chat = [
        assistantMessage("old scene one"),
        userMessage("old user one"),
        assistantMessage("old scene two"),
        userMessage("newest user reply"),
    ];
    const ctxState = {
        chat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => {},
        appendMediaToMessage: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: true,
                    insertAsHiddenReply: false,
                    saveToServer: false,
                    useChatMessageScene: true,
                    messageRange: "3",
                    manualInsertTarget: "assistant",
                },
            },
            getContext: () => ctxState,
        },
        fetch: pollinationsFetch,
    });
    t.after(() => h.dispose());
    seedChatDom(h, chat);

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => Array.isArray(chat[2].extra?.media) && chat[2].extra.media.length > 0, 10000, "image landed on the last assistant message");
    assert.equal(chat[3].extra, undefined, "scene-ending user message untouched");
    assert.equal(chat[0].extra, undefined, "first assistant message untouched");
});

test("multi-image palette inject with auto-insert opens the batch picker without inserting", async (t) => {
    const chat = [assistantMessage("A cat in a garden")];
    const ctxState = {
        chat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => {},
        appendMediaToMessage: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: true,
                    insertAsHiddenReply: false,
                    saveToServer: false,
                    useLastMessage: true,
                    paletteMode: "inject",
                    injectEnabled: true,
                    injectRegex: "(.*)",
                    injectPrompt: "[Tag]",
                    batchCount: 2,
                },
            },
            getContext: () => ctxState,
        },
        fetch: pollinationsFetch,
    });
    t.after(() => h.dispose());
    seedChatDom(h, chat);

    h.document.getElementById("qig-input-btn").click();
    await h.waitFor(() => h.document.getElementById("qig-batch-popup"), 10000, "batch picker opened");
    assert.equal(chat[0].extra?.media, undefined, "zero auto-inserts before a picker choice");
});

test("an insert that cannot be saved leaves the chat untouched and offers no undo", async (t) => {
    const chat = [assistantMessage("a message")];
    const ctxState = {
        chat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => false,
        appendMediaToMessage: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: true,
                    insertAsHiddenReply: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
            getContext: () => ctxState,
        },
        fetch: pollinationsFetch,
    });
    t.after(() => h.dispose());
    seedChatDom(h, chat);

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => h.toastrCalls.some((call) => ["warning", "error"].includes(call.type) && /(could not be saved to the chat server|One image could not be inserted)/i.test(call.message)), 10000, "save failure surfaced");
    assert.equal(chat[0].extra, undefined, "failed insert rolled its owned media back");
    assert.equal(h.toastrCalls.some((call) => call.type === "success" && /Undo/i.test(call.message)), false, "no undo offered");
});

test("a failed undo save restores the media and keeps the undo available for retry", async (t) => {
    const chat = [assistantMessage("a message")];
    let saveChatCalls = 0;
    let saveChatResult = true;
    const ctxState = {
        chat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => {
            saveChatCalls++;
            return saveChatResult;
        },
        appendMediaToMessage: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: true,
                    insertAsHiddenReply: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
            getContext: () => ctxState,
        },
        fetch: pollinationsFetch,
    });
    t.after(() => h.dispose());
    seedChatDom(h, chat);

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => Array.isArray(chat[0].extra?.media) && chat[0].extra.media.length > 0, 10000, "image inserted");
    const successToast = h.toastrCalls.find((call) => call.type === "success" && typeof call.options?.onclick === "function");
    assert.ok(successToast, "success toast carries an undo handler");
    const insertedEntry = chat[0].extra.media[0];
    assert.ok(insertedEntry, "media entry present before undo");

    saveChatResult = false;
    const callsBefore = saveChatCalls;
    await successToast.options.onclick({ currentTarget: h.document.body });
    await h.waitFor(() => saveChatCalls > callsBefore, 5000, "undo attempted its save");
    await h.waitFor(() => h.toastrCalls.some((call) => call.type === "error" && /Could not undo the insert/i.test(call.message)), 5000, "undo failure surfaced");
    assert.ok(chat[0].extra.media.includes(insertedEntry), "applyRestore re-inserted the media entry");
    assert.equal(chat[0].extra.inline_image, true, "inline image flag restored");
});

test("proxy /v1 base defaults to the images endpoint instead of chat completions", async (t) => {
    const captured = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "proxy",
                    proxyUrl: "https://proxy.example/v1",
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
        },
        fetch: async (url, init) => {
            captured.push({ url, init });
            if (url.includes("proxy.example")) return pngResponse();
            throw new Error(`unexpected fetch: ${url}`);
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => captured.length > 0, 10000, "proxy request sent");
    assert.equal(captured[0].url, "https://proxy.example/v1/images/generations");
});

test("extended images payload includes proxy extra instructions", async (t) => {
    const captured = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "proxy",
                    proxyUrl: "https://proxy.example/v1/images/generations",
                    proxyExtraInstructions: "masterpiece, best quality",
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                },
            },
        },
        fetch: async (url, init) => {
            captured.push({ url, init });
            if (url.includes("proxy.example")) return pngResponse();
            throw new Error(`unexpected fetch: ${url}`);
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => captured.length > 0, 10000, "proxy request sent");
    const body = JSON.parse(captured[0].init.body);
    assert.match(body.prompt, /masterpiece, best quality/);
    assert.match(body.prompt, /a red fox/);
});

test("sequential batch seeds wrap at the unsigned 32-bit boundary", async (t) => {
    const capturedSeeds = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "pollinations",
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                    batchCount: 3,
                    sequentialSeeds: true,
                    seed: 4294967295,
                },
            },
        },
        fetch: async (url) => {
            if (url.includes("image.pollinations.ai")) {
                const match = url.match(/seed=(\d+)/);
                if (match) capturedSeeds.push(Number(match[1]));
                return pollinationsFetch(url);
            }
            throw new Error(`unexpected fetch: ${url}`);
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => capturedSeeds.length === 3, 15000, "three batch requests completed");
    assert.deepEqual(capturedSeeds, [4294967295, 0, 1]);
});

test("persisted pagehide keeps the extension alive while real unloads tear down", async (t) => {
    const h = await createQigHarness();
    t.after(() => h.dispose());
    await h.waitForInit();

    assert.ok(h.host.eventSource.listenerCount >= 3, "host subscriptions active before pagehide");

    const persistedHide = new h.window.Event("pagehide", { bubbles: false, cancelable: false });
    Object.defineProperty(persistedHide, "persisted", { value: true });
    h.window.dispatchEvent(persistedHide);
    await h.waitFor(() => true, 200, "persisted pagehide handled");
    assert.ok(h.host.eventSource.listenerCount >= 3, "bfcache entry keeps host subscriptions");
    assert.ok(h.document.getElementById("qig-settings"), "settings panel still present");

    const realHide = new h.window.Event("pagehide", { bubbles: false, cancelable: false });
    Object.defineProperty(realHide, "persisted", { value: false });
    h.window.dispatchEvent(realHide);
    await h.waitFor(() => h.host.eventSource.listenerCount === 0, 5000, "teardown released subscriptions");
    assert.equal(h.document.getElementById("qig-input-btn"), null, "input button removed");
});

test("Ctrl+Enter inside QIG is consumed even while generation is busy", async (t) => {
    const requests = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    provider: "local",
                    localType: "a1111",
                    localUrl: "http://127.0.0.1:7860",
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                    prompt: "a red fox",
                    disablePaletteButton: true,
                },
            },
        },
        fetch: async (url, init) => {
            requests.push(url);
            if (url.includes("/sdapi/v1/txt2img")) return hangUntilAborted(url, init);
            if (url.includes("/sdapi/v1/progress")) return hangUntilAborted(url, init);
            if (url.includes("/sdapi/v1/interrupt")) return { ok: true, status: 200 };
            throw new Error(`unexpected fetch: ${url}`);
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-generate-btn").click();
    await h.waitFor(() => requests.some((url) => url.includes("/sdapi/v1/txt2img")), 10000, "generation submitted");
    const input = h.document.getElementById("qig-prompt");
    assert.ok(input, "prompt input exists inside qig-settings");
    const keydown = new h.window.KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
    });
    input.dispatchEvent(keydown);
    assert.equal(keydown.defaultPrevented, true, "host regenerate shortcut consumed while busy");
});

test("inUser injection appends the instruction when the prompt has no user message", async (t) => {
    const prompts = [{ role: "system", content: "sys" }, { role: "assistant", content: "hi" }];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    injectEnabled: true,
                    autoGenerate: true,
                    injectPosition: "inUser",
                    injectPrompt: "SYSTEM INSTR",
                },
            },
        },
    });
    t.after(() => h.dispose());
    await h.waitForInit();

    h.host.eventSource.emit(h.host.eventTypes.CHAT_COMPLETION_PROMPT_READY, prompts);
    await h.waitFor(() => prompts.length === 3, 5000, "inject instruction appended");
    assert.deepEqual(prompts[2], { role: "system", content: "SYSTEM INSTR" });
});

test("merges same-name profile, preset and workflow records into one configuration without touching the legacy stores", async (t) => {
    const profiles = { local: { Krea: { localUrl: "http://127.0.0.1:8188", localType: "comfyui", a1111Model: "ignored.safetensors" } } };
    const presets = [{
        id: "preset-krea",
        name: "Krea",
        provider: "local",
        steps: 30,
        cfgScale: 3.5,
        sampler: "dpmpp_2m",
        a1111Scheduler: "Automatic",
        comfyScheduler: "normal",
    }];
    const workflows = [{ id: "cwf-krea", name: "Krea", localModel: "krea.safetensors", comfyModelLoader: "unet", comfyFluxVaeModel: "ae.safetensors" }];
    const rawProfiles = JSON.stringify(profiles);
    const rawPresets = JSON.stringify(presets);
    const rawWorkflows = JSON.stringify(workflows);

    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupProfiles: profiles,
                    _backupGenPresets: presets,
                    _backupComfyWorkflows: workflows,
                },
            },
        },
        localStorage: {
            qig_profiles: rawProfiles,
            qig_gen_presets: rawPresets,
            qig_comfy_workflows: rawWorkflows,
            qig_sync_cache_id: "owner-1",
        },
    });
    t.after(() => h.dispose());

    const configs = JSON.parse(h.localStorage.getItem("qig_configurations"));
    assert.equal(configs.length, 1, "one merged configuration");
    const [config] = configs;
    assert.equal(config.id, "preset-krea", "the generation preset remains the stable merged id");
    assert.equal(config.name, "Krea");
    assert.equal(config.provider, "local");
    assert.equal(config.localType, "comfyui", "workflow forces the ComfyUI backend");
    assert.equal(config.localUrl, "http://127.0.0.1:8188", "endpoint came from the connection profile");
    assert.equal(config.steps, 30, "generation values came from the preset");
    assert.equal(config.sampler, "dpmpp_2m");
    assert.equal(config.localModel, "krea.safetensors", "model came from the workflow preset");
    assert.equal(config.comfyFluxVaeModel, "ae.safetensors", "component selection survives the merge");

    assert.equal(h.localStorage.getItem("qig_profiles"), rawProfiles, "legacy profile store untouched");
    assert.equal(h.localStorage.getItem("qig_gen_presets"), rawPresets, "legacy preset store untouched");
    assert.equal(h.localStorage.getItem("qig_comfy_workflows"), rawWorkflows, "legacy workflow store untouched");

    const select = h.document.getElementById("qig-config-select");
    assert.ok(select, "configuration selector rendered");
    assert.ok([...select.options].some((option) => option.textContent.startsWith("Krea")), "merged configuration is selectable");
    assert.equal(h.document.getElementById("qig-profile-select"), null, "old connection profile control is gone");
});

test("keeps an A1111-only legacy profile separate from a same-name Comfy workflow", async (t) => {
    const profiles = { local: { Shared: { localUrl: "http://127.0.0.1:7860", a1111Model: "pony.safetensors" } } };
    const workflows = [{ id: "cwf-shared", name: "Shared", localModel: "flux.safetensors", comfyModelLoader: "unet" }];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupProfiles: profiles,
                    _backupComfyWorkflows: workflows,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                },
            },
        },
        localStorage: {
            qig_profiles: JSON.stringify(profiles),
            qig_comfy_workflows: JSON.stringify(workflows),
            qig_sync_cache_id: "owner-1",
        },
    });
    t.after(() => h.dispose());

    const configs = JSON.parse(h.localStorage.getItem("qig_configurations"));
    assert.equal(configs.length, 2);
    const a1111 = configs.find(config => config.name === "Shared");
    const comfy = configs.find(config => config.name === "Shared (Comfy workflow)");
    assert.equal(a1111.localType, "a1111");
    assert.equal(a1111.a1111Model, "pony.safetensors");
    assert.equal(comfy.localType, "comfyui");
    assert.equal(comfy.localModel, "flux.safetensors");
});

test("completes a sparse legacy preset from active settings after an interrupted migration", async (t) => {
    const workflow = JSON.stringify({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "baseline.safetensors" } },
    });
    const presets = [{
        id: "preset-only",
        name: "Only recipe",
        provider: "local",
        steps: 30,
        autoGenerate: false,
    }];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupGenPresets: presets,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "comfyui",
                    localUrl: "http://private-comfy.example:8188",
                    localModel: "baseline.safetensors",
                    comfyWorkflow: workflow,
                    autoGenerate: true,
                },
            },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_gen_presets: JSON.stringify(presets),
            qig_configurations: "[]",
        },
    });
    t.after(() => h.dispose());

    const [config] = JSON.parse(h.localStorage.getItem("qig_configurations"));
    assert.equal(config.id, "preset-only");
    assert.equal(config.localType, "comfyui");
    assert.equal(config.localUrl, "http://private-comfy.example:8188");
    assert.equal(config.localModel, "baseline.safetensors");
    assert.equal(config.comfyWorkflow, workflow);
    assert.equal(config.steps, 30);
    assert.equal(Object.hasOwn(config, "autoGenerate"), false, "automation is not owned by configurations");

    const settings = h.host.extension_settings["quick-image-gen"];
    assert.equal(settings._configurationMigrationVersion, 1);
    assert.equal(settings._backupConfigurations[0].id, "preset-only");
    settings.localUrl = "http://temporary.example:8188";
    settings.localModel = "temporary.safetensors";
    settings.comfyWorkflow = "";
    settings.autoGenerate = true;
    const select = h.document.getElementById("qig-config-select");
    select.value = "preset-only";
    h.fireEvent(select, "change");
    assert.equal(settings.localUrl, "http://private-comfy.example:8188");
    assert.equal(settings.localModel, "baseline.safetensors");
    assert.equal(settings.comfyWorkflow, workflow);
    assert.equal(settings.autoGenerate, true, "loading a configuration does not alter automation");
});

test("does not resurrect legacy records after a server-backed configuration store was emptied", async (t) => {
    const presets = [{ id: "legacy", name: "Deleted", provider: "pollinations", steps: 20 }];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _backupGenPresets: presets,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                },
            },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_configurations: "[]",
            qig_gen_presets: JSON.stringify(presets),
        },
    });
    t.after(() => h.dispose());

    assert.deepEqual(JSON.parse(h.localStorage.getItem("qig_configurations")), []);
    assert.deepEqual(h.host.extension_settings["quick-image-gen"]._backupConfigurations, []);
    assert.equal(h.host.extension_settings["quick-image-gen"]._configurationMigrationVersion, 1);
});

test("switching configurations cancels queued automatic generation without changing automation", async (t) => {
    const chat = [assistantMessage("first reply")];
    const context = {
        chat,
        characters: {},
        characterId: null,
        name1: "Char",
        name2: "You",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const configurations = [{
        id: "config-b",
        name: "B",
        provider: "pollinations",
        pollinationsModel: "flux",
        prompt: "configuration B",
        autoGenerate: false,
    }];
    const requests = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: configurations,
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "pollinations",
                    pollinationsModel: "flux",
                    prompt: "configuration A",
                    autoGenerate: true,
                    autoGenerateDelayMs: 80,
                    autoInsert: false,
                    saveToServer: false,
                    useLastMessage: false,
                },
            },
            getContext: () => context,
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_configurations: JSON.stringify(configurations),
        },
        fetch: async (url) => {
            requests.push(String(url));
            return pollinationsFetch(url);
        },
    });
    t.after(() => h.dispose());
    seedChatDom(h, chat);

    h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, 0);
    const select = h.document.getElementById("qig-config-select");
    select.value = "config-b";
    h.fireEvent(select, "change");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(requests.filter((url) => url.includes("image.pollinations.ai")).length, 0, "old queued request was cancelled");
    assert.equal(h.host.extension_settings["quick-image-gen"].autoGenerate, true, "stale configuration field was ignored");

    chat.push(assistantMessage("second reply"));
    seedChatDom(h, chat);
    h.host.eventSource.emit(h.host.eventTypes.MESSAGE_RECEIVED, 1);
    await h.waitFor(() => requests.some((url) => url.includes("image.pollinations.ai")), 5000, "new automatic request used current settings");
});

test("discovers only advertised custom Comfy workflow choices and prunes stale overrides", async (t) => {
    const workflow = JSON.stringify({
        "1": {
            class_type: "Third Party/Loader",
            inputs: {
                model_name: "a.safetensors",
                free_text: "not a choice",
                linked: ["2", 0],
            },
        },
        "2": { class_type: "Source", inputs: {} },
    });
    const requests = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "comfyui",
                    localUrl: "http://127.0.0.1:8188",
                    comfyWorkflow: workflow,
                },
            },
        },
        fetch: async (url) => {
            requests.push(String(url));
            assert.equal(String(url), "http://127.0.0.1:8188/object_info/Third%20Party%2FLoader");
            return new Response(JSON.stringify({
                "Third Party/Loader": {
                    input: {
                        required: {
                            model_name: [["a.safetensors", "b.safetensors"], {}],
                            free_text: ["STRING", {}],
                        },
                    },
                },
            }), { status: 200, headers: { "content-type": "application/json" } });
        },
    });
    t.after(() => h.dispose());

    const inspect = h.document.querySelector("#qig-comfy-component-overrides .qig-comfy-discovery-actions button");
    assert.ok(inspect, "explicit discovery action rendered");
    inspect.click();
    const choice = await h.waitFor(
        () => h.document.querySelector("#qig-comfy-component-overrides .qig-comfy-override select"),
        5000,
        "third-party COMBO rendered",
    );
    assert.equal(requests.length, 1, "one request per graph class");
    assert.equal(h.document.querySelectorAll("#qig-comfy-component-overrides .qig-comfy-override select").length, 1, "free text and linked inputs excluded");
    assert.deepEqual([...choice.options].map((option) => option.value), ["a.safetensors", "b.safetensors"]);

    choice.value = "b.safetensors";
    h.fireEvent(choice, "change");
    const settings = h.host.extension_settings["quick-image-gen"];
    assert.deepEqual(settings.comfyWorkflowComponentOverrides.entries, [{
        nodeId: "1",
        classType: "Third Party/Loader",
        inputName: "model_name",
        rawValue: "a.safetensors",
        value: "b.safetensors",
        verified: true,
    }]);

    const nextWorkflow = JSON.stringify({
        "1": { class_type: "Third Party/Loader", inputs: { model_name: "c.safetensors" } },
    });
    const textarea = h.document.getElementById("qig-comfy-workflow");
    textarea.value = nextWorkflow;
    h.fireEvent(textarea, "input");
    h.fireEvent(textarea, "change");
    assert.deepEqual(settings.comfyWorkflowComponentOverrides.entries, [], "changed graph source invalidated the override");
});

test("shows saved workflow overrides before inspection and deactivates choices the node no longer advertises", async (t) => {
    const workflow = JSON.stringify({
        "1": { class_type: "ThirdPartySelector", inputs: { mode: "safe" } },
    });
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "comfyui",
                    localUrl: "http://127.0.0.1:8188",
                    comfyWorkflow: workflow,
                    comfyWorkflowComponentOverrides: {
                        version: 1,
                        entries: [{
                            nodeId: "1",
                            classType: "ThirdPartySelector",
                            inputName: "mode",
                            rawValue: "safe",
                            value: "dangerous",
                            verified: true,
                        }],
                    },
                },
            },
        },
        fetch: async () => new Response(JSON.stringify({
            ThirdPartySelector: { input: { required: { mode: ["STRING", {}] } } },
        }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    t.after(() => h.dispose());

    const container = h.document.getElementById("qig-comfy-component-overrides");
    assert.match(container.textContent, /Saved active override.*dangerous/, "active saved value is never invisible");
    container.querySelector(".qig-comfy-discovery-actions button").click();
    const settings = h.host.extension_settings["quick-image-gen"];
    await h.waitFor(
        () => settings.comfyWorkflowComponentOverrides.entries[0]?.verified === false,
        5000,
        "non-COMBO override deactivated",
    );
    assert.match(container.textContent, /Inactive saved override.*dangerous/);
    container.querySelector(".qig-comfy-override button").click();
    assert.deepEqual(settings.comfyWorkflowComponentOverrides.entries, []);
});

test("keeps the Comfy model selection truthful when discovery fails", async (t) => {
    const comfyRequests = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "comfyui",
                    localUrl: "http://127.0.0.1:8188",
                    localModel: "",
                },
            },
        },
        fetch: async (url) => {
            comfyRequests.push(String(url));
            const classType = decodeURIComponent(String(url).split("/").at(-1));
            const inputs = {
                CheckpointLoaderSimple: { ckpt_name: [["first.safetensors"], {}] },
                UNETLoader: { unet_name: [["unet.safetensors"], {}] },
                CLIPLoader: { clip_name: [["clip.safetensors"], {}] },
                DualCLIPLoader: {
                    clip_name1: [["clip.safetensors"], {}],
                    clip_name2: [["t5.safetensors"], {}],
                },
                VAELoader: { vae_name: [["vae.safetensors"], {}] },
            };
            return new Response(JSON.stringify({ [classType]: { input: { required: inputs[classType] || {} } } }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-comfy-model-refresh").click();
    const modelSelect = h.document.getElementById("qig-local-model");
    await h.waitFor(() => [...modelSelect.options].some((option) => option.value === "first.safetensors"), 5000, "Comfy models loaded");
    assert.equal(modelSelect.value, "", "blank saved model remains visibly blank");
    assert.equal(modelSelect.options[0].textContent, "-- Select model --");
    assert.deepEqual([...h.document.getElementById("qig-comfy-clip-catalog").options].map((option) => option.value), ["clip.safetensors", "t5.safetensors"]);
    assert.deepEqual([...h.document.getElementById("qig-comfy-vae-catalog").options].map((option) => option.value), ["vae.safetensors"]);

    h.setFetch(async () => new Response("Forbidden", { status: 403 }));
    h.document.getElementById("qig-comfy-model-refresh").click();
    assert.equal(h.document.getElementById("qig-comfy-clip-catalog").options.length, 0, "old encoder catalogue cleared immediately");
    assert.equal(h.document.getElementById("qig-comfy-vae-catalog").options.length, 0, "old VAE catalogue cleared immediately");
    await h.waitFor(() => modelSelect.textContent.includes("403 Forbidden"), 5000, "Comfy error shown");
    assert.ok(comfyRequests.length >= 5, "all built-in catalogues were queried before the failure check");
});

test("aborts a superseded built-in Comfy catalogue refresh", async (t) => {
    let staleSignal = null;
    let staleCalls = 0;
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "comfyui",
                    localUrl: "http://127.0.0.1:8188",
                },
            },
        },
        fetch: async (url, init) => {
            staleCalls += 1;
            staleSignal = init?.signal;
            return hangUntilAborted(url, init);
        },
    });
    t.after(() => h.dispose());

    const refresh = h.document.getElementById("qig-comfy-model-refresh");
    refresh.click();
    await h.waitFor(() => staleCalls === 6, 5000, "first Comfy catalogue batch started");
    h.setFetch(async (url) => {
        const classType = decodeURIComponent(String(url).split("/").at(-1));
        const required = classType === "CheckpointLoaderSimple" ? { ckpt_name: [["latest.safetensors"], {}] } : {};
        return new Response(JSON.stringify({ [classType]: { input: { required } } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
    refresh.click();
    assert.equal(staleSignal?.aborted, true, "superseded catalogue requests were aborted");
    const model = h.document.getElementById("qig-local-model");
    await h.waitFor(() => [...model.options].some(option => option.value === "latest.safetensors"), 5000, "latest catalogue committed");
});

test("keeps configured A1111 checkpoint and VAE visible while offline", async (t) => {
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "a1111",
                    localUrl: "http://127.0.0.1:7860",
                    a1111Model: "missing-checkpoint.safetensors",
                    a1111Vae: "missing-vae.safetensors",
                },
            },
        },
        fetch: async () => new Response("offline", { status: 503 }),
    });
    t.after(() => h.dispose());

    const model = h.document.getElementById("qig-a1111-model");
    const vae = h.document.getElementById("qig-a1111-vae");
    assert.equal(model.value, "missing-checkpoint.safetensors");
    assert.equal(vae.value, "missing-vae.safetensors");
    h.document.getElementById("qig-a1111-model-refresh").click();
    assert.equal(model.value, "missing-checkpoint.safetensors", "loading state retains configured checkpoint");
    await h.waitFor(() => model.textContent.includes("Failed to load"), 5000, "offline state shown");
    assert.equal(model.value, "missing-checkpoint.safetensors");
    await h.waitFor(() => vae.value === "missing-vae.safetensors", 5000, "configured VAE retained");
});

test("selecting an A1111 checkpoint stays local and uses no global options POST", async (t) => {
    const requests = [];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "a1111",
                    localUrl: "http://127.0.0.1:7860",
                    a1111Model: "first.safetensors",
                },
            },
        },
        fetch: async (url, init = {}) => {
            requests.push({ url: String(url), method: init.method || "GET" });
            const path = String(url);
            let payload = {};
            if (path.endsWith("/sdapi/v1/sd-models")) payload = [
                { title: "first.safetensors", model_name: "First" },
                { title: "second.safetensors", model_name: "Second" },
            ];
            else if (path.endsWith("/sdapi/v1/options")) payload = { sd_model_checkpoint: "first.safetensors" };
            else if (path.endsWith("/sdapi/v1/upscalers")) payload = [];
            else if (path.endsWith("/sdapi/v1/sd-vae")) payload = [];
            else if (path.includes("controlnet/model_list")) payload = { model_list: [] };
            return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
        },
    });
    t.after(() => h.dispose());

    h.document.getElementById("qig-a1111-model-refresh").click();
    const model = h.document.getElementById("qig-a1111-model");
    await h.waitFor(() => [...model.options].some(option => option.value === "second.safetensors"), 5000, "checkpoint catalogue loaded");
    const requestsBeforeSelection = requests.length;
    model.value = "second.safetensors";
    h.fireEvent(model, "change");
    assert.equal(h.host.extension_settings["quick-image-gen"].a1111Model, "second.safetensors");
    assert.equal(requests.length, requestsBeforeSelection, "selection made no network request");
    assert.equal(requests.some(request => request.method === "POST" && request.url.endsWith("/sdapi/v1/options")), false);
});

test("configuration UI rejects duplicate identities and keeps search and summaries accurate", async (t) => {
    const configurations = [
        { id: "home-local", name: "Home", provider: "local", localType: "a1111" },
        { id: "home-poll", name: "Home", provider: "pollinations", pollinationsModel: "flux" },
    ];
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: configurations,
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "local",
                    localType: "a1111",
                },
            },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_configurations: JSON.stringify(configurations),
        },
    });
    t.after(() => h.dispose());

    assert.deepEqual(
        [...h.document.querySelectorAll(".qig-filter-summary-label")].map((label) => label.textContent),
        ["Visible Filters", "Active Now", "Seed Overrides"],
    );

    const configSelect = h.document.getElementById("qig-config-select");
    configSelect.value = "home-poll";
    h.fireEvent(configSelect, "change");
    const provider = h.document.getElementById("qig-provider");
    provider.value = "local";
    h.fireEvent(provider, "change");
    h.document.getElementById("qig-config-update").click();
    await h.waitFor(() => h.toastrCalls.some((call) => call.type === "warning" && /already exists/.test(call.message)), 5000, "duplicate update rejected");
    assert.equal(JSON.parse(h.localStorage.getItem("qig_configurations")).find((entry) => entry.id === "home-poll").provider, "pollinations");

    const search = h.document.getElementById("qig-settings-search");
    search.value = "kl_optimal";
    h.fireEvent(search, "input");
    assert.match(h.document.getElementById("qig-settings-search-status").textContent, /^No settings/);
    const localType = h.document.getElementById("qig-local-type");
    localType.value = "comfyui";
    h.fireEvent(localType, "change");
    assert.match(h.document.getElementById("qig-settings-search-status").textContent, /^Found /, "active search reran after backend switch");
    assert.equal(h.document.getElementById("qig-comfy-scheduler-wrap").classList.contains("qig-search-hidden"), false);

    h.document.getElementById("qig-input-btn").dispatchEvent(new h.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
    }));
    const labels = [...h.document.querySelectorAll(".qig-palette-preset-menu__item")].map((item) => item.textContent);
    assert.ok(labels.some((label) => label.includes("Home · Local")));
    assert.ok(labels.some((label) => label.includes("Home · Pollinations")));
});

test("filter summary combines pools from every active group character", async (t) => {
    const filterPools = [
        { id: "qig_pool_default_global", name: "Default", scope: "global" },
        { id: "alice-pool", name: "Alice", scope: "char", charId: "alice" },
        { id: "bob-pool", name: "Bob", scope: "char", charId: "bob" },
    ];
    const activeGlobal = ["qig_pool_default_global"];
    const activeByChar = {
        alice: ["alice-pool"],
        bob: ["bob-pool"],
    };
    const context = {
        chat: [],
        characters: {
            alice: { id: "alice", name: "Alice", avatar: "alice.png" },
            bob: { id: "bob", name: "Bob", avatar: "bob.png" },
        },
        characterId: null,
        name1: "You",
        name2: "",
        groupId: "g1",
        groups: { g1: { id: "g1", members: ["alice", "bob"] } },
        chatId: "qig-group-chat",
        chatMetadata: {},
        saveChat: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-group-chat",
    };
    const h = await createQigHarness({
        host: {
            getContext: () => context,
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: [],
                    _backupFilterPools: filterPools,
                    _backupActiveFilterPoolIdsGlobal: activeGlobal,
                    _backupActiveFilterPoolIdsByChar: activeByChar,
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                },
            },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_configurations: "[]",
            qig_filter_pools: JSON.stringify(filterPools),
            qig_active_pool_ids_global: JSON.stringify(activeGlobal),
            qig_active_pool_ids_by_char: JSON.stringify(activeByChar),
        },
    });
    t.after(() => h.dispose());

    assert.equal(h.document.querySelector('[data-qig-summary="scope"]').textContent, "2 active characters in group context");
    assert.equal(h.document.querySelector('[data-qig-summary="enabled-pools"]').textContent, "3 enabled pools");
    assert.equal(h.document.querySelector('[data-qig-summary="total-pools"]').textContent, "3 pools available");
});

test("loading a configuration updates the global base beneath a character override", async (t) => {
    const characterSettings = {
        "card:alice.png": {
            prompt: "character prompt",
            negativePrompt: "character negative",
            style: "anime",
            width: 640,
            height: 960,
        },
    };
    const configurations = [{
        id: "global-b",
        name: "Global B",
        provider: "custom",
        customApiUrl: "https://global-custom.example/v1/images",
        customApiRefImages: ["data:image/png;base64,global-custom"],
        prompt: "global B prompt",
        negativePrompt: "global B negative",
        style: "photorealistic",
        width: 896,
        height: 1152,
    }];
    const characterReferences = {
        "card:alice.png": {
            proxyRefImages: ["data:image/png;base64,character-proxy"],
            customApiRefImages: ["data:image/png;base64,character-custom"],
        },
    };
    const context = {
        chat: [],
        characters: { alice: { name: "Alice", avatar: "alice.png" } },
        characterId: "alice",
        name1: "You",
        name2: "Alice",
        groupId: null,
        chatId: "qig-test-chat",
        chatMetadata: {},
        saveChat: async () => {},
        powerUserSettings: {},
        persona: {},
        getPresetManager: () => null,
        chatCompletionSettings: {},
        getCurrentChatId: () => "qig-test-chat",
    };
    const h = await createQigHarness({
        host: {
            extension_settings: {
                "quick-image-gen": {
                    _syncCacheId: "owner-1",
                    _backupConfigurations: configurations,
                    _backupCharSettings: characterSettings,
                    _backupCharRefImages: characterReferences,
                    _configurationMigrationVersion: 1,
                    setupWizardSeen: true,
                    starterPresetsSeeded: true,
                    provider: "proxy",
                    proxyRefImages: ["data:image/png;base64,global-proxy"],
                    prompt: "old global prompt",
                    negativePrompt: "old global negative",
                    style: "none",
                    width: 512,
                    height: 512,
                    _charSettingsBaseState: {
                        prompt: "old global prompt",
                        negativePrompt: "old global negative",
                        style: "none",
                        width: 512,
                        height: 512,
                        proxyRefImages: ["data:image/png;base64,global-proxy"],
                        customApiRefImages: [],
                        nanobananaRefImages: [],
                        nanogptRefImages: [],
                        localRefImage: "",
                    },
                },
            },
            getContext: () => context,
            callGenericPopup: async () => 1,
            POPUP_TYPE: { CONFIRM: 1, TEXT: 2, INPUT: 3 },
            POPUP_RESULT: { AFFIRMATIVE: 1 },
        },
        localStorage: {
            qig_sync_cache_id: "owner-1",
            qig_configurations: JSON.stringify(configurations),
            qig_char_settings: JSON.stringify(characterSettings),
            qig_char_ref_images: JSON.stringify(characterReferences),
        },
    });
    t.after(() => h.dispose());

    const settings = h.host.extension_settings["quick-image-gen"];
    assert.equal(settings.prompt, "character prompt", "character override active after boot");
    assert.deepEqual(settings.proxyRefImages, ["data:image/png;base64,character-proxy"]);
    const select = h.document.getElementById("qig-config-select");
    select.value = "global-b";
    h.fireEvent(select, "change");
    await h.waitFor(() => settings.prompt === "character prompt", 5000, "character override reapplied after configuration load");
    assert.equal(settings.prompt, "character prompt", "character override remains visible");
    assert.equal(settings.style, "anime");
    assert.equal(settings.provider, "custom");
    assert.deepEqual(settings.proxyRefImages, [], "old-provider character references were cleared");
    assert.deepEqual(settings.customApiRefImages, ["data:image/png;base64,character-custom"], "new-provider character references were loaded");

    h.document.getElementById("qig-config-update").click();
    await h.waitFor(() => {
        const [saved] = JSON.parse(h.localStorage.getItem("qig_configurations"));
        return saved?.prompt === "global B prompt";
    }, 5000, "configuration updated from global base");
    const [updated] = JSON.parse(h.localStorage.getItem("qig_configurations"));
    assert.equal(updated.prompt, "global B prompt", "Update did not capture the character prompt");
    assert.deepEqual(updated.customApiRefImages, ["data:image/png;base64,global-custom"], "Update retained global provider references");

    let exportedBlob = null;
    URL.createObjectURL = (blob) => {
        exportedBlob = blob;
        return "blob:qig-export-test";
    };
    URL.revokeObjectURL = () => {};
    h.document.getElementById("qig-export-btn").click();
    await h.waitFor(() => exportedBlob, 5000, "settings export created");
    const exported = JSON.parse(await exportedBlob.text());
    assert.equal(exported.activeSettings.prompt, "global B prompt", "export used the global prompt");
    assert.equal(exported.activeSettings.width, 896, "export used the global dimensions");

    h.document.getElementById("qig-reset-char-btn").click();
    await h.waitFor(() => !JSON.parse(h.localStorage.getItem("qig_char_settings"))["card:alice.png"], 5000, "character override removed");
    assert.equal(settings.prompt, "global B prompt", "new configuration became the recoverable global base");
    assert.equal(settings.negativePrompt, "global B negative");
    assert.equal(settings.style, "photorealistic");
    assert.equal(settings.width, 896);
    assert.equal(settings.height, 1152);
    assert.deepEqual(settings.customApiRefImages, ["data:image/png;base64,global-custom"]);
});
