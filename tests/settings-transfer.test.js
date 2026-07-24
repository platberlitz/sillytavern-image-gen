import assert from "node:assert/strict";
import test from "node:test";

import {
    createSettingsExport,
    MAX_SETTINGS_IMPORT_BYTES,
    mergePreservingPrivateFields,
    mergeSettingsImportStores,
    parseSettingsImport,
    SETTINGS_TRANSFER_VERSION,
    stageStorageTransaction,
} from "../lib/settings-transfer.js";

test("settings exports include active state but omit secrets and private images", () => {
    const exported = createSettingsExport({
        activeSettings: {
            provider: "proxy",
            proxyKey: "active-canary",
            proxyRefImages: ["data:image/png;base64,private"],
            comfyWorkflow: JSON.stringify({ "1": { inputs: { api_key: "workflow-canary", model: "safe" } } }),
            width: 768,
            _backupProfiles: { secret: true },
            _syncCacheId: "internal-cache-owner",
        },
        connectionProfiles: {
            proxy: { Home: { proxyUrl: "https://user:pass@images.example/v1?model=flux&api_key=url-canary", proxyKey: "profile-canary", proxyModel: "flux" } },
        },
        contextualFilters: [{ id: "filter-1", cardKey: "character:one", poolIds: ["default-global"] }],
        charRefImages: { "1": ["data:image/png;base64,private"] },
        generationPresets: [],
    }, { now: new Date("2026-07-21T00:00:00.000Z") });

    assert.equal(exported.version, SETTINGS_TRANSFER_VERSION);
    assert.equal(exported.activeSettings.width, 768);
    assert.equal(exported.activeSettings.comfyWorkflow, undefined);
    assert.equal(exported.connectionProfiles.proxy.Home.proxyModel, "flux");
    assert.equal(exported.connectionProfiles.proxy.Home.proxyUrl, "https://images.example/v1?model=flux");
    assert.equal(exported.contextualFilters[0].cardKey, "character:one");
    assert.equal(exported.charRefImages, undefined);
    assert.doesNotMatch(JSON.stringify(exported), /canary|base64|_backupProfiles|internal-cache-owner/);
});

test("settings transfer fails closed for normalized credential fields and malformed credential strings", () => {
    const exported = createSettingsExport({
        activeSettings: {
            width: 768,
            clientSecret: "client-canary",
            private_key: "private-canary",
            refreshToken: "refresh-canary",
            id_token: "id-canary",
            bearerToken: "bearer-canary",
            unsafeModel: "auth_token=inline-canary",
            unsafePathModel: "https://models.example/api%5Fkey%3Dpath-canary/model",
            safeModel: "checkpoint.safetensors",
        },
    });
    assert.deepEqual(exported.activeSettings, { width: 768, safeModel: "checkpoint.safetensors" });
    assert.doesNotMatch(JSON.stringify(exported), /canary/);
});

test("Comfy executable graphs are omitted and workflow presets are not imported", () => {
    const exported = createSettingsExport({
        activeSettings: {
            comfyWorkflow: '{"export-active-canary":true}',
            PROXYCOMFYWORKFLOW: '{"export-proxy-canary":true}',
            width: 768,
        },
        comfyWorkflows: [{
            id: "workflow-1",
            name: "Portrait",
            updatedAt: "2026-07-22T00:00:00.000Z",
            localModel: "flux-safe",
            ComfyWorkflow: '{"stored-comfy-canary":true}',
            Workflow: { "stored-workflow-canary": true },
            REQUEST: { "stored-request-canary": true },
        }],
    });

    assert.deepEqual(exported.activeSettings, { width: 768 });
    assert.deepEqual(exported.comfyWorkflows, [{
        id: "workflow-1",
        name: "Portrait",
        updatedAt: "2026-07-22T00:00:00.000Z",
        localModel: "flux-safe",
    }]);
    assert.doesNotMatch(JSON.stringify(exported), /canary/);

    const imported = parseSettingsImport(JSON.stringify({
        version: SETTINGS_TRANSFER_VERSION,
        activeSettings: {
            COMFYWORKFLOW: '{"import-active-canary":true}',
            ProxyComfyWorkflow: '{"import-proxy-canary":true}',
            height: 1024,
        },
        comfyWorkflows: [{
            id: "workflow-2",
            name: "Landscape",
            localModel: "sdxl-safe",
            comfyWorkflow: '{"import-comfy-canary":true}',
            workflow: { "import-workflow-canary": true },
            Request: { "import-request-canary": true },
        }],
    }));

    assert.deepEqual(imported.activeSettings, { height: 1024 });
    assert.equal(imported.comfyWorkflows, undefined);
    assert.doesNotMatch(JSON.stringify(imported), /canary/);
});

