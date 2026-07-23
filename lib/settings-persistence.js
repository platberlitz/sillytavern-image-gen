function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

const persistenceQueues = new WeakMap();

export function cloneSynchronizedValue(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function isValidSynchronizedStore(value, expectedType) {
    if (expectedType === "array") return Array.isArray(value);
    if (expectedType === "object") return isPlainObject(value);
    throw new Error(`Unsupported synchronized store type: ${expectedType}`);
}

export function reconcileSynchronizedStore({ serverValue, localValue, fallback, expectedType }) {
    if (!isValidSynchronizedStore(fallback, expectedType)) {
        throw new Error(`Fallback must be a valid ${expectedType}`);
    }

    if (isValidSynchronizedStore(serverValue, expectedType)) {
        return {
            value: cloneSynchronizedValue(serverValue),
            source: "server",
            serverNeedsUpdate: false,
        };
    }

    const source = isValidSynchronizedStore(localValue, expectedType) ? "local" : "default";
    return {
        value: cloneSynchronizedValue(source === "local" ? localValue : fallback),
        source,
        serverNeedsUpdate: true,
    };
}

export function canSeedSynchronizedStoreFromLocal({ serverCacheId, localCacheId }) {
    const serverId = String(serverCacheId || "");
    const localId = String(localCacheId || "");
    return Boolean(serverId && localId && serverId === localId);
}

function restoreStorageValue(storage, key, previousValue) {
    if (previousValue == null) storage.removeItem(key);
    else storage.setItem(key, previousValue);
}

async function persistSynchronizedStoreNow({
    storage,
    settings,
    localKey,
    backupKey,
    value,
    save,
}) {
    if (!storage || !settings || typeof save !== "function") {
        throw new Error("Synchronized store persistence is unavailable");
    }

    const canonicalValue = cloneSynchronizedValue(value);
    const hadBackup = Object.prototype.hasOwnProperty.call(settings, backupKey);
    const previousBackup = hadBackup ? cloneSynchronizedValue(settings[backupKey]) : undefined;
    let previousLocal = null;
    let cacheWritten = false;
    let cacheError = null;

    try {
        previousLocal = storage.getItem(localKey);
        storage.setItem(localKey, JSON.stringify(canonicalValue));
        cacheWritten = true;
    } catch (error) {
        cacheError = error;
    }

    settings[backupKey] = cloneSynchronizedValue(canonicalValue);
    try {
        await save();
    } catch (error) {
        const rollbackErrors = [];
        if (hadBackup) settings[backupKey] = previousBackup;
        else delete settings[backupKey];
        if (cacheWritten) {
            try {
                restoreStorageValue(storage, localKey, previousLocal);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
            }
        }
        if (rollbackErrors.length) {
            throw new AggregateError([error, ...rollbackErrors], "Server synchronization failed and the local cache could not be fully rolled back");
        }
        throw error;
    }

    return {
        value: canonicalValue,
        cacheSaved: !cacheError,
        cacheError,
    };
}

export function persistSynchronizedStore(options) {
    const { settings } = options;
    if (!settings || (typeof settings !== "object" && typeof settings !== "function")) {
        return Promise.reject(new Error("Synchronized store persistence is unavailable"));
    }

    const previous = persistenceQueues.get(settings) || Promise.resolve();
    const operation = previous
        .catch(() => {})
        .then(() => persistSynchronizedStoreNow(options));
    persistenceQueues.set(settings, operation);
    return operation.finally(() => {
        if (persistenceQueues.get(settings) === operation) persistenceQueues.delete(settings);
    });
}
