import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const INDEX_JS_PATH = join(REPO_ROOT, "index.js");
const LIB_DIR = join(REPO_ROOT, "lib");

const HOST_MODULE_FILES = {
    "public/scripts/extensions.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const extension_settings = host.extension_settings;
export const getContext = (...args) => host.getContext(...args);
`,
    "public/script.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const saveSettingsDebounced = (...args) => host.saveSettingsDebounced(...args);
export const saveSettings = (...args) => host.saveSettings(...args);
export const generateQuietPrompt = (...args) => host.generateQuietPrompt(...args);
export const generateRaw = (...args) => host.generateRaw(...args);
export const generateRawData = (...args) => host.generateRawData(...args);
export const createRawPrompt = (...args) => host.createRawPrompt(...args);
export const substituteParams = (...args) => host.substituteParams(...args);
export const getRequestHeaders = (...args) => host.getRequestHeaders(...args);
export const eventSource = host.eventSource;
export const event_types = host.eventTypes;
`,
    "public/scripts/world-info.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const checkWorldInfo = (...args) => host.checkWorldInfo(...args);
`,
    "public/scripts/openai.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const createGenerationParameters = (...args) => host.createGenerationParameters(...args);
export const getChatCompletionModel = (...args) => host.getChatCompletionModel(...args);
`,
    "public/scripts/utils.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const saveBase64AsFile = (...args) => host.saveBase64AsFile(...args);
export const getSanitizedFilename = (...args) => host.getSanitizedFilename(...args);
`,
    "public/scripts/RossAscends-mods.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const humanizedDateTime = (...args) => host.humanizedDateTime(...args);
`,
    "public/scripts/popup.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const callGenericPopup = host.callGenericPopup;
export const POPUP_TYPE = host.POPUP_TYPE || {};
export const POPUP_RESULT = host.POPUP_RESULT || {};
`,
    "public/scripts/slash-commands/SlashCommand.js": `
export class SlashCommand {
    static fromProps(props) { return new SlashCommand(props); }
    constructor(props) { Object.assign(this, props); }
}
`,
    "public/scripts/slash-commands/SlashCommandParser.js": `
const host = globalThis.__QIG_TEST_HOST__;
export const SlashCommandParser = {
    addCommandObject: (command) => host.addSlashCommand(command),
};
`,
    "public/scripts/slash-commands/SlashCommandArgument.js": `
export const ARGUMENT_TYPE = { STRING: "string", NUMBER: "number", BOOLEAN: "boolean", ENUM: "enum", LIST: "list" };
export class SlashCommandArgument {
    static fromProps(props) { return new SlashCommandArgument(props); }
    constructor(props) { Object.assign(this, props); }
}
export class SlashCommandNamedArgument {
    static fromProps(props) { return new SlashCommandNamedArgument(props); }
    constructor(props) { Object.assign(this, props); }
}
`,
    "public/scripts/slash-commands/SlashCommandEnumValue.js": `
export class SlashCommandEnumValue {
    constructor(value) { this.value = value; }
    toString() { return String(this.value); }
}
`,
};

function createEventSourceStub() {
    const listeners = [];
    return {
        on(type, handler) {
            const entry = { type, handler, active: true };
            listeners.push(entry);
            return () => {
                entry.active = false;
            };
        },
        off(type, handler) {
            const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
            if (index >= 0) listeners.splice(index, 1);
        },
        emit(type, payload) {
            for (const entry of [...listeners]) {
                if (entry.active && entry.type === type) {
                    try {
                        entry.handler(payload);
                    } catch (error) {
                        console.error("[qig-harness] event handler error:", error);
                    }
                }
            }
        },
        get listenerCount() {
            return listeners.filter((entry) => entry.active).length;
        },
    };
}

function defaultHost() {
    return {
        extension_settings: {},
        getContext: () => defaultHost.currentContext,
        saveSettingsDebounced: () => {},
        saveSettings: async () => {},
        generateQuietPrompt: async () => "",
        generateRaw: async () => "",
        generateRawData: async () => "",
        createRawPrompt: async () => [],
        substituteParams: (text) => text,
        getRequestHeaders: () => ({}),
        checkWorldInfo: () => "",
        createGenerationParameters: () => {
            throw new Error("createGenerationParameters is not stubbed");
        },
        getChatCompletionModel: () => ({ model: "qig-stub" }),
        saveBase64AsFile: async () => null,
        getSanitizedFilename: (name) => name,
        humanizedDateTime: () => new Date().toISOString(),
        callGenericPopup: undefined,
        POPUP_TYPE: {},
        POPUP_RESULT: {},
        addSlashCommand: () => {},
        eventSource: null,
        eventTypes: {
            MESSAGE_RECEIVED: "message_received",
            CHAT_CHANGED: "chat_changed",
            CHAT_COMPLETION_PROMPT_READY: "chat_completion_prompt_ready",
            SETTINGS_UPDATED: "settings_updated",
        },
    };
}

defaultHost.currentContext = {
    chat: [],
    characters: {},
    characterId: null,
    name1: "",
    name2: "",
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

function createToastrStub(calls) {
    const stub = {};
    for (const type of ["success", "info", "warning", "error"]) {
        stub[type] = (message, title, options) => {
            calls.push({ type, message, title, options });
        };
    }
    stub.clear = () => {};
    return stub;
}

class FakeFileReader {
    constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.onloadend = null;
    }

    _finish(result) {
        this.result = result;
        queueMicrotask(() => {
            this.onload?.({ target: this });
            this.onloadend?.({ target: this });
        });
    }

    readAsDataURL(blob) {
        blob.arrayBuffer()
            .then((buffer) => {
                const base64 = Buffer.from(buffer).toString("base64");
                this._finish(`data:${blob.type || "application/octet-stream"};base64,${base64}`);
            })
            .catch((error) => {
                queueMicrotask(() => this.onerror?.({ target: this, error }));
            });
    }

    readAsArrayBuffer(blob) {
        blob.arrayBuffer()
            .then((buffer) => this._finish(buffer))
            .catch((error) => {
                queueMicrotask(() => this.onerror?.({ target: this, error }));
            });
    }

    readAsText(blob) {
        blob.arrayBuffer()
            .then((buffer) => this._finish(Buffer.from(buffer).toString("utf8")))
            .catch((error) => {
                queueMicrotask(() => this.onerror?.({ target: this, error }));
            });
    }
}

function createFakeImageClass(harness) {
    class FakeImage {
        constructor(width = 0, height = 0) {
            this.onload = null;
            this.onerror = null;
            this.crossOrigin = null;
            this.referrerPolicy = "";
            this.naturalWidth = width;
            this.naturalHeight = height;
            this.width = width;
            this.height = height;
            this._src = null;
        }

        set src(value) {
            this._src = value;
            const responder = harness._imageResponders.find((entry) => entry.matches(value));
            queueMicrotask(() => {
                if (responder) {
                    const size = responder.size || { width: 64, height: 64 };
                    this.naturalWidth = size.width;
                    this.naturalHeight = size.height;
                    this.width = size.width;
                    this.height = size.height;
                    this.onload?.({ target: this });
                } else {
                    this.onerror?.({ target: this });
                }
            });
        }

        get src() {
            return this._src;
        }

        removeAttribute(name) {
            if (name === "src") this._src = null;
        }

        decode() {
            return this._src ? Promise.resolve() : Promise.reject(new Error("No image source to decode"));
        }
    }
    return FakeImage;
}

function createJQueryShim(window) {
    const doc = window.document;
    const delegated = new Map();
    const delegatedKey = (type, selector) => `${type}\u0000${selector}`;

    doc.addEventListener("click", (event) => {
        const target = event.target && typeof event.target.closest === "function" ? event.target : null;
        if (!target) return;
        for (const entry of delegated.values()) {
            if (event.type !== entry.type.split(".")[0]) continue;
            const match = target.closest(entry.selector);
            if (!match) continue;
            const wrapped = Object.create(event);
            Object.defineProperty(wrapped, "currentTarget", { value: match, writable: true, configurable: true });
            try {
                entry.handler.call(match, wrapped);
            } catch (error) {
                console.error("[qig-harness] delegated handler error:", error);
            }
        }
    }, true);

    function wrap(nodes, extra = {}) {
        return Object.assign(nodes, {
            get(index) {
                return nodes[index] ?? null;
            },
            css(prop, value) {
                if (value === undefined) return nodes[0]?.style?.[prop] ?? "";
                for (const node of nodes) {
                    if (node?.style) node.style[prop] = value;
                }
                return this;
            },
            ...extra,
        });
    }

    function jQuery(selectorOrFn) {
        if (typeof selectorOrFn === "function") {
            selectorOrFn.call(doc);
            return;
        }
        if (selectorOrFn === doc || selectorOrFn === window) {
            return wrap([doc], {
                on(type, selector, handler) {
                    delegated.set(delegatedKey(type, selector), { type, selector, handler });
                },
                off(type, selector) {
                    delegated.delete(delegatedKey(type, selector));
                },
            });
        }
        if (selectorOrFn && typeof selectorOrFn === "object" && selectorOrFn.nodeType) {
            return wrap([selectorOrFn]);
        }
        return wrap(Array.from(doc.querySelectorAll(selectorOrFn)));
    }

    return jQuery;
}

export async function createQigHarness(options = {}) {
    const base = mkdtempSync(join(tmpdir(), "qig-harness-"));
    const scriptsDir = join(base, "public", "scripts", "extensions", "third-party", "qig");
    mkdirSync(scriptsDir, { recursive: true });

    writeFileSync(join(scriptsDir, "index.js"), readFileSync(INDEX_JS_PATH, "utf8"));
    symlinkSync(LIB_DIR, join(scriptsDir, "lib"), "dir");

    for (const [relative, content] of Object.entries(HOST_MODULE_FILES)) {
        const target = join(base, relative);
        mkdirSync(join(base, "public", "scripts", "slash-commands"), { recursive: true });
        writeFileSync(target, content);
    }

    const host = options.host ? { ...defaultHost(), ...options.host } : defaultHost();
    if (!host.eventSource) host.eventSource = createEventSourceStub();
    if (!options.host?.saveSettings) {
        // Real SillyTavern emits SETTINGS_UPDATED after an HTTP 2xx save.
        host.saveSettings = async () => {
            host.eventSource.emit(host.eventTypes.SETTINGS_UPDATED);
        };
    }
    defaultHost.currentContext = host.getContext?.() ?? defaultHost.currentContext;
    globalThis.__QIG_TEST_HOST__ = host;

    const dom = new JSDOM(
        `<!doctype html><html><body>
            <div id="extensions_settings"></div>
            <div id="chat"></div>
            <div id="bg1"></div>
            <div id="send_form"><div class="left_menu_buttons"></div></div>
            <div id="leftSendForm"></div>
        </body></html>`,
        { url: "http://localhost:8000/", pretendToBeVisual: true },
    );
    const { window } = dom;

    const toastrCalls = [];
    const harness = {
        base,
        window,
        document: window.document,
        localStorage: window.localStorage,
        host,
        toastrCalls,
        _imageResponders: [],
        _restore: [],
        mod: null,
        disposed: false,

        setFetch(impl) {
            this.fetchImpl = impl;
        },

        imageResponder(matches, size) {
            this._imageResponders.push({ matches, size });
        },

        async waitForInit(timeoutMs = 15000) {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                const failure = this.document.getElementById("qig-init-error");
                if (failure) {
                    throw new Error(`QIG init failed: ${(failure.textContent || "").trim().slice(0, 4000)}`);
                }
                if (Date.now() > deadline) {
                    throw new Error("QIG init timed out");
                }
                // The settings panel appears before the final boot step (host event
                // subscriptions), so keep polling until the whole boot has finished.
                if (this.document.getElementById("qig-settings") && this.host.eventSource.listenerCount > 0) {
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        },

        async waitFor(predicate, timeoutMs = 5000, label = "condition") {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                const value = predicate();
                if (value) return value;
                if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        },

        fireEvent(target, type, init = {}) {
            const event = new window.Event(type, { bubbles: true, cancelable: true, ...init });
            target.dispatchEvent(event);
            return event;
        },

        async dispose() {
            if (this.disposed) return;
            this.disposed = true;
            try {
                this.mod?.teardownQuickImageGen?.();
            } catch (error) {
                console.error("[qig-harness] teardown error:", error);
            }
            dom.window.close();
            rmSync(base, { recursive: true, force: true });
            // Globals intentionally stay installed: module-level timers from the
            // boot sequence may still fire after the test ends, and node:test runs
            // each test file in its own process, so leaving them is safe.
        },
    };

    const install = (key, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
        harness._restore.push([key, descriptor]);
        globalThis[key] = value;
    };

    install("window", window);
    install("document", window.document);
    install("localStorage", window.localStorage);
    install("AbortController", window.AbortController);
    install("AbortSignal", window.AbortSignal);
    // jsdom's canvas getContext throws "Not implemented"; QIG handles a null context
    // (no pixel inspection), which is what a browser without canvas support behaves like.
    const jsdomGetContext = window.HTMLCanvasElement.prototype.getContext;
    window.HTMLCanvasElement.prototype.getContext = function (...args) {
        try {
            return jsdomGetContext.apply(this, args);
        } catch {
            return null;
        }
    };
    install("Element", window.Element);
    install("HTMLElement", window.HTMLElement);
    install("Node", window.Node);
    install("Option", window.Option);
    install("indexedDB", indexedDB);
    install("IDBKeyRange", IDBKeyRange);    install("MutationObserver", window.MutationObserver);
    install("requestAnimationFrame", window.requestAnimationFrame.bind(window));
    install("cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
    install("DOMParser", window.DOMParser);
    install("XMLSerializer", window.XMLSerializer);
    install("Image", createFakeImageClass(harness));
    install("FileReader", FakeFileReader);
    install("toastr", createToastrStub(toastrCalls));
    install("confirm", () => false);
    install("alert", () => {});
    install("prompt", () => null);

    const fetchImplKey = "fetch";
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, fetchImplKey);
    harness._restore.push([fetchImplKey, fetchDescriptor]);
    globalThis.fetch = (url, init) => (harness.fetchImpl ?? harness.fetchImplDefault)(url, init);
    harness.fetchImplDefault = async (url) => {
        throw new Error(`fetch is not stubbed in this test: ${url}`);
    };
    if (options.fetch) harness.fetchImpl = options.fetch;

    const urlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    harness._restore.push(["__qig_url_createObjectURL", urlDescriptor]);
    const blobUrls = [];
    URL.createObjectURL = (blob) => {
        const id = `blob:qig-${blobUrls.length}`;
        blobUrls.push({ id, blob });
        return id;
    };
    URL.revokeObjectURL = (id) => {
        const index = blobUrls.findIndex((entry) => entry.id === id);
        if (index >= 0) blobUrls.splice(index, 1);
    };

    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    if (!globalThis.navigator) {
        install("navigator", { userAgent: "qig-harness" });
    }
    if (!globalThis.navigator.clipboard) {
        try {
            globalThis.navigator.clipboard = { writeText: async () => {} };
        } catch {
            Object.defineProperty(globalThis.navigator, "clipboard", {
                value: { writeText: async () => {} },
                configurable: true,
            });
        }
    }

    if (options.localStorage) {
        for (const [key, value] of Object.entries(options.localStorage)) {
            window.localStorage.setItem(key, value);
        }
    }

    const jQuery = createJQueryShim(window);
    install("jQuery", jQuery);
    install("$", jQuery);

    const moduleUrl = pathToFileURL(join(scriptsDir, "index.js")).href;
    harness.mod = await import(moduleUrl);
    await harness.waitForInit();

    return harness;
}