test("legacy Comfy interruption remains local trust configuration", () => {
    const exported = createSettingsExport({
        activeSettings: { comfyAllowLegacyInterrupt: true, width: 768 },
    });
    const imported = parseSettingsImport(JSON.stringify({
        version: SETTINGS_TRANSFER_VERSION,
        activeSettings: { COMFYALLOWLEGACYINTERRUPT: true, width: 1024 },
    }));
    const merged = mergePreservingPrivateFields({ comfyAllowLegacyInterrupt: false }, {
        comfyAllowLegacyInterrupt: true,
        width: 1024,
    });

    assert.deepEqual(exported.activeSettings, { width: 768 });
    assert.deepEqual(imported.activeSettings, { width: 1024 });
    assert.deepEqual(merged, { comfyAllowLegacyInterrupt: false, width: 1024 });
});

test("Context Media exports retain taxonomy but omit all local media details", () => {
    const exported = createSettingsExport({
        contextMedia: {
            chatMap: { "Character - 2026-07-22": "locations" },
            taxonomy: [{
                id: "locations",
                label: "Locations",
                description: "Reusable scene locations",
                type: "image/png",
                serverPath: "/data/users/private/taxonomy.json",
                previewUrl: "https://private.example/preview.png",
                localMediaRef: "private-ref",
                binaryData: "binary-taxonomy-canary",
                media: [{ id: "local-1", serverPath: "/data/users/private/castle.png" }],
            }],
            media: [{
                id: "local-1",
                url: "https://private.example/castle.png",
                mimeType: "image/png",
                localMediaRef: "private-ref",
                data: "binary-canary",
            }],
        },
    });

    assert.equal(exported.version, 7);
    assert.deepEqual(exported.contextMedia, {
        chatMap: {},
        taxonomy: [{
            id: "locations",
            label: "Locations",
            description: "Reusable scene locations",
            media: [],
        }],
        media: [],
    });
    assert.doesNotMatch(JSON.stringify(exported.contextMedia), /private|castle\.png|image\/png|binary-canary/);
});

test("Context Media imports accept portable taxonomy and discard injected media details", () => {
    const imported = parseSettingsImport(JSON.stringify({
        version: 7,
        contextMedia: {
            taxonomy: [{
                id: "poses",
                label: "Poses",
                description: "Reusable pose references",
                format: "image/webp",
                serverPath: "/private/taxonomy.json",
                previewUrl: "https://private.example/preview.webp",
                localMediaRef: "private-ref",
                payload: "binary-taxonomy-canary",
                media: [{ id: "local-2", src: "blob:private-preview" }],
            }],
            media: [{
                id: "local-2",
                filePath: "C:\\private\\pose.webp",
                href: "https://private.example/pose.webp",
                contentType: "image/webp",
                mediaId: "local-2",
                bytes: [1, 2, 3],
            }],
        },
    }));

    assert.deepEqual(imported.contextMedia, {
        taxonomy: [{
            id: "poses",
            label: "Poses",
            description: "Reusable pose references",
            media: [],
        }],
        media: [],
    });
});

test("custom API trust and executable mappings never cross settings exports", () => {
    const exported = createSettingsExport({
        activeSettings: {
            provider: "custom",
            model: "private-custom-model",
            customApiUrl: "https://untrusted.example/generate",
            customApiPollUrl: "https://untrusted.example/jobs/{{jobId}}",
            customApiKey: "custom-canary",
            customApiRefImages: ["data:image/png;base64,private"],
            customApiRequestTemplate: '{"prompt":"{{prompt}}","api_key":"template-canary"}',
            customApiResponsePath: "/image",
        },
    });

    assert.equal(exported.activeSettings.customApiUrl, undefined);
    assert.equal(exported.activeSettings.customApiPollUrl, undefined);
    assert.equal(exported.activeSettings.customApiKey, undefined);
    assert.equal(exported.activeSettings.customApiRefImages, undefined);
    assert.equal(exported.activeSettings.customApiRequestTemplate, undefined);
    assert.equal(exported.activeSettings.model, undefined);
    assert.doesNotMatch(JSON.stringify(exported), /canary|base64/);

    const imported = parseSettingsImport(JSON.stringify(exported));
    assert.equal(imported.activeSettings.customApiUrl, undefined);
    assert.equal(imported.activeSettings.customApiPollUrl, undefined);
    assert.equal(imported.activeSettings.provider, undefined);
    assert.equal(imported.activeSettings.customApiRequestTemplate, undefined);
});

