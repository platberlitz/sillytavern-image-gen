import assert from "node:assert/strict";
import { createQigHarness } from "./qig-harness.js";

export const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let harnessId = 0;

export async function uiHarness(t, { settings = {}, host = {}, context = {}, fetch } = {}) {
    const owner = `ui-regressions-${++harnessId}`;
    const ctx = {
        chat: [], characters: {}, characterId: null, groupId: null,
        name1: "User", name2: "Character", chatId: "ui-chat", chatMetadata: {},
        saveChat: async () => {}, powerUserSettings: {}, persona: {},
        getPresetManager: () => null, chatCompletionSettings: {}, ...context,
    };
    const h = await createQigHarness({
        host: {
            getContext: () => ctx,
            extension_settings: { "quick-image-gen": {
                _syncCacheId: owner, setupWizardSeen: true,
                provider: "local", localType: "a1111", localUrl: "http://127.0.0.1:7860",
                autoInsert: false, saveToServer: false, useLastMessage: false,
                useLLMPrompt: false, useSTStyle: false, appendQuality: false,
                reviewBeforeGenerate: false, prompt: "a red fox", ...settings,
            } },
            ...host,
        },
        localStorage: { qig_sync_cache_id: owner },
        fetch: (url, init) => {
            if (url === "/api/settings/get") return Response.json({ settings: { extension_settings: globalThis.__QIG_TEST_HOST__.extension_settings } });
            if (init?.method === "HEAD") return new Response(null, { status: 200 });
            if (/^(blob:|data:)/.test(String(url))) return new Response(Buffer.from(PNG_BASE64, "base64"), { headers: { "content-type": "image/png" } });
            return fetch ? fetch(String(url), init) : Response.json({});
        },
    });
    t.after(() => h.dispose());
    h.imageResponder(source => /^(blob:|data:)/.test(String(source)), { width: 8, height: 8 });
    return h;
}

// Only the documented host lifecycle is simulated; this is not a browser layout test.
export function nativePopupHost() {
    const instances = [];
    class Popup {
        constructor(content, type, inputValue, options) {
            assert.ok(content instanceof globalThis.HTMLElement, "native Popup receives a DOM element, never prompt HTML");
            const document = content.ownerDocument;
            this.options = options;
            this.type = type;
            this.inputValue = inputValue;
            this.closeCalls = 0;
            this.dlg = document.createElement("dialog");
            this.dlg.className = "popup";
            this.body = document.createElement("div");
            this.body.className = "popup-body";
            this.content = document.createElement("div");
            this.content.className = "popup-content";
            this.buttonControls = document.createElement("div");
            this.buttonControls.className = "popup-controls";
            this.content.append(content);
            this.body.append(this.content, this.buttonControls);
            this.dlg.append(this.body);
            this.dlg.addEventListener("cancel", event => {
                event.preventDefault();
                void this.completeCancelled();
            });
            instances.push(this);
        }

        show() {
            this.promise = new Promise(resolve => { this.resolve = resolve; });
            this.dlg.ownerDocument.body.append(this.dlg);
            this.dlg.setAttribute("open", "");
            this.dlg.querySelector("[autofocus]")?.focus({ preventScroll: true });
            return this.promise;
        }

        async completeCancelled() {
            this.closeCalls++;
            if (this.options.onClosing && !await this.options.onClosing(this)) return;
            this.dlg.removeAttribute("open");
            this.dlg.remove();
            this.resolve(null);
        }
    }
    return { instances, Popup, POPUP_TYPE: { TEXT: 1 } };
}
