import { createAbortDeadline } from "./network-runtime.js";
import { readResponseJson } from "./security.js";

// ST 1.14 saves resolve undefined even on failure. Read the persisted target,
// never a global event or the in-memory settings, to confirm those saves.
async function readHostPersistenceJson(url, body, {
    fetchImpl = null,
    getRequestHeaders = null,
    timeoutMs = 5000,
    maxBytes,
}) {
    if (typeof fetchImpl !== "function") return null;
    const deadline = createAbortDeadline(null, timeoutMs);
    try {
        const headers = typeof getRequestHeaders === "function" ? getRequestHeaders() : {};
        const response = await fetchImpl(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            cache: "no-store",
            signal: deadline.signal,
        });
        if (!response?.ok) return null;
        return await readResponseJson(response, maxBytes);
    } catch {
        return null;
    } finally {
        deadline.dispose();
    }
}

export async function confirmSettingsValues({ settingsKey, expectedValues, ...options }) {
    if (!settingsKey || !expectedValues || !Object.keys(expectedValues).length) return false;
    const payload = await readHostPersistenceJson("/api/settings/get", {}, options);
    try {
        const settings = typeof payload?.settings === "string" ? JSON.parse(payload.settings) : payload?.settings;
        const entry = settings?.extension_settings?.[settingsKey];
        return !!entry && Object.entries(expectedValues).every(([key, value]) =>
            JSON.stringify(entry[key]) === JSON.stringify(value));
    } catch {
        return false;
    }
}

export function confirmSettingsSyncCacheId({ expectedSyncCacheId, ...options }) {
    if (typeof expectedSyncCacheId !== "string" || !expectedSyncCacheId) return Promise.resolve(false);
    return confirmSettingsValues({ ...options, expectedValues: { _syncCacheId: expectedSyncCacheId } });
}

export function createChatSaveConfirmer({ context, metadataOnly = false, ...options }) {
    const chatId = context?.chatId ?? context?.getCurrentChatId?.();
    const groupId = context?.groupId;
    const character = context?.characters?.[context?.characterId];
    const avatar = character?.avatar;
    const name = character?.name;
    const expected = JSON.stringify(metadataOnly ? context?.chatMetadata : context?.chat);
    if (typeof chatId !== "string" || !chatId || !expected || (!groupId && !avatar)) return async () => false;
    // Metadata-only character saves still read the full chat; groups read the group list.
    const contents = metadataOnly ? JSON.stringify(groupId ? context?.groups : context?.chat) : expected;
    const metadata = metadataOnly ? expected : JSON.stringify(context?.chatMetadata);
    const encoder = new TextEncoder();
    const readOptions = {
        ...options,
        // One MiB of header/envelope slack, not a provider-response size limit.
        maxBytes: encoder.encode(contents || "").byteLength + encoder.encode(metadata || "").byteLength + 1024 * 1024,
    };

    return async () => {
        if (groupId && metadataOnly) {
            // Group metadata lives in the group file, not in its message array.
            const groups = await readHostPersistenceJson("/api/groups/all", {}, readOptions);
            const group = Array.isArray(groups) ? groups.find(item => String(item?.id) === String(groupId)) : null;
            return group?.chat_id === chatId && JSON.stringify(group.chat_metadata) === expected;
        }
        const payload = await readHostPersistenceJson(
            groupId ? "/api/chats/group/get" : "/api/chats/get",
            groupId ? { id: chatId } : { ch_name: name, file_name: chatId, avatar_url: avatar },
            readOptions,
        );
        if (!Array.isArray(payload) || (!groupId && !payload[0]?.chat_metadata)) return false;
        // ST adds the header outside context.chat and saves message JSON unchanged.
        const actual = metadataOnly ? payload[0].chat_metadata : (groupId ? payload : payload.slice(1));
        return JSON.stringify(actual) === expected;
    };
}

export function createSettingsSaveEventConfirmer({ eventSource = null, eventTypes = null, confirm = null, timeoutMs = 2500 }) {
    return () => {
        let cancel = () => {};
        const confirmation = new Promise((resolve) => {
            const type = eventTypes?.SETTINGS_UPDATED;
            if (!eventSource || typeof eventSource.on !== "function" || !type || typeof confirm !== "function") {
                resolve(null);
                return;
            }

            let settled = false;
            let unsubscribe = null;
            let timer = null;

            const off = () => {
                try {
                    if (typeof unsubscribe === "function") unsubscribe();
                    else if (typeof eventSource.off === "function") eventSource.off(type, handler);
                    else if (typeof eventSource.removeListener === "function") eventSource.removeListener(type, handler);
                } catch { /* host teardown may already have removed the listener */ }
            };
            const finish = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                off();
                resolve(value);
            };
            const handler = () => {
                // SETTINGS_UPDATED has no payload and may belong to another save.
                void Promise.resolve().then(() => settled ? false : confirm()).then(value => {
                    if (value === true) finish(true);
                }, () => {});
            };
            cancel = () => finish(false);
            timer = setTimeout(() => finish(false), timeoutMs);

            try {
                unsubscribe = eventSource.on(type, handler);
            } catch {
                finish(null);
            }
        });
        confirmation.cancel = () => cancel();
        confirmation.confirmAfterSave = async () => {
            cancel();
            // A slow save can outlast observation, and early evidence can become stale.
            return typeof confirm === "function" && await confirm() === true;
        };
        return confirmation;
    };
}