test("imports cannot pair custom mappings or authentication behavior with local credentials", () => {
    const imported = parseSettingsImport(JSON.stringify({
        version: 6,
        activeSettings: {
            provider: "custom",
            customApiAuthType: "query",
            customApiAuthName: "stolen",
            customApiMethod: "PUT",
            customApiRequestTemplate: '{"prompt":"{{prompt}}"}',
        },
        connectionProfiles: {
            custom: { Shared: { customApiAuthType: "header", customApiAuthName: "X-Stolen", customApiModel: "safe" } },
        },
        generationPresets: [{ id: "custom-1", name: "Shared", provider: "custom", customApiMethod: "PATCH" }],
    }));

    assert.deepEqual(imported.activeSettings, {});
    assert.equal(imported.connectionProfiles.custom, undefined);
    assert.deepEqual(imported.generationPresets, []);
});

test("version 5 imports are migrated and private profile fields are ignored", () => {
    let serial = 0;
    const imported = parseSettingsImport(JSON.stringify({
        version: 5,
        connectionProfiles: { proxy: { Home: { proxyKey: "untrusted", proxyModel: "flux" } } },
        generationPresets: [{ name: "Legacy" }],
        contextualFilters: [{ name: "Legacy filter", poolIds: ["default-global"] }],
        filterPools: [{ id: "default-global", name: "Default" }],
        activeFilterPoolIdsGlobal: ["default-global"],
    }), { createId: (prefix) => `${prefix}-${++serial}` });

    assert.equal(imported.sourceVersion, 5);
    assert.equal(imported.connectionProfiles.proxy.Home.proxyKey, undefined);
    assert.equal(imported.connectionProfiles.proxy.Home.proxyModel, "flux");
    assert.match(imported.generationPresets[0].id, /^generationPresets-/);
    assert.match(imported.contextualFilters[0].id, /^contextualFilters-/);
});

test("private fields are stripped from every store except explicit legacy references", () => {
    const imported = parseSettingsImport(JSON.stringify({
        version: 5,
        generationPresets: [{ id: "preset-1", name: "Safe", proxyKey: "preset-secret" }],
        charSettings: { alice: { width: 768, apiKey: "character-secret" } },
        contextualFilters: [{ id: "filter-1", name: "Safe", token: "filter-secret" }],
        charRefImages: { alice: ["data:image/png;base64,legacy-private"] },
    }));

    assert.equal(imported.generationPresets[0].proxyKey, undefined);
    assert.equal(imported.charSettings.alice.apiKey, undefined);
    assert.equal(imported.contextualFilters[0].token, undefined);
    assert.equal(imported.charRefImages.alice[0], "data:image/png;base64,legacy-private");
});

test("version 6 imports cannot restore private reference-image stores", () => {
    const imported = parseSettingsImport(JSON.stringify({
        version: 6,
        charRefImages: { alice: ["data:image/png;base64,private"] },
        generationPresets: [{ id: "preset-1", preview: "blob:private-preview" }],
    }));

    assert.equal(imported.charRefImages, undefined);
    assert.equal(imported.generationPresets[0].preview, undefined);
});

test("imports reject unsupported versions, prototype keys, bad IDs, and oversized files", () => {
    assert.throws(() => parseSettingsImport('{"version":8}'), /Unsupported settings version/);
    assert.throws(() => parseSettingsImport('{"version":6,"activeSettings":{"__proto__":{}}}'), /forbidden field/);
    assert.throws(() => parseSettingsImport(JSON.stringify({
        version: 6,
        filterPools: [{ id: "x');alert(1)//" }],
    })), /invalid ID/);
    assert.throws(() => parseSettingsImport(" ".repeat(MAX_SETTINGS_IMPORT_BYTES + 1)), /smaller than/);
});

test("merging imported settings preserves local credentials without accepting imported ones", () => {
    const current = {
        proxyKey: "local-secret",
        comfyWorkflow: '{"local-comfy":true}',
        PROXYCOMFYWORKFLOW: '{"local-proxy-comfy":true}',
        nested: { apiKey: "nested-secret", model: "old" },
    };
    const imported = parseSettingsImport(JSON.stringify({
        version: 6,
        activeSettings: {
            proxyKey: "file-secret",
            comfyWorkflow: '{"file-comfy":true}',
            PROXYCOMFYWORKFLOW: '{"file-proxy-comfy":true}',
            nested: { apiKey: "file-nested", model: "new" },
            width: 1024,
        },
    })).activeSettings;
    const merged = mergePreservingPrivateFields(current, imported);

    assert.deepEqual(merged, {
        proxyKey: "local-secret",
        comfyWorkflow: '{"local-comfy":true}',
        PROXYCOMFYWORKFLOW: '{"local-proxy-comfy":true}',
        nested: { apiKey: "nested-secret", model: "new" },
        width: 1024,
    });
});

test("imports retain locally trusted endpoints instead of pairing file URLs with local keys", () => {
    const imported = parseSettingsImport(JSON.stringify({
        version: 6,
        activeSettings: { proxyUrl: "https://untrusted.example/v1", proxyModel: "new-model" },
        connectionProfiles: { proxy: { Monkey: { proxyUrl: "https://untrusted.example/v1", proxyModel: "flux" } } },
    }));
    const merged = mergePreservingPrivateFields({
        proxyUrl: "https://trusted.example/v1",
        proxyKey: "local-secret",
    }, imported.activeSettings);

    assert.equal(imported.activeSettings.proxyUrl, undefined);
    assert.equal(imported.connectionProfiles.proxy.Monkey.proxyUrl, undefined);
    assert.equal(imported.connectionProfiles.proxy.Monkey.proxyModel, "flux");
    assert.deepEqual(merged, {
        proxyUrl: "https://trusted.example/v1",
        proxyKey: "local-secret",
        proxyModel: "new-model",
    });
});

test("export parse and commit merge preserve local Custom records while replacing portable records", () => {
    const current = {
        connectionProfiles: {
            custom: {
                Private: {
                    customApiUrl: "https://trusted.local/generate",
                    customApiKey: "local-custom-secret",
                    customApiRequestTemplate: '{"prompt":"{{prompt}}"}',
                },
            },
            proxy: { Old: { proxyModel: "old-model", proxyKey: "old-secret" } },
        },
        generationPresets: [
            { id: "custom-private", name: "Private", provider: "custom", customApiKey: "preset-secret", customApiRequestTemplate: "{}" },
            { id: "portable-old", name: "Old", provider: "proxy" },
        ],
    };
    const exported = createSettingsExport({
        connectionProfiles: {
            custom: { ExportCanary: { customApiKey: "must-not-export" } },
            proxy: { Imported: { proxyModel: "new-model" } },
        },
        generationPresets: [
            { id: "custom-export", name: "Custom", provider: "custom", customApiKey: "must-not-export" },
            { id: "portable-new", name: "New", provider: "proxy" },
        ],
    });
    const parsed = parseSettingsImport(JSON.stringify(exported));
    const committed = mergeSettingsImportStores(current, parsed);

    assert.deepEqual(Object.keys(committed.connectionProfiles), ["proxy", "custom"]);
    assert.deepEqual(committed.connectionProfiles.proxy, { Imported: { proxyModel: "new-model" } });
    assert.deepEqual(committed.connectionProfiles.custom, current.connectionProfiles.custom);
    assert.deepEqual(committed.generationPresets.map(record => record.id), ["portable-new", "custom-private"]);
    assert.equal(committed.generationPresets[1].customApiKey, "preset-secret");
    assert.doesNotMatch(JSON.stringify(exported), /must-not-export|custom-export|ExportCanary/);
});

test("storage staging rolls back every key when a write fails", () => {
    const values = new Map([["first", "old-first"], ["second", "old-second"]]);
    let fail = true;
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem(key, value) {
            if (fail && key === "second" && value === "new-second") throw new Error("quota");
            values.set(key, value);
        },
        removeItem: (key) => values.delete(key),
    };

    assert.throws(() => stageStorageTransaction(storage, {
        first: "new-first",
        second: "new-second",
    }), /Could not save imported settings/);
    fail = false;
    assert.equal(values.get("first"), "old-first");
    assert.equal(values.get("second"), "old-second");
});

test("a staged storage transaction can be rolled back after later failures", () => {
    const values = new Map([["first", "old"]]);
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
    const transaction = stageStorageTransaction(storage, { first: "new", added: "value" });
    assert.equal(values.get("first"), "new");
    transaction.rollback();
    assert.equal(values.get("first"), "old");
    assert.equal(values.has("added"), false);
});

test("rollback attempts every key after an individual restore failure", () => {
    const values = new Map([["first", "old-first"], ["second", "old-second"]]);
    const restored = [];
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem(key, value) {
            if (key === "first" && value === "old-first") throw new Error("first is locked");
            values.set(key, value);
            if (value.startsWith("old-")) restored.push(key);
        },
        removeItem: (key) => values.delete(key),
    };
    const transaction = stageStorageTransaction(storage, { first: "new-first", second: "new-second" });

    assert.throws(() => transaction.rollback(), /could not be fully rolled back/);
    assert.equal(values.has("first"), false);
    assert.equal(values.get("second"), "old-second");
    assert.deepEqual(restored, ["second"]);
});
