// Artist lists for random selection
const ARTISTS_NATURAL = ["abubu", "afrobull", "aiue oka", "akairiot", "akamatsu ken", "alex ahad", "alzi xiaomi", "amazuyu tatsuki", "ask (askzy)", "atdan", "ayami kojima", "azto dio", "bkub", "butcha-u", "ciloranko", "dino (dinoartforame)", "dishwasher1910", "dsmile", "ebifurya", "eroquis", "fkey", "fuzichoco", "gomennasai", "hews", "hiten", "hoshi (snacherubi)", "kantoku", "kawacy", "ke-ta", "kuavera", "kuon (kwonchan)", "lack", "lm7", "mika pikazo", "mikeinel", "morikura en", "nardack", "neco", "nian", "nixeu", "pochi (pochi-goya)", "redjuice", "rei (sanbonzakura)", "rurudo", "shirataki", "sky-freedom", "tofuubear", "wanke", "yaegashi nan", "yamakaze", "yoshiaki", "yuuki tatsuya"];

const ARTISTS_TAGS = ["abubu", "afrobull", "aiue_oka", "akairiot", "akamatsu_ken", "alex_ahad", "alzi_xiaomi", "amazuyu_tatsuki", "ask_(askzy)", "atdan", "ayami_kojima", "azto_dio", "bkub", "butcha-u", "ciloranko", "dino_(dinoartforame)", "dishwasher1910", "dsmile", "ebifurya", "eroquis", "fkey", "fuzichoco", "gomennasai", "hews", "hiten", "hoshi_(snacherubi)", "kantoku", "kawacy", "ke-ta", "kuavera", "kuon_(kwonchan)", "lack", "lm7", "mika_pikazo", "mikeinel", "morikura_en", "nardack", "neco", "nian", "nixeu", "pochi_(pochi-goya)", "redjuice", "rei_(sanbonzakura)", "rurudo", "shirataki", "sky-freedom", "tofuubear", "wanke", "yaegashi_nan", "yamakaze", "yoshiaki", "yuuki_tatsuya"];

function getRandomArtist(useTagFormat = false) {
    const artists = useTagFormat ? ARTISTS_TAGS : ARTISTS_NATURAL;
    return artists[Math.floor(Math.random() * artists.length)];
}

const extensionName = "quick-image-gen";
let extension_settings, getContext, saveSettingsDebounced, generateQuietPrompt, secret_state, rotateSecret, getRequestHeaders;
let saveBase64AsFile, getSanitizedFilename, humanizedDateTime;

const DEFAULT_INJECT_TAG_NAME = "image";
const LEGACY_INJECT_PROMPT_DEFAULT = 'When describing a scene visually, include an image tag: <pic prompt="detailed visual description">\nUse this for important visual moments. The prompt should describe the scene in detail including character appearances, poses, expressions, clothing, and setting.';
const LEGACY_INJECT_REGEX_DEFAULT = '<pic\\s+prompt="([^"]+)"\\s*/?>';
const DUAL_INJECT_PROMPT_DEFAULT = 'When describing a scene visually, include an image tag using one of these formats:\n- Simple: <image>detailed visual description</image>\n- Alternative: <pic prompt="detailed visual description">\nUse this for important visual moments. The description should detail character appearances, poses, expressions, clothing, and setting.';
const DUAL_INJECT_REGEX_DEFAULT = '<pic\\s+prompt="([^"]+)"\\s*/?>|<image>([\\s\\S]*?)</image>';

function escapeRegex(text) {
    return String(text ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeInjectTagName(value) {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "");
    return /^[a-z][a-z0-9_-]*$/.test(normalized) ? normalized : DEFAULT_INJECT_TAG_NAME;
}

function buildDefaultInjectPrompt(tagName = DEFAULT_INJECT_TAG_NAME) {
    const safeTagName = normalizeInjectTagName(tagName);
    return `When describing a scene visually, include an image tag in the final visible reply using this exact format:\n<${safeTagName}>detailed visual description</${safeTagName}>\nUse this for important visual moments. Do not put the image tag inside <think> blocks, hidden reasoning, analysis sections, or code fences. The description should detail character appearances, poses, expressions, clothing, and setting.`;
}

function buildDefaultInjectRegex(tagName = DEFAULT_INJECT_TAG_NAME) {
    const normalizedTag = normalizeInjectTagName(tagName);
    const pairedTagNames = [...new Set([normalizedTag, DEFAULT_INJECT_TAG_NAME])];
    const pairedPatterns = pairedTagNames.map(name => `<${escapeRegex(name)}>([\\s\\S]*?)<\\/${escapeRegex(name)}>`);
    return [...pairedPatterns, LEGACY_INJECT_REGEX_DEFAULT].join("|");
}

function isGeneratedInjectPrompt(value, tagName = DEFAULT_INJECT_TAG_NAME) {
    if (typeof value !== "string") return false;
    return [
        buildDefaultInjectPrompt(tagName),
        DUAL_INJECT_PROMPT_DEFAULT,
        LEGACY_INJECT_PROMPT_DEFAULT,
    ].includes(value);
}

function isGeneratedInjectRegex(value, tagName = DEFAULT_INJECT_TAG_NAME) {
    if (typeof value !== "string") return false;
    return [
        buildDefaultInjectRegex(tagName),
        DUAL_INJECT_REGEX_DEFAULT,
        LEGACY_INJECT_REGEX_DEFAULT,
    ].includes(value);
}

function getInjectTagName(settings) {
    return normalizeInjectTagName(settings?.injectTagName ?? DEFAULT_INJECT_TAG_NAME);
}

function getInjectPromptTemplate(settings) {
    return typeof settings?.injectPrompt === "string" && settings.injectPrompt.trim()
        ? settings.injectPrompt
        : buildDefaultInjectPrompt(getInjectTagName(settings));
}

function getInjectRegexPattern(settings) {
    return typeof settings?.injectRegex === "string" && settings.injectRegex.trim()
        ? settings.injectRegex
        : buildDefaultInjectRegex(getInjectTagName(settings));
}

function getInjectTagPreview(tagName = DEFAULT_INJECT_TAG_NAME) {
    const safeTagName = normalizeInjectTagName(tagName);
    return `<${safeTagName}>detailed visual description</${safeTagName}>`;
}

const defaultSettings = {
    provider: "pollinations",
    style: "none",
    prompt: "{{char}} in the current scene",
    negativePrompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, deformed, ugly, duplicate, morbid, mutilated, out of frame, mutation, disfigured",
    qualityTags: "masterpiece, best quality, highly detailed, sharp focus, 8k",
    appendQuality: true,
    useLastMessage: true,
    useLLMPrompt: false,
    llmPromptStyle: "tags",
    llmCustomInstruction: "",
    llmEditPrompt: false,
    llmAddQuality: false,
    llmAddLighting: false,
    llmAddArtist: false,
    llmPrefill: "",
    messageRange: "-1",
    width: 512,
    height: 512,
    steps: 25,
    cfgScale: 7,
    sampler: "euler_a",
    seed: -1,
    autoGenerate: false,
    autoInsert: false,
    insertAsHiddenReply: false,
    saveToServer: false,
    saveToServerEmbedMetadata: true,
    disablePaletteButton: false,
    paletteMode: "direct",
    confirmBeforeGenerate: false,
    enableParagraphPicker: false,
    batchCount: 1,
    sequentialSeeds: false,
    // Reverse Proxy
    proxyUrl: "",
    proxyKey: "",
    proxyModel: "",
    proxyLoras: "",
    proxyFacefix: false,
    proxySteps: 25,
    proxyCfg: 6,
    proxySampler: "Euler a",
    proxySeed: -1,
    proxyRefImages: [],
    proxyExtraInstructions: "",
    proxyComfyMode: false,
    proxyComfyTimeout: 300,
    proxyComfyNodeId: "",
    proxyComfyWorkflow: "",
    // NovelAI
    naiKey: "",
    naiModel: "nai-diffusion-4-5-curated",
    naiProxyUrl: "",
    naiProxyKey: "",
    // ArliAI
    arliKey: "",
    arliModel: "arliai-realistic-v1",
    // NanoGPT
    nanogptKey: "",
    nanogptModel: "image-flux-schnell",
    nanogptRefImages: [],
    nanogptStrength: 0.75,
    // Chutes
    chutesKey: "",
    chutesModel: "stabilityai/stable-diffusion-xl-base-1.0",
    // CivitAI
    civitaiKey: "",
    civitaiModel: "urn:air:sd1:checkpoint:civitai:4201@130072",
    civitaiScheduler: "EulerA",
    civitaiLoras: "",
    // Nanobanana (Gemini)
    nanobananaKey: "",
    nanobananaModel: "gemini-2.5-flash-image",
    nanobananaExtraInstructions: "",
    nanobananaRefImages: [],
    // Stability AI
    stabilityKey: "",
    // Replicate
    replicateKey: "",
    replicateModel: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    // Fal.ai
    falKey: "",
    falModel: "fal-ai/flux/schnell",
    // Together AI
    togetherKey: "",
    togetherModel: "stabilityai/stable-diffusion-xl-base-1.0",
    // Pollinations
    pollinationsModel: "",
    // Local (A1111/ComfyUI)
    localUrl: "http://127.0.0.1:7860",
    localType: "a1111",
    localModel: "model.safetensors",
    localRefImage: "",
    localDenoise: 0.75,
    // A1111 specific
    a1111Model: "",
    a1111ClipSkip: 1,
    a1111Scheduler: "Automatic",
    a1111RestoreFaces: false,
    a1111Tiling: false,
    a1111Subseed: -1,
    a1111SubseedStrength: 0,
    a1111Adetailer: false,
    a1111AdetailerModel: "face_yolov8n.pt",
    a1111AdetailerPrompt: "",
    a1111AdetailerNegative: "",
    a1111AdetailerDenoise: 0.4,
    a1111AdetailerConfidence: 0.3,
    a1111AdetailerMaskBlur: 4,
    a1111AdetailerDilateErode: 4,
    a1111AdetailerInpaintOnlyMasked: true,
    a1111AdetailerInpaintPadding: 32,
    a1111Adetailer2: false,
    a1111Adetailer2Model: "hand_yolov8n.pt",
    a1111Adetailer2Prompt: "",
    a1111Adetailer2Negative: "",
    a1111Adetailer2Denoise: 0.4,
    a1111Adetailer2Confidence: 0.3,
    a1111Adetailer2MaskBlur: 4,
    a1111Adetailer2DilateErode: 4,
    a1111Adetailer2InpaintOnlyMasked: true,
    a1111Adetailer2InpaintPadding: 32,
    a1111Loras: "",
    a1111Vae: "",
    a1111HiresFix: false,
    a1111HiresUpscaler: "Latent",
    a1111HiresScale: 2,
    a1111HiresSteps: 0,
    a1111HiresDenoise: 0.55,
    a1111HiresSampler: "",
    a1111HiresScheduler: "",
    a1111HiresPrompt: "",
    a1111HiresNegative: "",
    a1111HiresResizeX: 0,
    a1111HiresResizeY: 0,
    a1111IpAdapter: false,
    a1111IpAdapterMode: "ip-adapter-faceid-portrait_sd15",
    a1111IpAdapterWeight: 0.7,
    a1111IpAdapterPixelPerfect: true,
    a1111IpAdapterResizeMode: "Crop and Resize",
    a1111IpAdapterControlMode: "Balanced",
    a1111IpAdapterStartStep: 0,
    a1111IpAdapterEndStep: 1,
    // A1111 Generic ControlNet
    a1111ControlNet: false,
    a1111ControlNetModel: "",
    a1111ControlNetModule: "none",
    a1111ControlNetWeight: 1.0,
    a1111ControlNetResizeMode: "Crop and Resize",
    a1111ControlNetControlMode: "Balanced",
    a1111ControlNetPixelPerfect: true,
    a1111ControlNetGuidanceStart: 0,
    a1111ControlNetGuidanceEnd: 1,
    a1111ControlNetImage: "",
    a1111SaveToWebUI: true,
    // ComfyUI specific
    comfyWorkflow: "",
    comfyClipSkip: 1,
    comfyDenoise: 1.0,
    comfyScheduler: "normal",
    comfyTimeout: 300,
    comfyUpscale: false,
    comfyUpscaleModel: "RealESRGAN_x4plus.pth",
    comfyLoras: "",
    // ST Style integration
    useSTStyle: true,
    // Inject Mode (wickedcode01-style)
    injectEnabled: false,
    injectTagName: DEFAULT_INJECT_TAG_NAME,
    injectPrompt: buildDefaultInjectPrompt(DEFAULT_INJECT_TAG_NAME),
    injectRegex: buildDefaultInjectRegex(DEFAULT_INJECT_TAG_NAME),
    injectPosition: "afterScenario",
    injectDepth: 0,
    injectInsertMode: "replace",
    injectAutoClean: true,
    // LLM Override (separate AI for image prompts via Connection Manager)
    llmOverrideEnabled: false,
    llmOverrideProfileId: "",
    llmOverridePreset: "",
    llmOverrideMaxTokens: 500,
    // ComfyUI Flux/UNET support
    comfySkipNegativePrompt: false,
    comfyFluxClipModel1: "",
    comfyFluxClipModel2: "",
    comfyFluxVaeModel: "",
    comfyFluxClipType: "flux",
    // Backups of localStorage stores (survive browser storage wipes)
    _backupTemplates: null,
    _backupCharSettings: null,
    _backupProfiles: null,
    _backupCharRefImages: null,
    _backupGenPresets: null,
    _backupComfyWorkflows: null,
    _backupContextualFilters: null,
    _backupFilterPools: null,
    _backupActiveFilterPoolIdsGlobal: null,
    _backupActiveFilterPoolIdsByChar: null,
    _backupPromptReplacements: null,
    _backupActivePromptReplacementIdsGlobal: null,
    _backupActivePromptReplacementIdsByChar: null,
};

let lastPrompt = "";
let lastNegative = "";
let lastPromptWasLLM = false;
let originalPrompt = "";
let originalNegative = "";
function safeParse(key, fallback) {
    try {
        const val = JSON.parse(localStorage.getItem(key));
        return val != null ? val : fallback;
    } catch { return fallback; }
}
function safeSetStorage(key, value, errorMessage = "") {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        log(`Storage write failed for ${key}: ${e.message}`);
        if (errorMessage) toastr?.error?.(errorMessage);
        return false;
    }
}
// Backup mapping: localStorage key → extensionSettings backup key
const BACKUP_KEYS = {
    qig_templates: "_backupTemplates",
    qig_char_settings: "_backupCharSettings",
    qig_profiles: "_backupProfiles",
    qig_char_ref_images: "_backupCharRefImages",
    qig_gen_presets: "_backupGenPresets",
    qig_comfy_workflows: "_backupComfyWorkflows",
    qig_contextual_filters: "_backupContextualFilters",
    qig_filter_pools: "_backupFilterPools",
    qig_active_pool_ids_global: "_backupActiveFilterPoolIdsGlobal",
    qig_active_pool_ids_by_char: "_backupActiveFilterPoolIdsByChar",
    qig_prompt_replacements: "_backupPromptReplacements",
    qig_active_prompt_replacement_ids_global: "_backupActivePromptReplacementIdsGlobal",
    qig_active_prompt_replacement_ids_by_char: "_backupActivePromptReplacementIdsByChar",
};
function backupToSettings(localKey, data) {
    const backupKey = BACKUP_KEYS[localKey];
    if (!backupKey) return;
    try {
        const es = extension_settings?.[extensionName];
        if (!es) return;
        es[backupKey] = data;
        saveSettingsDebounced?.();
    } catch (e) {
        log(`Backup write failed for ${backupKey}: ${e.message}`);
    }
}
function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function generateUUID() {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        if (typeof crypto.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = [...bytes].map(b => b.toString(16).padStart(2, "0"));
            return [
                hex.slice(0, 4).join(""),
                hex.slice(4, 6).join(""),
                hex.slice(6, 8).join(""),
                hex.slice(8, 10).join(""),
                hex.slice(10, 16).join("")
            ].join("-");
        }
    }
    return "qig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

let sessionGallery = safeParse("qig_gallery", []);
let promptHistory = safeParse("qig_prompt_history", []);
let promptTemplates = safeParse("qig_templates", []);
let charSettings = safeParse("qig_char_settings", {});
let connectionProfiles = safeParse("qig_profiles", {});
let charRefImages = safeParse("qig_char_ref_images", {});
let generationPresets = safeParse("qig_gen_presets", []);
let comfyWorkflows = safeParse("qig_comfy_workflows", []);
let contextualFilters = safeParse("qig_contextual_filters", []);
let filterPools = safeParse("qig_filter_pools", []);
let activeFilterPoolIdsGlobal = safeParse("qig_active_pool_ids_global", []);
let activeFilterPoolIdsByChar = safeParse("qig_active_pool_ids_by_char", {});
let promptReplacements = safeParse("qig_prompt_replacements", []);
let activePromptReplacementIdsGlobal = safeParse("qig_active_prompt_replacement_ids_global", []);
let activePromptReplacementIdsByChar = safeParse("qig_active_prompt_replacement_ids_by_char", {});
let selectedComfyWorkflowId = "";
let isGenerating = false;
const blobUrls = new Set();
let batchKeyHandler = null;
const _processedInjectFingerprints = new Map();
let _injectProcessingCount = 0;
let currentAbortController = null;
let _autoGenTimeout = null;
let cancelRequested = false;
let cancelRequestSerial = 0;
let paletteGenerateLockUntil = 0;
let paletteCancelLockUntil = 0;
let _paletteInjectActive = false;
let _paletteInjectSerial = 0;
const PALETTE_GENERATE_LOCK_MS = 350;
const PALETTE_CANCEL_LOCK_MS = 500;
const INJECT_FINGERPRINT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FILTER_POOL_ID = "qig_pool_default_global";
const DEFAULT_FILTER_POOL_NAME = "Default";
const FILTER_MANAGER_SCOPE_CURRENT = "__qig_scope_current__";
const FILTER_MANAGER_SCOPE_GLOBAL_ONLY = "__qig_scope_global_only__";
let filterManagerUiState = {
    selectedScopeCharId: FILTER_MANAGER_SCOPE_CURRENT,
    hideInactive: false,
    draggedFilterId: null,
    dropTargetFilterId: null,
    dropPosition: "after",
};

function getCancelCheckpoint() {
    return cancelRequestSerial;
}

function wasCancelRequestedSince(checkpoint) {
    return typeof checkpoint === "number" && checkpoint !== cancelRequestSerial;
}

function checkAborted(checkpoint) {
    if (cancelRequested || currentAbortController?.signal?.aborted || wasCancelRequestedSince(checkpoint)) {
        throw new DOMException("Generation cancelled by user", "AbortError");
    }
}

function generateRandomSeed() {
    return Math.floor(Math.random() * 2147483647);
}

function resolveRandomSeed(seedValue = -1, target = null) {
    const numericSeed = Number(seedValue);
    if (Number.isFinite(numericSeed) && numericSeed >= 0) return numericSeed;
    const resolvedSeed = generateRandomSeed();
    if (target && typeof target === "object") target.__qigResolvedSeed = resolvedSeed;
    return resolvedSeed;
}

function normalizeSeedOverride(seedValue) {
    if (seedValue == null || seedValue === "") return null;
    const numericSeed = Number(seedValue);
    if (!Number.isFinite(numericSeed) || numericSeed <= 0) return null;
    return Math.floor(numericSeed);
}

function getGenerationSeedKey(settings = getSettings()) {
    return settings?.provider === "proxy" ? "proxySeed" : "seed";
}

function getGenerationSeedValue(settings = getSettings()) {
    const source = settings || getSettings();
    const value = Number(source?.[getGenerationSeedKey(source)]);
    return Number.isFinite(value) ? value : -1;
}

function setGenerationSeedValue(settings, value) {
    if (!settings || typeof settings !== "object") return value;
    settings[getGenerationSeedKey(settings)] = value;
    return value;
}

function getAbortError(signal, message = "Generation cancelled by user") {
    const reason = signal?.reason;
    if (reason instanceof DOMException && reason.name === "AbortError") return reason;
    return new DOMException(message, "AbortError");
}

async function runAbortableTask(taskFactory, signal) {
    if (!signal) return await taskFactory();
    if (signal.aborted) throw getAbortError(signal);

    return await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            handler(value);
        };
        const onAbort = () => finish(reject, getAbortError(signal));
        signal.addEventListener("abort", onAbort, { once: true });

        Promise.resolve()
            .then(taskFactory)
            .then((value) => finish(resolve, value))
            .catch((error) => finish(reject, error));
    });
}

const HTML_MESSAGE_TAG_RE = /<\/?(?:div|span|button|i|p|br|ul|ol|li|a|img|svg|section|article|table|tr|td|th)\b/i;
const UI_HTML_MESSAGE_RE = /menu_button|drawer-opener|data-target=|fa-solid|inline-flex|extensions-settings-button|sys-settings-button|rightNavHolder/i;

function normalizeSceneMessageText(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    if (!HTML_MESSAGE_TAG_RE.test(raw)) return raw;
    if (UI_HTML_MESSAGE_RE.test(raw)) return "";
    try {
        const temp = document.createElement("div");
        temp.innerHTML = raw;
        return String(temp.innerText || temp.textContent || "")
            .replace(/\u00a0/g, " ")
            .replace(/\r\n/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    } catch {
        return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
}

const PROVIDER_KEYS = {
    pollinations: ["pollinationsModel"],
    novelai: ["naiKey", "naiModel", "naiProxyUrl", "naiProxyKey"],
    arliai: ["arliKey", "arliModel"],
    nanogpt: ["nanogptKey", "nanogptModel", "nanogptRefImages", "nanogptStrength"],
    chutes: ["chutesKey", "chutesModel"],
    civitai: ["civitaiKey", "civitaiModel", "civitaiScheduler", "civitaiLoras"],
    nanobanana: ["nanobananaKey", "nanobananaModel", "nanobananaExtraInstructions", "nanobananaRefImages"],
    stability: ["stabilityKey"],
    replicate: ["replicateKey", "replicateModel"],
    fal: ["falKey", "falModel"],
    together: ["togetherKey", "togetherModel"],
    local: ["localUrl", "localType", "localModel", "localRefImage", "localDenoise", "a1111Model", "a1111ClipSkip", "a1111Scheduler", "a1111RestoreFaces", "a1111Tiling", "a1111Subseed", "a1111SubseedStrength", "a1111Adetailer", "a1111AdetailerModel", "a1111AdetailerPrompt", "a1111AdetailerNegative", "a1111AdetailerDenoise", "a1111AdetailerConfidence", "a1111AdetailerMaskBlur", "a1111AdetailerDilateErode", "a1111AdetailerInpaintOnlyMasked", "a1111AdetailerInpaintPadding", "a1111Adetailer2", "a1111Adetailer2Model", "a1111Adetailer2Prompt", "a1111Adetailer2Negative", "a1111Adetailer2Denoise", "a1111Adetailer2Confidence", "a1111Adetailer2MaskBlur", "a1111Adetailer2DilateErode", "a1111Adetailer2InpaintOnlyMasked", "a1111Adetailer2InpaintPadding", "a1111Loras", "a1111Vae", "a1111HiresFix", "a1111HiresUpscaler", "a1111HiresScale", "a1111HiresSteps", "a1111HiresDenoise", "a1111HiresSampler", "a1111HiresScheduler", "a1111HiresPrompt", "a1111HiresNegative", "a1111HiresResizeX", "a1111HiresResizeY", "a1111SaveToWebUI", "a1111IpAdapter", "a1111IpAdapterMode", "a1111IpAdapterWeight", "a1111IpAdapterPixelPerfect", "a1111IpAdapterResizeMode", "a1111IpAdapterControlMode", "a1111IpAdapterStartStep", "a1111IpAdapterEndStep", "a1111ControlNet", "a1111ControlNetModel", "a1111ControlNetModule", "a1111ControlNetWeight", "a1111ControlNetResizeMode", "a1111ControlNetControlMode", "a1111ControlNetPixelPerfect", "a1111ControlNetGuidanceStart", "a1111ControlNetGuidanceEnd", "a1111ControlNetImage", "comfyWorkflow", "comfyClipSkip", "comfyDenoise", "comfyScheduler", "comfyTimeout", "comfyUpscale", "comfyUpscaleModel", "comfyLoras", "comfySkipNegativePrompt", "comfyFluxClipModel1", "comfyFluxClipModel2", "comfyFluxVaeModel", "comfyFluxClipType"],
    proxy: ["proxyUrl", "proxyKey", "proxyModel", "proxyLoras", "proxyFacefix", "proxySteps", "proxyCfg", "proxySampler", "proxySeed", "proxyExtraInstructions", "proxyRefImages", "proxyComfyMode", "proxyComfyTimeout", "proxyComfyNodeId", "proxyComfyWorkflow"]
};

const PROVIDERS = {
    pollinations: { name: "Pollinations (Free)", needsKey: false },
    novelai: { name: "NovelAI", needsKey: true },
    arliai: { name: "ArliAI", needsKey: true },
    nanogpt: { name: "NanoGPT", needsKey: true },
    chutes: { name: "Chutes", needsKey: true },
    civitai: { name: "CivitAI", needsKey: true },
    nanobanana: { name: "Nanobanana (Gemini)", needsKey: true },
    stability: { name: "Stability AI", needsKey: true },
    replicate: { name: "Replicate", needsKey: true },
    fal: { name: "Fal.ai", needsKey: true },
    together: { name: "Together AI", needsKey: true },
    local: { name: "Local (A1111/ComfyUI)", needsKey: false },
    proxy: { name: "Reverse Proxy (OpenAI-compatible)", needsKey: false }
};

const NAI_RESOLUTIONS = [
    { label: "Small Portrait (512×768)", w: 512, h: 768 },
    { label: "Small Landscape (768×512)", w: 768, h: 512 },
    { label: "Small Square (640×640)", w: 640, h: 640 },
    { label: "Normal Portrait (832×1216)", w: 832, h: 1216 },
    { label: "Normal Landscape (1216×832)", w: 1216, h: 832 },
    { label: "Normal Square (1024×1024)", w: 1024, h: 1024 },
    { label: "Large Portrait (1024×1536)", w: 1024, h: 1536 },
    { label: "Large Landscape (1536×1024)", w: 1536, h: 1024 },
    { label: "Large Square (1472×1472)", w: 1472, h: 1472 },
    { label: "Wallpaper Portrait (1088×1920)", w: 1088, h: 1920 },
    { label: "Wallpaper Landscape (1920×1088)", w: 1920, h: 1088 }
];

const SIZE_MIN = 256;
const SIZE_MAX = 2048;
const SIZE_STEP = 64;
const SIZE_DEFAULT = 512;
const NAI_CUSTOM_RESOLUTION_VALUE = "custom";

function normalizeDimension(value, fallback = SIZE_DEFAULT) {
    const numeric = Number.parseInt(value, 10);
    const base = Number.isFinite(numeric) ? numeric : fallback;
    const clamped = Math.max(SIZE_MIN, Math.min(SIZE_MAX, base));
    return Math.round(clamped / SIZE_STEP) * SIZE_STEP;
}

function normalizeSize(settings) {
    if (!settings || typeof settings !== "object") return false;
    const width = normalizeDimension(settings.width, SIZE_DEFAULT);
    const height = normalizeDimension(settings.height, SIZE_DEFAULT);
    const changed = settings.width !== width || settings.height !== height;
    settings.width = width;
    settings.height = height;
    return changed;
}

function syncSizeInputs(width, height) {
    const wEl = document.getElementById("qig-width");
    const hEl = document.getElementById("qig-height");
    if (wEl) wEl.value = width;
    if (hEl) hEl.value = height;
}

function getNaiResolutionOptionValue(width, height) {
    const w = Number.parseInt(width, 10);
    const h = Number.parseInt(height, 10);
    const preset = NAI_RESOLUTIONS.find(r => r.w === w && r.h === h);
    return preset ? `${preset.w}x${preset.h}` : NAI_CUSTOM_RESOLUTION_VALUE;
}

function syncNaiResolutionSelect() {
    const select = document.getElementById("qig-nai-resolution");
    if (!select) return;
    const s = getSettings();
    if (!s) return;
    const customOption = Array.from(select.options).find(opt => opt.value === NAI_CUSTOM_RESOLUTION_VALUE);
    if (customOption) customOption.textContent = `Custom (${s.width}×${s.height})`;
    const nextValue = getNaiResolutionOptionValue(s.width, s.height);
    const exists = Array.from(select.options).some(opt => opt.value === nextValue);
    select.value = exists ? nextValue : NAI_CUSTOM_RESOLUTION_VALUE;
}

function getNovelAIProxyGenerateUrl(proxyUrl) {
    const trimmed = String(proxyUrl || "").trim().replace(/\/$/, "");
    if (!trimmed) return "";
    if (/\/generate$/i.test(trimmed)) return trimmed;
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "/generate");
    if (/\/v1$/i.test(trimmed)) return trimmed.replace(/\/v1$/i, "/generate");
    return `${trimmed}/generate`;
}

function resolveNovelAIProxyImageUrl(rawUrl, proxyUrl) {
    const url = String(rawUrl || "");
    if (url.startsWith("data:")) return url;
    if (/^https?:\/\//i.test(url)) return url;

    const baseUrl = String(proxyUrl || "")
        .replace(/\/generate\/?$/i, "")
        .replace(/\/chat\/completions\/?$/i, "")
        .replace(/\/$/, "");
    try {
        return new URL(url, baseUrl + "/").toString();
    } catch {
        return baseUrl + (url.startsWith("/") ? url : "/" + url);
    }
}

function extractNovelAIProxyImageUrl(json, proxyUrl) {
    const urlCandidates = [
        json?.url,
        json?.image_url,
        json?.imageUrl,
        json?.data?.url,
        json?.data?.[0]?.url,
        json?.output?.[0]?.url,
        json?.output?.[0],
        json?.image,
    ];
    for (const candidate of urlCandidates) {
        if (typeof candidate !== "string" || !candidate) continue;
        if (/^[A-Za-z0-9+/]{100,}[=]{0,2}$/.test(candidate)) {
            return `data:image/png;base64,${candidate}`;
        }
        if (candidate.startsWith("data:")) return candidate;
        if (/^https?:\/\//i.test(candidate) || candidate.startsWith("/")) {
            return resolveNovelAIProxyImageUrl(candidate, proxyUrl);
        }
    }

    const base64Candidates = [
        json?.b64_json,
        json?.base64,
        json?.image_base64,
        json?.imageBase64,
        json?.data?.base64,
        json?.data?.[0]?.base64,
        json?.data?.[0]?.b64_json,
        json?.output?.[0]?.b64_json,
    ];
    for (const candidate of base64Candidates) {
        if (typeof candidate === "string" && candidate) {
            return candidate.startsWith("data:") ? candidate : `data:image/png;base64,${candidate}`;
        }
    }

    throw new Error(`NovelAI proxy error: ${JSON.stringify(json)}`);
}

const STYLES = {
    none: { name: "None", prefix: "", suffix: "" },
    anime: { name: "Anime", prefix: "anime style, anime artwork, 2D illustration, anime key visual, ", suffix: ", sharp lineart, anime coloring, vibrant colors" },
    photorealistic: { name: "Photorealistic", prefix: "realistic, photorealistic, hyperrealistic, ", suffix: ", 8k uhd, dslr" },
    digitalart: { name: "Digital Art", prefix: "digital painting, concept art, ", suffix: ", artstation" },
    oilpainting: { name: "Oil Painting", prefix: "oil painting, classical, ", suffix: ", renaissance style" },
    watercolor: { name: "Watercolor", prefix: "watercolor painting, ", suffix: ", soft edges, flowing colors" },
    pencilsketch: { name: "Pencil Sketch", prefix: "pencil sketch, graphite, ", suffix: ", hand drawn" },
    inkdrawing: { name: "Ink Drawing", prefix: "ink drawing, lineart, ", suffix: ", pen and ink" },
    pixelart: { name: "Pixel Art", prefix: "pixel art, 16-bit, ", suffix: ", retro game style" },
    render3d: { name: "3D Render", prefix: "3d render, octane render, ", suffix: ", unreal engine 5" },
    cyberpunk: { name: "Cyberpunk", prefix: "cyberpunk, neon lights, ", suffix: ", futuristic, sci-fi" },
    fantasy: { name: "Fantasy", prefix: "fantasy art, magical, ", suffix: ", ethereal, mystical" },
    comicbook: { name: "Comic Book", prefix: "comic book style, bold lines, ", suffix: ", halftone" },
    manga: { name: "Manga", prefix: "manga style, japanese manga, black and white, ", suffix: ", screentone, ink" },
    chibi: { name: "Chibi", prefix: "chibi, cute anime, kawaii, ", suffix: ", super deformed, adorable" },
    ghibli: { name: "Ghibli", prefix: "studio ghibli style, anime, miyazaki, ", suffix: ", whimsical, hand painted" },
    ukiyoe: { name: "Ukiyo-e", prefix: "ukiyo-e, ", suffix: ", japanese woodblock print" },
    artnouveau: { name: "Art Nouveau", prefix: "art nouveau, ornate, ", suffix: ", decorative, mucha style" },
    artdeco: { name: "Art Deco", prefix: "art deco, geometric, ", suffix: ", 1920s style" },
    impressionist: { name: "Impressionist", prefix: "impressionist, monet style, ", suffix: ", soft brushstrokes" },
    surrealist: { name: "Surrealist", prefix: "surrealist, dreamlike, ", suffix: ", dali style" },
    popart: { name: "Pop Art", prefix: "pop art, warhol style, ", suffix: ", bold colors" },
    minimalist: { name: "Minimalist", prefix: "minimalist, simple, ", suffix: ", clean lines" },
    gothic: { name: "Gothic", prefix: "gothic, dark, macabre, ", suffix: ", victorian" },
    steampunk: { name: "Steampunk", prefix: "steampunk, victorian sci-fi, ", suffix: ", brass and gears" },
    vaporwave: { name: "Vaporwave", prefix: "vaporwave, 80s aesthetic, ", suffix: ", synthwave, retrowave" },
    lowpoly: { name: "Low Poly", prefix: "low poly, geometric, ", suffix: ", polygonal 3d" },
    isometric: { name: "Isometric", prefix: "isometric, isometric view, ", suffix: ", game asset" },
    stainedglass: { name: "Stained Glass", prefix: "stained glass, colorful glass, ", suffix: ", cathedral" },
    graffiti: { name: "Graffiti", prefix: "graffiti art, street art, ", suffix: ", urban" },
    charcoal: { name: "Charcoal", prefix: "charcoal drawing, smudged, ", suffix: ", dramatic shadows" },
    pastel: { name: "Pastel", prefix: "pastel colors, soft, ", suffix: ", dreamy, light" },
    filmnoir: { name: "Film Noir", prefix: "noir, black and white, ", suffix: ", high contrast, dramatic" },
    vintagephoto: { name: "Vintage Photo", prefix: "vintage photo, old photograph, ", suffix: ", sepia, aged" },
    polaroid: { name: "Polaroid", prefix: "polaroid, instant photo, ", suffix: ", nostalgic" },
    cinematic: { name: "Cinematic", prefix: "cinematic, movie still, ", suffix: ", dramatic lighting, anamorphic" },
    portrait: { name: "Portrait", prefix: "portrait photography, ", suffix: ", studio lighting, professional" },
    landscape: { name: "Landscape", prefix: "landscape photography, ", suffix: ", nature, scenic" },
    macro: { name: "Macro", prefix: "macro photography, close-up, ", suffix: ", detailed" },
    abstract: { name: "Abstract", prefix: "abstract, non-representational, ", suffix: ", shapes and colors" },
    psychedelic: { name: "Psychedelic", prefix: "psychedelic, trippy, ", suffix: ", vibrant, kaleidoscopic" },
    darkfantasy: { name: "Dark Fantasy", prefix: "dark fantasy, grimdark, ", suffix: ", elden ring style" },
    moeanime: { name: "Moe Anime", prefix: "anime style, cute anime, moe, kawaii, ", suffix: ", adorable, soft colors" },
    retroanime: { name: "90s Anime", prefix: "90s anime style, retro anime, cel animation, ", suffix: ", vintage anime, old school anime" }
};

const PROVIDER_MODELS = {
    pollinations: [
        { id: "", name: "Default" },
        { id: "flux", name: "Flux" },
        { id: "turbo", name: "Turbo" }
    ]
};

const SAMPLERS = [
    // Euler family
    "euler_a", "euler",
    // DPM++ family
    "dpm++_2m", "dpm++_sde", "dpm++_2m_sde", "dpm++_3m_sde", "dpm++_2s_ancestral",
    // DPM family
    "dpm_2", "dpm_2_ancestral", "dpm_fast", "dpm_adaptive",
    // Classic
    "ddim", "ddpm", "lms", "heun", "heunpp2", "plms",
    // Unified Predictor-Corrector
    "uni_pc", "uni_pc_bh2",
    // Specialty
    "lcm", "deis", "restart",
    // Anima
    "er_sde"
];

// Display names for samplers (used in HTML select and A1111 API)
const SAMPLER_DISPLAY_NAMES = {
    "euler_a": "Euler a", "euler": "Euler",
    "dpm++_2m": "DPM++ 2M", "dpm++_sde": "DPM++ SDE", "dpm++_2m_sde": "DPM++ 2M SDE",
    "dpm++_3m_sde": "DPM++ 3M SDE", "dpm++_2s_ancestral": "DPM++ 2S a",
    "dpm_2": "DPM2", "dpm_2_ancestral": "DPM2 a", "dpm_fast": "DPM fast", "dpm_adaptive": "DPM adaptive",
    "ddim": "DDIM", "ddpm": "DDPM", "lms": "LMS", "heun": "Heun", "heunpp2": "Heun++ 2", "plms": "PLMS",
    "uni_pc": "UniPC", "uni_pc_bh2": "UniPC BH2",
    "lcm": "LCM", "deis": "DEIS", "restart": "Restart",
    "er_sde": "ER SDE"
};

// Sampler grouping for <optgroup> display
const SAMPLER_GROUPS = {
    "Euler": ["euler_a", "euler"],
    "DPM++": ["dpm++_2m", "dpm++_sde", "dpm++_2m_sde", "dpm++_3m_sde", "dpm++_2s_ancestral"],
    "DPM": ["dpm_2", "dpm_2_ancestral", "dpm_fast", "dpm_adaptive"],
    "Classic": ["ddim", "ddpm", "lms", "heun", "heunpp2", "plms"],
    "UniPC": ["uni_pc", "uni_pc_bh2"],
    "Specialty": ["lcm", "deis", "restart"],
    "Anima": ["er_sde"]
};

const A1111_SCHEDULERS = ["Automatic", "Uniform", "Karras", "Exponential", "Polyexponential", "SGM Uniform", "Simple", "Normal", "DDIM", "Beta"];

const COMFY_SCHEDULERS = ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta", "kl_optimal"];

const logs = [];
function log(msg) {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logs.length > 100) logs.shift();
    console.log("[QIG]", msg);
}

function parseFloatOr(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

function parseIntOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function isComfyFluxMode(s) {
    return !!s?.comfySkipNegativePrompt && !!(s?.comfyFluxClipModel1 || "").trim();
}

// CORS-aware fetch: tries direct, falls back to ST's /proxy/ endpoint
let _corsProxyState = 0; // 0=unknown, 1=direct works, 2=proxy works, -1=proxy disabled
async function corsFetch(url, opts = {}) {
    const crossOrigin = (() => {
        try { return new URL(url).origin !== location.origin; } catch { return true; }
    })();
    // Prefer direct fetch; only skip direct cross-origin when proxy has already been proven required.
    if (!crossOrigin || _corsProxyState !== 2) {
        try {
            const res = await fetch(url, opts);
            if (crossOrigin) _corsProxyState = 1;
            return res;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            if (!(e instanceof TypeError)) throw e;
            if (!crossOrigin) throw e;
            // TypeError on cross-origin usually means CORS/network failure, try proxy.
        }
    }
    if (_corsProxyState === -1) {
        throw new TypeError(`Cannot reach ${url} (CORS). Enable enableCorsProxy in SillyTavern config.yaml or launch A1111 with --cors-allow-origins=*`);
    }
    const proxyUrl = `/proxy/${url}`;
    // Merge ST request headers (CSRF token) into proxy requests
    const stHeaders = typeof getRequestHeaders === 'function' ? getRequestHeaders() : {};
    const mergedHeaders = { ...stHeaders, ...opts.headers };
    const res = await fetch(proxyUrl, { ...opts, headers: mergedHeaders });
    if (res.status === 404) {
        const text = await res.text();
        if (text.includes('CORS proxy is disabled')) {
            _corsProxyState = -1;
            throw new TypeError(`Cannot reach ${url} (CORS). Enable enableCorsProxy in SillyTavern config.yaml or launch A1111 with --cors-allow-origins=*`);
        }
    }
    if (res.status !== 403) _corsProxyState = 2;
    return res;
}

// A1111 Model API helpers
let a1111ModelsCache = [];
let a1111ControlNetScriptKey = "ControlNet";
async function fetchA1111Models(url) {
    try {
        const baseUrl = url.replace(/\/$/, "");
        const res = await corsFetch(`${baseUrl}/sdapi/v1/sd-models`);
        if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
        const models = await res.json();
        a1111ModelsCache = models.map(m => ({ title: m.title, name: m.model_name }));
        log(`A1111: Found ${a1111ModelsCache.length} models`);
        return a1111ModelsCache;
    } catch (e) {
        log(`A1111: Error fetching models: ${e.message}`);
        return [];
    }
}

async function fetchControlNetModels(url) {
    const baseUrl = url.replace(/\/$/, "");
    const endpoints = [
        `${baseUrl}/controlnet/model_list`,
        `${baseUrl}/api/proxy/controlnet/model_list`
    ];
    for (const endpoint of endpoints) {
        try {
            const res = await corsFetch(endpoint);
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data?.model_list)) return data.model_list;
        } catch {}
    }
    return [];
}

async function switchA1111Model(url, modelTitle) {
    try {
        const baseUrl = url.replace(/\/$/, "");
        log(`A1111: Switching to model: ${modelTitle}`);
        const res = await corsFetch(`${baseUrl}/sdapi/v1/options`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sd_model_checkpoint: modelTitle })
        });
        if (!res.ok) throw new Error(`Failed to switch model: ${res.status}`);
        log(`A1111: Model switched successfully`);
        return true;
    } catch (e) {
        log(`A1111: Error switching model: ${e.message}`);
        return false;
    }
}

async function getCurrentA1111Model(url) {
    try {
        const baseUrl = url.replace(/\/$/, "");
        const res = await corsFetch(`${baseUrl}/sdapi/v1/options`);
        if (!res.ok) return null;
        const opts = await res.json();
        return opts.sd_model_checkpoint || null;
    } catch {
        return null;
    }
}

async function fetchA1111Upscalers(url) {
    try {
        const res = await corsFetch(`${url.replace(/\/$/, "")}/sdapi/v1/upscalers`);
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()).map(u => u.name);
    } catch (e) {
        return ["Latent", "Latent (antialiased)", "Latent (bicubic)",
                "Latent (bicubic antialiased)", "Latent (nearest)",
                "Latent (nearest-exact)", "None"];
    }
}

async function fetchA1111VAEs(url) {
    try {
        const res = await corsFetch(`${url.replace(/\/$/, "")}/sdapi/v1/sd-vae`);
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()).map(v => v.model_name);
    } catch (e) {
        log("Failed to fetch VAE list: " + e.message);
        return [];
    }
}

async function fetchComfyNodeModelList(baseUrl, nodeClass, inputKey) {
    const res = await corsFetch(`${baseUrl}/object_info/${nodeClass}`);
    if (!res.ok) {
        if (res.status === 403) {
            throw new Error("ComfyUI returned 403 Forbidden. This is usually caused by ComfyUI-Manager's security check. Fix: in ComfyUI-Manager settings, set Security Level to 'normal', then restart ComfyUI. Also ensure ComfyUI is launched with --enable-cors-header.");
        }
        return [];
    }
    const data = await res.json();
    const values = data?.[nodeClass]?.input?.required?.[inputKey]?.[0];
    return Array.isArray(values) ? values : [];
}

async function fetchComfyUIModels(url, preferUnet = false) {
    const rethrow403 = (e) => { if (e.message?.includes("403 Forbidden")) throw e; return []; };
    try {
        const baseUrl = url.replace(/\/$/, "");
        const [ckpts, unets] = await Promise.all([
            fetchComfyNodeModelList(baseUrl, "CheckpointLoaderSimple", "ckpt_name").catch(rethrow403),
            fetchComfyNodeModelList(baseUrl, "UNETLoader", "unet_name").catch(rethrow403)
        ]);

        if (preferUnet) {
            if (unets.length > 0) return unets;
            if (ckpts.length > 0) {
                log("ComfyUI: UNET list unavailable, falling back to checkpoints");
                return ckpts;
            }
        } else {
            if (ckpts.length > 0) return ckpts;
            if (unets.length > 0) {
                log("ComfyUI: Checkpoint list unavailable, falling back to UNET models");
                return unets;
            }
        }
        return [];
    } catch (e) {
        log("Failed to fetch ComfyUI models: " + e.message);
        if (e.message?.includes("403 Forbidden")) throw e;
        return [];
    }
}

const cachedElements = {};

function getOrCacheElement(id) {
    if (cachedElements[id]) return cachedElements[id];
    const el = document.getElementById(id);
    if (el) cachedElements[id] = el;
    return el;
}

function clearCache() {
    for (const key in cachedElements) {
        delete cachedElements[key];
    }
}

function showStatus(msg) {
    let status = cachedElements["qig-status"];
    if (!status) {
        status = document.createElement("div");
        status.id = "qig-status";
        document.body.appendChild(status);
        cachedElements["qig-status"] = status;
    }
    if (msg) {
        status.textContent = msg;
        status.style.display = "block";
    } else {
        status.style.display = "none";
    }
}

const hideStatus = () => showStatus();

function setGenerationActiveUI(active, { disableGenerateButton = false } = {}) {
    const paletteBtn = getOrCacheElement("qig-input-btn");
    if (paletteBtn) {
        if (active) {
            paletteBtn.classList.remove("fa-palette");
            paletteBtn.classList.add("fa-spinner", "fa-spin");
            paletteBtn.title = "Cancel Generation";
            paletteBtn.style.opacity = "0.7";
        } else {
            paletteBtn.classList.remove("fa-spinner", "fa-spin");
            paletteBtn.classList.add("fa-palette");
            paletteBtn.title = "Generate Image";
            paletteBtn.style.opacity = "0.7";
        }
    }

    if (!disableGenerateButton) return;
    const btn = getOrCacheElement("qig-generate-btn");
    if (!btn) return;
    if (active) {
        btn.disabled = true;
        btn.textContent = "Generating...";
    } else {
        btn.disabled = false;
        btn.textContent = "🎨 Generate";
    }
}

function beginGeneration({ disableGenerateButton = false, clearPendingAuto = false } = {}) {
    if (clearPendingAuto && _autoGenTimeout) {
        clearTimeout(_autoGenTimeout);
        _autoGenTimeout = null;
    }
    cancelRequested = false;
    isGenerating = true;
    currentAbortController = new AbortController();
    setGenerationActiveUI(true, { disableGenerateButton });
}

function endGeneration({ disableGenerateButton = false } = {}) {
    currentAbortController = null;
    isGenerating = false;
    cancelRequested = false;
    paletteCancelLockUntil = 0;
    showStatus(null);
    setGenerationActiveUI(false, { disableGenerateButton });
}

function requestGenerationCancel() {
    if (!isGenerating) return false;
    const now = Date.now();
    if (now < paletteCancelLockUntil) {
        log("Palette: Ignored rapid duplicate cancel click");
        return false;
    }
    if (currentAbortController?.signal?.aborted) {
        log("Cancel already requested, ignoring duplicate click");
        return false;
    }

    paletteCancelLockUntil = now + PALETTE_CANCEL_LOCK_MS;
    cancelRequested = true;
    cancelRequestSerial += 1;
    if (currentAbortController) {
        currentAbortController.abort();
    }
    if (_autoGenTimeout) {
        clearTimeout(_autoGenTimeout);
        _autoGenTimeout = null;
    }

    // Send server-side interrupt (fire-and-forget) so the GPU actually stops
    try {
        const s = extension_settings?.[extensionName];
        if (s?.provider === "local" && s.localUrl) {
            const baseUrl = s.localUrl.replace(/\/$/, "");
            if (s.localType === "comfyui") {
                corsFetch(`${baseUrl}/interrupt`, { method: "POST" }).catch(() => {});
            } else {
                corsFetch(`${baseUrl}/sdapi/v1/interrupt`, { method: "POST" }).catch(() => {});
            }
        }
    } catch (e) { /* best-effort */ }

    // Cancellation watchdog: keep the UI busy until the active async chain actually settles.
    const thisCancelSerial = cancelRequestSerial;
    setTimeout(() => {
        if (isGenerating && cancelRequestSerial === thisCancelSerial && currentAbortController?.signal?.aborted) {
            log("Cancel watchdog: generation is still settling after 5 seconds");
        }
    }, 5000);

    const paletteBtn = getOrCacheElement("qig-input-btn");
    if (paletteBtn) {
        paletteBtn.title = "Cancelling...";
        paletteBtn.style.opacity = "0.4";
    }
    return true;
}

async function loadSettings() {
    const saved = extension_settings[extensionName];
    extension_settings[extensionName] = { ...defaultSettings, ...saved };
    const s = extension_settings[extensionName];
    const savedTagName = getInjectTagName(saved);
    s.injectTagName = savedTagName;
    // Migrate old messageIndex to messageRange
    if (saved && "messageIndex" in saved && !("messageRange" in saved)) {
        s.messageRange = String(saved.messageIndex);
    }
    delete s.messageIndex;
    // Migrate generated inject defaults to the current tag-aware defaults while preserving custom overrides.
    if (saved && isGeneratedInjectRegex(saved.injectRegex, savedTagName)) {
        s.injectRegex = buildDefaultInjectRegex(savedTagName);
    }
    if (saved && isGeneratedInjectPrompt(saved.injectPrompt, savedTagName)) {
        s.injectPrompt = buildDefaultInjectPrompt(savedTagName);
    }
    if (!s.injectRegex) s.injectRegex = buildDefaultInjectRegex(savedTagName);
    if (!s.injectPrompt) s.injectPrompt = buildDefaultInjectPrompt(savedTagName);
    // Restore localStorage stores from extensionSettings backup if localStorage was wiped
    const restoreTargets = [
        { localKey: "qig_templates", backupKey: "_backupTemplates", setter: v => { promptTemplates = v; } },
        { localKey: "qig_char_settings", backupKey: "_backupCharSettings", setter: v => { charSettings = v; } },
        { localKey: "qig_profiles", backupKey: "_backupProfiles", setter: v => { connectionProfiles = v; } },
        { localKey: "qig_char_ref_images", backupKey: "_backupCharRefImages", setter: v => { charRefImages = v; } },
        { localKey: "qig_gen_presets", backupKey: "_backupGenPresets", setter: v => { generationPresets = v; } },
        { localKey: "qig_comfy_workflows", backupKey: "_backupComfyWorkflows", setter: v => { comfyWorkflows = v; } },
        { localKey: "qig_contextual_filters", backupKey: "_backupContextualFilters", setter: v => { contextualFilters = v; } },
        { localKey: "qig_filter_pools", backupKey: "_backupFilterPools", setter: v => { filterPools = v; } },
        { localKey: "qig_active_pool_ids_global", backupKey: "_backupActiveFilterPoolIdsGlobal", setter: v => { activeFilterPoolIdsGlobal = v; } },
        { localKey: "qig_active_pool_ids_by_char", backupKey: "_backupActiveFilterPoolIdsByChar", setter: v => { activeFilterPoolIdsByChar = v; } },
        { localKey: "qig_prompt_replacements", backupKey: "_backupPromptReplacements", setter: v => { promptReplacements = v; } },
        { localKey: "qig_active_prompt_replacement_ids_global", backupKey: "_backupActivePromptReplacementIdsGlobal", setter: v => { activePromptReplacementIdsGlobal = v; } },
        { localKey: "qig_active_prompt_replacement_ids_by_char", backupKey: "_backupActivePromptReplacementIdsByChar", setter: v => { activePromptReplacementIdsByChar = v; } },
    ];
    let restoredCount = 0;
    for (const { localKey, backupKey, setter } of restoreTargets) {
        const localVal = localStorage.getItem(localKey);
        const backupVal = s[backupKey];
        if (backupVal == null) continue;

        let parsedLocal;
        let hasParsableLocal = false;
        if (localVal != null) {
            try {
                parsedLocal = JSON.parse(localVal);
                hasParsableLocal = true;
            } catch {
                hasParsableLocal = false;
            }
        }

        const expectsArray = Array.isArray(backupVal);
        const expectsObject = !expectsArray && typeof backupVal === "object" && backupVal !== null;
        const typeMismatch = hasParsableLocal && (
            (expectsArray && !Array.isArray(parsedLocal)) ||
            (expectsObject && (typeof parsedLocal !== "object" || parsedLocal === null || Array.isArray(parsedLocal)))
        );

        if (localVal == null || !hasParsableLocal || typeMismatch) {
            setter(backupVal);
            safeSetStorage(localKey, JSON.stringify(backupVal));
            restoredCount++;
        }
    }
    if (restoredCount > 0) {
        log(`Restored ${restoredCount} preset store(s) from server backup`);
        toastr?.info?.(`Restored ${restoredCount} setting(s) from server backup (localStorage was empty)`);
    }
    ensureFilterPoolsState({ persist: true });
    ensurePromptReplacementState({ persist: true });
}

function normalizePoolIdList(poolIds) {
    if (!Array.isArray(poolIds)) return [];
    const out = [];
    const seen = new Set();
    for (const id of poolIds) {
        const val = String(id || "").trim();
        if (!val || seen.has(val)) continue;
        seen.add(val);
        out.push(val);
    }
    return out;
}

function getDefaultFilterPool() {
    return {
        id: DEFAULT_FILTER_POOL_ID,
        name: DEFAULT_FILTER_POOL_NAME,
        scope: "global",
        charId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function saveFilterPools() {
    const ok = safeSetStorage("qig_filter_pools", JSON.stringify(filterPools), "Failed to save filter pools. Browser storage may be full.");
    if (ok) backupToSettings("qig_filter_pools", filterPools);
    return ok;
}

function saveActiveFilterPools() {
    const okGlobal = safeSetStorage("qig_active_pool_ids_global", JSON.stringify(activeFilterPoolIdsGlobal), "Failed to save active global pools. Browser storage may be full.");
    const okByChar = safeSetStorage("qig_active_pool_ids_by_char", JSON.stringify(activeFilterPoolIdsByChar), "Failed to save active character pools. Browser storage may be full.");
    if (okGlobal) backupToSettings("qig_active_pool_ids_global", activeFilterPoolIdsGlobal);
    if (okByChar) backupToSettings("qig_active_pool_ids_by_char", activeFilterPoolIdsByChar);
    return okGlobal && okByChar;
}

function persistFilterPoolState() {
    saveContextualFilters();
    saveFilterPools();
    saveActiveFilterPools();
}

function getEnabledPoolIdsForCurrentContext() {
    const enabled = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
    const activeCharIds = getActiveCharacterScopeIds();
    for (const charId of activeCharIds) {
        const charPoolIds = normalizePoolIdList(activeFilterPoolIdsByChar?.[String(charId)]);
        for (const id of charPoolIds) enabled.add(id);
    }
    return enabled;
}

function getSelectablePoolsForFilterScope(scopeCharId) {
    const charId = scopeCharId != null && scopeCharId !== "" ? String(scopeCharId) : null;
    return filterPools.filter(pool => pool.scope === "global" || (charId && pool.scope === "char" && String(pool.charId) === charId));
}

function ensureFilterPoolsState({ persist = false } = {}) {
    let changed = false;

    const incomingPools = Array.isArray(filterPools) ? filterPools : [];
    if (!Array.isArray(filterPools)) changed = true;
    const normalizedPools = [];
    const seenPoolIds = new Set();
    for (const rawPool of incomingPools) {
        if (!rawPool || typeof rawPool !== "object") { changed = true; continue; }
        const id = String(rawPool.id || "").trim();
        if (!id || seenPoolIds.has(id)) { changed = true; continue; }
        const name = String(rawPool.name || "").trim() || (id === DEFAULT_FILTER_POOL_ID ? DEFAULT_FILTER_POOL_NAME : "Untitled Pool");
        const scope = rawPool.scope === "char" ? "char" : "global";
        const charId = rawPool.charId != null && rawPool.charId !== "" ? String(rawPool.charId) : null;
        if (scope === "char" && !charId) { changed = true; continue; }
        normalizedPools.push({
            id,
            name,
            scope,
            charId: scope === "char" ? charId : null,
            createdAt: rawPool.createdAt || new Date().toISOString(),
            updatedAt: rawPool.updatedAt || new Date().toISOString(),
        });
        seenPoolIds.add(id);
    }
    if (!seenPoolIds.has(DEFAULT_FILTER_POOL_ID)) {
        normalizedPools.unshift(getDefaultFilterPool());
        seenPoolIds.add(DEFAULT_FILTER_POOL_ID);
        changed = true;
    }
    filterPools = normalizedPools;

    const globalPoolIds = new Set(filterPools.filter(p => p.scope === "global").map(p => p.id));
    const charPoolsByChar = new Map();
    for (const pool of filterPools) {
        if (pool.scope !== "char" || !pool.charId) continue;
        const key = String(pool.charId);
        if (!charPoolsByChar.has(key)) charPoolsByChar.set(key, new Set());
        charPoolsByChar.get(key).add(pool.id);
    }

    const hadStoredGlobalPoolState =
        localStorage.getItem("qig_active_pool_ids_global") != null ||
        extension_settings?.[extensionName]?._backupActiveFilterPoolIdsGlobal != null;
    const originalGlobalIds = normalizePoolIdList(activeFilterPoolIdsGlobal);
    let nextGlobalIds = originalGlobalIds.filter(id => globalPoolIds.has(id));
    if (!hadStoredGlobalPoolState && nextGlobalIds.length === 0 && globalPoolIds.has(DEFAULT_FILTER_POOL_ID)) {
        nextGlobalIds.push(DEFAULT_FILTER_POOL_ID);
    }
    if (JSON.stringify(originalGlobalIds) !== JSON.stringify(nextGlobalIds)) changed = true;
    activeFilterPoolIdsGlobal = nextGlobalIds;

    const incomingByChar = activeFilterPoolIdsByChar && typeof activeFilterPoolIdsByChar === "object" && !Array.isArray(activeFilterPoolIdsByChar)
        ? activeFilterPoolIdsByChar
        : {};
    if (incomingByChar !== activeFilterPoolIdsByChar) changed = true;
    const nextByChar = {};
    for (const [charIdRaw, ids] of Object.entries(incomingByChar)) {
        const charId = String(charIdRaw);
        const allowed = charPoolsByChar.get(charId);
        if (!allowed?.size) {
            if (Array.isArray(ids) && ids.length) changed = true;
            continue;
        }
        const normalizedIds = normalizePoolIdList(ids).filter(id => allowed.has(id));
        if (normalizedIds.length > 0) nextByChar[charId] = normalizedIds;
        if (JSON.stringify(normalizePoolIdList(ids)) !== JSON.stringify(normalizedIds)) changed = true;
    }
    if (JSON.stringify(incomingByChar) !== JSON.stringify(nextByChar)) changed = true;
    activeFilterPoolIdsByChar = nextByChar;

    if (!Array.isArray(contextualFilters)) {
        contextualFilters = [];
        changed = true;
    }
    const validPoolIds = new Set(filterPools.map(p => p.id));
    for (const filter of contextualFilters) {
        if (!filter || typeof filter !== "object") { changed = true; continue; }
        const before = normalizePoolIdList(filter.poolIds);
        const after = before.filter(id => validPoolIds.has(id));
        if (!after.length) after.push(DEFAULT_FILTER_POOL_ID);
        if (JSON.stringify(before) !== JSON.stringify(after)) changed = true;
        filter.poolIds = after;
        const nextSeedOverride = normalizeSeedOverride(filter.seedOverride);
        if (filter.seedOverride !== nextSeedOverride) changed = true;
        filter.seedOverride = nextSeedOverride;
        const nextPriority = getContextualFilterPriorityValue(filter);
        if (filter.priority !== nextPriority) changed = true;
        filter.priority = nextPriority;
    }
    if (normalizeContextualFilterOrder(contextualFilters)) changed = true;

    if (persist) {
        persistFilterPoolState();
    }
    return changed;
}

function buildPromptReplacementActiveStateFromRules(rules = promptReplacements) {
    const globalIds = [];
    const byChar = {};
    for (const rule of (rules || [])) {
        if (!rule?.enabled || !rule?.id) continue;
        if (rule.scope === "char") {
            const key = String(rule.charId || "");
            if (!key) continue;
            if (!byChar[key]) byChar[key] = [];
            byChar[key].push(rule.id);
        } else {
            globalIds.push(rule.id);
        }
    }
    return {
        globalIds: normalizePoolIdList(globalIds),
        byChar: Object.fromEntries(
            Object.entries(byChar)
                .map(([charId, ids]) => [charId, normalizePoolIdList(ids)])
                .filter(([, ids]) => ids.length > 0)
        ),
    };
}

function savePromptReplacementActiveState() {
    const okGlobal = safeSetStorage("qig_active_prompt_replacement_ids_global", JSON.stringify(activePromptReplacementIdsGlobal), "Failed to save global replacement map states. Browser storage may be full.");
    const okByChar = safeSetStorage("qig_active_prompt_replacement_ids_by_char", JSON.stringify(activePromptReplacementIdsByChar), "Failed to save character replacement map states. Browser storage may be full.");
    if (okGlobal) backupToSettings("qig_active_prompt_replacement_ids_global", activePromptReplacementIdsGlobal);
    if (okByChar) backupToSettings("qig_active_prompt_replacement_ids_by_char", activePromptReplacementIdsByChar);
    return okGlobal && okByChar;
}

function savePromptReplacements() {
    const computed = buildPromptReplacementActiveStateFromRules(promptReplacements);
    activePromptReplacementIdsGlobal = computed.globalIds;
    activePromptReplacementIdsByChar = computed.byChar;
    const okReplacements = safeSetStorage("qig_prompt_replacements", JSON.stringify(promptReplacements), "Failed to save prompt replacement maps. Browser storage may be full.");
    if (okReplacements) backupToSettings("qig_prompt_replacements", promptReplacements);
    const okState = savePromptReplacementActiveState();
    return okReplacements && okState;
}

function ensurePromptReplacementState({ persist = false } = {}) {
    let changed = false;
    const incoming = Array.isArray(promptReplacements) ? promptReplacements : [];
    if (!Array.isArray(promptReplacements)) changed = true;

    const normalized = [];
    const seenIds = new Set();
    for (const raw of incoming) {
        if (!raw || typeof raw !== "object") { changed = true; continue; }
        let id = String(raw.id || "").trim();
        if (!id || seenIds.has(id)) {
            id = `qig_repl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            changed = true;
        }
        let scope = (raw.scope === "char" || (raw.charId != null && raw.charId !== "")) ? "char" : "global";
        let charId = raw.charId != null && raw.charId !== "" ? String(raw.charId) : null;
        if (!charId && scope === "char") {
            scope = "global";
            changed = true;
        }
        if (scope === "global") charId = null;
        const target = raw.target === "positive" || raw.target === "negative" || raw.target === "both" ? raw.target : "both";
        const priorityValue = Number(raw.priority);
        normalized.push({
            id,
            name: String(raw.name || "").trim() || "Untitled replacement",
            enabled: raw.enabled !== false,
            scope,
            charId,
            target,
            trigger: String(raw.trigger || "").trim(),
            replacement: String(raw.replacement || "").trim(),
            priority: Number.isFinite(priorityValue) ? Math.trunc(priorityValue) : 0,
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || new Date().toISOString(),
        });
        seenIds.add(id);
    }
    promptReplacements = normalized;

    const globalIds = new Set(promptReplacements.filter(r => r.scope === "global").map(r => r.id));
    const charIdsByChar = new Map();
    for (const rule of promptReplacements) {
        if (rule.scope !== "char" || !rule.charId) continue;
        const key = String(rule.charId);
        if (!charIdsByChar.has(key)) charIdsByChar.set(key, new Set());
        charIdsByChar.get(key).add(rule.id);
    }

    const storedGlobal = normalizePoolIdList(activePromptReplacementIdsGlobal).filter(id => globalIds.has(id));
    if (JSON.stringify(storedGlobal) !== JSON.stringify(normalizePoolIdList(activePromptReplacementIdsGlobal))) changed = true;

    const incomingByChar = activePromptReplacementIdsByChar && typeof activePromptReplacementIdsByChar === "object" && !Array.isArray(activePromptReplacementIdsByChar)
        ? activePromptReplacementIdsByChar
        : {};
    if (incomingByChar !== activePromptReplacementIdsByChar) changed = true;
    const storedByChar = {};
    for (const [charIdRaw, ids] of Object.entries(incomingByChar)) {
        const key = String(charIdRaw);
        const allowed = charIdsByChar.get(key);
        if (!allowed?.size) continue;
        const nextIds = normalizePoolIdList(ids).filter(id => allowed.has(id));
        if (nextIds.length > 0) storedByChar[key] = nextIds;
    }
    if (JSON.stringify(storedByChar) !== JSON.stringify(incomingByChar)) changed = true;

    const computed = buildPromptReplacementActiveStateFromRules(promptReplacements);
    if (JSON.stringify(activePromptReplacementIdsGlobal) !== JSON.stringify(computed.globalIds)) changed = true;
    if (JSON.stringify(activePromptReplacementIdsByChar) !== JSON.stringify(computed.byChar)) changed = true;
    activePromptReplacementIdsGlobal = computed.globalIds;
    activePromptReplacementIdsByChar = computed.byChar;

    if (persist && changed) {
        savePromptReplacements();
    }
    return changed;
}

function getPromptReplacementScopeRank(rule) {
    return rule?.scope === "char" ? 1 : 0;
}

function comparePromptReplacements(a, b) {
    const byPriority = (b.priority || 0) - (a.priority || 0);
    if (byPriority !== 0) return byPriority;
    const byScope = getPromptReplacementScopeRank(b) - getPromptReplacementScopeRank(a);
    if (byScope !== 0) return byScope;
    const byCreated = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (byCreated !== 0) return byCreated;
    return String(a.id || "").localeCompare(String(b.id || ""));
}

function getContextualFilterPriorityValue(filter) {
    const priority = Number(filter?.priority);
    return Number.isFinite(priority) ? Math.trunc(priority) : 0;
}

function normalizeContextualFilterSortOrder(value, fallback = null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.trunc(numeric));
}

function getContextualFilterScopeKey(filterOrCharId) {
    const charId = filterOrCharId && typeof filterOrCharId === "object"
        ? filterOrCharId.charId
        : filterOrCharId;
    return charId != null && charId !== "" ? `char:${String(charId)}` : "global";
}

function compareContextualFilters(a, b) {
    const byPriority = getContextualFilterPriorityValue(b) - getContextualFilterPriorityValue(a);
    if (byPriority !== 0) return byPriority;

    const aSort = normalizeContextualFilterSortOrder(a?.sortOrder, Number.MAX_SAFE_INTEGER);
    const bSort = normalizeContextualFilterSortOrder(b?.sortOrder, Number.MAX_SAFE_INTEGER);
    if (aSort !== bSort) return aSort - bSort;

    return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function normalizeContextualFilterOrder(filterList = contextualFilters) {
    if (!Array.isArray(filterList)) return false;
    const byScope = new Map();

    filterList.forEach((filter, index) => {
        if (!filter || typeof filter !== "object") return;
        const scopeKey = getContextualFilterScopeKey(filter);
        if (!byScope.has(scopeKey)) byScope.set(scopeKey, []);
        byScope.get(scopeKey).push({
            filter,
            index,
            existingSortOrder: normalizeContextualFilterSortOrder(filter.sortOrder, null),
        });
    });

    let changed = false;
    for (const entries of byScope.values()) {
        entries.sort((a, b) => {
            const aHasSort = a.existingSortOrder != null;
            const bHasSort = b.existingSortOrder != null;
            if (aHasSort && bHasSort && a.existingSortOrder !== b.existingSortOrder) {
                return a.existingSortOrder - b.existingSortOrder;
            }
            if (aHasSort !== bHasSort) return aHasSort ? -1 : 1;
            return a.index - b.index;
        });

        entries.forEach((entry, nextIndex) => {
            if (entry.filter.sortOrder !== nextIndex) changed = true;
            entry.filter.sortOrder = nextIndex;
        });
    }

    return changed;
}

function normalizeContextLookupValue(value) {
    return String(value ?? "").trim().toLowerCase();
}

function uniqueStringList(values) {
    const seen = new Set();
    const result = [];
    for (const value of (values || [])) {
        const str = String(value ?? "").trim();
        if (!str || seen.has(str)) continue;
        seen.add(str);
        result.push(str);
    }
    return result;
}

function truncateForContext(text, maxLen = 1200) {
    const str = String(text || "").trim();
    if (!str) return "";
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen - 3)}...`;
}

function getCharacterCardTags(charData) {
    if (!charData) return [];
    if (Array.isArray(charData.tags)) {
        return charData.tags.map(tag => String(tag || "").trim()).filter(Boolean);
    }
    if (typeof charData.tags === "string") {
        return charData.tags.split(",").map(tag => tag.trim()).filter(Boolean);
    }
    return [];
}

function getContextCharactersList(ctx) {
    const chars = ctx?.characters;
    if (!chars) return [];
    const entries = [];
    if (Array.isArray(chars)) {
        chars.forEach((charData, index) => {
            if (!charData || typeof charData !== "object") return;
            const id = String(index);
            entries.push({
                id,
                name: String(charData.name || charData.avatar || `Character ${id}`).trim(),
                avatar: String(charData.avatar || "").trim(),
                data: charData,
            });
        });
        return entries;
    }
    if (typeof chars === "object") {
        for (const [key, charData] of Object.entries(chars)) {
            if (!charData || typeof charData !== "object") continue;
            const id = String(key);
            entries.push({
                id,
                name: String(charData.name || charData.avatar || `Character ${id}`).trim(),
                avatar: String(charData.avatar || "").trim(),
                data: charData,
            });
        }
    }
    return entries;
}

function getGroupObjectFromContext(ctx) {
    const groupId = ctx?.groupId;
    if (groupId == null) return null;
    const normalizedGroupId = String(groupId);
    if (ctx?.group && (ctx.group.id == null || String(ctx.group.id) === normalizedGroupId)) {
        return ctx.group;
    }
    const groups = ctx?.groups;
    if (Array.isArray(groups)) {
        return groups.find(group => String(group?.id ?? group?.group_id ?? "") === normalizedGroupId) || null;
    }
    if (groups && typeof groups === "object") {
        if (groups[groupId]) return groups[groupId];
        for (const [key, group] of Object.entries(groups)) {
            if (!group) continue;
            if (String(group.id ?? key) === normalizedGroupId || String(key) === normalizedGroupId) {
                return group;
            }
        }
    }
    return null;
}

function getRecentSpeakerNames(ctx, maxItems = 8) {
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    const names = [];
    for (let i = chat.length - 1; i >= 0 && names.length < maxItems; i--) {
        const msg = chat[i];
        if (!msg || msg.is_user) continue;
        const name = String(msg.name || "").trim();
        if (!name) continue;
        names.push(name);
    }
    return uniqueStringList(names);
}

function resolveGroupCharacterEntries(ctx, characters) {
    const byId = new Map();
    const byAvatar = new Map();
    const byName = new Map();

    for (const entry of characters) {
        const idKey = normalizeContextLookupValue(entry.id);
        if (idKey) byId.set(idKey, entry);

        const modelId = normalizeContextLookupValue(entry.data?.id);
        if (modelId) byId.set(modelId, entry);

        const avatarKey = normalizeContextLookupValue(entry.avatar || entry.data?.avatar);
        if (avatarKey) byAvatar.set(avatarKey, entry);

        const nameKey = normalizeContextLookupValue(entry.name);
        if (nameKey) byName.set(nameKey, entry);
    }

    const group = getGroupObjectFromContext(ctx);
    const rawMembers = Array.isArray(group?.members)
        ? group.members
        : Array.isArray(group?.characters)
            ? group.characters
            : Array.isArray(group?.member_ids)
                ? group.member_ids
                : [];

    const resolved = [];
    const seenIds = new Set();
    const addEntry = (entry) => {
        if (!entry) return;
        if (seenIds.has(entry.id)) return;
        seenIds.add(entry.id);
        resolved.push(entry);
    };

    const resolveToken = (token) => {
        const normalized = normalizeContextLookupValue(token);
        if (!normalized) return null;
        return byId.get(normalized) || byAvatar.get(normalized) || byName.get(normalized) || null;
    };

    for (const member of rawMembers) {
        const candidates = [];
        if (member && typeof member === "object") {
            candidates.push(member.characterId, member.character_id, member.id, member.avatar, member.name);
        } else {
            candidates.push(member);
        }
        for (const token of candidates) {
            const match = resolveToken(token);
            if (match) {
                addEntry(match);
                break;
            }
        }
    }

    for (const speakerName of getRecentSpeakerNames(ctx)) {
        const match = byName.get(normalizeContextLookupValue(speakerName));
        if (match) addEntry(match);
    }

    if (!resolved.length && ctx?.characterId != null) {
        const fallback = resolveToken(ctx.characterId);
        if (fallback) addEntry(fallback);
    }
    if (!resolved.length && characters.length === 1) {
        addEntry(characters[0]);
    }

    return resolved;
}

function resolveChatProfileContext(ctx = getContext()) {
    if (!ctx) {
        return {
            isGroup: false,
            userName: "user",
            userDesc: "",
            charIds: [],
            charNames: [],
            charNameJoined: "character",
            primaryCharId: null,
            primaryCharName: "character",
            charDescCombined: "",
            charScenarioCombined: "",
            charTagsCombined: "",
            charCards: [],
        };
    }

    const isGroup = !!ctx.groupId;
    const characters = getContextCharactersList(ctx);
    let activeEntries = [];
    if (isGroup) {
        activeEntries = resolveGroupCharacterEntries(ctx, characters);
    } else if (ctx.characterId != null) {
        const key = normalizeContextLookupValue(ctx.characterId);
        activeEntries = characters.filter(entry =>
            normalizeContextLookupValue(entry.id) === key ||
            normalizeContextLookupValue(entry.data?.id) === key
        );
    } else if (characters.length === 1) {
        activeEntries = [characters[0]];
    }

    const charIds = uniqueStringList(activeEntries.map(entry => entry.id));
    if (!charIds.length && ctx.characterId != null) {
        charIds.push(String(ctx.characterId));
    }

    const charNames = uniqueStringList(activeEntries.map(entry => entry.name));
    const fallbackName = String(ctx.name2 || "").trim();
    if (!charNames.length && fallbackName) {
        charNames.push(fallbackName);
    }

    const charDescLines = [];
    const charScenarioLines = [];
    const tagSet = new Set();
    const charCards = [];
    for (const entry of activeEntries) {
        const data = entry.data || {};
        charCards.push(data);
        const desc = truncateForContext(data.description, 1500);
        if (desc) charDescLines.push(`${entry.name}: ${desc}`);

        const scenario = truncateForContext(data.scenario, 600);
        if (scenario) charScenarioLines.push(`${entry.name}: ${scenario}`);

        const creatorNotes = truncateForContext(data.creator_notes || data.creatorcomment, 600);
        if (creatorNotes) charScenarioLines.push(`${entry.name} notes: ${creatorNotes}`);

        for (const tag of getCharacterCardTags(data)) {
            tagSet.add(tag);
        }
    }

    return {
        isGroup,
        userName: String(ctx.name1 || "").trim() || "user",
        userDesc: String(ctx.persona || "").trim(),
        charIds,
        charNames,
        charNameJoined: charNames.length ? charNames.join(", ") : "character",
        primaryCharId: charIds[0] || null,
        primaryCharName: charNames[0] || "character",
        charDescCombined: charDescLines.join("\n"),
        charScenarioCombined: charScenarioLines.join("\n"),
        charTagsCombined: [...tagSet].join(", "),
        charCards,
    };
}

function getActiveCharacterScopeIds(ctx = getContext()) {
    const profile = resolveChatProfileContext(ctx);
    return uniqueStringList(profile.charIds);
}

function enrichSceneTextForFilters(sceneText, label = "Contextual filters") {
    const base = String(sceneText || "").trim();
    const profile = resolveChatProfileContext();
    const extraLines = [];
    if (profile.charNames.length) {
        extraLines.push(`Characters: ${profile.charNames.join(", ")}`);
    }
    if (profile.charDescCombined) {
        extraLines.push(`Character profiles:\n${truncateForContext(profile.charDescCombined, 1800)}`);
    }
    if (profile.userDesc) {
        extraLines.push(`${profile.userName} profile: ${truncateForContext(profile.userDesc, 600)}`);
    }
    if (!extraLines.length) return base;
    const enriched = [base, ...extraLines].filter(Boolean).join("\n\n");
    const addedChars = Math.max(0, enriched.length - base.length);
    if (addedChars > 0) {
        log(`${label}: enriched matching context (+${addedChars} chars)`);
    }
    return enriched;
}

function getActivePromptReplacements() {
    ensurePromptReplacementState();
    const activeCharIds = new Set(getActiveCharacterScopeIds());
    return promptReplacements
        .filter(rule => {
            if (!rule?.enabled) return false;
            if (rule.scope === "char") {
                return !!rule.charId && activeCharIds.has(String(rule.charId));
            }
            return true;
        })
        .sort(comparePromptReplacements);
}

function getSettings() {
    return extension_settings[extensionName];
}

function resolvePrompt(template) {
    if (template == null) return "";
    const text = typeof template === "string" ? template : String(template);
    const profile = resolveChatProfileContext();
    return text
        .replace(/\{\{char\}\}/gi, profile.charNameJoined || "character")
        .replace(/\{\{user\}\}/gi, profile.userName || "user");
}

function expandWildcards(text) {
    return text.replace(/\{([^{}]+)\}/g, (match, inner) => {
        const options = inner.split('|').map(s => s.trim()).filter(Boolean);
        if (options.length === 0) return match;
        return options[Math.floor(Math.random() * options.length)];
    });
}

let _stStyleLogged = false;
function getSTStyleSettings() {
    const result = { prefix: "", negative: "", charPositive: "", charNegative: "" };
    try {
        const sd = extension_settings?.sd || extension_settings?.["stable-diffusion"];
        if (!sd) return result;
        if (!_stStyleLogged) {
            log("ST Style: Found SD extension settings, keys: " + Object.keys(sd).filter(k => typeof sd[k] === "string" && sd[k]).join(", "));
            _stStyleLogged = true;
        }
        // Common prefix/negative from ST's style settings
        if (sd.prompt_prefix) result.prefix = sd.prompt_prefix.trim();
        if (sd.negative_prompt) result.negative = sd.negative_prompt.trim();
        // Character-specific overrides
        const ctx = getContext();
        const charName = ctx?.name2;
        if (charName && sd.character_prompts) {
            const charPrompt = sd.character_prompts[charName];
            if (typeof charPrompt === "string" && charPrompt) {
                result.charPositive = charPrompt.trim();
            } else if (charPrompt && typeof charPrompt === "object") {
                if (charPrompt.positive) result.charPositive = charPrompt.positive.trim();
                if (charPrompt.negative) result.charNegative = charPrompt.negative.trim();
            }
        }
        if (charName && sd.character_negative_prompts) {
            const charNeg = sd.character_negative_prompts[charName];
            if (typeof charNeg === "string" && charNeg) {
                result.charNegative = charNeg.trim();
            }
        }
    } catch (e) {
        log("ST Style: Error reading settings: " + e.message);
    }
    return result;
}

function parseMessageRange(rangeStr, chatLength) {
    if (!chatLength || chatLength === 0) return [];
    const str = String(rangeStr || "-1").trim().toLowerCase();
    const indices = new Set();
    const clamp = (n) => Math.max(0, Math.min(n, chatLength - 1));

    // Handle "lastN" format
    const lastMatch = str.match(/^last(\d+)$/);
    if (lastMatch) {
        const n = parseInt(lastMatch[1]);
        if (!isNaN(n) && n > 0) {
            const start = Math.max(0, chatLength - n);
            for (let i = start; i < chatLength; i++) indices.add(i);
        }
        return [...indices].sort((a, b) => a - b);
    }

    // Split by comma and process each part
    const parts = str.split(",");
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === "") continue;

        // Check for range (e.g. "3-7")
        const rangeMatch = trimmed.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
        if (rangeMatch) {
            let a = parseInt(rangeMatch[1]);
            let b = parseInt(rangeMatch[2]);
            if (isNaN(a) || isNaN(b)) continue;
            // Resolve -1 as last
            if (a === -1) a = chatLength - 1;
            if (b === -1) b = chatLength - 1;
            // Swap if reversed
            if (a > b) { const tmp = a; a = b; b = tmp; }
            a = clamp(a);
            b = clamp(b);
            for (let i = a; i <= b; i++) indices.add(i);
        } else {
            // Single number
            let n = parseInt(trimmed);
            if (isNaN(n)) continue;
            if (n === -1) n = chatLength - 1;
            indices.add(clamp(n));
        }
    }

    return [...indices].sort((a, b) => a - b);
}

function getMessages() {
    const ctx = getContext();
    if (!ctx) return "";
    const chat = ctx.chat;
    if (!chat || chat.length === 0) return "";
    const s = getSettings();
    const indices = parseMessageRange(s.messageRange, chat.length);
    if (indices.length === 0) return "";

    // Single message: return plain text (backward compatible, no labels)
    if (indices.length === 1) {
        const msg = chat[indices[0]];
        return normalizeSceneMessageText(msg?.mes || "");
    }

    // Multiple messages: return speaker-labeled concatenation
    const lines = [];
    for (const i of indices) {
        const msg = chat[i];
        if (!msg || !msg.mes) continue;
        const plainText = normalizeSceneMessageText(msg.mes);
        if (!plainText) continue;
        const name = msg.name || (msg.is_user ? ctx.name1 : ctx.name2) || "Unknown";
        lines.push(`[${name}]: ${plainText}`);
    }
    const result = lines.join("\n\n");
    if (result.length > 10000) {
        console.warn("[QIG] Multi-message context exceeds 10000 chars:", result.length);
    }
    return result;
}

const styleCache = new Map();

function applyStyle(prompt, s) {
    if (!s.style || s.style === "none") return prompt;

    const cacheKey = `${s.style}|${prompt}`;
    if (styleCache.has(cacheKey)) return styleCache.get(cacheKey);

    const style = STYLES[s.style];
    if (!style) return prompt;

    const result = style.prefix + prompt + style.suffix;

    styleCache.set(cacheKey, result);
    if (styleCache.size > 100) styleCache.delete(styleCache.keys().next().value);

    return result;
}

function clearStyleCache() {
    styleCache.clear();
    log("Style cache cleared");
}

function getActiveFilters() {
    ensureFilterPoolsState();
    const activeCharIds = new Set(getActiveCharacterScopeIds());
    const enabledPoolIds = getEnabledPoolIdsForCurrentContext();
    return contextualFilters.filter(f => {
        if (!f || typeof f !== "object") return false;
        if (f.charId && !activeCharIds.has(String(f.charId))) return false;
        const poolIds = normalizePoolIdList(f.poolIds);
        if (!poolIds.length) return enabledPoolIds.has(DEFAULT_FILTER_POOL_ID);
        return poolIds.some(id => enabledPoolIds.has(id));
    }).sort(compareContextualFilters);
}

function splitPromptTokens(text) {
    return String(text || "")
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
}

function previewTextForLog(text, maxLen = 90) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (compact.length <= maxLen) return compact;
    return `${compact.slice(0, Math.max(0, maxLen - 3))}...`;
}

function previewTokenListForLog(tokens, maxItems = 3) {
    const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
    if (!list.length) return "";
    const shown = list.slice(0, maxItems).map(t => previewTextForLog(t, 36));
    if (list.length > maxItems) shown.push(`+${list.length - maxItems} more`);
    return shown.join(" | ");
}

function getPromptTokenIdentity(token) {
    const normalized = String(token || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return "";
    // Match LoRA tags by name only so <lora:foo:0.6> removes <lora:foo:1.0>.
    const loraMatch = normalized.match(/^<\s*lora\s*:\s*([^:>]+?)\s*(?::\s*[^>]+)?\s*>$/i);
    if (loraMatch) return `lora:${loraMatch[1].trim()}`;
    return `text:${normalized}`;
}

function appendPromptText(base, addition) {
    const add = String(addition || "").trim();
    if (!add) return String(base || "");
    return base ? `${base}, ${add}` : add;
}

function removeTokensFromPromptText(text, removalList) {
    const removals = new Set(
        splitPromptTokens(removalList)
            .map(getPromptTokenIdentity)
            .filter(Boolean)
    );
    const sourceTokens = splitPromptTokens(text);
    if (!removals.size || !sourceTokens.length) {
        return { text: String(text || ""), removedTokens: [] };
    }
    const kept = [];
    const removed = [];
    for (const token of sourceTokens) {
        const identity = getPromptTokenIdentity(token);
        if (identity && removals.has(identity)) {
            removed.push(token);
        } else {
            kept.push(token);
        }
    }
    return { text: kept.join(", "), removedTokens: removed };
}

function applyFilterRemovals(prompt, negative, filter) {
    const mode = filter?.removeMode || "remove";
    const removedFromPrompt = removeTokensFromPromptText(prompt, filter?.removePositive);
    const removedFromNegative = removeTokensFromPromptText(negative, filter?.removeNegative);
    let nextNegative = removedFromNegative.text;
    if (mode === "moveToNegative" && removedFromPrompt.removedTokens.length) {
        nextNegative = appendPromptText(nextNegative, removedFromPrompt.removedTokens.join(", "));
    }
    return {
        prompt: removedFromPrompt.text,
        negative: nextNegative,
        removedPositiveTokens: removedFromPrompt.removedTokens,
        removedNegativeTokens: removedFromNegative.removedTokens,
        removedCount: removedFromPrompt.removedTokens.length + removedFromNegative.removedTokens.length,
    };
}

function applyMatchedFiltersWithDebug(prompt, negative, filters, labelPrefix = "Contextual filter") {
    let p = prompt;
    let n = negative;
    let removedCount = 0;
    for (const f of (filters || [])) {
        const beforeP = p;
        const beforeN = n;
        const removed = applyFilterRemovals(p, n, f);
        p = removed.prompt;
        n = removed.negative;
        removedCount += removed.removedCount;
        if (f.positive) p = appendPromptText(p, f.positive);
        if (f.negative) n = appendPromptText(n, f.negative);
        const deltas = [];
        const removedPositivePreview = previewTokenListForLog(removed.removedPositiveTokens);
        const removedNegativePreview = previewTokenListForLog(removed.removedNegativeTokens);
        if (removedPositivePreview) deltas.push(`-P[${removedPositivePreview}]`);
        if (removedNegativePreview) deltas.push(`-N[${removedNegativePreview}]`);
        if (f.positive) deltas.push(`+P[${previewTextForLog(f.positive, 60)}]`);
        if (f.negative) deltas.push(`+N[${previewTextForLog(f.negative, 60)}]`);
        const changed = beforeP !== p || beforeN !== n;
        log(`${labelPrefix} "${f.name || "(unnamed)"}" p${f.priority || 0}: ${deltas.join(" ") || "no-op"}${changed ? ` => P:${previewTextForLog(p)} | N:${previewTextForLog(n)}` : ""}`);
    }
    return { prompt: p, negative: n, removedCount };
}

function selectContextualSeedOverride(filters = []) {
    let selected = null;
    for (const filter of (filters || [])) {
        const seedOverride = normalizeSeedOverride(filter?.seedOverride);
        if (seedOverride == null) continue;
        const priority = Number.isFinite(Number(filter?.priority)) ? Number(filter.priority) : 0;
        if (!selected || priority > selected.priority) {
            selected = {
                seedOverride,
                priority,
                name: filter?.name || "(unnamed)",
            };
        }
    }
    if (selected) {
        log(`Contextual seed override: ${selected.seedOverride} from "${selected.name}" p${selected.priority}`);
    }
    return selected;
}

function applyContextualFilters(prompt, negative, sceneText) {
    const activeFilters = getActiveFilters();
    if (!activeFilters.length || !sceneText) return { prompt, negative, matchedFilters: [] };
    const activeCharIds = new Set(getActiveCharacterScopeIds());
    const scopedFilterCount = contextualFilters.filter(f => !f?.charId || activeCharIds.has(String(f.charId))).length;
    if (scopedFilterCount > activeFilters.length) {
        log(`Contextual pools: ${activeFilters.length}/${scopedFilterCount} scoped filter(s) enabled by active pools`);
    }
    const sceneForMatching = enrichSceneTextForFilters(sceneText, "Contextual filters");
    const scene = sceneForMatching.toLowerCase();
    const matched = [];
    for (const f of activeFilters) {
        if (!f.enabled) continue;
        if (f.matchMode === "LLM") continue;
        const keywords = f.keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
        if (!keywords.length) continue;
        const hit = f.matchMode === "AND"
            ? keywords.every(kw => scene.includes(kw))
            : keywords.some(kw => scene.includes(kw));
        if (hit) matched.push({ ...f, _keywords: new Set(keywords) });
    }
    if (!matched.length) return { prompt, negative, matchedFilters: [] };
    matched.sort(compareContextualFilters);
    // Suppress OR filters whose keywords are a subset of a higher-priority AND filter
    const andFilters = matched.filter(f => f.matchMode === "AND");
    const surviving = matched.filter(f => {
        if (f.matchMode === "AND") return true;
        return !andFilters.some(af =>
            (af.priority || 0) >= (f.priority || 0) &&
            [...f._keywords].every(kw => af._keywords.has(kw))
        );
    });
    const applied = applyMatchedFiltersWithDebug(prompt, negative, surviving, "Contextual filter");
    log(`Contextual filters: ${surviving.length} applied (${matched.length - surviving.length} suppressed, ${applied.removedCount} token(s) removed)`);
    return { prompt: applied.prompt, negative: applied.negative, matchedFilters: surviving };
}

async function applyResolvedContextualFilters(prompt, negative, {
    matchText,
    llmSceneText,
    signal = null,
} = {}) {
    const applied = applyContextualFilters(prompt, negative, matchText);
    let nextPrompt = applied.prompt;
    let nextNegative = applied.negative;
    const matchedFilters = [...(applied.matchedFilters || [])];

    const llmMatched = await matchLLMFilters(llmSceneText || matchText, signal);
    if (llmMatched.length) {
        const llmApplied = applyMatchedFiltersWithDebug(nextPrompt, nextNegative, llmMatched, "LLM contextual filter");
        nextPrompt = llmApplied.prompt;
        nextNegative = llmApplied.negative;
        matchedFilters.push(...llmMatched);
        log(`LLM contextual filters: ${llmMatched.length} applied (${llmApplied.removedCount} token(s) removed)`);
    }

    const selectedSeed = selectContextualSeedOverride(matchedFilters);
    return {
        prompt: nextPrompt,
        negative: nextNegative,
        matchedFilters,
        seedOverride: selectedSeed?.seedOverride ?? null,
    };
}

function getBatchBaseSeed(settings, batchCount, seedOverride = null) {
    let baseSeed = seedOverride != null ? seedOverride : getGenerationSeedValue(settings);
    if (settings?.sequentialSeeds && batchCount > 1 && baseSeed === -1) {
        baseSeed = generateRandomSeed();
    }
    return baseSeed;
}

function parsePromptReplacementTriggers(triggerText) {
    return splitPromptTokens(triggerText)
        .map(token => ({
            raw: token,
            identity: getPromptTokenIdentity(token),
        }))
        .filter(entry => entry.identity);
}

function applyPromptReplacementMaps(prompt, negative) {
    const rules = getActivePromptReplacements();
    if (!rules.length) return { prompt, negative, appliedCount: 0, replacedTokenCount: 0 };
    let p = String(prompt || "");
    let n = String(negative || "");
    const consumedPositive = new Set();
    const consumedNegative = new Set();
    let appliedCount = 0;
    let replacedTokenCount = 0;

    const applyToField = (text, fieldKey, triggers, replacementText) => {
        if (!triggers.length) return { text, matched: false, replaced: 0 };
        const consumed = fieldKey === "positive" ? consumedPositive : consumedNegative;
        const triggerIds = triggers.map(t => t.identity).filter(id => !consumed.has(id));
        if (!triggerIds.length) return { text, matched: false, replaced: 0 };
        const allowed = new Set(triggerIds);
        const sourceTokens = splitPromptTokens(text);
        if (!sourceTokens.length) return { text, matched: false, replaced: 0 };
        let matched = false;
        let replaced = 0;
        const matchedIds = new Set();
        const kept = [];
        for (const token of sourceTokens) {
            const identity = getPromptTokenIdentity(token);
            if (identity && allowed.has(identity)) {
                matched = true;
                replaced += 1;
                matchedIds.add(identity);
            } else {
                kept.push(token);
            }
        }
        if (!matched) return { text, matched: false, replaced: 0 };
        for (const id of matchedIds) consumed.add(id);
        const next = appendPromptText(kept.join(", "), replacementText);
        return { text: next, matched: true, replaced };
    };

    for (const rule of rules) {
        const triggers = parsePromptReplacementTriggers(rule.trigger);
        const replacementText = String(rule.replacement || "").trim();
        if (!triggers.length || !replacementText) continue;
        const target = rule.target || "both";
        let ruleMatched = false;
        let ruleReplacedTokens = 0;

        if (target === "both" || target === "positive") {
            const result = applyToField(p, "positive", triggers, replacementText);
            p = result.text;
            if (result.matched) {
                ruleMatched = true;
                ruleReplacedTokens += result.replaced;
            }
        }
        if (target === "both" || target === "negative") {
            const result = applyToField(n, "negative", triggers, replacementText);
            n = result.text;
            if (result.matched) {
                ruleMatched = true;
                ruleReplacedTokens += result.replaced;
            }
        }

        if (ruleMatched) {
            appliedCount += 1;
            replacedTokenCount += ruleReplacedTokens;
            const scopeLabel = rule.scope === "char" ? `char:${rule.charId}` : "global";
            log(`Replacement map "${rule.name || "(unnamed)"}" [${scopeLabel}] p${rule.priority || 0} ${rule.target || "both"}: replaced ${ruleReplacedTokens} token(s) -> ${previewTextForLog(rule.replacement, 80)}`);
        }
    }

    if (appliedCount > 0) {
        log(`Replacement maps: ${appliedCount} applied (${replacedTokenCount} token(s) replaced)`);
    }
    return { prompt: p, negative: n, appliedCount, replacedTokenCount };
}

async function matchLLMFilters(sceneText, signal = null) {
    const llmFilters = getActiveFilters().filter(f => f.enabled && f.matchMode === "LLM" && f.description);
    if (!llmFilters.length || !sceneText) return [];
    const sceneForMatching = enrichSceneTextForFilters(sceneText, "LLM filters");

    const conceptList = llmFilters.map((f, i) => `${i + 1}. "${f.name}": ${f.description}`).join('\n');

    const instruction = `Given the following scene, identify which concepts are present.
Reply ONLY with the numbers of matching concepts, comma-separated. If none match, reply "none".

Scene:
${sceneForMatching.substring(0, 2000)}

Concepts:
${conceptList}`;

    const s = getSettings();
    let response;
    try {
        if (s.llmOverrideEnabled && s.llmOverrideProfileId) {
            response = await callOverrideLLM(instruction, "You are a scene analyst. Reply only with numbers.", signal);
        } else {
            const quietOptions = { skipWIAN: true, quietName: `FilterMatch_${Date.now()}`, quietToLoud: false };
            try {
                response = await runAbortableTask(() => generateQuietPrompt(instruction, quietOptions), signal);
            } catch (e) {
                if (e.name === "AbortError") throw e;
                response = await runAbortableTask(() => generateQuietPrompt(instruction, false), signal);
            }
        }
        checkAborted();
    } catch (e) {
        if (e.name === "AbortError") throw e; // Let cancellation propagate
        log(`LLM filter matching failed: ${e.message}`);
        return [];
    }

    const nums = (response || "").match(/\d+/g)?.map(Number) || [];
    const matched = llmFilters.filter((_, i) => nums.includes(i + 1)).sort(compareContextualFilters);
    log(`LLM filter matching: ${matched.length}/${llmFilters.length} concepts matched`);
    return matched;
}

const skinPattern = /\b(dark[- ]?skin(?:ned)?|brown[- ]?skin(?:ned)?|black[- ]?skin(?:ned)?|tan(?:ned)?[- ]?skin|ebony|melanin|mocha|chocolate[- ]?skin|caramel[- ]?skin)\b/gi;

function extractLLMResponse(response) {
    if (typeof response === "string") return response;
    if (response && typeof response === "object") {
        // CMRS extractData format: { content, reasoning }
        if (typeof response.content === "string") return response.content;
        // OpenAI raw format fallback
        const choiceContent = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text;
        if (typeof choiceContent === "string") return choiceContent;
        // Generic message format
        if (typeof response.message?.content === "string") return response.message.content;
        // Try text property
        if (typeof response.text === "string") return response.text;
    }
    log(`LLM Override: Unexpected response format: ${JSON.stringify(response).substring(0, 200)}`);
    return "";
}

function findSecretKeyForId(secretId) {
    if (!secret_state) return null;
    for (const [key, secrets] of Object.entries(secret_state)) {
        if (Array.isArray(secrets) && secrets.some(s => s.id === secretId)) {
            return key;
        }
    }
    return null;
}

async function callOverrideLLM(instruction, systemPrompt = "", signal = null) {
    const s = getSettings();
    let CMRS = null;
    try {
        const ctx = getContext();
        CMRS = ctx.ConnectionManagerRequestService;
    } catch { /* pre-1.15.0 */ }

    if (!CMRS || !s.llmOverrideProfileId) {
        // Fallback: use main chat AI via generateQuietPrompt
        log("LLM Override: No Connection Manager or profile, falling back to main AI");
        const quietOptions = { skipWIAN: true, quietName: `ImageGen_${Date.now()}`, quietToLoud: false };
        try {
            return await runAbortableTask(() => generateQuietPrompt(instruction, quietOptions), signal);
        } catch (e) {
            if (e.name === "AbortError") throw e;
            return await runAbortableTask(() => generateQuietPrompt(instruction, false), signal);
        }
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: instruction });

    const requestedPreset = s.llmOverridePreset || "";
    log(`LLM Override: Using connection profile '${s.llmOverrideProfileId}' (preset: ${requestedPreset || "profile default"})`);

    // Rotate to the profile's secret if it has one
    let previousSecretId = null;
    let secretKey = null;
    let profile = null;
    let originalProfilePreset;
    let presetOverridden = false;
    try {
        profile = CMRS.getProfile(s.llmOverrideProfileId);

        // Apply selected preset for this request only, then restore it.
        if (profile && requestedPreset && profile.preset !== requestedPreset) {
            originalProfilePreset = profile.preset;
            profile.preset = requestedPreset;
            presetOverridden = true;
        }

        const profileSecretId = profile?.['secret-id'];
        if (profileSecretId && rotateSecret && secret_state) {
            secretKey = findSecretKeyForId(profileSecretId);
            if (secretKey) {
                previousSecretId = secret_state[secretKey]?.find(sec => sec.active)?.id;
                if (previousSecretId !== profileSecretId) {
                    log(`LLM Override: Rotating secret for '${secretKey}' to profile's key`);
                    await rotateSecret(secretKey, profileSecretId);
                } else {
                    previousSecretId = null; // already correct, no restore needed
                }
            }
        }
    } catch (e) {
        log(`LLM Override: Could not prepare profile override: ${e.message}`);
    }

    try {
        const response = await runAbortableTask(() => CMRS.sendRequest(
            s.llmOverrideProfileId,
            messages,
            s.llmOverrideMaxTokens || 500,
            { extractData: true, includePreset: true, stream: false }
        ), signal);
        return extractLLMResponse(response);
    } catch (e) {
        if (e.name === "AbortError") throw e;
        log(`LLM Override failed (profile: ${s.llmOverrideProfileId}): ${e.message}`);
        log("Falling back to main chat AI. Check your Connection Manager profile's API type, endpoint, and API key.");
        const quietOptions = { skipWIAN: true, quietName: `ImageGen_${Date.now()}`, quietToLoud: false };
        try {
            return await runAbortableTask(() => generateQuietPrompt(instruction, quietOptions), signal);
        } catch (e2) {
            if (e2.name === "AbortError") throw e2;
            return await runAbortableTask(() => generateQuietPrompt(instruction, false), signal);
        }
    } finally {
        // Restore original secret
        if (previousSecretId && secretKey && rotateSecret) {
            try {
                log(`LLM Override: Restoring original secret for '${secretKey}'`);
                await rotateSecret(secretKey, previousSecretId);
            } catch (e) {
                log(`LLM Override: Could not restore secret: ${e.message}`);
            }
        }

        // Restore profile preset if we overrode it for this call.
        if (presetOverridden && profile) {
            profile.preset = originalProfilePreset;
        }
    }
}

function populateConnectionProfiles(selectId, selectedId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Use main chat AI --</option>';
    try {
        const ctx = getContext();
        const CMRS = ctx.ConnectionManagerRequestService;
        if (!CMRS) {
            select.innerHTML += '<option value="" disabled>Requires SillyTavern 1.15.0+</option>';
            return;
        }
        const profiles = CMRS.getSupportedProfiles();
        for (const p of profiles) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            if (p.id === selectedId) opt.selected = true;
            select.appendChild(opt);
        }
    } catch (e) {
        log(`Failed to load connection profiles: ${e.message}`);
        select.innerHTML += '<option value="" disabled>Error loading profiles</option>';
    }
}

async function populatePresetList(selectId, selectedPreset) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Default (from profile) --</option>';
    try {
        const ctx = getContext();
        const presetManager = ctx.getPresetManager?.();
        if (!presetManager) return;
        const presets = presetManager.getAllPresets?.() || [];
        for (const name of presets) {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            if (name === selectedPreset) opt.selected = true;
            select.appendChild(opt);
        }
    } catch (e) {
        log(`Failed to load presets: ${e.message}`);
    }
}

async function generateLLMPrompt(s, basePrompt, signal) {
    if (!s.useLLMPrompt) return basePrompt;

    // Clear any cached styles before generating new prompt
    clearStyleCache();

    checkAborted(); // Bail early if already cancelled
    log("Generating prompt via SillyTavern LLM...");
    showStatus("🤖 Creating image prompt...");

    try {
        const ctx = getContext();
        const profile = resolveChatProfileContext(ctx);
        const charName = profile.charNameJoined || "character";
        const userName = profile.userName || "user";
        const charDesc = profile.charDescCombined || "";
        const userPersona = profile.userDesc || "";
        const scenario = profile.charScenarioCombined || "";
        const tags = profile.charTagsCombined || "";

        const skinTones = [];
        const charSkin = charDesc.match(skinPattern);
        const userSkin = userPersona.match(skinPattern);
        if (charSkin) skinTones.push(`${charName}: ${charSkin[0]}`);
        if (userSkin) skinTones.push(`${userName}: ${userSkin[0]}`);

        let appearanceContext = "";
        if (charDesc) appearanceContext += `${charName}'s appearance: ${charDesc.substring(0, 1500)}\n`;
        if (userPersona) appearanceContext += `${userName}'s appearance: ${userPersona.substring(0, 800)}\n`;
        if (tags) appearanceContext += `Source/Tags: ${tags}\n`;
        if (scenario) appearanceContext += `Setting: ${scenario.substring(0, 400)}\n`;

        const skinEnforce = skinTones.length ? `\nCRITICAL - You MUST include these skin tones: ${skinTones.join(", ")}` : "";

        const isNatural = s.llmPromptStyle === "natural";
        const wantsCustom = s.llmPromptStyle === "custom";
        const isCustom = wantsCustom && !!s.llmCustomInstruction?.trim();
        const isMultiMessage = basePrompt.includes("\n\n[") && basePrompt.includes("]: ");

        let instruction;
        if (isCustom) {
            log(`Custom macros: scene=${basePrompt.length}ch, char="${charName}", user="${userName}", charDesc=${charDesc.length}ch, userDesc=${userPersona.length}ch`);
            log(`Using custom instruction: ${s.llmCustomInstruction.substring(0, 100)}...`);
            instruction = s.llmCustomInstruction
                .replace(/\{\{scene\}\}/gi, basePrompt)
                .replace(/\{\{charDesc\}\}/gi, charDesc.substring(0, 1500))
                .replace(/\{\{userDesc\}\}/gi, userPersona.substring(0, 800))
                .replace(/\{\{char\}\}/gi, charName)
                .replace(/\{\{user\}\}/gi, userName);

            // Add enhancement options to custom instruction
            let customEnhancements = "";
            if (s.llmAddQuality) customEnhancements += "\n- Include quality tags (masterpiece, best quality, highly detailed, sharp focus, etc.)";
            if (s.llmAddLighting) customEnhancements += "\n- Include lighting descriptions (dramatic lighting, soft lighting, rim lighting, etc.)";
            if (s.llmAddArtist) {
                const randomArtist = getRandomArtist(true);
                customEnhancements += `\n- Include artist tags (e.g., ${randomArtist}, etc.)`;
            }
            if (customEnhancements) {
                instruction += `\n\nADDITIONAL REQUIREMENTS:${customEnhancements}`;
            }
            if (skinEnforce) {
                instruction += skinEnforce;
            }
        } else if (wantsCustom) {
            log("Custom instruction selected but empty, falling back to tags style");
            // Don't set instruction here - let it fall through to default tags style
        } else if (isNatural) {
            let enhancements = "";
            let restrictions = "";
            if (s.llmAddQuality) enhancements += "\n- Enhanced quality descriptors (masterpiece, highly detailed, sharp focus, etc.)";
            if (s.llmAddLighting) enhancements += "\n- Professional lighting descriptions (dramatic lighting, soft lighting, rim lighting, etc.)";
            if (s.llmAddArtist) {
                const randomArtist = getRandomArtist(false);
                enhancements += `\n- Art style references from well-known artists (e.g., ${randomArtist}, etc.)`;
            }
            else restrictions += "\n- DO NOT include artist names or art style references";

            instruction = `[STANDALONE IMAGE PROMPT GENERATION TASK]${skinEnforce}

CRITICAL INSTRUCTIONS:
- IGNORE ALL chat messages, roleplay dialogue, and conversation history
- Generate ONLY a new image prompt based on the scene below
- DO NOT repeat, paraphrase, or use any roleplay text as input
- This is a standalone task, not a continuation of chat

[Output ONLY an image generation prompt. No commentary or explanation.]${skinEnforce}

CHARACTER REFERENCE:
${appearanceContext}
${isMultiMessage ? "SCENE CONTEXT (multiple messages):\n" : "CURRENT SCENE: "}${basePrompt}

Write a detailed image prompt describing:
- The characters involved with their defining visual traits (hair color, eye color, outfit, distinguishing features)
- If from known media/franchise, include the series name and character's canonical appearance
- Their poses, expressions, and body language
- The setting/background
- Lighting and atmosphere
- High quality visual details (sharp focus, detailed rendering, etc.)${enhancements ? `

YOU MUST ALSO INCLUDE:${enhancements}` : ""}${restrictions}

Prompt:`;
        } else {
            // Only generate default instruction if no custom instruction was set
            let enhancements = "";
            let restrictions = "";

            // Critical restrictions - ALWAYS apply these regardless of settings
            restrictions += "\nCRITICAL RESTRICTIONS (MUST FOLLOW):";
            restrictions += "\n- NEVER use realistic style tags (e.g., realistic, photorealistic, hyperrealistic, photography, etc.)";
            restrictions += "\n- NEVER use realistic artists (e.g., wlop, artgerm, rossdraws, etc.)";
            restrictions += "\n- NEVER use common/overused artists (e.g., sakimichan, greg rutkowski, alphonse mucha, etc.)";

            if (s.llmAddQuality) enhancements += "\n- Enhanced quality tags (masterpiece, best quality, highly detailed, sharp focus, etc.)";
            if (s.llmAddLighting) enhancements += "\n- Professional lighting descriptions (dramatic lighting, soft lighting, rim lighting, etc.)";
            if (s.llmAddArtist) {
                const randomArtist = getRandomArtist(true); // Use tag format for Danbooru style
                enhancements += `\n- Include artist tags from anime/manga artists (e.g., ${randomArtist}, etc.)`;
            } else {
                restrictions += "\n- DO NOT include any artist names";
            }

            instruction = `### STANDALONE IMAGE GENERATION TASK ###${skinEnforce}

CRITICAL - THIS IS NOT A CONTINUATION OF CHAT:
- IGNORE ALL previous messages and roleplay dialogue
- Generate a FRESH image prompt based ONLY on scene below
- DO NOT repeat, rephrase, or incorporate any chat text
- This is a standalone generation task

### OUTPUT FORMAT (MANDATORY) ###
Output ONLY comma-separated Danbooru/Booru-style tags. No sentences. No descriptions. No paragraphs. No prose. No explanations.
If you write a sentence instead of tags, you have FAILED the task.

CORRECT example output:
1girl, hatsune_miku, vocaloid, long_hair, twintails, blue_hair, blue_eyes, detached_sleeves, thighhighs, sitting, smile, looking_at_viewer, classroom, window, sunlight, masterpiece, best_quality

WRONG (DO NOT do this):
"A girl with long blue twintails sits in a classroom by the window, smiling at the viewer."

### IMAGE GENERATION TASK ###

Create Danbooru/Booru-style tags for this ${isMultiMessage ? "scene context:\n" : "scene: "}${basePrompt}

Character info: ${appearanceContext}

Required tag categories:
- Character name + series name (CRITICAL: Use recognizable fictional media character tags whenever recognized)
- Physical traits (hair, eyes, body, skin)
- Clothing and accessories
- Pose and expression
- Background/setting
- Quality tags (masterpiece, best quality, etc.)${enhancements ? `

MUST INCLUDE these additional elements:${enhancements}` : ""}
${restrictions}

Tags:`;
        }

        log(`Sending instruction to LLM (length: ${instruction.length} chars)`);

        // CRITICAL: Strong cache-busting by embedding random entropy INSIDE the instruction
        // SillyTavern caches based on instruction text, so we must make each request unique
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substring(2, 11);
        const uniqueId = `${timestamp}_${randomPart}`;

        // Inject entropy directly into the scene/instruction at multiple points
        // This ensures cache invalidation even if prefix is stripped
        const entropyInline = `{{${uniqueId}}}`;
        let instructionWithEntropy = instruction
            .replace(/(CURRENT SCENE:|Scene:|scene:)/i, `$1 ${entropyInline}`)
            .replace(/(Tags:|Prompt:)\s*$/m, `$1 [ref:${randomPart}]`);

        // Also add at start as backup
        instructionWithEntropy = `[${timestamp}]\n${instructionWithEntropy}`;

        log(`Request ID: ${uniqueId}`);

        // Build the full instruction with optional prefill
        const prefillHint = s.llmPrefill ? `\n\nStart your response with: "${s.llmPrefill}"` : "";
        instructionWithEntropy += prefillHint;

        log(isCustom ? "Custom instruction mode" : "Built-in instruction mode");

        // Use generateQuietPrompt with options to bypass caching
        // skipWIAN: true - skip World Info and Author's Note (can cause cache hits)
        // quietName: unique name per request to prevent prompt caching
        let llmPrompt;
        if (s.llmOverrideEnabled && s.llmOverrideProfileId) {
            log("Using LLM Override for prompt generation");
            llmPrompt = await callOverrideLLM(instructionWithEntropy, "", signal);
        } else {
            const quietOptions = {
                skipWIAN: true,
                quietName: `ImageGen_${timestamp}`,
                quietToLoud: false
            };
            try {
                llmPrompt = await runAbortableTask(() => generateQuietPrompt(instructionWithEntropy, quietOptions), signal);
            } catch (e) {
                if (e.name === "AbortError") throw e;
                log(`generateQuietPrompt with options failed: ${e.message}, using simple call`);
                llmPrompt = await runAbortableTask(() => generateQuietPrompt(instructionWithEntropy, false), signal);
            }
        }

        checkAborted(); // Check immediately after LLM call returns
        log(`LLM raw response: ${llmPrompt}`);
        log(`LLM response length: ${(llmPrompt || "").length} chars`);

        let cleaned = (llmPrompt || "").trim();

        // Remove all cache-busting tokens and entropy markers from response
        cleaned = cleaned.replace(/\[\d+\]\s*/g, '');              // [timestamp] at start
        cleaned = cleaned.replace(/\{\{\d+_[a-z0-9]+\}\}/gi, '');  // {{timestamp_random}} inline
        cleaned = cleaned.replace(/\[ref:[a-z0-9]+\]/gi, '');      // [ref:random] markers
        cleaned = cleaned.replace(/\[GEN:[^\]]+\]/g, '');          // legacy [GEN:...] format
        cleaned = cleaned.replace(/\[Request ID: [^\]]+\]/g, '');  // legacy Request ID
        cleaned = cleaned.replace(/\[Generation ID: \d+\]/g, '');  // legacy Generation ID
        cleaned = cleaned.trim();

        if (!cleaned) {
            log("WARNING: LLM returned empty response — using extracted prompt as-is. Check your provider's token/output limit.");
            toastr.warning("LLM prompt was empty — using raw prompt. Check token limits.", "Image Gen", { timeOut: 5000 });
            return basePrompt;
        }

        // Remove prefill text if it appears at start of response
        if (s.llmPrefill && cleaned.toLowerCase().startsWith(s.llmPrefill.toLowerCase())) {
            cleaned = cleaned.substring(s.llmPrefill.length).trim();
        }

        // CRITICAL: Check if response looks like roleplay dialogue (indicates LLM used chat context)
        // Roleplay dialogue typically has dialogue markers, quotation marks, or narrative text
        const looksLikeRoleplay = /["'"].*\s["']|said:|thought:|thought\s*:|^[A-Z][a-z]+\s+(?:nods|smiles|frowns|laughs|gasps)/i.test(cleaned);

        if (looksLikeRoleplay) {
            log("⚠️ WARNING: Response appears to be roleplay dialogue, not an image prompt!");
            log("This indicates LLM used chat context despite our instructions.");

            // Force a minimal, literal instruction as fallback
            log("Attempting literal fallback instruction...");
            cleaned = await generateLiteralFallback(basePrompt);
        }

        return cleaned || basePrompt;
    } catch (e) {
        if (e.name === "AbortError") throw e;
        log(`LLM prompt failed: ${e.message}`);
        toastr.warning(`LLM prompt failed: ${e.message}`, "Image Gen", { timeOut: 5000 });
        return basePrompt;
    }
}

async function generateLiteralFallback(originalInstruction) {
    try {
        // This is a last resort: we extract just the scene/action from the instruction
        // and return it as-is without LLM processing
        log("Using literal fallback to avoid chat context issues");

        // Extract scene/action part by looking for common patterns
        let extracted = originalInstruction;

        // Remove instruction headers if present
        extracted = extracted.replace(/^###.*?###\s*/g, '');
        extracted = extracted.replace(/CRITICAL.*?\n*/gi, '');
        extracted = extracted.replace(/Create.*?for\s+this\s+scene:/gi, '');
        extracted = extracted.replace(/Scene:\s*/gi, '');

        // Clean up but keep essence
        extracted = extracted.replace(/\n\n+/g, '\n').trim();

        log(`Literal fallback extracted: ${extracted.substring(0, 100)}...`);
        return extracted;
    } catch (e) {
        log(`Literal fallback failed: ${e.message}`);
        return originalInstruction;
    }
}
async function genPollinations(prompt, negative, s, signal) {
    if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
    const seed = resolveRandomSeed(s.seed, s);
    let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${s.width}&height=${s.height}&seed=${seed}&nologo=true`;
    if (negative) url += `&negative=${encodeURIComponent(negative)}`;
    if (s.pollinationsModel && s.pollinationsModel !== "flux") url += `&model=${s.pollinationsModel}`;
    log(`Pollinations URL: ${url.substring(0, 100)}...`);
    return url;
}

async function genNovelAI(prompt, negative, s, signal) {
    normalizeSize(s);
    const isV4 = s.naiModel.includes("-4");
    // Map SillyTavern sampler names to NovelAI API format
    const samplerMap = {
        "euler_a": "k_euler_ancestral", "euler": "k_euler",
        "dpm++_2m": "k_dpmpp_2m", "dpm++_sde": "k_dpmpp_sde",
        "dpm++_2m_sde": "k_dpmpp_2m", "dpm++_3m_sde": "k_dpmpp_2m",
        "dpm++_2s_ancestral": "k_dpmpp_2s_ancestral",
        "dpm_2": "k_dpm_2", "dpm_2_ancestral": "k_dpm_2_ancestral",
        "dpm_fast": "k_dpm_fast", "dpm_adaptive": "k_dpm_adaptive",
        "ddim": "ddim", "ddpm": "k_euler", "lms": "k_lms",
        "heun": "k_heun", "heunpp2": "k_heun",
        "plms": "k_euler", "uni_pc": "k_euler", "uni_pc_bh2": "k_euler",
        "lcm": "k_euler", "deis": "k_euler", "restart": "k_euler"
    };
    const isV3OrNewer = s.naiModel.includes("diffusion-3") || s.naiModel.includes("diffusion-4");
    const sampler = (s.sampler === "ddim" && isV3OrNewer)
        ? "ddim_v3"
        : (samplerMap[s.sampler] || "k_euler_ancestral");
    const seed = resolveRandomSeed(s.seed, s);

    const params = {
        width: s.width,
        height: s.height,
        steps: s.steps,
        scale: s.cfgScale,
        sampler: sampler,
        seed: seed,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: false,
        negative_prompt: negative,
        params_version: 3,
        legacy: false,
        controlnet_strength: 1,
        dynamic_thresholding: false,
        cfg_rescale: 0,
        noise_schedule: "native"
    };

    if (isV4) {
        params.v4_prompt = { caption: { base_caption: prompt, char_captions: [] }, use_coords: false, use_order: true };
        params.v4_negative_prompt = { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false };
        params.characterPrompts = [];
        params.skip_cfg_above_sigma = null;
    }

    const payload = { input: prompt, model: s.naiModel, action: "generate", parameters: params };

    // OpenAI-compatible proxy (e.g. linkapi.cc/v1 → yousebaby → NAI)
    if (s.naiProxyUrl && s.naiProxyUrl.includes("/v1")) {
        const proxyKey = s.naiProxyKey || s.naiKey;
        const proxyUrl = String(s.naiProxyUrl || "").replace(/\/$/, "");

        if (proxyUrl.includes("/chat/completions")) {
            const exactGenerateUrl = getNovelAIProxyGenerateUrl(proxyUrl);
            if (exactGenerateUrl) {
                const exactPayload = {
                    input: prompt,
                    model: s.naiModel,
                    action: "generate",
                    parameters: { ...params, return_base64: true }
                };
                try {
                    log(`NAI v1 proxy exact-size attempt to ${exactGenerateUrl}: size=${s.width}x${s.height}`);
                    const exactRes = await fetch(exactGenerateUrl, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${proxyKey}`, "Content-Type": "application/json", "Accept": "*/*" },
                        body: JSON.stringify(exactPayload),
                        signal
                    });
                    if (exactRes.ok) {
                        const exactJson = await exactRes.json();
                        return extractNovelAIProxyImageUrl(exactJson, exactGenerateUrl);
                    }
                    const errText = await exactRes.text().catch(() => "");
                    log(`NAI v1 proxy exact-size fallback: ${exactRes.status} ${errText.substring(0, 180)}`);
                } catch (e) {
                    if (e.name === "AbortError") throw e;
                    log(`NAI v1 proxy exact-size fallback (error): ${e.message}`);
                }
            }
        }

        const v1SamplerMap = {
            "k_euler_ancestral": "Euler Ancestral", "k_euler": "Euler",
            "k_dpmpp_2m": "DPM++ 2M", "k_dpmpp_sde": "DPM++ SDE",
            "k_dpmpp_2m_sde": "DPM++ 2M SDE", "ddim": "DDIM", "ddim_v3": "DDIM"
        };
        const v1Url = proxyUrl.includes("/chat/completions")
            ? proxyUrl
            : proxyUrl + "/chat/completions";
        const v1Payload = {
            model: s.naiModel,
            messages: [{ role: "user", content: prompt }],
            size: s.width > s.height ? "1216:832" : s.width < s.height ? "832:1216" : "1024:1024",
            negative_prompt: negative,
            sampler: v1SamplerMap[sampler] || "Euler Ancestral",
            return_base64: true,
            stream: false
        };
        log(`NAI v1 proxy request to ${v1Url}: ${JSON.stringify(v1Payload).substring(0, 200)}...`);
        const res = await fetch(v1Url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${proxyKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(v1Payload),
            signal
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`NovelAI proxy error: ${res.status} ${errText}`);
        }
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content) throw new Error(`NovelAI proxy returned no image: ${JSON.stringify(json).substring(0, 300)}`);
        if (content.startsWith("data:")) return content;
        if (content.startsWith("http")) return content;
        const mdMatch = content.match(/!\[.*?\]\((.*?)\)/);
        if (mdMatch) return mdMatch[1];
        throw new Error(`NovelAI proxy returned unexpected content: ${content.substring(0, 200)}`);
    }

    const isProxy = !!s.naiProxyUrl;
    const apiUrl = isProxy
        ? getNovelAIProxyGenerateUrl(s.naiProxyUrl)
        : "https://image.novelai.net/ai/generate-image";
    if (isProxy && !apiUrl) throw new Error("NovelAI proxy URL is required");
    const apiKey = s.naiProxyKey || s.naiKey;

    if (isProxy) params.return_base64 = true;

    const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Accept": "*/*" },
        body: JSON.stringify(payload),
        signal
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`NovelAI error: ${res.status} ${errText}`);
    }

    // Proxy returns JSON with a URL or base64 data URI
    if (isProxy) {
        const json = await res.json();
        return extractNovelAIProxyImageUrl(json, apiUrl);
    }

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    log(`NAI response length: ${bytes.length}`);

    // Check if response is a ZIP file (starts with PK)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
        log("Response is ZIP format, extracting PNG...");
        const pngData = await extractPngFromZip(bytes);
        if (!pngData) {
            throw new Error("No PNG found in ZIP response. Check your API key and model settings.");
        }

        // Verify PNG signature
        if (pngData[0] === 0x89 && pngData[1] === 0x50 && pngData[2] === 0x4E && pngData[3] === 0x47) {
            log(`Extracted valid PNG from ZIP: ${pngData.length} bytes`);
            { const u = URL.createObjectURL(new Blob([pngData], { type: "image/png" })); blobUrls.add(u); return u; }
        } else {
            log(`Invalid PNG signature after extraction: ${pngData[0]} ${pngData[1]} ${pngData[2]} ${pngData[3]}`);
            throw new Error("Extracted data is not a valid PNG file.");
        }
    }

    // V4+ returns msgpack events, V3 returns zip - both contain PNG data we can extract
    const pngStart = findPngStart(bytes);
    if (pngStart < 0) {
        const textResponse = new TextDecoder().decode(bytes.slice(0, Math.min(200, bytes.length)));
        log(`First 200 bytes as text: ${textResponse}`);
        throw new Error("No PNG found in response. Check your API key and model settings.");
    }

    // Find PNG end (IEND chunk + CRC)
    const pngEnd = findPngEnd(bytes, pngStart);
    log(`Extracted PNG: ${pngStart} to ${pngEnd} (${pngEnd - pngStart} bytes)`);
    const pngData = bytes.slice(pngStart, pngEnd);
    { const u = URL.createObjectURL(new Blob([pngData], { type: "image/png" })); blobUrls.add(u); return u; }
}

function findPngStart(bytes) {
    for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x47) return i;
    }
    return -1;
}

function findPngEnd(bytes, start) {
    // Look for IEND chunk (49 45 4E 44) followed by CRC
    for (let i = start; i < bytes.length - 8; i++) {
        if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x44) {
            return i + 8; // IEND + 4 byte CRC
        }
    }
    return bytes.length;
}

async function extractPngFromZip(zipBytes) {
    try {
        const view = new DataView(zipBytes.buffer);

        // Find end of central directory record
        let eocdOffset = -1;
        for (let i = zipBytes.length - 22; i >= 0; i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }

        if (eocdOffset === -1) {
            console.log("No EOCD found, trying direct PNG search...");
            return searchForPngInBytes(zipBytes);
        }

        // Get central directory info
        const cdOffset = view.getUint32(eocdOffset + 16, true);
        const cdEntries = view.getUint16(eocdOffset + 10, true);

        if (cdOffset >= zipBytes.length || cdOffset < 0) return searchForPngInBytes(zipBytes);

        // Parse central directory entries
        let offset = cdOffset;
        for (let i = 0; i < cdEntries; i++) {
            if (view.getUint32(offset, true) !== 0x02014b50) break;

            const compressionMethod = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const uncompressedSize = view.getUint32(offset + 24, true);
            const filenameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);

            // Get filename
            const filename = new TextDecoder().decode(zipBytes.slice(offset + 46, offset + 46 + filenameLength));

            if (filename.toLowerCase().endsWith('.png')) {
                console.log(`Found PNG file: ${filename}, compression: ${compressionMethod}`);

                if (localHeaderOffset + 30 >= zipBytes.length) break;

                // Get local file header
                const localFilenameLength = view.getUint16(localHeaderOffset + 26, true);
                const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
                const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;

                if (compressionMethod === 0) {
                    // No compression
                    return zipBytes.slice(dataOffset, dataOffset + compressedSize);
                } else if (compressionMethod === 8) {
                    // Deflate compression - try to decompress
                    const compressedData = zipBytes.slice(dataOffset, dataOffset + compressedSize);
                    return await decompressDeflate(compressedData);
                }
            }

            offset += 46 + filenameLength + extraLength + commentLength;
        }

        console.log("No PNG found in central directory, trying direct search...");
        return searchForPngInBytes(zipBytes);

    } catch (e) {
        console.error("ZIP parsing error:", e);
        return searchForPngInBytes(zipBytes);
    }
}

function searchForPngInBytes(bytes) {
    // Search for PNG signature in raw bytes
    for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x47 &&
            bytes[i + 4] === 0x0D && bytes[i + 5] === 0x0A && bytes[i + 6] === 0x1A && bytes[i + 7] === 0x0A) {

            // Find IEND
            for (let j = i + 8; j < bytes.length - 8; j++) {
                if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0x4E && bytes[j + 3] === 0x44) {
                    const pngData = bytes.slice(i, j + 8);
                    console.log(`Found PNG via direct search: ${pngData.length} bytes`);
                    return pngData;
                }
            }
        }
    }
    return null;
}

async function decompressDeflate(compressedData) {
    try {
        // Use pako if available (common in many environments)
        if (typeof pako !== 'undefined') {
            return pako.inflate(compressedData);
        }

        // Try browser's DecompressionStream
        if (typeof DecompressionStream !== 'undefined') {
            const stream = new DecompressionStream('deflate-raw');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();

            writer.write(compressedData);
            writer.close();

            const chunks = [];
            let done = false;
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
            }

            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.length;
            }
            return result;
        }

        console.log("No decompression method available, returning null");
        return null;

    } catch (e) {
        console.error("Decompression failed:", e);
        return null;
    }
}

async function genArliAI(prompt, negative, s, signal) {
    const seed = resolveRandomSeed(s.seed, s);
    const res = await fetch("https://api.arliai.com/v1/txt2img", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.arliKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            sd_model_checkpoint: s.arliModel,
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
            steps: s.steps,
            cfg_scale: s.cfgScale,
            sampler_name: s.sampler,
            seed: seed
        }),
        signal
    });
    if (!res.ok) throw new Error(`ArliAI error: ${res.status}`);
    const data = await res.json();
    if (data.images?.[0]) return `data:image/png;base64,${data.images[0]}`;
    throw new Error("No image in response");
}

async function genNanoGPT(prompt, negative, s, signal) {
    const body = {
        model: s.nanogptModel,
        prompt: prompt,
        negative_prompt: negative,
        size: `${s.width}x${s.height}`,
        n: 1
    };
    const refs = s.nanogptRefImages || [];
    if (refs.length === 1) {
        body.imageDataUrl = refs[0];
        body.strength = s.nanogptStrength ?? 0.75;
    } else if (refs.length > 1) {
        body.imageDataUrls = refs;
        body.strength = s.nanogptStrength ?? 0.75;
    }
    const res = await fetch("https://nano-gpt.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.nanogptKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
    });
    if (!res.ok) throw new Error(`NanoGPT error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

async function genChutes(prompt, negative, s, signal) {
    const seed = resolveRandomSeed(s.seed, s);
    const res = await fetch("https://image.chutes.ai/generate", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.chutesKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: s.chutesModel,
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
            num_inference_steps: s.steps,
            guidance_scale: s.cfgScale,
            seed: seed
        }),
        signal
    });
    if (!res.ok) throw new Error(`Chutes error: ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image/")) {
        const blob = await res.blob();
        const u = URL.createObjectURL(blob); blobUrls.add(u); return u;
    }
    const data = await res.json();
    if (data.images?.[0]) {
        const img = data.images[0];
        if (img.startsWith?.("data:") || img.startsWith?.("http")) return img;
        return `data:image/png;base64,${img}`;
    }
    if (data.image) {
        if (data.image.startsWith?.("data:") || data.image.startsWith?.("http")) return data.image;
        return `data:image/png;base64,${data.image}`;
    }
    throw new Error("No image in response");
}

async function genCivitAI(prompt, negative, s, signal) {
    const seed = resolveRandomSeed(s.seed, s);
    // Parse LoRAs into additionalNetworks map
    let additionalNetworks;
    if (s.civitaiLoras && s.civitaiLoras.trim()) {
        additionalNetworks = {};
        for (const entry of s.civitaiLoras.split(",")) {
            const trimmed = entry.trim();
            if (!trimmed) continue;
            const lastColon = trimmed.lastIndexOf(":");
            // URNs contain colons, so split on the last one for urn:weight
            const hasWeight = lastColon > 0 && !isNaN(parseFloat(trimmed.slice(lastColon + 1)));
            const urn = hasWeight ? trimmed.slice(0, lastColon).trim() : trimmed;
            const strength = hasWeight ? parseFloat(trimmed.slice(lastColon + 1)) : 1.0;
            additionalNetworks[urn] = { strength };
        }
        if (Object.keys(additionalNetworks).length > 0) {
            log(`CivitAI: Using ${Object.keys(additionalNetworks).length} LoRA(s): ${Object.keys(additionalNetworks).map(u => u.split(":").pop()).join(", ")}`);
        } else {
            additionalNetworks = undefined;
        }
    }

    const input = {
        model: s.civitaiModel,
        params: {
            prompt: prompt,
            negativePrompt: negative,
            scheduler: s.civitaiScheduler || "EulerA",
            steps: s.steps,
            cfgScale: s.cfgScale,
            width: s.width,
            height: s.height,
            seed: seed,
            clipSkip: parseInt(s.a1111ClipSkip) || 2
        },
        batchSize: 1
    };
    if (additionalNetworks) input.additionalNetworks = additionalNetworks;

    const res = await fetch("https://civitai.com/api/v1/consumer/jobs", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.civitaiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ $type: "textToImage", input }),
        signal
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`CivitAI error: ${res.status} - ${errText}`);
    }
    const data = await res.json();

    // Poll for job completion using token
    const jobToken = data.token;
    if (!jobToken) throw new Error(`No job token returned: ${JSON.stringify(data)}`);

    let lastError = null;
    for (let i = 0; i < 60; i++) {
        if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://civitai.com/api/v1/consumer/jobs?token=${jobToken}`, {
            headers: { "Authorization": `Bearer ${s.civitaiKey}` },
            signal
        });
        if (!statusRes.ok) {
            lastError = `Status error: ${statusRes.status}`;
            continue;
        }
        const jobs = await statusRes.json();
        const job = jobs?.[0];

        if (job?.result?.blobUrl) {
            return job.result.blobUrl;
        }
        if (job?.scheduled === false && !job?.result) {
            throw new Error(`CivitAI job failed: ${job.message || 'Unknown error'}`);
        }
    }
    throw new Error(`CivitAI job timeout. Last error: ${lastError || 'Still processing'}`);
}

async function genNanobanana(prompt, negative, s, signal) {
    // Build parts array with reference images and prompt
    const parts = [];
    if (s.nanobananaRefImages?.length) {
        log(`Adding ${s.nanobananaRefImages.length} reference images to Nanobanana request`);
        for (const img of s.nanobananaRefImages) {
            const match = img.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
        }
    }

    let finalPrompt = `Generate an image: ${prompt}`;
    if (negative) finalPrompt += ` Avoid: ${negative}`;
    if (s.nanobananaExtraInstructions) finalPrompt += ` ${s.nanobananaExtraInstructions}`;

    parts.push({ text: finalPrompt });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.nanobananaModel}:generateContent?key=${s.nanobananaKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]
            }
        }),
        signal
    });
    if (!res.ok) throw new Error(`Nanobanana error: ${res.status}`);
    const data = await res.json();

    for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
            if (part.inlineData?.data) {
                return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            }
        }
    }
    throw new Error("No image in response");
}

async function genLocal(prompt, negative, s, signal) {
    const baseUrl = s.localUrl.replace(/\/$/, "");

    if (s.localType === "comfyui") {
        // Map sampler names to ComfyUI format
        const comfySamplerMap = {
            "euler_a": "euler_ancestral", "euler": "euler",
            "dpm++_2m": "dpmpp_2m", "dpm++_sde": "dpmpp_sde", "dpm++_2m_sde": "dpmpp_2m_sde",
            "dpm++_3m_sde": "dpmpp_3m_sde", "dpm++_2s_ancestral": "dpmpp_2s_ancestral",
            "dpmpp_2m": "dpmpp_2m", "dpmpp_sde": "dpmpp_sde",
            "dpm_2": "dpm_2", "dpm_2_ancestral": "dpm_2_ancestral",
            "dpm_fast": "dpm_fast", "dpm_adaptive": "dpm_adaptive",
            "ddim": "ddim", "ddpm": "ddpm", "lms": "lms",
            "heun": "heun", "heunpp2": "heunpp2", "plms": "euler",
            "uni_pc": "uni_pc", "uni_pc_bh2": "uni_pc_bh2",
            "lcm": "lcm", "deis": "deis", "restart": "restart"
        };

        const samplerName = comfySamplerMap[s.sampler] || s.sampler.replace(/\+\+/g, "pp");
        const schedulerName = s.comfyScheduler || "normal";
        const seed = resolveRandomSeed(s.seed, s);
        const denoise = parseFloatOr(s.comfyDenoise, 1.0);
        const clipSkip = parseIntOr(s.comfyClipSkip, 1);
        const comfyTimeoutSeconds = Math.max(10, parseIntOr(s.comfyTimeout, 300));

        async function waitForComfyImage(promptId) {
            for (let i = 0; i < comfyTimeoutSeconds; i++) {
                if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
                await new Promise(r => setTimeout(r, 1000));
                showStatus(`Generating... (waiting ${i + 1}s)`);
                let hist;
                try {
                    const histRes = await corsFetch(`${baseUrl}/history/${promptId}`, { signal });
                    if (!histRes.ok) continue;
                    hist = await histRes.json();
                } catch { continue; }
                const result = hist[promptId];
                checkComfyResult(result);
                if (result?.outputs) {
                    for (const nodeId in result.outputs) {
                        const output = result.outputs[nodeId];
                        if (output.images?.[0]) {
                            const img = output.images[0];
                            return `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "output"}`;
                        }
                    }
                }
            }
            throw new Error(`ComfyUI timed out after ${comfyTimeoutSeconds}s`);
        }

        // Check for custom workflow JSON
        if (s.comfyWorkflow && s.comfyWorkflow.trim()) {
            try {
                let customWorkflow = JSON.parse(s.comfyWorkflow);

                // Upload reference image for %reference_image% placeholder
                let uploadedRefName = '';
                if (s.localRefImage) {
                    try {
                        const imgData = s.localRefImage.replace(/^data:image\/.+;base64,/, '');
                        const blob = await (await fetch(`data:image/png;base64,${imgData}`)).blob();
                        const formData = new FormData();
                        formData.append("image", blob, "qig_ref.png");
                        formData.append("overwrite", "true");
                        const uploadRes = await corsFetch(`${baseUrl}/upload/image`, {
                            method: "POST",
                            body: formData,
                            signal
                        });
                        if (uploadRes.ok) {
                            const uploadData = await uploadRes.json();
                            uploadedRefName = uploadData.name || "qig_ref.png";
                            log(`ComfyUI: Uploaded reference image as "${uploadedRefName}"`);
                        } else {
                            log(`ComfyUI: Failed to upload reference image (${uploadRes.status})`);
                        }
                    } catch (uploadErr) {
                        log(`ComfyUI: Reference image upload error: ${uploadErr.message}`);
                    }
                }

                // Replace placeholders like sd-proxy does
                const replacements = {
                    '%prompt%': prompt,
                    '%negative%': negative,
                    '%seed%': String(seed),
                    '%width%': String(s.width),
                    '%height%': String(s.height),
                    '%steps%': String(s.steps),
                    '%cfg%': String(s.cfgScale),
                    '%denoise%': String(denoise),
                    '%clip_skip%': String(clipSkip),
                    '%sampler%': samplerName,
                    '%scheduler%': schedulerName,
                    '%model%': s.localModel || 'model.safetensors',
                    '%reference_image%': uploadedRefName
                };

                const replaceInObj = (obj) => {
                    for (const key in obj) {
                        if (typeof obj[key] === 'string') {
                            for (const [placeholder, value] of Object.entries(replacements)) {
                                obj[key] = obj[key].split(placeholder).join(value);
                            }
                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                            replaceInObj(obj[key]);
                        }
                    }
                };
                replaceInObj(customWorkflow);

                log(`ComfyUI: Using custom workflow with ${Object.keys(customWorkflow).length} nodes`);

                const res = await corsFetch(`${baseUrl}/prompt`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: customWorkflow }),
                    signal
                });
                if (!res.ok) {
                    let detail = "";
                    try { const b = await res.json(); detail = b.error?.message || b.error || ""; } catch {}
                    throw new Error(`ComfyUI error ${res.status}${detail ? ": " + detail : ""}`);
                }
                const data = await res.json();

                const promptId = data.prompt_id;
                return await waitForComfyImage(promptId);
            } catch (e) {
                if (e instanceof SyntaxError) {
                    log(`ComfyUI: Invalid workflow JSON: ${e.message}, using default`);
                } else {
                    throw e;
                }
            }
        }

        function checkComfyResult(result) {
            if (result?.status?.status_str === "error") {
                const errorMsgs = result.status.messages || [];
                const executionError = errorMsgs.find(m => m[0] === "execution_error");
                const errMsg = executionError?.[1]?.exception_message || "Unknown execution error";
                let hint = "";
                if (/clip.*invalid|invalid.*clip|clip.*not.*found/i.test(errMsg)) {
                    hint = " (Hint: model may lack a built-in CLIP encoder. For UNET-only models, enable 'Skip Negative Prompt' and fill in the CLIP Model and VAE Model fields below it. Or use a custom workflow JSON exported from ComfyUI.)";
                } else if (/vae.*invalid|invalid.*vae|vae.*not.*found/i.test(errMsg)) {
                    hint = " (Hint: model may lack a built-in VAE. For UNET-only models, enable 'Skip Negative Prompt' and fill in the VAE Model field below it. Or use a custom workflow JSON exported from ComfyUI.)";
                } else if (/negative.*conditioning|conditioning.*negative/i.test(errMsg)) {
                    hint = " (Hint: this model may not support negative prompts. Try enabling 'Skip Negative Prompt' in ComfyUI settings.)";
                }
                throw new Error(`ComfyUI execution error: ${errMsg}${hint}`);
            }
        }

        // ComfyUI API - Default workflow
        const skipNeg = !!s.comfySkipNegativePrompt;
        const fluxMode = isComfyFluxMode(s);

        let workflowNodes;
        if (fluxMode) {
            // Flux/UNET-only workflow: separate UNETLoader + CLIP loader(s) + VAELoader
            const hasDualClip = !!(s.comfyFluxClipModel2 || "").trim();
            const clipType = (s.comfyFluxClipType || "flux").trim();
            const clipRef = clipSkip > 1 ? ["10", 0] : ["12", 0];
            workflowNodes = {
                "3": {
                    class_type: "KSampler",
                    inputs: {
                        seed: seed,
                        steps: s.steps,
                        cfg: s.cfgScale,
                        sampler_name: samplerName,
                        scheduler: schedulerName,
                        denoise: denoise,
                        model: ["11", 0],
                        positive: ["6", 0],
                        negative: ["6", 0],
                        latent_image: ["5", 0]
                    }
                },
                "5": { class_type: "EmptyLatentImage", inputs: { width: s.width, height: s.height, batch_size: 1 } },
                "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: clipRef } },
                "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["13", 0] } },
                "9": { class_type: "SaveImage", inputs: { filename_prefix: "qig", images: ["8", 0] } },
                "11": { class_type: "UNETLoader", inputs: { unet_name: s.localModel || "model.safetensors", weight_dtype: "default" } },
                "12": hasDualClip
                    ? { class_type: "DualCLIPLoader", inputs: { clip_name1: s.comfyFluxClipModel1, clip_name2: s.comfyFluxClipModel2, type: clipType } }
                    : { class_type: "CLIPLoader", inputs: { clip_name: s.comfyFluxClipModel1, type: clipType } },
                "13": { class_type: "VAELoader", inputs: { vae_name: s.comfyFluxVaeModel || "ae.safetensors" } }
            };
            if (clipSkip > 1) {
                workflowNodes["10"] = { class_type: "CLIPSetLastLayer", inputs: { stop_at_clip_layer: -clipSkip, clip: ["12", 0] } };
            }
            log(`ComfyUI: Using Flux/UNET workflow (UNETLoader + ${hasDualClip ? 'DualCLIPLoader' : 'CLIPLoader'} + VAELoader)`);
        } else {
            // Standard checkpoint workflow
            workflowNodes = {
                "3": {
                    class_type: "KSampler",
                    inputs: {
                        seed: seed,
                        steps: s.steps,
                        cfg: s.cfgScale,
                        sampler_name: samplerName,
                        scheduler: schedulerName,
                        denoise: denoise,
                        model: ["4", 0],
                        positive: ["6", 0],
                        negative: skipNeg ? ["6", 0] : ["7", 0],
                        latent_image: ["5", 0]
                    }
                },
                "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: s.localModel || "model.safetensors" } },
                "5": { class_type: "EmptyLatentImage", inputs: { width: s.width, height: s.height, batch_size: 1 } },
                "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: clipSkip > 1 ? ["10", 0] : ["4", 1] } },
                "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
                "9": { class_type: "SaveImage", inputs: { filename_prefix: "qig", images: ["8", 0] } }
            };
            if (!skipNeg) {
                workflowNodes["7"] = { class_type: "CLIPTextEncode", inputs: { text: negative, clip: clipSkip > 1 ? ["10", 0] : ["4", 1] } };
            }
            if (clipSkip > 1) {
                workflowNodes["10"] = { class_type: "CLIPSetLastLayer", inputs: { stop_at_clip_layer: -clipSkip, clip: ["4", 1] } };
            }
        }

        // LoRA injection for ComfyUI default workflow
        if (s.comfyLoras && s.comfyLoras.trim()) {
            let loraNodeStart = 20;
            let lastModelRef = fluxMode ? ["11", 0] : ["4", 0];
            let lastClipRef = fluxMode ? ["12", 0] : ["4", 1];
            const loras = s.comfyLoras.split(",").map(l => l.trim()).filter(l => l);
            let injectedCount = 0;
            loras.forEach((l, i) => {
                const lastColon = l.lastIndexOf(":");
                const hasWeight = lastColon > 0 && !isNaN(parseFloat(l.slice(lastColon + 1)));
                const name = (hasWeight ? l.slice(0, lastColon) : l).trim();
                const pw = hasWeight ? parseFloat(l.slice(lastColon + 1)) : NaN;
                const weight = isNaN(pw) ? 0.8 : pw;
                if (!name) return;
                injectedCount++;
                const nodeId = String(loraNodeStart + i);
                workflowNodes[nodeId] = {
                    class_type: "LoraLoader",
                    inputs: {
                        lora_name: name,
                        strength_model: weight,
                        strength_clip: weight,
                        model: lastModelRef,
                        clip: lastClipRef
                    }
                };
                lastModelRef = [nodeId, 0];
                lastClipRef = [nodeId, 1];
            });
            // Rewire KSampler model input
            workflowNodes["3"].inputs.model = lastModelRef;
            // Rewire CLIP inputs
            if (clipSkip > 1) {
                workflowNodes["10"].inputs.clip = lastClipRef;
            } else {
                workflowNodes["6"].inputs.clip = lastClipRef;
                if (workflowNodes["7"]) workflowNodes["7"].inputs.clip = lastClipRef;
            }
            log(`ComfyUI: Injected ${injectedCount} LoRA(s)`);
        }

        // img2img: swap EmptyLatentImage for LoadImage + VAEEncode when reference image present
        if (s.localRefImage && denoise < 1.0) {
            // Upload image to ComfyUI
            const imgData = s.localRefImage.replace(/^data:image\/.+;base64,/, '');
            const blob = await (await fetch(`data:image/png;base64,${imgData}`)).blob();
            const formData = new FormData();
            formData.append("image", blob, "qig_ref.png");
            formData.append("overwrite", "true");
            try {
                const uploadRes = await corsFetch(`${baseUrl}/upload/image`, {
                    method: "POST",
                    body: formData,
                    signal
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    const uploadedName = uploadData.name || "qig_ref.png";

                    // Replace EmptyLatentImage (node 5) with LoadImage
                    workflowNodes["5"] = {
                        class_type: "LoadImage",
                        inputs: { image: uploadedName }
                    };
                    // Add VAEEncode node (node 15) to encode the loaded image to latent
                    const vaeRef = fluxMode ? ["13", 0] : ["4", 2];
                    workflowNodes["15"] = {
                        class_type: "VAEEncode",
                        inputs: { pixels: ["5", 0], vae: vaeRef }
                    };
                    // Rewire KSampler latent_image to VAEEncode output
                    workflowNodes["3"].inputs.latent_image = ["15", 0];
                    log(`ComfyUI: img2img mode — uploaded reference image as "${uploadedName}", denoise=${denoise}`);
                } else {
                    log(`ComfyUI: Failed to upload reference image (${uploadRes.status}), falling back to txt2img`);
                }
            } catch (uploadErr) {
                log(`ComfyUI: Image upload error: ${uploadErr.message}, falling back to txt2img`);
            }
        }

        // Upscale: inject UpscaleModelLoader + ImageUpscaleWithModel between VAEDecode and SaveImage
        if (s.comfyUpscale && s.comfyUpscaleModel) {
            workflowNodes["30"] = {
                class_type: "UpscaleModelLoader",
                inputs: { model_name: s.comfyUpscaleModel }
            };
            workflowNodes["31"] = {
                class_type: "ImageUpscaleWithModel",
                inputs: { upscale_model: ["30", 0], image: ["8", 0] }
            };
            // Rewire SaveImage to take upscaled output instead of VAEDecode
            workflowNodes["9"].inputs.images = ["31", 0];
            log(`ComfyUI: Upscale enabled with model=${s.comfyUpscaleModel}`);
        }

        log(`ComfyUI: sampler=${samplerName}, scheduler=${schedulerName}, steps=${s.steps}, cfg=${s.cfgScale}, seed=${seed}, denoise=${denoise}, clip_skip=${clipSkip}, size=${s.width}x${s.height}${s.localRefImage && denoise < 1.0 ? ', mode=img2img' : ''}${s.comfyUpscale ? ', upscale=' + s.comfyUpscaleModel : ''}`);

        const res = await corsFetch(`${baseUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: workflowNodes }),
            signal
        });
        if (!res.ok) {
            let detail = "";
            try { const b = await res.json(); detail = b.error?.message || b.error || ""; } catch {}
            const hint403 = res.status === 403 ? " (Hint: ComfyUI-Manager's security check may be blocking this request. In ComfyUI-Manager settings, set Security Level to 'normal', then restart ComfyUI. Also ensure --enable-cors-header is set.)" : "";
            throw new Error(`ComfyUI error ${res.status}${detail ? ": " + detail : ""}${hint403}`);
        }
        const data = await res.json();
        // Poll for result - find any SaveImage output
        const promptId = data.prompt_id;
        return await waitForComfyImage(promptId);
    }

    // A1111 API
    const isImg2Img = s.localType === "a1111" && s.localRefImage && !s.a1111IpAdapter;
    const endpoint = isImg2Img ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img";

    const payload = {
        prompt: prompt,
        negative_prompt: negative,
        width: s.width,
        height: s.height,
        steps: s.steps,
        cfg_scale: s.cfgScale,
        sampler_name: SAMPLER_DISPLAY_NAMES[s.sampler] || s.sampler,
        scheduler: s.a1111Scheduler || "Automatic",
        seed: s.seed
    };
    const controlNetUnits = [];

    // Restore Faces & Tiling
    if (s.a1111RestoreFaces) payload.restore_faces = true;
    if (s.a1111Tiling) payload.tiling = true;

    // Variation Seed / Subseed
    const subseedStrength = parseFloatOr(s.a1111SubseedStrength, 0);
    if (subseedStrength > 0) {
        payload.subseed = s.a1111Subseed ?? -1;
        payload.subseed_strength = subseedStrength;
    }

    // LoRA injection via A1111 prompt syntax
    if (s.a1111Loras && s.a1111Loras.trim()) {
        const loraTags = s.a1111Loras.split(",")
            .map(l => l.trim()).filter(l => l)
            .map(l => {
                const lastColon = l.lastIndexOf(":");
                const hasWeight = lastColon > 0 && !isNaN(parseFloat(l.slice(lastColon + 1)));
                const name = (hasWeight ? l.slice(0, lastColon) : l).trim();
                const pw = hasWeight ? parseFloat(l.slice(lastColon + 1)) : NaN;
                const weight = isNaN(pw) ? 0.8 : pw;
                if (!name) return null;
                return `<lora:${name}:${weight}>`;
            }).filter(Boolean).join(" ");
        if (loraTags) {
            payload.prompt = `${payload.prompt} ${loraTags}`;
            log(`A1111: Injected LoRAs: ${loraTags}`);
        }
    }

    // CLIP skip
    const clipSkip = parseIntOr(s.a1111ClipSkip, 1);
    if (clipSkip > 1) {
        payload.override_settings = payload.override_settings || {};
        payload.override_settings.CLIP_stop_at_last_layers = clipSkip;
    }

    // VAE override
    if (s.a1111Vae) {
        payload.override_settings = payload.override_settings || {};
        payload.override_settings.sd_vae = s.a1111Vae;
    }

    // Hires Fix (txt2img only)
    if (s.a1111HiresFix && !isImg2Img) {
        payload.enable_hr = true;
        payload.hr_upscaler = s.a1111HiresUpscaler || "Latent";
        payload.hr_scale = parseFloatOr(s.a1111HiresScale, 2);
        payload.hr_second_pass_steps = parseIntOr(s.a1111HiresSteps, 0);
        payload.denoising_strength = parseFloatOr(s.a1111HiresDenoise, 0.55);
        if (s.a1111HiresSampler) payload.hr_sampler_name = s.a1111HiresSampler;
        if (s.a1111HiresScheduler) payload.hr_scheduler = s.a1111HiresScheduler;
        if (s.a1111HiresPrompt) payload.hr_prompt = s.a1111HiresPrompt;
        if (s.a1111HiresNegative) payload.hr_negative_prompt = s.a1111HiresNegative;
        const hiresResizeX = parseIntOr(s.a1111HiresResizeX, 0);
        const hiresResizeY = parseIntOr(s.a1111HiresResizeY, 0);
        if (hiresResizeX > 0) payload.hr_resize_x = hiresResizeX;
        if (hiresResizeY > 0) payload.hr_resize_y = hiresResizeY;
        log(`A1111: Hires Fix: upscaler=${payload.hr_upscaler}, scale=${payload.hr_scale}, denoise=${payload.denoising_strength}${payload.hr_sampler_name ? ', sampler=' + payload.hr_sampler_name : ''}${payload.hr_scheduler ? ', scheduler=' + payload.hr_scheduler : ''}${hiresResizeX ? ', resize=' + hiresResizeX + 'x' + hiresResizeY : ''}`);
    }

    // ADetailer
    if (s.a1111Adetailer) {
        const buildADetailerUnit = (model, prompt, neg, denoise, confidence, maskBlur, dilateErode, inpaintOnly, inpaintPadding) => ({
            ad_model: model,
            ad_prompt: prompt || "",
            ad_negative_prompt: neg || "",
            ad_denoising_strength: parseFloat(denoise) ?? 0.4,
            ad_confidence: parseFloat(confidence) ?? 0.3,
            ad_mask_blur: parseInt(maskBlur) ?? 4,
            ad_dilate_erode: parseInt(dilateErode) ?? 4,
            ad_inpaint_only_masked: inpaintOnly ?? true,
            ad_inpaint_only_masked_padding: parseInt(inpaintPadding) ?? 32
        });

        payload.alwayson_scripts = payload.alwayson_scripts || {};
        const adUnit1 = buildADetailerUnit(
            s.a1111AdetailerModel || "face_yolov8n.pt",
            s.a1111AdetailerPrompt, s.a1111AdetailerNegative,
            s.a1111AdetailerDenoise, s.a1111AdetailerConfidence,
            s.a1111AdetailerMaskBlur, s.a1111AdetailerDilateErode,
            s.a1111AdetailerInpaintOnlyMasked, s.a1111AdetailerInpaintPadding
        );
        const adArgs = [true, adUnit1];

        if (s.a1111Adetailer2) {
            const adUnit2 = buildADetailerUnit(
                s.a1111Adetailer2Model || "hand_yolov8n.pt",
                s.a1111Adetailer2Prompt, s.a1111Adetailer2Negative,
                s.a1111Adetailer2Denoise, s.a1111Adetailer2Confidence,
                s.a1111Adetailer2MaskBlur, s.a1111Adetailer2DilateErode,
                s.a1111Adetailer2InpaintOnlyMasked, s.a1111Adetailer2InpaintPadding
            );
            adArgs.push(adUnit2);
        }

        payload.alwayson_scripts.ADetailer = { args: adArgs };
    }

    // Save to WebUI output folder
    if (s.a1111SaveToWebUI) {
        payload.save_images = true;
    }

    if (isImg2Img && !s.a1111IpAdapter) {
        // Standard img2img - use as init image
        payload.init_images = [s.localRefImage.replace(/^data:image\/.+;base64,/, '')];
        payload.denoising_strength = parseFloatOr(s.localDenoise, 0.75);
    }

    // IP-Adapter Face - use reference image for face only
    if (s.a1111IpAdapter && s.localRefImage) {
        // Determine correct preprocessor based on model type
        // Plus/Plus v2 variants need ip-adapter_face_id_plus, others use ip-adapter_face_id
        const ipAdapterModel = s.a1111IpAdapterMode || "ip-adapter-faceid-portrait_sd15";
        const ipAdapterPreprocessor = ipAdapterModel.toLowerCase().includes('plus')
            ? 'ip-adapter_face_id_plus'
            : 'ip-adapter_face_id';

        const imageData = s.localRefImage.replace(/^data:image\/.+;base64,/, '');

        // ControlNet unit configuration - use both 'image' and 'input_image' for compatibility
        // A1111 extension uses 'image', Forge Neo may use 'input_image'
        const controlNetUnit = {
            enabled: true,
            module: ipAdapterPreprocessor,
            model: ipAdapterModel,
            weight: parseFloatOr(s.a1111IpAdapterWeight, 0.7),
            image: imageData,
            input_image: imageData,  // Forge Neo compatibility
            resize_mode: s.a1111IpAdapterResizeMode || "Crop and Resize",
            control_mode: s.a1111IpAdapterControlMode || "Balanced",
            pixel_perfect: s.a1111IpAdapterPixelPerfect ?? true,
            guidance_start: parseFloatOr(s.a1111IpAdapterStartStep, 0),
            guidance_end: parseFloatOr(s.a1111IpAdapterEndStep, 1)
        };
        controlNetUnits.push(controlNetUnit);

        const logPayload = { ...controlNetUnit, image: "BASE64_TRUNCATED", input_image: "BASE64_TRUNCATED" };
        log(`A1111/Forge ControlNet Payload: ${JSON.stringify(logPayload)}`);
        log(`A1111/Forge: Using IP-Adapter Face with preprocessor=${ipAdapterPreprocessor}, model=${ipAdapterModel}, weight=${s.a1111IpAdapterWeight}`);
    }

    // Generic ControlNet
    if (s.a1111ControlNet && s.a1111ControlNetModel) {
        const cnUnit = {
            enabled: true,
            module: s.a1111ControlNetModule || "none",
            model: s.a1111ControlNetModel,
            weight: parseFloatOr(s.a1111ControlNetWeight, 1.0),
            resize_mode: s.a1111ControlNetResizeMode || "Crop and Resize",
            control_mode: s.a1111ControlNetControlMode || "Balanced",
            pixel_perfect: s.a1111ControlNetPixelPerfect ?? true,
            guidance_start: parseFloatOr(s.a1111ControlNetGuidanceStart, 0),
            guidance_end: parseFloatOr(s.a1111ControlNetGuidanceEnd, 1)
        };
        if (s.a1111ControlNetImage) {
            const cnImageData = s.a1111ControlNetImage.replace(/^data:image\/.+;base64,/, '');
            cnUnit.image = cnImageData;
            cnUnit.input_image = cnImageData;
        }
        controlNetUnits.push(cnUnit);
        log(`A1111: Generic ControlNet: model=${s.a1111ControlNetModel}, module=${cnUnit.module}, weight=${cnUnit.weight}, image=${s.a1111ControlNetImage ? 'yes' : 'no'}`);
    }
    if (controlNetUnits.length > 0) {
        payload.alwayson_scripts = payload.alwayson_scripts || {};
        payload.alwayson_scripts[a1111ControlNetScriptKey] = { args: controlNetUnits };
    }

    log(`A1111: steps=${s.steps}, cfg=${s.cfgScale}, clip_skip=${clipSkip}, loras=${s.a1111Loras || 'none'}, hires=${s.a1111HiresFix && !isImg2Img ? 'on' : 'off'}, adetailer=${s.a1111Adetailer ? 'on' : 'off'}, ip-adapter=${s.a1111IpAdapter && s.localRefImage ? 'on' : 'off'}, controlnet=${s.a1111ControlNet ? 'on' : 'off'}`);

    // Start progress polling
    let progressInterval = null;
    progressInterval = setInterval(async () => {
        try {
            const pr = await corsFetch(`${baseUrl}/sdapi/v1/progress`);
            if (pr.ok) {
                const p = await pr.json();
                if (p.progress > 0 && p.progress < 1) {
                    const pct = Math.round(p.progress * 100);
                    const step = p.state?.sampling_step !== undefined
                        ? ` | Step ${p.state.sampling_step}/${p.state.sampling_steps}` : "";
                    const eta = p.eta_relative ? ` | ~${Math.round(p.eta_relative)}s left` : "";
                    showStatus(`Generating... ${pct}%${step}${eta}`);
                }
            }
        } catch { /* ignore polling errors */ }
    }, 500);

    const getAlternateControlNetScriptKey = (key) => key === "ControlNet" ? "sd_forge_controlnet" : "ControlNet";
    const parseA1111ErrorDetail = async (res) => {
        try {
            const data = await res.json();
            if (typeof data?.detail === "string") return data.detail;
            if (typeof data?.error === "string") return data.error;
            return JSON.stringify(data);
        } catch {
            try { return await res.text(); } catch { return ""; }
        }
    };
    const postA1111 = async (requestPayload) => corsFetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal
    });

    try {
        let requestPayload = payload;
        let res = await postA1111(requestPayload);
        if (!res.ok && controlNetUnits.length > 0 && res.status === 422) {
            const detail = await parseA1111ErrorDetail(res);
            const missingCurrentScript = new RegExp(`always on script ${a1111ControlNetScriptKey} not found`, "i");
            if (missingCurrentScript.test(detail)) {
                const fallbackKey = getAlternateControlNetScriptKey(a1111ControlNetScriptKey);
                log(`A1111: Script "${a1111ControlNetScriptKey}" not found, retrying ControlNet payload as "${fallbackKey}"`);
                const retryPayload = JSON.parse(JSON.stringify(requestPayload));
                const scriptData = retryPayload?.alwayson_scripts?.[a1111ControlNetScriptKey];
                delete retryPayload?.alwayson_scripts?.[a1111ControlNetScriptKey];
                if (scriptData) {
                    retryPayload.alwayson_scripts[fallbackKey] = scriptData;
                    const retryRes = await postA1111(retryPayload);
                    if (retryRes.ok) {
                        a1111ControlNetScriptKey = fallbackKey;
                        res = retryRes;
                        requestPayload = retryPayload;
                    } else {
                        const retryDetail = await parseA1111ErrorDetail(retryRes);
                        throw new Error(`A1111 error: ${retryRes.status}${retryDetail ? `: ${retryDetail}` : ""}`);
                    }
                }
            }
        }
        if (!res.ok) {
            const detail = await parseA1111ErrorDetail(res);
            throw new Error(`A1111 error: ${res.status}${detail ? `: ${detail}` : ""}`);
        }
        const data = await res.json();
        if (data.images?.[0]) return `data:image/png;base64,${data.images[0]}`;
        throw new Error("No image in response");
    } finally {
        if (progressInterval) clearInterval(progressInterval);
    }
}

async function genProxy(prompt, negative, s, signal) {
    // ComfyUI Proxy mode — simple GET /prompt/{text}?token=xxx → PNG
    if (s.proxyComfyMode) {
        const baseUrl = s.proxyUrl.replace(/\/$/, "");
        const params = new URLSearchParams();
        if (s.proxyKey) params.set("token", s.proxyKey);
        if (s.proxyComfyNodeId) params.set("node_id", s.proxyComfyNodeId);
        const qs = params.toString() ? `?${params.toString()}` : "";

        // If workflow JSON is provided, use POST with body
        const hasWorkflow = s.proxyComfyWorkflow && s.proxyComfyWorkflow.trim();
        const url = `${baseUrl}/prompt/${encodeURIComponent(prompt)}${qs}`;
        log(`ComfyUI Proxy: ${url.substring(0, 80)}...`);

        const controller = new AbortController();
        let timedOut = false;
        const timeout = (s.proxyComfyTimeout || 300) * 1000;
        const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
        if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

        const fetchOpts = { signal: controller.signal };
        if (hasWorkflow) {
            fetchOpts.method = "POST";
            fetchOpts.headers = { "Content-Type": "application/json" };
            fetchOpts.body = s.proxyComfyWorkflow.trim();
        }

        let res;
        try {
            res = await fetch(url, fetchOpts);
        } catch (e) {
            if (e.name === "AbortError" && timedOut && !signal?.aborted) {
                throw new Error(`ComfyUI Proxy timed out after ${s.proxyComfyTimeout}s`);
            }
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`ComfyUI Proxy error ${res.status}: ${errText || res.statusText}`);
        }
        const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get("content-type") || "image/png" });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.add(blobUrl);
        return blobUrl;
    }

    const headers = { "Content-Type": "application/json" };
    if (s.proxyKey) headers["Authorization"] = `Bearer ${s.proxyKey}`;

    const isChatProxy = s.proxyUrl.includes("/v1") && !s.proxyUrl.includes("/images");
    const proxySeed = resolveRandomSeed(s.proxySeed, s);

    if (isChatProxy) {
        const proxyUrlBase = s.proxyUrl.replace(/\/$/, "");
        const chatUrl = /\/chat\/completions$/i.test(proxyUrlBase)
            ? proxyUrlBase
            : proxyUrlBase + "/chat/completions";
        log(`Using chat completions: ${chatUrl}`);
        const negPrompt = negative ? `\nAvoid: ${negative}` : "";
        const extraInstr = s.proxyExtraInstructions ? `\n${s.proxyExtraInstructions}` : "";

        // Build message content with reference images
        const content = [];
        if (s.proxyRefImages?.length) {
            for (const img of s.proxyRefImages) {
                content.push({ type: "image_url", image_url: { url: img } });
            }
        }
        content.push({ type: "text", text: `Generate an image: ${prompt}${negPrompt}${extraInstr}` });

        // Detect Gemini image models and add responseModalities so proxies can forward it
        const isGeminiImage = /gemini.*image|gemini.*preview/i.test(s.proxyModel);
        const payload = {
                model: s.proxyModel,
                messages: [{ role: "user", content }],
                max_tokens: 4096,
                width: s.width,
                height: s.height,
                steps: s.proxySteps || 25,
                cfg_scale: s.proxyCfg || 6,
                sampler: s.proxySampler || "Euler a",
                seed: proxySeed,
                negative_prompt: negative,
                loras: s.proxyLoras ? s.proxyLoras.split(",").map(l => { const t = l.trim(); const lc = t.lastIndexOf(":"); const hw = lc > 0 && !isNaN(parseFloat(t.slice(lc + 1))); const id = (hw ? t.slice(0, lc) : t).trim(); const pw = hw ? parseFloat(t.slice(lc + 1)) : NaN; return { id, weight: isNaN(pw) ? 0.8 : pw }; }).filter(l => l.id) : undefined,
                facefix: s.proxyFacefix || undefined
        };
        if (isGeminiImage) {
            payload.response_modalities = ["TEXT", "IMAGE"];
            payload.generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
            log(`Gemini image model detected, adding responseModalities`);
        }
        const controller = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
        if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
        let res;
        try {
            res = await fetch(chatUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } catch (e) {
            if (e.name === "AbortError" && timedOut && !signal?.aborted) {
                throw new Error("Proxy request timed out after 120 seconds");
            }
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
        if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
        const data = await res.json();
        log(`Response keys: ${JSON.stringify(Object.keys(data))}`);

        const images = data.choices?.[0]?.message?.images;
        if (images && images.length > 0) {
            const img = images[0];
            if (img.image_url?.url) return img.image_url.url;
            if (img.url) return img.url;
            if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
            // Direct base64 string
            if (typeof img === 'string' && img.length > 100) {
                return img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
            }
        }

        const msgContent = data.choices?.[0]?.message?.content;

        // Handle content as array (multimodal response)
        if (Array.isArray(msgContent)) {
            for (const item of msgContent) {
                if (item.type === 'image_url' && item.image_url?.url) {
                    return item.image_url.url;
                }
                if (item.type === 'image' && item.source?.data) {
                    return `data:${item.source.media_type || 'image/png'};base64,${item.source.data}`;
                }
                if (item.image_url?.url) {
                    return item.image_url.url;
                }
                // Inline base64 in content array
                if (typeof item === 'string' && item.startsWith('data:image')) {
                    return item;
                }
            }
        }

        // Handle content as string
        const contentStr = typeof msgContent === 'string' ? msgContent : '';

        // Check for plain URL (like LinkAPI/Naistera style)
        const urlMatch = contentStr.match(/^https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif)(\?[^\s]*)?$/i);
        if (urlMatch) {
            log(`Found image URL in content: ${contentStr.substring(0, 50)}...`);
            return contentStr.trim();
        }

        // Check for URL embedded in text
        const embeddedUrlMatch = contentStr.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif)(\?[^\s]*)?)/i);
        if (embeddedUrlMatch) {
            log(`Found embedded image URL: ${embeddedUrlMatch[1].substring(0, 50)}...`);
            return embeddedUrlMatch[1];
        }

        const b64Match = contentStr.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (b64Match) return b64Match[0];

        // Check for raw base64 (no data: prefix) - common in some APIs
        const rawB64Match = contentStr.match(/^[A-Za-z0-9+/]{100,}[=]{0,2}$/);
        if (rawB64Match) return `data:image/png;base64,${rawB64Match[0]}`;

        const parts = data.choices?.[0]?.message?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inline_data?.data) {
                    return `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
                }
            }
        }

        for (const candidate of data.candidates || []) {
            for (const part of candidate.content?.parts || []) {
                if (part.inlineData?.data) {
                    return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
                }
                if (part.inline_data?.data) {
                    return `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
                }
            }
        }

        // Log full response structure for debugging
        log(`Full message structure: ${JSON.stringify(data.choices?.[0]?.message || {}).substring(0, 500)}`);
        throw new Error(msgContent === null
            ? "Model returned empty response - image generation may not be supported via this proxy"
            : "No image in response");
    }

    const controller2 = new AbortController();
    let timedOut2 = false;
    const timeoutId2 = setTimeout(() => { timedOut2 = true; controller2.abort(); }, 120000);
    if (signal) signal.addEventListener("abort", () => controller2.abort(), { once: true });
    let res;
    try {
        res = await fetch(s.proxyUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: s.proxyModel,
                prompt: prompt,
                negative_prompt: negative,
                n: 1,
                size: `${s.width}x${s.height}`,
                width: s.width,
                height: s.height,
                steps: s.proxySteps || 25,
                cfg_scale: s.proxyCfg || 6,
                sampler: s.proxySampler || "Euler a",
                seed: proxySeed,
                loras: s.proxyLoras ? s.proxyLoras.split(",").map(l => { const t = l.trim(); const lc = t.lastIndexOf(":"); const hw = lc > 0 && !isNaN(parseFloat(t.slice(lc + 1))); const id = (hw ? t.slice(0, lc) : t).trim(); const pw = hw ? parseFloat(t.slice(lc + 1)) : NaN; return { id, weight: isNaN(pw) ? 0.8 : pw }; }).filter(l => l.id) : undefined,
                facefix: s.proxyFacefix || undefined,
                reference_images: s.proxyRefImages?.length ? s.proxyRefImages : undefined
            }),
            signal: controller2.signal
        });
    } catch (e) {
        if (e.name === "AbortError" && timedOut2 && !signal?.aborted) {
            throw new Error("Proxy request timed out after 120 seconds");
        }
        throw e;
    } finally {
        clearTimeout(timeoutId2);
    }
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

let resizeAbortController = null;

function initResizeHandle(popup) {
    if (resizeAbortController) resizeAbortController.abort();
    resizeAbortController = new AbortController();
    const signal = resizeAbortController.signal;

    const handle = popup.querySelector('.qig-resize-handle');
    if (!handle) return;

    const content = popup.querySelector('.qig-popup-content');

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = content.offsetWidth;
        const startHeight = content.offsetHeight;

        popup.classList.add('qig-resizing');

        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const newWidth = Math.max(300, startWidth + deltaX * 2);
            const newHeight = Math.max(200, startHeight + deltaY);
            content.style.maxWidth = newWidth + 'px';
            content.style.width = newWidth + 'px';
            content.style.maxHeight = newHeight + 'px';
        };

        const onMouseUp = () => {
            popup.classList.remove('qig-resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, { signal });
}

function bindPopupDismiss(popup, onClose, { closeOnBackdrop = true } = {}) {
    if (!popup) return;
    const contentEl = popup.querySelector(".qig-popup-content");
    const stopBubble = (e) => {
        e?.stopPropagation?.();
    };
    const stopClick = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
    };

    if (contentEl) {
        contentEl.onpointerdown = stopBubble;
        contentEl.onmousedown = stopBubble;
        contentEl.onclick = stopBubble;
    }

    popup.onpointerdown = (e) => {
        if (e.target === popup) stopBubble(e);
    };
    popup.onmousedown = (e) => {
        if (e.target === popup) stopBubble(e);
    };
    popup.onclick = (e) => {
        if (e.target !== popup) return;
        stopClick(e);
        if (closeOnBackdrop) onClose?.(e);
    };

    const popupCloseBtn = popup.querySelector(".qig-close-btn");
    if (popupCloseBtn) {
        popupCloseBtn.onclick = (e) => {
            stopClick(e);
            onClose?.(e);
        };
    }
}

function createPopup(id, title, content, onShow, options = {}) {
    let popup = document.getElementById(id);
    if (!popup) {
        popup = document.createElement("div");
        popup.id = id;
        popup.className = "qig-popup";
        popup.style.cssText = "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;justify-content:center;align-items:center;";
        document.body.appendChild(popup);
    }
    const popupClass = options.popupClass ? ` qig-popup--${options.popupClass}` : "";
    const contentClass = options.contentClass ? ` ${options.contentClass}` : "";
    const resizeHandleHtml = options.resizable === false ? "" : `<div class="qig-resize-handle"></div>`;
    popup.className = `qig-popup${popupClass}`;
    // ALWAYS update innerHTML to ensure fresh content each time
    popup.innerHTML = `
        <div class="qig-popup-content${contentClass}">
            <div class="qig-popup-header">
                <span>${title}</span>
                <button class="qig-close-btn">✕</button>
            </div>
            ${content}
            ${resizeHandleHtml}
        </div>`;
    const closePopup = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        setTimeout(() => { popup.style.display = "none"; }, 0);
    };
    bindPopupDismiss(popup, closePopup, { closeOnBackdrop: options.closeOnBackdrop !== false });
    if (onShow) onShow(popup);
    popup.style.display = "flex";
    return popup;
}

function showLogs() {
    createPopup("qig-logs-popup", "Generation Logs", `<pre id="qig-logs-content"></pre>`, (popup) => {
        document.getElementById("qig-logs-content").textContent = logs.join("\n") || "No logs yet";
    });
}

function showPromptHistory() {
    createPopup("qig-prompt-history-popup", "Prompt History", `<div id="qig-prompt-history-content"></div>`, (popup) => {
        const container = document.getElementById("qig-prompt-history-content");
        if (!promptHistory.length) {
            container.innerHTML = '<p style="color:#888;">No prompts yet</p>';
            return;
        }
        container.innerHTML = `<div style="text-align:right;margin-bottom:8px;"><button id="qig-clear-history" class="menu_button" style="padding:2px 8px;font-size:11px;">Clear History</button></div>` +
        promptHistory.map((entry, i) => `
            <div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:#e94560;font-size:12px;">#${promptHistory.length - i} - ${entry.time}</span>
                    <button class="qig-copy-prompt" data-index="${i}" style="background:#333;border:none;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Copy</button>
                </div>
                <pre style="white-space:pre-wrap;word-break:break-word;color:#ddd;margin:0;font-size:13px;">${escapeHtml(entry.prompt)}</pre>
                ${entry.negative ? `<pre style="white-space:pre-wrap;word-break:break-word;color:#888;margin:6px 0 0;font-size:12px;">Negative: ${escapeHtml(entry.negative)}</pre>` : ''}
            </div>
        `).join('');
        container.querySelectorAll(".qig-copy-prompt").forEach((btn) => {
            btn.onclick = async () => {
                const idx = parseInt(btn.dataset.index, 10);
                const entry = promptHistory[idx];
                if (!entry) return;
                try {
                    await navigator.clipboard.writeText(entry.prompt || "");
                    toastr?.success?.("Prompt copied");
                } catch (e) {
                    log(`Prompt copy failed: ${e.message}`);
                    toastr?.error?.("Failed to copy prompt");
                }
            };
        });

        document.getElementById("qig-clear-history").onclick = () => {
            if (confirm("Clear all prompt history?")) {
                promptHistory = [];
                localStorage.removeItem("qig_prompt_history");
                container.innerHTML = '<p style="color:#888;">No prompts yet</p>';
            }
        };
    });
}

async function blobUrlToDataUrl(blobUrl) {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function insertImageIntoMessage(imageUrl, targetMessageIndex = null) {
    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat || chat.length === 0) throw new Error("No messages in chat");

    const s = getSettings();
    const indices = parseMessageRange(s.messageRange, chat.length);
    const fallbackIdx = indices.length > 0 ? indices[indices.length - 1] : chat.length - 1;
    const idx = Number.isInteger(targetMessageIndex)
        ? Math.max(0, Math.min(targetMessageIndex, chat.length - 1))
        : fallbackIdx;
    const message = chat[idx];
    if (!message) throw new Error("Could not find target message");

    // Convert blob URLs to data URLs for persistence
    let url = imageUrl;
    if (imageUrl.startsWith('blob:')) {
        url = await blobUrlToDataUrl(imageUrl);
    }

    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    const title = lastPrompt || 'Generated Image';

    // Use modern media API if available
    if (typeof ctx.appendMediaToMessage === 'function') {
        if (!Array.isArray(message.extra.media)) {
            message.extra.media = [];
        }
        if (!message.extra.media.length && !message.extra.media_display) {
            message.extra.media_display = 'gallery';
        }

        message.extra.media.push({
            url: url,
            type: 'image',
            title: title,
            source: 'generated',
        });
        message.extra.inline_image = true;
        message.extra.media_index = message.extra.media.length - 1;

        const messageElement = $(`.mes[mesid="${idx}"]`);
        if (messageElement.length) {
            ctx.appendMediaToMessage(message, messageElement, 'keep');
        }
    } else {
        // Legacy fallback for older ST versions
        message.extra.image = url;
        message.extra.inline_image = true;
        message.extra.title = title;
    }

    await ctx.saveChat();
}

async function insertImageAsNewMessage(imageUrl) {
    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat) throw new Error("No active chat");

    let url = imageUrl;
    if (imageUrl.startsWith('blob:')) {
        url = await blobUrlToDataUrl(imageUrl);
    }

    const title = lastPrompt || 'Generated Image';
    const message = {
        name: ctx.name2 || "Assistant",
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: "",
        extra: {
            media: [{ url, type: 'image', title, source: 'generated' }],
            media_display: 'gallery',
            media_index: 0,
            inline_image: true,
        },
    };

    chat.push(message);
    if (typeof ctx.addOneMessage === 'function') {
        ctx.addOneMessage(message);
    }
    await ctx.saveChat();
}

async function insertImageAsHiddenReply(imageUrl) {
    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat) throw new Error("No active chat");

    let url = imageUrl;
    if (imageUrl.startsWith('blob:')) {
        url = await blobUrlToDataUrl(imageUrl);
    }

    const title = lastPrompt || 'Generated Image';
    const message = {
        name: ctx.name2 || "Assistant",
        is_user: false,
        is_system: true,
        send_date: new Date().toISOString(),
        mes: "",
        extra: {
            media: [{ url, type: 'image', title, source: 'generated' }],
            media_display: 'gallery',
            media_index: 0,
            inline_image: true,
        },
    };

    chat.push(message);
    if (typeof ctx.addOneMessage === 'function') {
        ctx.addOneMessage(message);
    }
    await ctx.saveChat();
}

async function autoInsertInjectImage(imageUrl, { messageIndex, insertMode } = {}) {
    const mode = insertMode || "replace";
    if (mode === "hidden") return await insertImageAsHiddenReply(imageUrl);
    if (mode === "new") {
        return await insertImageAsNewMessage(imageUrl);
    }
    if (mode === "replace" && Number.isInteger(messageIndex)) {
        return await insertImageIntoMessage(imageUrl, messageIndex);
    }
    return await insertImageIntoMessage(imageUrl);
}

function shouldPersistImageUrl(url) {
    const source = String(url || "");
    if (!source || source.startsWith("data:")) return false;
    if (source.startsWith("blob:")) return true;

    try {
        const parsed = new URL(source, window.location?.href || "http://localhost/");
        if (!/^https?:$/i.test(parsed.protocol)) return false;
        return parsed.origin !== (window.location?.origin || parsed.origin);
    } catch {
        return /^https?:/i.test(source);
    }
}

async function persistImageUrl(url) {
    if (!shouldPersistImageUrl(url)) return url;
    try {
        const { buffer, contentType } = await fetchImageBuffer(url);
        const formatInfo = detectImageFormat(buffer, contentType, url);
        return `data:${formatInfo.mime};base64,${arrayBufferToBase64(buffer)}`;
    } catch {
        return url;
    }
}

function createThumbnail(url, maxSize = 150) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.7));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function cloneMetadataSettings(settings) {
    try {
        return JSON.parse(JSON.stringify(settings || {}));
    } catch {
        return { ...(settings || {}) };
    }
}

function createGenerationEntry(url, prompt = lastPrompt, negative = lastNegative, metadataSettings = null, options = {}) {
    const snapshot = cloneMetadataSettings(metadataSettings || {});
    const provider = options.provider || snapshot.provider || getSettings()?.provider || "";
    if (provider && !snapshot.provider) snapshot.provider = provider;
    return {
        url,
        thumbnail: options.thumbnail ?? null,
        prompt: prompt || "",
        negative: negative || "",
        provider,
        metadataSettings: snapshot,
        promptWasLLM: options.promptWasLLM ?? lastPromptWasLLM,
        date: options.date ?? Date.now(),
    };
}

function normalizeGenerationEntry(entryOrUrl, fallback = {}) {
    if (typeof entryOrUrl === "string") {
        return createGenerationEntry(entryOrUrl, fallback.prompt, fallback.negative, fallback.metadataSettings, fallback);
    }
    if (!entryOrUrl || typeof entryOrUrl !== "object") {
        return createGenerationEntry("", fallback.prompt, fallback.negative, fallback.metadataSettings, fallback);
    }
    const snapshot = cloneMetadataSettings(entryOrUrl.metadataSettings || fallback.metadataSettings || {});
    const provider = entryOrUrl.provider || snapshot.provider || fallback.provider || getSettings()?.provider || "";
    if (provider && !snapshot.provider) snapshot.provider = provider;
    return {
        ...entryOrUrl,
        prompt: entryOrUrl.prompt ?? fallback.prompt ?? "",
        negative: entryOrUrl.negative ?? fallback.negative ?? "",
        provider,
        metadataSettings: snapshot,
        promptWasLLM: entryOrUrl.promptWasLLM ?? fallback.promptWasLLM ?? false,
        date: entryOrUrl.date ?? fallback.date ?? Date.now(),
    };
}

async function finalizeGeneratedEntry(rawUrl, prompt, negative, settings, options = {}) {
    const resolvedSeed = settings && Number.isFinite(settings.__qigResolvedSeed) ? settings.__qigResolvedSeed : undefined;
    if (settings && Object.prototype.hasOwnProperty.call(settings, "__qigResolvedSeed")) {
        delete settings.__qigResolvedSeed;
    }
    const metadataSettings = getMetadataSettings(settings, { resolvedSeed });
    const finalUrl = await maybeFinalizeUrl(rawUrl, prompt, negative, metadataSettings);
    if (!finalUrl) return null;
    const stableUrl = metadataSettings.saveToServer ? finalUrl : await persistImageUrl(finalUrl);
    return createGenerationEntry(stableUrl, prompt, negative, metadataSettings, options);
}

async function addToGallery(entryOrUrl) {
    const entry = normalizeGenerationEntry(entryOrUrl);
    if (!entry.url) return;
    const persistentUrl = await persistImageUrl(entry.url);
    const thumbnail = await createThumbnail(persistentUrl);
    sessionGallery.unshift({ ...entry, url: persistentUrl, thumbnail, date: entry.date ?? Date.now() });
    if (sessionGallery.length > 50) sessionGallery.pop();
    saveGallery();
}

function saveGallery() {
    try {
        localStorage.setItem("qig_gallery", JSON.stringify(sessionGallery));
    } catch (e) {
        // Quota exceeded — trim oldest entries and retry
        while (sessionGallery.length > 5) {
            sessionGallery.pop();
            try { localStorage.setItem("qig_gallery", JSON.stringify(sessionGallery)); return; } catch {}
        }
    }
}

function savePromptHistory() {
    try {
        localStorage.setItem("qig_prompt_history", JSON.stringify(promptHistory));
    } catch {
        while (promptHistory.length > 10) {
            promptHistory.pop();
            try { localStorage.setItem("qig_prompt_history", JSON.stringify(promptHistory)); return; } catch {}
        }
    }
}

function displayImage(entryOrUrl, skipGallery) {
    const entry = normalizeGenerationEntry(entryOrUrl);
    if (!entry.url) return;
    if (!skipGallery) addToGallery(entry);

    const imagePrompt = entry.prompt || "";
    const imageNegative = entry.negative || "";
    const imagePromptWasLLM = !!entry.promptWasLLM;
    const imageMetadataSettings = cloneMetadataSettings(entry.metadataSettings || {});

    const popup = createPopup("qig-popup", "Generated Image", `
        <img id="qig-result-img" src="">
        <button id="qig-toggle-prompt-editor" style="width: calc(100% - 32px); margin: 8px 16px; padding: 6px; background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; cursor: pointer; font-size: 11px;">
            ✏️ Edit Prompt
        </button>
        <div class="qig-prompt-editor" style="display:none;">
            <div style="padding: 8px 16px;">
                <span id="qig-prompt-source-label" style="font-size: 10px; opacity: 0.7; display: block; margin-bottom: 4px;"></span>
                <label style="font-size: 11px; color: var(--SmartThemeBodyColor); display: block; margin-bottom: 4px;">Prompt:</label>
                <textarea id="qig-preview-prompt" style="width: 100%; height: 80px; resize: vertical; background: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; padding: 8px; font-size: 12px; font-family: monospace;"></textarea>
                <label style="font-size: 11px; color: var(--SmartThemeBodyColor); display: block; margin: 8px 0 4px;">Negative Prompt:</label>
                <textarea id="qig-preview-negative" style="width: 100%; height: 60px; resize: vertical; background: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; padding: 8px; font-size: 12px; font-family: monospace;"></textarea>
                <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
                    <button id="qig-reset-prompt" class="menu_button" style="padding: 4px 10px; font-size: 11px;">Reset to Original</button>
                </div>
            </div>
        </div>
        <div class="qig-popup-actions">
            <button id="qig-regenerate-btn" title="Generate a new image with the same settings">🔄 Regenerate</button>
            <button id="qig-use-as-ref" title="Use this image as reference for img2img">🖼 Use as Reference</button>
            <button id="qig-insert-btn" title="Insert this image into the chat">📌 Insert</button>
            <button id="qig-gallery-btn" title="Save to gallery">🖼️ Gallery</button>
            <button id="qig-download-btn" title="Download image with metadata">💾 Download</button>
            <button id="qig-close-popup" title="Close without inserting">Close</button>
        </div>`, (popup) => {
        // Reset any previous inline resize styles
        const content = popup.querySelector('.qig-popup-content');
        if (content) {
            content.style.maxWidth = '';
            content.style.width = '';
            content.style.maxHeight = '';
        }
        initResizeHandle(popup);

        // Initialize prompt editor
        originalPrompt = imagePrompt;
        originalNegative = imageNegative;
        const promptTextarea = document.getElementById("qig-preview-prompt");
        const negativeTextarea = document.getElementById("qig-preview-negative");
        const toggleBtn = document.getElementById("qig-toggle-prompt-editor");
        const resetBtn = document.getElementById("qig-reset-prompt");
        const editorDiv = popup.querySelector(".qig-prompt-editor");
        if (promptTextarea) promptTextarea.value = imagePrompt;
        if (negativeTextarea) negativeTextarea.value = imageNegative;
        const sourceLabel = document.getElementById("qig-prompt-source-label");
        if (sourceLabel) sourceLabel.textContent = imagePromptWasLLM ? "🤖 AI-Enhanced Prompt" : "📝 Direct Prompt";
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = editorDiv.style.display !== "none";
            editorDiv.style.display = isVisible ? "none" : "block";
            toggleBtn.textContent = isVisible ? "✏️ Edit Prompt" : "▲ Hide Prompt";
        };
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            promptTextarea.value = originalPrompt;
            negativeTextarea.value = originalNegative;
        };

        const img = document.getElementById("qig-result-img");
        img.src = "";
        img.src = entry.url;
        const downloadBtn = document.getElementById("qig-download-btn");
        downloadBtn.onclick = async (e) => {
            e.stopPropagation();
            await downloadWithMetadata(entry.url, `generated-${Date.now()}.png`, imagePrompt, imageNegative, imageMetadataSettings);
        };
        document.getElementById("qig-regenerate-btn").onclick = (e) => {
            e.stopPropagation();
            if (isGenerating) {
                toastr.warning("Generation already in progress");
                return;
            }
            if (promptTextarea && promptTextarea.value.trim()) {
                lastPrompt = promptTextarea.value;
            }
            if (negativeTextarea) {
                lastNegative = negativeTextarea.value;
            }
            lastPromptWasLLM = false;
            if (!lastPrompt.trim()) {
                toastr.error("Prompt cannot be empty");
                return;
            }
            popup.style.display = "none";
            regenerateImage();
        };
        document.getElementById("qig-gallery-btn").onclick = (e) => {
            e.stopPropagation();
            showGallery();
        };
        document.getElementById("qig-insert-btn").onclick = async (e) => {
            e.stopPropagation();
            const s = getSettings();
            try {
                if (s.insertAsHiddenReply) {
                    await insertImageAsHiddenReply(entry.url);
                } else {
                    await insertImageIntoMessage(entry.url);
                }
                toastr.success("Image inserted into message");
            } catch (err) {
                console.error("[Quick Image Gen] Insert failed:", err);
                toastr.error("Failed to insert image: " + err.message);
            }
        };
        document.getElementById("qig-use-as-ref").onclick = (e) => {
            e.stopPropagation();
            const imgSrc = document.getElementById("qig-result-img")?.src;
            if (!imgSrc) return;
            const s = getSettings();
            s.localRefImage = imgSrc;
            saveSettingsDebounced();
            const preview = document.getElementById("qig-local-ref-preview");
            if (preview) { preview.src = imgSrc; preview.style.display = "block"; }
            const clearBtn = document.getElementById("qig-local-ref-clear");
            if (clearBtn) clearBtn.style.display = "block";
            const denoiseWrap = document.getElementById("qig-local-denoise-wrap");
            if (denoiseWrap) denoiseWrap.style.display = s.localType === "a1111" ? "block" : "none";
            popup.style.display = "none";
            toastr.success("Image set as reference for img2img");
        };
        document.getElementById("qig-close-popup").onclick = () => popup.style.display = "none";
    });
}

function displayBatchResults(results) {
    const entries = results.map(result => normalizeGenerationEntry(result));
    if (!entries.length) return;
    entries.forEach(entry => addToGallery(entry));

    let currentIndex = 0;

    const thumbsHtml = entries.map((entry, i) =>
        `<img class="qig-batch-thumb${i === 0 ? ' active' : ''}" data-index="${i}" src="${entry.url}">`
    ).join('');

    const popup = createPopup("qig-batch-popup", `Image 1/${entries.length}`, `
        <img id="qig-batch-img" src="" style="max-width:100%;max-height:60vh;object-fit:contain;padding:10px;min-height:100px;">
        <div class="qig-batch-nav">
            <button id="qig-batch-prev">◀</button>
            <span id="qig-batch-counter">1 / ${entries.length}</span>
            <button id="qig-batch-next">▶</button>
        </div>
        <div class="qig-batch-thumbs">${thumbsHtml}</div>
        <button id="qig-batch-toggle-prompt-editor" style="width: calc(100% - 32px); margin: 8px 16px; padding: 6px; background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; cursor: pointer; font-size: 11px;">
            ✏️ Edit Prompt
        </button>
        <div class="qig-prompt-editor" style="display:none;">
            <div style="padding: 8px 16px;">
                <span id="qig-batch-prompt-source-label" style="font-size: 10px; opacity: 0.7; display: block; margin-bottom: 4px;"></span>
                <label style="font-size: 11px; color: var(--SmartThemeBodyColor); display: block; margin-bottom: 4px;">Prompt:</label>
                <textarea id="qig-batch-preview-prompt" style="width: 100%; height: 80px; resize: vertical; background: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; padding: 8px; font-size: 12px; font-family: monospace;"></textarea>
                <label style="font-size: 11px; color: var(--SmartThemeBodyColor); display: block; margin: 8px 0 4px;">Negative Prompt:</label>
                <textarea id="qig-batch-preview-negative" style="width: 100%; height: 60px; resize: vertical; background: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px; padding: 8px; font-size: 12px; font-family: monospace;"></textarea>
                <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
                    <button id="qig-batch-reset-prompt" class="menu_button" style="padding: 4px 10px; font-size: 11px;">Reset to Original</button>
                </div>
            </div>
        </div>
        <div class="qig-popup-actions">
            <button id="qig-batch-regenerate" title="Regenerate all images in this batch">🔄 Regenerate</button>
            <button id="qig-batch-use-as-ref" title="Use selected image as reference for img2img">🖼 Use as Reference</button>
            <button id="qig-batch-insert" title="Insert selected image into chat">📌 Insert</button>
            <button id="qig-batch-insert-all" title="Insert all images into chat">📌 Insert All</button>
            <button id="qig-batch-gallery" title="Save all to gallery">🖼️ Gallery</button>
            <button id="qig-batch-download" title="Download selected image">💾 Download</button>
            <button id="qig-batch-save-all" title="Download all images">💾 Save All</button>
            <button id="qig-batch-close" title="Close without inserting">Close</button>
        </div>`, (popup) => {
        const content = popup.querySelector('.qig-popup-content');
        if (content) {
            content.style.maxWidth = '';
            content.style.width = '';
            content.style.maxHeight = '';
        }
        initResizeHandle(popup);

        const getCurrentEntry = () => entries[currentIndex];
        const syncPromptEditor = (entry) => {
            const activeEntry = normalizeGenerationEntry(entry, { prompt: lastPrompt, negative: lastNegative, promptWasLLM: lastPromptWasLLM });
            originalPrompt = activeEntry.prompt;
            originalNegative = activeEntry.negative;
            if (batchPromptTextarea) batchPromptTextarea.value = originalPrompt;
            if (batchNegativeTextarea) batchNegativeTextarea.value = originalNegative;
            if (batchSourceLabel) batchSourceLabel.textContent = activeEntry.promptWasLLM ? "🤖 AI-Enhanced Prompt" : "📝 Direct Prompt";
        };

        // Initialize prompt editor
        const batchPromptTextarea = document.getElementById("qig-batch-preview-prompt");
        const batchNegativeTextarea = document.getElementById("qig-batch-preview-negative");
        const batchToggleBtn = document.getElementById("qig-batch-toggle-prompt-editor");
        const batchResetBtn = document.getElementById("qig-batch-reset-prompt");
        const batchEditorDiv = popup.querySelector(".qig-prompt-editor");
        const batchSourceLabel = document.getElementById("qig-batch-prompt-source-label");
        syncPromptEditor(entries[0]);
        batchToggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = batchEditorDiv.style.display !== "none";
            batchEditorDiv.style.display = isVisible ? "none" : "block";
            batchToggleBtn.textContent = isVisible ? "✏️ Edit Prompt" : "▲ Hide Prompt";
        };
        batchResetBtn.onclick = (e) => {
            e.stopPropagation();
            batchPromptTextarea.value = originalPrompt;
            batchNegativeTextarea.value = originalNegative;
        };

        const img = document.getElementById("qig-batch-img");
        img.src = entries[0].url;

        function showImage(index) {
            currentIndex = index;
            img.src = entries[index].url;
            syncPromptEditor(entries[index]);
            document.getElementById("qig-batch-counter").textContent = `${index + 1} / ${entries.length}`;
            popup.querySelector('.qig-popup-header span').textContent = `Image ${index + 1}/${entries.length}`;
            popup.querySelectorAll('.qig-batch-thumb').forEach((t, i) => {
                t.classList.toggle('active', i === index);
            });
        }

        document.getElementById("qig-batch-prev").onclick = (e) => {
            e.stopPropagation();
            showImage((currentIndex - 1 + entries.length) % entries.length);
        };
        document.getElementById("qig-batch-next").onclick = (e) => {
            e.stopPropagation();
            showImage((currentIndex + 1) % entries.length);
        };

        popup.querySelectorAll('.qig-batch-thumb').forEach(thumb => {
            thumb.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(thumb.dataset.index);
                if (!isNaN(idx)) showImage(idx);
            };
        });

        const keyHandler = (e) => {
            if (popup.style.display === "none") {
                document.removeEventListener("keydown", keyHandler);
                return;
            }
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "ArrowLeft") showImage((currentIndex - 1 + entries.length) % entries.length);
            if (e.key === "ArrowRight") showImage((currentIndex + 1) % entries.length);
            if (e.key === "Escape") { popup.style.display = "none"; document.removeEventListener("keydown", keyHandler); }
        };
        if (batchKeyHandler) document.removeEventListener("keydown", batchKeyHandler);
        batchKeyHandler = keyHandler;
        document.addEventListener("keydown", keyHandler);
        const origOnClick = popup.onclick;
        popup.onclick = (e) => {
            document.removeEventListener("keydown", keyHandler);
            if (origOnClick) origOnClick(e);
        };

        document.getElementById("qig-batch-download").onclick = async (e) => {
            e.stopPropagation();
            const activeEntry = getCurrentEntry();
            await downloadWithMetadata(activeEntry.url, `generated-${Date.now()}.png`, activeEntry.prompt, activeEntry.negative, activeEntry.metadataSettings);
        };
        document.getElementById("qig-batch-save-all").onclick = async (e) => {
            e.stopPropagation();
            const ts = Date.now();
            for (let i = 0; i < entries.length; i++) {
                const item = entries[i];
                await downloadWithMetadata(item.url, `generated-${ts}-${i + 1}.png`, item.prompt, item.negative, item.metadataSettings);
                if (i < entries.length - 1) await new Promise(r => setTimeout(r, 300));
            }
            toastr.success(`Downloaded ${entries.length} images`);
        };
        document.getElementById("qig-batch-insert-all").onclick = async (e) => {
            e.stopPropagation();
            try {
                for (const entry of entries) await insertImageIntoMessage(entry.url);
                toastr.success(`Inserted ${entries.length} images into message`);
            } catch (err) {
                console.error("[Quick Image Gen] Insert all failed:", err);
                toastr.error("Failed to insert images: " + err.message);
            }
        };
        document.getElementById("qig-batch-regenerate").onclick = (e) => {
            e.stopPropagation();
            if (isGenerating) {
                toastr.warning("Generation already in progress");
                return;
            }
            if (batchPromptTextarea && batchPromptTextarea.value.trim()) {
                lastPrompt = batchPromptTextarea.value;
            }
            if (batchNegativeTextarea) {
                lastNegative = batchNegativeTextarea.value;
            }
            lastPromptWasLLM = false;
            if (!lastPrompt.trim()) {
                toastr.error("Prompt cannot be empty");
                return;
            }
            popup.style.display = "none";
            regenerateImage();
        };
        document.getElementById("qig-batch-gallery").onclick = (e) => {
            e.stopPropagation();
            showGallery();
        };
        document.getElementById("qig-batch-insert").onclick = async (e) => {
            e.stopPropagation();
            try {
                await insertImageIntoMessage(getCurrentEntry().url);
                toastr.success("Image inserted into message");
            } catch (err) {
                console.error("[Quick Image Gen] Insert failed:", err);
                toastr.error("Failed to insert image: " + err.message);
            }
        };
        document.getElementById("qig-batch-use-as-ref").onclick = (e) => {
            e.stopPropagation();
            const imgSrc = document.getElementById("qig-batch-img")?.src;
            if (!imgSrc) return;
            const s = getSettings();
            s.localRefImage = imgSrc;
            saveSettingsDebounced();
            const preview = document.getElementById("qig-local-ref-preview");
            if (preview) { preview.src = imgSrc; preview.style.display = "block"; }
            const clearBtn = document.getElementById("qig-local-ref-clear");
            if (clearBtn) clearBtn.style.display = "block";
            const denoiseWrap = document.getElementById("qig-local-denoise-wrap");
            if (denoiseWrap) denoiseWrap.style.display = s.localType === "a1111" ? "block" : "none";
            popup.style.display = "none";
            toastr.success("Image set as reference for img2img");
        };
        document.getElementById("qig-batch-close").onclick = () => popup.style.display = "none";
    });
}

function showGallery() {
    const gallery = createPopup("qig-gallery-popup", "Gallery", `
        <div style="background:#16213e;padding:20px;border-radius:12px;max-width:800px;width:90%;max-height:80vh;overflow:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;color:#e94560;">Gallery (${sessionGallery.length})</h3>
                <div style="display:flex;gap:8px;">
                    <button id="qig-gallery-clear" class="menu_button" style="padding:2px 8px;font-size:11px;">Clear Gallery</button>
                    <button id="qig-gallery-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
                </div>
            </div>
            <div id="qig-gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;"></div>
        </div>`, (gallery) => {
        document.getElementById("qig-gallery-close").onclick = () => gallery.style.display = "none";
        document.getElementById("qig-gallery-clear").onclick = () => {
            if (confirm("Clear entire gallery?")) {
                blobUrls.forEach(u => URL.revokeObjectURL(u)); blobUrls.clear();
                sessionGallery = [];
                localStorage.removeItem("qig_gallery");
                document.getElementById("qig-gallery-grid").innerHTML = '<p style="color:#888;">No images yet</p>';
            }
        };
        const grid = document.getElementById("qig-gallery-grid");
        grid.innerHTML = sessionGallery.length ? sessionGallery.map((item, index) => {
            const imgSrc = escapeHtml(item.thumbnail || item.url || "");
            const snippet = item.prompt ? item.prompt.substring(0, 40) + (item.prompt.length > 40 ? '...' : '') : '';
            const safeSnippet = escapeHtml(snippet);
            return `<div style="position:relative;cursor:pointer;" data-gallery-index="${index}">` +
                `<img src="${imgSrc}" style="width:100%;border-radius:6px;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><text y=%2240%22 x=%2220%22 fill=%22gray%22>expired</text></svg>'">` +
                (snippet ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#ccc;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${safeSnippet}</div>` : '') +
                `</div>`;
        }).join('') : '<p style="color:#888;">No images yet</p>';
        grid.querySelectorAll("[data-gallery-index]").forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                const item = sessionGallery[parseInt(el.dataset.galleryIndex)];
                if (!item) return;
                lastPrompt = item.prompt || "";
                lastNegative = item.negative || "";
                lastPromptWasLLM = !!item.promptWasLLM;
                gallery.style.display = "none";
                displayImage(item, true);
            };
        });
    });
}

function showPromptEditDialog(prompt) {
    return new Promise((resolve) => {
        const popup = createPopup("qig-prompt-edit-popup", "Edit LLM Generated Prompt", `
            <div style="background:#16213e;padding:20px;border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow:auto;" onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;color:#e94560;">Edit Generated Prompt</h3>
                    <button id="qig-prompt-edit-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
                </div>
                <textarea id="qig-prompt-edit-text" style="width:100%;height:200px;resize:vertical;background:#0f1419;color:#fff;border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;" placeholder="Edit the generated prompt..."></textarea>
                <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                    <button id="qig-prompt-edit-cancel" class="menu_button">Cancel</button>
                    <button id="qig-prompt-edit-use" class="menu_button">Use Prompt</button>
                </div>
            </div>`, (popup) => {
            const textarea = document.getElementById("qig-prompt-edit-text");
            textarea.value = prompt;
            const closeBtn = document.getElementById("qig-prompt-edit-close");
            const cancelBtn = document.getElementById("qig-prompt-edit-cancel");
            const useBtn = document.getElementById("qig-prompt-edit-use");

            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);

            const close = () => {
                popup.style.display = "none";
                resolve(null);
            };

            const use = () => {
                popup.style.display = "none";
                resolve(textarea.value);
            };

            closeBtn.onclick = close;
            cancelBtn.onclick = close;
            useBtn.onclick = use;

            bindPopupDismiss(popup, close);

            textarea.onkeydown = (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    use();
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                }
            };
        });
    });
}

function showParagraphPicker(messageText) {
    return new Promise((resolve) => {
        const paragraphs = messageText.split(/\n\n+/).filter(p => p.trim());
        if (paragraphs.length === 0) { resolve(messageText); return; }

        const listHtml = paragraphs.map((p, i) => {
            const preview = p.length > 120 ? p.substring(0, 120) + "..." : p;
            const escaped = preview.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            return `<label class="qig-paragraph-item">
                <input type="checkbox" class="qig-para-cb" data-idx="${i}" checked>
                <span class="qig-paragraph-preview">${escaped}</span>
            </label>`;
        }).join("");

        const popup = createPopup("qig-paragraph-picker-popup", "Select Paragraphs", `
            <div style="padding:12px 16px;">
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="qig-para-select-all" class="menu_button" style="padding:2px 10px;font-size:11px;">Select All</button>
                    <button id="qig-para-deselect-all" class="menu_button" style="padding:2px 10px;font-size:11px;">Deselect All</button>
                </div>
                <div class="qig-paragraph-list">${listHtml}</div>
                <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
                    <button id="qig-para-cancel" class="menu_button">Cancel</button>
                    <button id="qig-para-use" class="menu_button">Use Selected</button>
                </div>
            </div>`, (popup) => {
            const checkboxes = () => popup.querySelectorAll(".qig-para-cb");
            document.getElementById("qig-para-select-all").onclick = () => checkboxes().forEach(cb => cb.checked = true);
            document.getElementById("qig-para-deselect-all").onclick = () => checkboxes().forEach(cb => cb.checked = false);

            const close = () => { popup.style.display = "none"; resolve(null); };
            const use = () => {
                const selected = [...checkboxes()].filter(cb => cb.checked).map(cb => paragraphs[parseInt(cb.dataset.idx)]);
                popup.style.display = "none";
                resolve(selected.length ? selected.join("\n\n") : null);
            };

            document.getElementById("qig-para-cancel").onclick = close;
            document.getElementById("qig-para-use").onclick = use;
            bindPopupDismiss(popup, close);
        });
    });
}

async function genStability(prompt, negative, s, signal) {
    if (!s.stabilityKey) throw new Error("Stability AI API key required");
    const seed = resolveRandomSeed(s.seed, s);
    const res = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${s.stabilityKey}`
        },
        body: JSON.stringify({
            text_prompts: [
                { text: prompt, weight: 1 },
                { text: negative || "", weight: -1 }
            ],
            cfg_scale: s.cfgScale,
            steps: Math.min(Math.max(s.steps, 10), 50),
            width: s.width,
            height: s.height,
            seed,
            samples: 1
        }),
        signal
    });
    if (!res.ok) throw new Error(`Stability error: ${res.status}`);
    const data = await res.json();
    if (data.artifacts?.[0]) return `data:image/png;base64,${data.artifacts[0].base64}`;
    throw new Error("No image in response");
}

async function genReplicate(prompt, negative, s, signal) {
    if (!s.replicateKey) throw new Error("Replicate API key required");
    const seed = resolveRandomSeed(s.seed, s);
    // Default to SDXL if no model specified
    const version = s.replicateModel || "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";

    // Create prediction
    const res = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${s.replicateKey}`
        },
        body: JSON.stringify({
            version: version,
            input: {
                prompt: prompt,
                negative_prompt: negative,
                width: s.width,
                height: s.height,
                num_inference_steps: s.steps,
                guidance_scale: s.cfgScale,
                seed: seed,
                num_outputs: 1,
                scheduler: ({
                    "euler_a": "K_EULER_ANCESTRAL",
                    "euler": "K_EULER",
                    "dpm++_2m": "DPMSolverMultistep",
                    "dpm++_sde": "DPM++SDE",
                    "ddim": "DDIM",
                    "lms": "K_LMS",
                    "heun": "K_HEUN"
                })[s.sampler] || "K_EULER"
            }
        }),
        signal
    });
    if (!res.ok) throw new Error(`Replicate error: ${res.status}`);
    const pred = await res.json();

    // Poll for result
    for (let i = 0; i < 60; i++) {
        if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
            headers: { "Authorization": `Token ${s.replicateKey}` },
            signal
        });
        if (!statusRes.ok) throw new Error(`Replicate polling error: ${statusRes.status}`);
        const status = await statusRes.json();
        if (status.status === "succeeded") {
            const outputs = Array.isArray(status.output) ? status.output : [status.output];
            for (const output of outputs) {
                if (typeof output === "string" && output) return output;
                if (typeof output?.url === "string" && output.url) return output.url;
                if (typeof output?.image === "string" && output.image) return output.image;
                if (typeof output?.image?.url === "string" && output.image.url) return output.image.url;
            }
            throw new Error("Replicate returned no image in response");
        }
        if (status.status === "failed") throw new Error(status.error || "Generation failed");
    }
    throw new Error("Replicate timeout");
}

async function genFal(prompt, negative, s, signal) {
    if (!s.falKey) throw new Error("Fal.ai API key required");
    const seed = resolveRandomSeed(s.seed, s);
    // Default to Flux Schnell
    const model = s.falModel || "fal-ai/flux/schnell";
    const endpoint = `https://fal.run/${model}`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Key ${s.falKey}`
        },
        body: JSON.stringify({
            prompt: prompt,
            negative_prompt: negative || "",
            image_size: { width: s.width, height: s.height },
            num_inference_steps: s.steps,
            guidance_scale: s.cfgScale,
            seed: seed,
            num_images: 1,
            enable_safety_checker: false
        }),
        signal
    });
    if (!res.ok) throw new Error(`Fal.ai error: ${res.status}`);
    const data = await res.json();
    if (data.images?.[0]?.url) return data.images[0].url;
    throw new Error("No image in response");
}

async function genTogether(prompt, negative, s, signal) {
    if (!s.togetherKey) throw new Error("Together AI API key required");
    const seed = resolveRandomSeed(s.seed, s);
    const model = s.togetherModel || "stabilityai/stable-diffusion-xl-base-1.0";

    const res = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${s.togetherKey}`
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
            steps: Math.min(s.steps, 50),
            seed: seed,
            n: 1
        }),
        signal
    });
    if (!res.ok) throw new Error(`Together AI error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

const providerGenerators = {
    pollinations: genPollinations,
    novelai: genNovelAI,
    arliai: genArliAI,
    nanogpt: genNanoGPT,
    chutes: genChutes,
    civitai: genCivitAI,
    nanobanana: genNanobanana,
    stability: genStability,
    replicate: genReplicate,
    fal: genFal,
    together: genTogether,
    local: genLocal,
    comfyui: genLocal,
    proxy: genProxy
};

async function generateForProvider(prompt, negative, settings, signal) {
    const generator = providerGenerators[settings.provider];
    if (!generator) throw new Error(`Unknown provider: ${settings.provider}`);
    return await generator(prompt, negative, settings, signal);
}

async function regenerateImage() {
    if (isGenerating) return;
    if (!lastPrompt) {
        showStatus("❌ No previous prompt to regenerate");
        return;
    }
    beginGeneration({ disableGenerateButton: true });
    const s = getSettings();
    const batchCount = s.batchCount || 1;
    const originalSeed = getGenerationSeedValue(s);
    const cancelCheckpoint = getCancelCheckpoint();
    setGenerationSeedValue(s, -1);

    log(`Regenerating with prompt: ${lastPrompt.substring(0, 50)}... (batch: ${batchCount})`);
    try {
        checkAborted(cancelCheckpoint);
        if (batchCount <= 1) {
            showStatus("🔄 Regenerating...");
            const result = await generateForProvider(lastPrompt, lastNegative, s, currentAbortController?.signal);
            checkAborted(cancelCheckpoint);
            hideStatus();
            if (result) {
                const entry = await finalizeGeneratedEntry(result, lastPrompt, lastNegative, s, { promptWasLLM: lastPromptWasLLM });
                if (entry) displayImage(entry);
            }
        } else {
            const results = [];
            let baseSeed = Math.floor(Math.random() * 2147483647);
            for (let i = 0; i < batchCount; i++) {
                checkAborted(cancelCheckpoint);
                if (s.sequentialSeeds) s.seed = baseSeed + i;
                showStatus(`🔄 Regenerating ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(lastPrompt);
                const expandedNegative = expandWildcards(lastNegative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s, currentAbortController?.signal);
                if (result) {
                    const entry = await finalizeGeneratedEntry(result, expandedPrompt, expandedNegative, s, { promptWasLLM: lastPromptWasLLM });
                    if (entry) results.push(entry);
                }
            }
            hideStatus();
            if (results.length > 1) {
                displayBatchResults(results);
            } else if (results.length === 1) {
                displayImage(results[0]);
            }
        }
    } catch (e) {
        if (e.name === "AbortError") {
            log("Regeneration cancelled by user");
            toastr.info("Generation cancelled");
        } else {
            showStatus(`❌ ${e.message}`);
            log(`Regenerate error: ${e.message}`);
            setTimeout(hideStatus, 3000);
        }
    } finally {
        setGenerationSeedValue(s, originalSeed);
        endGeneration({ disableGenerateButton: true });
    }
}

// Prompt Templates
function saveTemplate() {
    const prompt = document.getElementById("qig-prompt").value;
    const negative = document.getElementById("qig-negative").value;
    const quality = document.getElementById("qig-quality").value;
    if (!prompt.trim()) return;
    const name = window.prompt("Template name:");
    if (!name) return;
    promptTemplates.unshift({ name, prompt, negative, quality });
    promptTemplates = promptTemplates.slice(0, 20);
    if (!safeSetStorage("qig_templates", JSON.stringify(promptTemplates), "Failed to save template. Browser storage may be full.")) return;
    backupToSettings("qig_templates", promptTemplates);
    renderTemplates();
}

function loadTemplate(i) {
    const t = promptTemplates[i];
    if (!t) return;
    document.getElementById("qig-prompt").value = t.prompt || "";
    document.getElementById("qig-negative").value = t.negative || "";
    document.getElementById("qig-quality").value = t.quality || "";
    const s = getSettings();
    s.prompt = t.prompt || "";
    s.negativePrompt = t.negative || "";
    s.qualityTags = t.quality || "";
    saveSettingsDebounced();
}

function deleteTemplate(i) {
    promptTemplates.splice(i, 1);
    if (!safeSetStorage("qig_templates", JSON.stringify(promptTemplates), "Failed to delete template. Browser storage may be full.")) return;
    backupToSettings("qig_templates", promptTemplates);
    renderTemplates();
}

function renderTemplates() {
    const container = getOrCacheElement("qig-templates");
    if (!container) return;
    const html = promptTemplates.map((t, i) =>
        `<span style="display:inline-flex;align-items:center;margin:2px;">` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;" onclick="loadTemplate(${i})">${escapeHtml(t.name || "")}</button>` +
        `<button class="menu_button" style="padding:2px 4px;font-size:10px;margin-left:1px;" onclick="deleteTemplate(${i})">×</button></span>`
    ).join('');
    container.innerHTML = promptTemplates.length > 0
        ? `<div style="max-height:120px;overflow-y:auto;margin-bottom:4px;">${html}</div>` +
          `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearTemplates()">Clear All</button>`
        : '';
}

window.loadTemplate = loadTemplate;
window.deleteTemplate = deleteTemplate;
window.clearTemplates = clearTemplates;

function clearTemplates() {
    if (confirm("Clear all templates?")) {
        promptTemplates = [];
        localStorage.removeItem("qig_templates");
        backupToSettings("qig_templates", promptTemplates);
        renderTemplates();
    }
}

// === Contextual Filters (lorebook-style prompt injection) ===
function saveContextualFilters() {
    safeSetStorage("qig_contextual_filters", JSON.stringify(contextualFilters), "Failed to save contextual filters. Browser storage may be full.");
    backupToSettings("qig_contextual_filters", contextualFilters);
}

function getVisibleFilterPools(scopeCharId = getCurrentCharId()) {
    const selectedCharId = scopeCharId != null && scopeCharId !== "" ? String(scopeCharId) : null;
    const globalPools = filterPools
        .filter(p => p.scope === "global")
        .sort((a, b) => a.name.localeCompare(b.name));
    const charPools = selectedCharId != null
        ? filterPools
            .filter(p => p.scope === "char" && String(p.charId) === selectedCharId)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
    return { globalPools, charPools, selectedCharId };
}

function getEnabledPoolIdsForScope(scopeCharId = null) {
    const enabled = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
    const selectedCharId = scopeCharId != null && scopeCharId !== "" ? String(scopeCharId) : null;
    if (!selectedCharId) return enabled;
    for (const id of normalizePoolIdList(activeFilterPoolIdsByChar?.[selectedCharId])) {
        enabled.add(id);
    }
    return enabled;
}

function isContextualFilterEnabledByPools(filter, enabledPoolIds = getEnabledPoolIdsForCurrentContext()) {
    const poolIds = normalizePoolIdList(filter?.poolIds);
    if (!poolIds.length) return enabledPoolIds.has(DEFAULT_FILTER_POOL_ID);
    return poolIds.some(id => enabledPoolIds.has(id));
}

function isContextualFilterEffective(filter, enabledPoolIds = getEnabledPoolIdsForCurrentContext()) {
    return !!filter?.enabled && isContextualFilterEnabledByPools(filter, enabledPoolIds);
}

function getPoolNameById(poolId) {
    const id = String(poolId || "");
    return filterPools.find(p => p.id === id)?.name || "Unknown Pool";
}

function findFilterPoolByName(name, { scope = "global", charId = null } = {}) {
    const normalizedName = String(name || "").trim().toLowerCase();
    const scopeKey = scope === "char" ? "char" : "global";
    const targetCharId = scopeKey === "char" && charId != null ? String(charId) : null;
    if (!normalizedName) return null;
    return filterPools.find(pool =>
        pool.scope === scopeKey &&
        String(pool.charId || "") === String(targetCharId || "") &&
        String(pool.name || "").trim().toLowerCase() === normalizedName
    ) || null;
}

function createFilterPoolRecord(name, { scope = "global", charId = null, enable = true } = {}) {
    const trimmedName = String(name || "").trim();
    const scopeKey = scope === "char" ? "char" : "global";
    const targetCharId = scopeKey === "char" && charId != null ? String(charId) : null;
    if (!trimmedName) return null;
    if (scopeKey === "char" && !targetCharId) return null;

    const now = new Date().toISOString();
    const pool = {
        id: `qig_pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: trimmedName,
        scope: scopeKey,
        charId: targetCharId,
        createdAt: now,
        updatedAt: now,
    };
    filterPools.push(pool);

    if (enable) {
        if (scopeKey === "char" && targetCharId) {
            const ids = new Set(normalizePoolIdList(activeFilterPoolIdsByChar[targetCharId]));
            ids.add(pool.id);
            activeFilterPoolIdsByChar[targetCharId] = [...ids];
        } else {
            const ids = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
            ids.add(pool.id);
            activeFilterPoolIdsGlobal = [...ids];
        }
    }

    return pool;
}

function enableFilterPool(pool) {
    if (!pool?.id) return;
    if (pool.scope === "char" && pool.charId != null) {
        const key = String(pool.charId);
        const ids = new Set(normalizePoolIdList(activeFilterPoolIdsByChar[key]));
        ids.add(pool.id);
        activeFilterPoolIdsByChar[key] = [...ids];
        return;
    }

    const ids = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
    ids.add(pool.id);
    activeFilterPoolIdsGlobal = [...ids];
}

function ensureFilterPoolByName(name, options = {}) {
    const existing = findFilterPoolByName(name, options);
    if (existing) {
        if (options.enable) enableFilterPool(existing);
        return existing;
    }
    return createFilterPoolRecord(name, options);
}

function getNextContextualFilterSortOrder(scopeCharId, excludeFilterId = null) {
    const scopeKey = getContextualFilterScopeKey(scopeCharId);
    return contextualFilters.filter(filter =>
        filter?.id !== excludeFilterId &&
        getContextualFilterScopeKey(filter) === scopeKey
    ).length;
}

function getMappedPoolIdsForCopiedFilter(sourcePoolIds, { scope = "global", charId = null } = {}) {
    const mappedPoolIds = [];
    for (const poolId of normalizePoolIdList(sourcePoolIds)) {
        const sourcePool = filterPools.find(pool => pool.id === poolId);
        const sourcePoolName = String(sourcePool?.name || "").trim();
        if (poolId === DEFAULT_FILTER_POOL_ID || sourcePoolName.toLowerCase() === DEFAULT_FILTER_POOL_NAME.toLowerCase()) {
            mappedPoolIds.push(DEFAULT_FILTER_POOL_ID);
            continue;
        }
        if (!sourcePoolName) continue;
        const mappedPool = ensureFilterPoolByName(sourcePoolName, { scope, charId, enable: true });
        if (mappedPool?.id) mappedPoolIds.push(mappedPool.id);
    }
    if (!mappedPoolIds.length) mappedPoolIds.push(DEFAULT_FILTER_POOL_ID);
    return normalizePoolIdList(mappedPoolIds);
}

function addFilterPool(scope = "global") {
    const currentCharId = getCurrentCharId();
    const isCharScope = scope === "char";
    const targetCharId = isCharScope && currentCharId != null ? String(currentCharId) : null;
    if (isCharScope && !targetCharId) {
        toastr.warning("Open a character chat to create a character pool.");
        return;
    }
    const rawName = prompt(`New ${isCharScope ? "character" : "global"} pool name:`);
    if (rawName == null) return;
    const name = rawName.trim();
    if (!name) {
        toastr.warning("Pool name cannot be empty.");
        return;
    }
    if (findFilterPoolByName(name, { scope: isCharScope ? "char" : "global", charId: targetCharId })) {
        toastr.warning(`Pool "${name}" already exists in this scope.`);
        return;
    }
    createFilterPoolRecord(name, { scope: isCharScope ? "char" : "global", charId: targetCharId, enable: true });
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function renameFilterPool(poolId) {
    const pool = filterPools.find(p => p.id === poolId);
    if (!pool) return;
    const rawName = prompt("Rename pool:", pool.name || "");
    if (rawName == null) return;
    const name = rawName.trim();
    if (!name) {
        toastr.warning("Pool name cannot be empty.");
        return;
    }
    pool.name = name;
    pool.updatedAt = new Date().toISOString();
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function deleteFilterPool(poolId) {
    if (poolId === DEFAULT_FILTER_POOL_ID) {
        toastr.warning("The default pool cannot be deleted.");
        return;
    }
    const pool = filterPools.find(p => p.id === poolId);
    if (!pool) return;
    if (!confirm(`Delete pool "${pool.name}"? Filters in this pool will be moved to "${DEFAULT_FILTER_POOL_NAME}" if needed.`)) return;
    filterPools = filterPools.filter(p => p.id !== poolId);
    activeFilterPoolIdsGlobal = normalizePoolIdList(activeFilterPoolIdsGlobal).filter(id => id !== poolId);
    const nextByChar = {};
    for (const [charId, ids] of Object.entries(activeFilterPoolIdsByChar || {})) {
        const nextIds = normalizePoolIdList(ids).filter(id => id !== poolId);
        if (nextIds.length) nextByChar[charId] = nextIds;
    }
    activeFilterPoolIdsByChar = nextByChar;
    for (const f of contextualFilters) {
        const nextPoolIds = normalizePoolIdList(f.poolIds).filter(id => id !== poolId);
        f.poolIds = nextPoolIds.length ? nextPoolIds : [DEFAULT_FILTER_POOL_ID];
    }
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function toggleFilterPool(poolId) {
    const pool = filterPools.find(p => p.id === poolId);
    if (!pool) return;
    if (pool.scope === "char") {
        const key = String(pool.charId);
        const ids = new Set(normalizePoolIdList(activeFilterPoolIdsByChar[key]));
        if (ids.has(poolId)) ids.delete(poolId);
        else ids.add(poolId);
        if (ids.size > 0) activeFilterPoolIdsByChar[key] = [...ids];
        else delete activeFilterPoolIdsByChar[key];
    } else {
        const ids = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
        if (ids.has(poolId)) ids.delete(poolId);
        else ids.add(poolId);
        activeFilterPoolIdsGlobal = [...ids];
    }
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function setVisiblePoolsEnabled(enabled) {
    const selectedCharId = getSelectedFilterManagerCharId();
    const { globalPools, charPools } = getVisibleFilterPools(selectedCharId);
    if (enabled) {
        const globalIds = new Set(normalizePoolIdList(activeFilterPoolIdsGlobal));
        for (const p of globalPools) globalIds.add(p.id);
        activeFilterPoolIdsGlobal = [...globalIds];
        if (selectedCharId != null) {
            const key = String(selectedCharId);
            const charIds = new Set(normalizePoolIdList(activeFilterPoolIdsByChar[key]));
            for (const p of charPools) charIds.add(p.id);
            if (charIds.size > 0) activeFilterPoolIdsByChar[key] = [...charIds];
        }
    } else {
        const hideGlobal = new Set(globalPools.map(p => p.id));
        activeFilterPoolIdsGlobal = normalizePoolIdList(activeFilterPoolIdsGlobal).filter(id => !hideGlobal.has(id));
        if (selectedCharId != null) {
            const key = String(selectedCharId);
            const hideChar = new Set(charPools.map(p => p.id));
            const next = normalizePoolIdList(activeFilterPoolIdsByChar[key]).filter(id => !hideChar.has(id));
            if (next.length > 0) activeFilterPoolIdsByChar[key] = next;
            else delete activeFilterPoolIdsByChar[key];
        }
    }
    saveActiveFilterPools();
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function showFilterDialog(filter) {
    const isNew = !filter;
    const f = filter || { name: "", keywords: "", matchMode: "OR", positive: "", negative: "", removePositive: "", removeNegative: "", removeMode: "remove", priority: 0, description: "", charId: null, poolIds: [DEFAULT_FILTER_POOL_ID], seedOverride: null };
    const isLLM = f.matchMode === "LLM";
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    const editingDifferentChar = f.charId && (!currentCharId || String(f.charId) !== String(currentCharId));
    const initialPoolIds = normalizePoolIdList(f.poolIds);
    const initialSeedOverride = normalizeSeedOverride(f.seedOverride);
    return new Promise((resolve) => {
        const popup = createPopup("qig-filter-dialog", isNew ? "Add Contextual Filter" : "Edit Contextual Filter", `
            <div class="qig-popup-form qig-filter-dialog-form">
                <section class="qig-form-section">
                    <div class="qig-form-grid">
                        <div class="qig-form-field">
                            <label for="qig-fd-name">Name</label>
                            <input id="qig-fd-name" type="text" value="${escapeHtml(f.name)}" placeholder="e.g., Goku & Vegeta">
                        </div>
                        <div class="qig-form-field">
                            <label for="qig-fd-scope">Scope</label>
                            <select id="qig-fd-scope">
                                <option value="" ${!f.charId ? "selected" : ""}>Global (all characters)</option>
                                ${currentCharId != null ? `<option value="${escapeHtml(String(currentCharId))}" ${f.charId && String(f.charId) === String(currentCharId) ? "selected" : ""}>This Character: ${escapeHtml(charName || "Unknown")}</option>` : ""}
                                ${editingDifferentChar ? `<option value="${escapeHtml(String(f.charId))}" selected disabled>Other Character (${escapeHtml(String(f.charId))})</option>` : ""}
                            </select>
                        </div>
                        <div class="qig-form-field qig-form-field--full">
                            <label>Pools</label>
                            <div id="qig-fd-pools-wrap" class="qig-pool-choice-grid"></div>
                        </div>
                    </div>
                </section>

                <section class="qig-form-section">
                    <div class="qig-form-grid">
                        <div class="qig-form-field">
                            <label for="qig-fd-mode">Match Mode</label>
                            <select id="qig-fd-mode">
                                <option value="OR" ${f.matchMode === "OR" ? "selected" : ""}>OR — any keyword triggers</option>
                                <option value="AND" ${f.matchMode === "AND" ? "selected" : ""}>AND — all keywords required</option>
                                <option value="LLM" ${f.matchMode === "LLM" ? "selected" : ""}>LLM — AI concept recognition</option>
                            </select>
                        </div>
                        <div class="qig-form-field">
                            <label for="qig-fd-priority">Priority</label>
                            <input id="qig-fd-priority" type="number" value="${f.priority || 0}">
                            <small class="qig-help">Higher priority filters apply first and seed ties resolve in that order.</small>
                        </div>
                        <div class="qig-form-field">
                            <label for="qig-fd-seed">Seed Override</label>
                            <input id="qig-fd-seed" type="number" min="0" step="1" value="${initialSeedOverride == null ? "" : escapeHtml(String(initialSeedOverride))}" placeholder="Leave blank to use the main seed">
                            <small class="qig-help">Optional. When this filter matches, it can override the generation seed.</small>
                        </div>
                        <div class="qig-form-field qig-form-field--full" id="qig-fd-keywords-wrap" style="display:${isLLM ? 'none' : ''};">
                            <label for="qig-fd-keywords">Keywords (comma-separated)</label>
                            <textarea id="qig-fd-keywords" rows="3" placeholder="goku, vegeta">${escapeHtml(f.keywords || "")}</textarea>
                        </div>
                        <div class="qig-form-field qig-form-field--full" id="qig-fd-desc-wrap" style="display:${isLLM ? '' : 'none'};">
                            <label for="qig-fd-description">Concept Description</label>
                            <textarea id="qig-fd-description" rows="4" placeholder="Scenes with a cyberpunk or futuristic urban aesthetic — neon lights, holograms, high-tech cityscapes">${escapeHtml(f.description || "")}</textarea>
                            <small class="qig-help">Used by LLM match mode to detect concepts that are not literal keywords.</small>
                        </div>
                    </div>
                </section>

                <section class="qig-form-section">
                    <div class="qig-form-grid">
                        <div class="qig-form-field qig-form-field--full">
                            <label for="qig-fd-positive">Positive Prompt</label>
                            <textarea id="qig-fd-positive" rows="4" placeholder="1boy, goku, &lt;lora:goku:0.8&gt;">${escapeHtml(f.positive)}</textarea>
                        </div>
                        <div class="qig-form-field qig-form-field--full">
                            <label for="qig-fd-negative">Negative Prompt</label>
                            <textarea id="qig-fd-negative" rows="3" placeholder="solo, 1boy">${escapeHtml(f.negative)}</textarea>
                        </div>
                        <div class="qig-form-field">
                            <label for="qig-fd-remove-positive">Remove From Positive</label>
                            <textarea id="qig-fd-remove-positive" rows="3" placeholder="&lt;lora:general_style&gt;, solo">${escapeHtml(f.removePositive || "")}</textarea>
                        </div>
                        <div class="qig-form-field">
                            <label for="qig-fd-remove-negative">Remove From Negative</label>
                            <textarea id="qig-fd-remove-negative" rows="3" placeholder="blurry, watermark">${escapeHtml(f.removeNegative || "")}</textarea>
                        </div>
                    </div>
                    <small class="qig-help">LoRA removals match by name only, so &lt;lora:foo&gt; removes any &lt;lora:foo:*&gt; variant.</small>
                </section>

                <div class="qig-dialog-actions">
                    <button id="qig-fd-cancel" class="menu_button">Cancel</button>
                    <button id="qig-fd-save" class="menu_button">Save</button>
                </div>
            </div>`, (popup) => {
            const selectedPoolIds = new Set(initialPoolIds.length ? initialPoolIds : [DEFAULT_FILTER_POOL_ID]);
            const poolWrap = document.getElementById("qig-fd-pools-wrap");

            const syncSelectedPoolIds = () => {
                if (!poolWrap) return;
                const checkboxes = poolWrap.querySelectorAll(".qig-fd-pool-cb");
                if (!checkboxes.length) return;
                for (const id of [...selectedPoolIds]) selectedPoolIds.delete(id);
                checkboxes.forEach(cb => { if (cb.checked) selectedPoolIds.add(String(cb.value)); });
            };

            const renderPoolChoices = () => {
                syncSelectedPoolIds();
                const scopeVal = document.getElementById("qig-fd-scope").value || null;
                const poolChoices = getSelectablePoolsForFilterScope(scopeVal);
                const available = new Set(poolChoices.map(p => p.id));
                for (const id of [...selectedPoolIds]) {
                    if (!available.has(id)) selectedPoolIds.delete(id);
                }
                if (!selectedPoolIds.size) {
                    if (available.has(DEFAULT_FILTER_POOL_ID)) selectedPoolIds.add(DEFAULT_FILTER_POOL_ID);
                    else if (poolChoices[0]) selectedPoolIds.add(poolChoices[0].id);
                }
                if (!poolChoices.length) {
                    poolWrap.innerHTML = `<div class="qig-help">No pools available for this scope.</div>`;
                    return;
                }
                poolWrap.innerHTML = poolChoices.map(pool => {
                    const isChecked = selectedPoolIds.has(pool.id);
                    const scopeBadge = pool.scope === "global"
                        ? '<span class="qig-scope-badge qig-scope-badge--global">G</span>'
                        : '<span class="qig-scope-badge qig-scope-badge--char">C</span>';
                    return `<label class="qig-pool-choice">
                        <input class="qig-fd-pool-cb" type="checkbox" value="${escapeHtml(pool.id)}" ${isChecked ? "checked" : ""}>
                        <span class="qig-pool-choice-name">${escapeHtml(pool.name)}</span>
                        ${scopeBadge}
                    </label>`;
                }).join("");
            };

            document.getElementById("qig-fd-name").focus();
            renderPoolChoices();
            document.getElementById("qig-fd-mode").onchange = (e) => {
                const llm = e.target.value === "LLM";
                document.getElementById("qig-fd-keywords-wrap").style.display = llm ? "none" : "";
                document.getElementById("qig-fd-desc-wrap").style.display = llm ? "" : "none";
            };
            document.getElementById("qig-fd-scope").onchange = renderPoolChoices;
            const close = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                popup.style.display = "none";
                resolve(null);
            };
            bindPopupDismiss(popup, close);
            document.getElementById("qig-fd-cancel").onclick = close;
            document.getElementById("qig-fd-save").onclick = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                const name = document.getElementById("qig-fd-name").value.trim();
                const mode = document.getElementById("qig-fd-mode").value;
                const keywords = document.getElementById("qig-fd-keywords").value.trim();
                const description = document.getElementById("qig-fd-description").value.trim();
                const seedInput = document.getElementById("qig-fd-seed").value.trim();
                if (!name) { alert("Name is required."); return; }
                if (mode === "LLM" && !description) { alert("Concept description is required for LLM mode."); return; }
                if (mode !== "LLM" && !keywords) { alert("Keywords are required."); return; }
                const seedOverride = seedInput === "" ? null : normalizeSeedOverride(seedInput);
                if (seedInput !== "" && seedOverride == null) {
                    alert("Seed Override must be a non-negative integer or left blank.");
                    return;
                }
                const selected = [...popup.querySelectorAll(".qig-fd-pool-cb:checked")].map(cb => String(cb.value));
                const poolIds = normalizePoolIdList(selected);
                if (!poolIds.length) { alert("Select at least one pool."); return; }
                popup.style.display = "none";
                const scopeVal = document.getElementById("qig-fd-scope").value;
                resolve({
                    name,
                    keywords: mode === "LLM" ? "" : keywords,
                    matchMode: mode,
                    description: mode === "LLM" ? description : "",
                    positive: document.getElementById("qig-fd-positive").value.trim(),
                    negative: document.getElementById("qig-fd-negative").value.trim(),
                    removePositive: document.getElementById("qig-fd-remove-positive").value.trim(),
                    removeNegative: document.getElementById("qig-fd-remove-negative").value.trim(),
                    removeMode: "remove",
                    priority: parseInt(document.getElementById("qig-fd-priority").value) || 0,
                    charId: scopeVal || null,
                    poolIds,
                    seedOverride,
                });
            };
        }, { popupClass: "editor", contentClass: "qig-popup-content--editor", resizable: false });
    });
}

// CONTEXTUAL_FILTERS_CRUD_PLACEHOLDER

async function addContextualFilter() {
    const result = await showFilterDialog(null);
    if (!result) return;
    result.id = generateUUID();
    result.enabled = true;
    result.poolIds = normalizePoolIdList(result.poolIds);
    result.seedOverride = normalizeSeedOverride(result.seedOverride);
    result.sortOrder = getNextContextualFilterSortOrder(result.charId);
    contextualFilters.push(result);
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

async function editContextualFilter(id) {
    const f = contextualFilters.find(x => x.id === id);
    if (!f) return;
    const result = await showFilterDialog(f);
    if (!result) return;
    const previousScopeKey = getContextualFilterScopeKey(f);
    Object.assign(f, result);
    f.poolIds = normalizePoolIdList(f.poolIds);
    f.seedOverride = normalizeSeedOverride(f.seedOverride);
    f.sortOrder = previousScopeKey === getContextualFilterScopeKey(f)
        ? normalizeContextualFilterSortOrder(f.sortOrder, getNextContextualFilterSortOrder(f.charId, id))
        : getNextContextualFilterSortOrder(f.charId, id);
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function deleteContextualFilter(id) {
    const idx = contextualFilters.findIndex(x => x.id === id);
    if (idx === -1) return;
    contextualFilters.splice(idx, 1);
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function toggleContextualFilter(id) {
    const f = contextualFilters.find(x => x.id === id);
    if (!f) return;
    f.enabled = !f.enabled;
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function clearContextualFilters() {
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    if (currentCharId != null) {
        const choice = prompt(
            `Clear filters — type a number:\n1) All filters\n2) Global filters only\n3) ${charName || "This character"}'s filters only\n\nCancel to abort.`
        );
        if (!choice) return;
        const n = parseInt(choice);
        if (n === 1) {
            contextualFilters = [];
        } else if (n === 2) {
            contextualFilters = contextualFilters.filter(f => !!f.charId);
        } else if (n === 3) {
            contextualFilters = contextualFilters.filter(f => !f.charId || String(f.charId) !== String(currentCharId));
        } else {
            return;
        }
    } else {
        if (!confirm("Clear all contextual filters?")) return;
        contextualFilters = [];
    }
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function buildCopiedContextualFilter(filter, { scope = "global", charId = null } = {}) {
    const targetScope = scope === "char" ? "char" : "global";
    const targetCharId = targetScope === "char" && charId != null ? String(charId) : null;
    return {
        ...JSON.parse(JSON.stringify(filter)),
        id: generateUUID(),
        charId: targetCharId,
        poolIds: getMappedPoolIdsForCopiedFilter(filter.poolIds, { scope: targetScope, charId: targetCharId }),
        seedOverride: normalizeSeedOverride(filter.seedOverride),
        sortOrder: getNextContextualFilterSortOrder(targetCharId),
    };
}

function duplicateContextualFilter(id) {
    const f = contextualFilters.find(x => x.id === id);
    if (!f) return;
    const currentCharId = getCurrentCharId();
    if (!f.charId && currentCharId == null) {
        toastr.warning("Open a character chat to duplicate this filter into character scope.");
        return;
    }
    const targetScope = f.charId ? "global" : "char";
    const targetCharId = targetScope === "char" ? String(currentCharId) : null;
    contextualFilters.push(buildCopiedContextualFilter(f, { scope: targetScope, charId: targetCharId }));
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function copyContextualFilterToScope(id, target = "global") {
    const filter = contextualFilters.find(entry => entry.id === id);
    if (!filter) return;
    if (target === "current") {
        const currentCharId = getCurrentCharId();
        if (currentCharId == null) {
            toastr.warning("Open a character chat to copy this filter into character scope.");
            return;
        }
        contextualFilters.push(buildCopiedContextualFilter(filter, { scope: "char", charId: String(currentCharId) }));
    } else {
        contextualFilters.push(buildCopiedContextualFilter(filter, { scope: "global", charId: null }));
    }
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function copyFilterPoolToCurrentScope(poolId) {
    const pool = filterPools.find(entry => entry.id === poolId);
    if (!pool) return;
    const currentCharId = getCurrentCharId();
    if (currentCharId == null) {
        toastr.warning("Open a character chat to copy this pool into character scope.");
        return;
    }
    const existing = findFilterPoolByName(pool.name, { scope: "char", charId: String(currentCharId) });
    ensureFilterPoolByName(pool.name, { scope: "char", charId: String(currentCharId), enable: true });
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
    if (existing) {
        toastr.info(`Pool "${pool.name}" already exists for the current character.`);
    }
}

function setContextualFilterManagerScope(value) {
    filterManagerUiState.selectedScopeCharId = value || FILTER_MANAGER_SCOPE_GLOBAL_ONLY;
    filterManagerUiState.draggedFilterId = null;
    filterManagerUiState.dropTargetFilterId = null;
    filterManagerUiState.dropPosition = "after";
    renderContextualFilters();
}

function setContextualFilterManagerHideInactive(enabled) {
    filterManagerUiState.hideInactive = !!enabled;
    renderContextualFilters();
}

function clearContextualFilterManagerDragState() {
    filterManagerUiState.draggedFilterId = null;
    filterManagerUiState.dropTargetFilterId = null;
    filterManagerUiState.dropPosition = "after";
}

function moveContextualFilter(draggedId, targetId, position = "after") {
    if (!draggedId || !targetId || draggedId === targetId) return;

    const dragged = contextualFilters.find(filter => filter.id === draggedId);
    const target = contextualFilters.find(filter => filter.id === targetId);
    if (!dragged || !target) return;

    if (getContextualFilterScopeKey(dragged) !== getContextualFilterScopeKey(target)) {
        clearContextualFilterManagerDragState();
        return;
    }
    if (getContextualFilterPriorityValue(dragged) !== getContextualFilterPriorityValue(target)) {
        clearContextualFilterManagerDragState();
        toastr.info("Drag reordering keeps filters grouped by priority. Drag within the same priority block.");
        renderContextualFilters();
        return;
    }

    const scopeKey = getContextualFilterScopeKey(dragged);
    const scopedFilters = contextualFilters
        .filter(filter => getContextualFilterScopeKey(filter) === scopeKey)
        .sort(compareContextualFilters);
    const draggedIndex = scopedFilters.findIndex(filter => filter.id === draggedId);
    if (draggedIndex === -1) return;

    const [draggedFilter] = scopedFilters.splice(draggedIndex, 1);
    const targetIndex = scopedFilters.findIndex(filter => filter.id === targetId);
    if (targetIndex === -1) return;
    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    scopedFilters.splice(insertIndex, 0, draggedFilter);
    scopedFilters.forEach((filter, index) => {
        filter.sortOrder = index;
    });

    clearContextualFilterManagerDragState();
    ensureFilterPoolsState({ persist: true });
    renderContextualFilters();
}

function getContextualFiltersSummaryViewState() {
    ensureFilterPoolsState();
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    const globalFilters = contextualFilters.filter(f => !f.charId).sort(compareContextualFilters);
    const charFilters = currentCharId != null
        ? contextualFilters.filter(f => f.charId && String(f.charId) === String(currentCharId)).sort(compareContextualFilters)
        : [];
    const enabledPoolIds = getEnabledPoolIdsForCurrentContext();
    const { globalPools, charPools } = getVisibleFilterPools(currentCharId);
    const visibleFilters = [...globalFilters, ...charFilters];
    const activeVisibleCount = visibleFilters.filter(filter => isContextualFilterEffective(filter, enabledPoolIds)).length;
    const seededFilterCount = visibleFilters.filter(filter => normalizeSeedOverride(filter?.seedOverride) != null).length;
    const otherScopeCount = getContextualFilterScopeOptions().filter(option =>
        option.value !== FILTER_MANAGER_SCOPE_CURRENT &&
        option.value !== FILTER_MANAGER_SCOPE_GLOBAL_ONLY
    ).length;
    return {
        currentCharId,
        charName,
        enabledPoolIds,
        globalPools,
        charPools,
        visibleFilters,
        activeVisibleCount,
        seededFilterCount,
        otherScopeCount,
    };
}

function renderContextualFiltersSummary(container, viewState = getContextualFiltersSummaryViewState()) {
    if (!container) return;
    const totalPools = viewState.globalPools.length + viewState.charPools.length;
    const scopeLabel = viewState.currentCharId != null ? (viewState.charName || "Current character") : "Global-only context";
    const hiddenNote = viewState.otherScopeCount > 0
        ? `Manage Filters can browse ${viewState.otherScopeCount} ${viewState.currentCharId != null ? "other " : ""}character scope(s) without switching chats.`
        : (viewState.currentCharId != null
            ? "All filters shown here belong to the current scope."
            : "This summary is showing global filters only.");
    container.innerHTML = `
        <div class="qig-filter-summary">
            <div class="qig-filter-summary-grid">
                <div class="qig-filter-summary-card">
                    <span class="qig-filter-summary-label">Visible Filters</span>
                    <strong>${viewState.visibleFilters.length}</strong>
                    <small>${scopeLabel}</small>
                </div>
                <div class="qig-filter-summary-card">
                    <span class="qig-filter-summary-label">Active Now</span>
                    <strong>${viewState.activeVisibleCount}</strong>
                    <small>${viewState.enabledPoolIds.size} enabled pool(s)</small>
                </div>
                <div class="qig-filter-summary-card">
                    <span class="qig-filter-summary-label">Seed Overrides</span>
                    <strong>${viewState.seededFilterCount}</strong>
                    <small>${totalPools} pool(s) available</small>
                </div>
            </div>
            <p class="qig-filter-summary-note">${hiddenNote}</p>
            <button id="qig-manage-filters-btn-inline" class="menu_button" onclick="showContextualFilterManager()">Manage Filters</button>
        </div>`;
}

function getContextualFilterManagerViewState() {
    ensureFilterPoolsState();
    const scopeOptions = getContextualFilterScopeOptions();
    const selectedScopeValue = ensureContextualFilterManagerScopeSelection(scopeOptions);
    const currentCharId = getCurrentCharId();
    const currentCharKey = currentCharId != null ? String(currentCharId) : null;
    const viewedCharId = getSelectedFilterManagerCharId(selectedScopeValue);
    const knownNames = getKnownFilterScopeCharacterMap();
    const viewedCharName = viewedCharId != null ? getCharacterNameForFilters(viewedCharId, knownNames) : null;
    const isViewingCurrentCharScope = viewedCharId != null && currentCharKey != null && viewedCharId === currentCharKey;
    const enabledPoolIds = getEnabledPoolIdsForScope(viewedCharId);
    const { globalPools, charPools } = getVisibleFilterPools(viewedCharId);
    const globalFilters = contextualFilters.filter(filter => !filter.charId).sort(compareContextualFilters);
    const charFilters = viewedCharId != null
        ? contextualFilters.filter(filter => filter.charId && String(filter.charId) === viewedCharId).sort(compareContextualFilters)
        : [];

    const displayGlobalPools = filterManagerUiState.hideInactive
        ? globalPools.filter(pool => enabledPoolIds.has(pool.id))
        : globalPools;
    const displayCharPools = filterManagerUiState.hideInactive
        ? charPools.filter(pool => enabledPoolIds.has(pool.id))
        : charPools;
    const displayGlobalFilters = filterManagerUiState.hideInactive
        ? globalFilters.filter(filter => isContextualFilterEffective(filter, enabledPoolIds))
        : globalFilters;
    const displayCharFilters = filterManagerUiState.hideInactive
        ? charFilters.filter(filter => isContextualFilterEffective(filter, enabledPoolIds))
        : charFilters;

    return {
        scopeOptions,
        selectedScopeValue,
        currentCharId: currentCharKey,
        viewedCharId,
        viewedCharName,
        isViewingCurrentCharScope,
        isBrowsingOtherChar: viewedCharId != null && !isViewingCurrentCharScope,
        enabledPoolIds,
        hideInactive: !!filterManagerUiState.hideInactive,
        globalPools,
        charPools,
        displayGlobalPools,
        displayCharPools,
        globalFilters,
        charFilters,
        displayGlobalFilters,
        displayCharFilters,
        visibleFilters: [...globalFilters, ...charFilters],
        displayFilters: [...displayGlobalFilters, ...displayCharFilters],
        visiblePools: [...globalPools, ...charPools],
        displayPools: [...displayGlobalPools, ...displayCharPools],
        activeVisibleCount: [...globalFilters, ...charFilters].filter(filter => isContextualFilterEffective(filter, enabledPoolIds)).length,
        seededFilterCount: [...globalFilters, ...charFilters].filter(filter => normalizeSeedOverride(filter?.seedOverride) != null).length,
    };
}

function showContextualFilterManager() {
    resetContextualFilterManagerState();
    return createPopup("qig-filter-manager-popup", "Contextual Filters", `
        <div class="qig-filter-manager-shell">
            <div id="qig-filter-manager-actions" class="qig-filter-manager-topbar"></div>
            <div class="qig-filter-manager-grid">
                <section class="qig-filter-manager-pane">
                    <div class="qig-filter-manager-pane-header">Pools</div>
                    <div id="qig-filter-manager-pools" class="qig-filter-manager-scroll"></div>
                </section>
                <section class="qig-filter-manager-pane">
                    <div class="qig-filter-manager-pane-header">Filters</div>
                    <div id="qig-filter-manager-filters" class="qig-filter-manager-scroll"></div>
                </section>
            </div>
        </div>`, (popup) => {
        renderContextualFilterManager(popup);
    }, { popupClass: "manager", contentClass: "qig-popup-content--wide", resizable: false });
}

function bindContextualFilterManagerDragHandlers(popup) {
    if (!popup) return;
    const clearDropClasses = () => {
        popup.querySelectorAll(".qig-manager-row--drop-before, .qig-manager-row--drop-after").forEach(row => {
            row.classList.remove("qig-manager-row--drop-before", "qig-manager-row--drop-after");
        });
    };

    popup.querySelectorAll(".qig-filter-drag-handle").forEach(handle => {
        handle.addEventListener("dragstart", (event) => {
            const draggedId = String(handle.dataset.filterId || "");
            if (!draggedId) return;
            filterManagerUiState.draggedFilterId = draggedId;
            filterManagerUiState.dropTargetFilterId = null;
            filterManagerUiState.dropPosition = "after";
            popup.classList.add("qig-filter-manager--dragging");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggedId);
        });

        handle.addEventListener("dragend", () => {
            clearDropClasses();
            popup.classList.remove("qig-filter-manager--dragging");
            clearContextualFilterManagerDragState();
        });
    });

    popup.querySelectorAll(".qig-manager-row[data-filter-id]").forEach(row => {
        row.addEventListener("dragover", (event) => {
            const draggedId = filterManagerUiState.draggedFilterId;
            const targetId = String(row.dataset.filterId || "");
            if (!draggedId || !targetId || draggedId === targetId) return;

            const dragged = contextualFilters.find(filter => filter.id === draggedId);
            const target = contextualFilters.find(filter => filter.id === targetId);
            if (!dragged || !target) return;
            if (getContextualFilterScopeKey(dragged) !== getContextualFilterScopeKey(target)) return;
            if (getContextualFilterPriorityValue(dragged) !== getContextualFilterPriorityValue(target)) return;

            event.preventDefault();
            const bounds = row.getBoundingClientRect();
            const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
            filterManagerUiState.dropTargetFilterId = targetId;
            filterManagerUiState.dropPosition = position;
            clearDropClasses();
            row.classList.add(position === "before" ? "qig-manager-row--drop-before" : "qig-manager-row--drop-after");
        });

        row.addEventListener("drop", (event) => {
            event.preventDefault();
            const draggedId = filterManagerUiState.draggedFilterId;
            const targetId = String(row.dataset.filterId || "");
            if (!draggedId || !targetId) return;
            const position = filterManagerUiState.dropPosition || "after";
            clearDropClasses();
            popup.classList.remove("qig-filter-manager--dragging");
            moveContextualFilter(draggedId, targetId, position);
        });
    });
}

function renderContextualFilterManager(popup = document.getElementById("qig-filter-manager-popup"), viewState = getContextualFilterManagerViewState()) {
    if (!popup) return;
    const actionContainer = popup.querySelector("#qig-filter-manager-actions");
    const poolsContainer = popup.querySelector("#qig-filter-manager-pools");
    const filtersContainer = popup.querySelector("#qig-filter-manager-filters");
    if (!actionContainer || !poolsContainer || !filtersContainer) return;

    const renderScopeBadge = (scope, title) => `<span class="qig-scope-badge ${scope === "global" ? "qig-scope-badge--global" : "qig-scope-badge--char"}" title="${escapeHtml(title)}">${scope === "global" ? "G" : "C"}</span>`;
    const formatSectionTitle = (label, shown, total) => `${label} (${shown}${shown !== total ? `/${total}` : ""})`;

    const renderPoolRow = (pool) => {
        const isActive = viewState.enabledPoolIds.has(pool.id);
        const assignedCount = contextualFilters.filter(f => normalizePoolIdList(f.poolIds).includes(pool.id)).length;
        const canDelete = pool.id !== DEFAULT_FILTER_POOL_ID;
        const isEditable = pool.scope === "global" || viewState.isViewingCurrentCharScope;
        if (!isEditable) {
            return `<div class="qig-manager-row qig-manager-row--readonly ${isActive ? "" : "qig-manager-row--dimmed"}">
                <button class="menu_button qig-manager-main-button ${isActive ? "qig-manager-main-button--active" : ""} qig-manager-main-button--readonly" title="Browse mode: copy this pool into the current character scope">${isActive ? "✅" : "⬜"} ${escapeHtml(pool.name)} (${assignedCount})</button>
                ${renderScopeBadge(pool.scope, pool.scope === "global" ? "Global pool" : "Character pool")}
                ${viewState.currentCharId != null ? `<button class="menu_button qig-manager-copy-button" onclick="copyFilterPoolToCurrentScope('${escapeHtml(pool.id)}')" title="Copy pool to the current character">Copy to Current</button>` : `<span class="qig-manager-muted-inline">Read-only</span>`}
            </div>`;
        }
        return `<div class="qig-manager-row ${isActive ? "" : "qig-manager-row--dimmed"}">
            <button class="menu_button qig-manager-main-button ${isActive ? "qig-manager-main-button--active" : ""}" onclick="toggleFilterPool('${escapeHtml(pool.id)}')" title="Toggle pool">${isActive ? "✅" : "⬜"} ${escapeHtml(pool.name)} (${assignedCount})</button>
            ${renderScopeBadge(pool.scope, pool.scope === "global" ? "Global pool" : "Character pool")}
            <button class="menu_button qig-manager-icon-button" onclick="renameFilterPool('${escapeHtml(pool.id)}')" title="Rename pool">✎</button>
            <button class="menu_button qig-manager-icon-button" onclick="deleteFilterPool('${escapeHtml(pool.id)}')" ${canDelete ? "" : "disabled"} title="Delete pool">🗑️</button>
        </div>`;
    };

    const renderRow = (f) => {
        const eName = escapeHtml(f.name);
        const eDesc = escapeHtml(f.description || "");
        const eKeywords = escapeHtml(f.keywords || "");
        const eRemovePos = escapeHtml(f.removePositive || "");
        const eRemoveNeg = escapeHtml(f.removeNegative || "");
        const eId = escapeHtml(f.id);
        const eMode = escapeHtml(f.matchMode);
        const eDetail = f.matchMode === "LLM" ? eDesc : eKeywords;
        const eRemovalInfo = [
            eRemovePos ? `Remove +: ${eRemovePos}` : "",
            eRemoveNeg ? `Remove -: ${eRemoveNeg}` : "",
        ].filter(Boolean).join("\n");
        const poolNames = normalizePoolIdList(f.poolIds).map(id => getPoolNameById(id));
        const poolInfo = poolNames.length ? `Pools: ${poolNames.join(", ")}` : `Pools: ${DEFAULT_FILTER_POOL_NAME}`;
        const ePoolInfo = escapeHtml(poolInfo);
        const isGlobal = !f.charId;
        const effectiveEnabled = isContextualFilterEffective(f, viewState.enabledPoolIds);
        const seedOverride = normalizeSeedOverride(f.seedOverride);
        const statusParts = [
            f.matchMode === "LLM" ? "\u{1F916} LLM" : eMode,
            `p${f.priority || 0}`,
            seedOverride != null ? `seed ${seedOverride}` : "",
            effectiveEnabled ? "" : "off",
        ].filter(Boolean).join(" ");
        const isEditable = isGlobal || viewState.isViewingCurrentCharScope;
        const tooltip = `${eMode}: ${eDetail}\nPriority: ${f.priority}\n${seedOverride != null ? `Seed Override: ${seedOverride}\n` : ""}${ePoolInfo}${eRemovalInfo ? `\n${eRemovalInfo}` : ""}`;
        const rowClasses = [
            "qig-manager-row",
            effectiveEnabled ? "" : "qig-manager-row--dimmed",
            isEditable ? "" : "qig-manager-row--readonly",
            filterManagerUiState.dropTargetFilterId === f.id
                ? (filterManagerUiState.dropPosition === "before" ? "qig-manager-row--drop-before" : "qig-manager-row--drop-after")
                : "",
        ].filter(Boolean).join(" ");

        if (!isEditable) {
            return `<div class="${rowClasses}">` +
            `<span class="qig-manager-drag-placeholder" title="Browse mode">⋮⋮</span>` +
            renderScopeBadge("char", "Character filter") +
            `<button class="menu_button qig-manager-main-button qig-manager-main-button--readonly" title="${tooltip}">${eName}</button>` +
            `<span class="qig-filter-status">${escapeHtml(statusParts)}</span>` +
            `${viewState.currentCharId != null ? `<button class="menu_button qig-manager-copy-button" onclick="copyContextualFilterToScope('${eId}', 'current')" title="Copy filter to the current character">Copy to Current</button>` : ""}` +
            `<button class="menu_button qig-manager-copy-button" onclick="copyContextualFilterToScope('${eId}', 'global')" title="Copy filter to global scope">Copy to Global</button>` +
            `</div>`;
        }

        return `<div class="${rowClasses}" data-filter-id="${eId}">` +
        `<button class="menu_button qig-manager-icon-button qig-filter-drag-handle" type="button" draggable="true" data-filter-id="${eId}" title="Drag to reorder filters with the same priority">⋮⋮</button>` +
        `<input type="checkbox" ${f.enabled ? "checked" : ""} onchange="toggleContextualFilter('${eId}')" title="Enable/disable">` +
        renderScopeBadge(isGlobal ? "global" : "char", isGlobal ? "Global filter" : "Character filter") +
        `<button class="menu_button qig-manager-main-button" onclick="editContextualFilter('${eId}')" title="${tooltip}">${eName}</button>` +
        `<span class="qig-filter-status">${escapeHtml(statusParts)}</span>` +
        `<button class="menu_button qig-manager-icon-button" onclick="duplicateContextualFilter('${eId}')" title="Duplicate to ${isGlobal ? "character" : "global"} scope">\u29C9</button>` +
        `<button class="menu_button qig-manager-icon-button" onclick="deleteContextualFilter('${eId}')" title="Delete filter">×</button>` +
        `</div>`;
    };

    let poolHtml = "";
    if (viewState.globalPools.length) {
        poolHtml += `<div class="qig-manager-section-title">${formatSectionTitle("Global Pools", viewState.displayGlobalPools.length, viewState.globalPools.length)}</div>`;
        poolHtml += viewState.displayGlobalPools.map(renderPoolRow).join("");
    }
    if (viewState.charPools.length) {
        poolHtml += `<div class="qig-manager-section-title">${escapeHtml(formatSectionTitle(`${viewState.viewedCharName || "Character"} Pools`, viewState.displayCharPools.length, viewState.charPools.length))}</div>`;
        poolHtml += viewState.displayCharPools.map(renderPoolRow).join("");
    }
    if (!poolHtml) poolHtml = `<div class="qig-help">No pools available yet. Create one from the toolbar above.</div>`;

    let html = "";
    if (viewState.globalFilters.length) {
        html += `<div class="qig-manager-section-title">${formatSectionTitle("Global Filters", viewState.displayGlobalFilters.length, viewState.globalFilters.length)}</div>`;
        html += viewState.displayGlobalFilters.map(renderRow).join("");
    }
    if (viewState.charFilters.length) {
        html += `<div class="qig-manager-section-title">${escapeHtml(formatSectionTitle(`${viewState.viewedCharName || "Character"} Filters`, viewState.displayCharFilters.length, viewState.charFilters.length))}</div>`;
        html += viewState.displayCharFilters.map(renderRow).join("");
    }
    if (!viewState.displayFilters.length && viewState.visibleFilters.length && viewState.hideInactive) {
        html += `<div class="qig-manager-muted">All filters in this view are currently inactive.</div>`;
    }
    if (!html) {
        html = `<div class="qig-help">No filters yet. Add one to get started.</div>`;
    }

    const scopeOptionsHtml = viewState.scopeOptions.map(option => `
        <option value="${escapeHtml(String(option.value))}" ${String(option.value) === String(viewState.selectedScopeValue) ? "selected" : ""}>
            ${escapeHtml(option.label)}
        </option>
    `).join("");
    const scopeSummary = viewState.viewedCharId != null
        ? `${escapeHtml(viewState.viewedCharName || "Character")} + global`
        : "Global only";
    const browseSummary = viewState.isBrowsingOtherChar
        ? ` Browsing another character is read-only; use copy buttons to bring items into the current/global scope.`
        : "";
    const hiddenSummary = viewState.hideInactive && viewState.displayFilters.length !== viewState.visibleFilters.length
        ? ` Showing ${viewState.displayFilters.length} after hiding inactive rows.`
        : "";

    actionContainer.innerHTML = `
        <div class="qig-filter-manager-controls">
            <label class="qig-filter-manager-scope">
                <span>Scope</span>
                <select id="qig-filter-manager-scope" onchange="setContextualFilterManagerScope(this.value)">
                    ${scopeOptionsHtml}
                </select>
            </label>
            <label class="checkbox_label qig-filter-manager-hide-inactive">
                <input type="checkbox" ${viewState.hideInactive ? "checked" : ""} onchange="setContextualFilterManagerHideInactive(this.checked)">
                <span>Hide inactive</span>
            </label>
        </div>
        <div class="qig-filter-manager-actions">
            <button class="menu_button" onclick="addFilterPoolGlobal()">+ Global Pool</button>
            <button class="menu_button" onclick="addFilterPoolForCurrentChar()">+ Char Pool</button>
            <button class="menu_button" onclick="setVisiblePoolsEnabled(true)">Enable Shown Pools</button>
            <button class="menu_button" onclick="setVisiblePoolsEnabled(false)">Disable Shown Pools</button>
            <button class="menu_button" onclick="addContextualFilter()">+ Add Filter</button>
            <button class="menu_button" onclick="clearContextualFilters()">Clear All</button>
        </div>
        <div class="qig-filter-manager-summary">
            Viewing ${scopeSummary}. ${viewState.visibleFilters.length} filter(s), ${viewState.activeVisibleCount} active, ${viewState.seededFilterCount} with seed overrides.${hiddenSummary}${browseSummary}
        </div>`;
    poolsContainer.innerHTML = poolHtml;
    filtersContainer.innerHTML = html;
    bindContextualFilterManagerDragHandlers(popup);
}

function renderContextualFilters() {
    const container = document.getElementById("qig-contextual-filters");
    if (container) renderContextualFiltersSummary(container, getContextualFiltersSummaryViewState());
    const popup = document.getElementById("qig-filter-manager-popup");
    if (popup && popup.style.display !== "none") {
        renderContextualFilterManager(popup, getContextualFilterManagerViewState());
    }
}

function showPromptReplacementDialog(rule) {
    const isNew = !rule;
    const r = rule || {
        name: "",
        scope: "global",
        charId: null,
        target: "both",
        trigger: "",
        replacement: "",
        priority: 0,
    };
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    const editingDifferentChar = r.scope === "char" && r.charId && (!currentCharId || String(r.charId) !== String(currentCharId));
    return new Promise((resolve) => {
        const popup = createPopup("qig-replacement-dialog", isNew ? "Add Prompt Replacement Map" : "Edit Prompt Replacement Map", `
            <div style="padding:12px;">
                <label style="font-size:11px;">Name</label>
                <input id="qig-rd-name" type="text" value="${escapeHtml(r.name || "")}" placeholder="e.g., Miranda character map" style="width:100%;margin-bottom:8px;">
                <label style="font-size:11px;">Scope</label>
                <select id="qig-rd-scope" style="width:100%;margin-bottom:8px;">
                    <option value="global" ${(r.scope !== "char" || !r.charId) ? "selected" : ""}>Global (all characters)</option>
                    ${currentCharId != null ? `<option value="char:${escapeHtml(String(currentCharId))}" ${r.scope === "char" && String(r.charId) === String(currentCharId) ? "selected" : ""}>This Character: ${escapeHtml(charName || "Unknown")}</option>` : ""}
                    ${editingDifferentChar ? `<option value="char:${escapeHtml(String(r.charId))}" selected disabled>Other Character (${escapeHtml(String(r.charId))})</option>` : ""}
                </select>
                <label style="font-size:11px;">Target Field</label>
                <select id="qig-rd-target" style="width:100%;margin-bottom:8px;">
                    <option value="both" ${r.target === "both" ? "selected" : ""}>Both (Positive + Negative)</option>
                    <option value="positive" ${r.target === "positive" ? "selected" : ""}>Positive Prompt only</option>
                    <option value="negative" ${r.target === "negative" ? "selected" : ""}>Negative Prompt only</option>
                </select>
                <label style="font-size:11px;">Trigger Tokens (comma-separated, exact token match)</label>
                <textarea id="qig-rd-trigger" style="width:100%;height:50px;resize:vertical;" placeholder="miranda, miranda_style">${escapeHtml(r.trigger || "")}</textarea>
                <small style="display:block;opacity:0.65;font-size:10px;margin-bottom:8px;">Matches comma-separated prompt tokens exactly. LoRA tags match by name, weight-insensitive.</small>
                <label style="font-size:11px;">Replacement Text</label>
                <textarea id="qig-rd-replacement" style="width:100%;height:60px;resize:vertical;" placeholder="&lt;lora:miranda_v2:0.8&gt;, 1girl, miranda, detailed face">${escapeHtml(r.replacement || "")}</textarea>
                <label style="font-size:11px;">Priority (higher runs first)</label>
                <input id="qig-rd-priority" type="number" value="${r.priority || 0}" style="width:80px;margin-bottom:12px;">
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="qig-rd-cancel" class="menu_button">Cancel</button>
                    <button id="qig-rd-save" class="menu_button">Save</button>
                </div>
            </div>`, (popup) => {
            const close = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                popup.style.display = "none";
                resolve(null);
            };
            bindPopupDismiss(popup, close);
            document.getElementById("qig-rd-name").focus();
            document.getElementById("qig-rd-cancel").onclick = close;
            document.getElementById("qig-rd-save").onclick = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                const name = document.getElementById("qig-rd-name").value.trim();
                const scopeVal = document.getElementById("qig-rd-scope").value;
                const target = document.getElementById("qig-rd-target").value;
                const trigger = document.getElementById("qig-rd-trigger").value.trim();
                const replacement = document.getElementById("qig-rd-replacement").value.trim();
                if (!name) { alert("Name is required."); return; }
                if (!trigger) { alert("Trigger tokens are required."); return; }
                if (!replacement) { alert("Replacement text is required."); return; }
                let scope = "global";
                let charId = null;
                if (scopeVal.startsWith("char:")) {
                    scope = "char";
                    charId = scopeVal.slice(5) || null;
                    if (!charId) {
                        alert("Character scope requires an active character.");
                        return;
                    }
                }
                const priority = parseInt(document.getElementById("qig-rd-priority").value, 10) || 0;
                popup.style.display = "none";
                resolve({ name, scope, charId, target, trigger, replacement, priority });
            };
        });
    });
}

async function addPromptReplacement() {
    const result = await showPromptReplacementDialog(null);
    if (!result) return;
    const now = new Date().toISOString();
    promptReplacements.push({
        id: generateUUID(),
        enabled: true,
        createdAt: now,
        updatedAt: now,
        ...result,
    });
    ensurePromptReplacementState({ persist: true });
    renderPromptReplacements();
}

async function editPromptReplacement(id) {
    const rule = promptReplacements.find(x => x.id === id);
    if (!rule) return;
    const result = await showPromptReplacementDialog(rule);
    if (!result) return;
    Object.assign(rule, result, { updatedAt: new Date().toISOString() });
    ensurePromptReplacementState({ persist: true });
    renderPromptReplacements();
}

function deletePromptReplacement(id) {
    const idx = promptReplacements.findIndex(x => x.id === id);
    if (idx === -1) return;
    promptReplacements.splice(idx, 1);
    savePromptReplacements();
    renderPromptReplacements();
}

function togglePromptReplacement(id) {
    const rule = promptReplacements.find(x => x.id === id);
    if (!rule) return;
    rule.enabled = !rule.enabled;
    rule.updatedAt = new Date().toISOString();
    savePromptReplacements();
    renderPromptReplacements();
}

function duplicatePromptReplacement(id) {
    const rule = promptReplacements.find(x => x.id === id);
    if (!rule) return;
    const charId = getCurrentCharId();
    const duplicateScope = rule.scope === "char" ? "global" : "char";
    const duplicateCharId = duplicateScope === "char" ? (charId != null ? String(charId) : null) : null;
    if (duplicateScope === "char" && !duplicateCharId) return;
    const now = new Date().toISOString();
    promptReplacements.push({
        ...JSON.parse(JSON.stringify(rule)),
        id: generateUUID(),
        scope: duplicateScope,
        charId: duplicateCharId,
        createdAt: now,
        updatedAt: now,
    });
    savePromptReplacements();
    renderPromptReplacements();
}

function clearPromptReplacements() {
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    if (currentCharId != null) {
        const choice = prompt(
            `Clear replacement maps — type a number:\n1) All replacement maps\n2) Global maps only\n3) ${charName || "This character"}'s maps only\n\nCancel to abort.`
        );
        if (!choice) return;
        const n = parseInt(choice, 10);
        if (n === 1) {
            promptReplacements = [];
        } else if (n === 2) {
            promptReplacements = promptReplacements.filter(r => r.scope === "char");
        } else if (n === 3) {
            promptReplacements = promptReplacements.filter(r => !(r.scope === "char" && String(r.charId) === String(currentCharId)));
        } else {
            return;
        }
    } else {
        if (!confirm("Clear all prompt replacement maps?")) return;
        promptReplacements = [];
    }
    savePromptReplacements();
    renderPromptReplacements();
}

function renderPromptReplacements() {
    const container = document.getElementById("qig-prompt-replacements");
    if (!container) return;
    ensurePromptReplacementState();
    const currentCharId = getCurrentCharId();
    const charName = getCurrentCharName();
    const globalRules = promptReplacements
        .filter(r => r.scope !== "char")
        .sort(comparePromptReplacements);
    const charRules = currentCharId != null
        ? promptReplacements
            .filter(r => r.scope === "char" && String(r.charId) === String(currentCharId))
            .sort(comparePromptReplacements)
        : [];
    const otherCount = promptReplacements.filter(r => r.scope === "char" && (!currentCharId || String(r.charId) !== String(currentCharId))).length;

    const renderRow = (r) => {
        const eId = escapeHtml(r.id || "");
        const eName = escapeHtml(r.name || "");
        const eTrigger = escapeHtml(r.trigger || "");
        const eReplacement = escapeHtml(r.replacement || "");
        const isGlobal = r.scope !== "char";
        const badge = isGlobal
            ? `<span style="background:#4a90d9;color:#fff;font-size:8px;font-weight:bold;padding:1px 3px;border-radius:2px;margin-right:2px;" title="Global map">G</span>`
            : `<span style="background:#5cb85c;color:#fff;font-size:8px;font-weight:bold;padding:1px 3px;border-radius:2px;margin-right:2px;" title="Character map">C</span>`;
        const targetLabel = r.target === "positive" ? "P" : r.target === "negative" ? "N" : "P+N";
        return `<div style="display:flex;align-items:center;gap:4px;margin:2px 0;font-size:10px;${r.enabled ? "" : "opacity:0.72;"}">` +
            `<input type="checkbox" ${r.enabled ? "checked" : ""} onchange="togglePromptReplacement('${eId}')" title="Enable/disable">` +
            badge +
            `<button class="menu_button" style="padding:2px 6px;font-size:10px;flex:1;text-align:left;" onclick="editPromptReplacement('${eId}')" title="Trigger: ${eTrigger}\nReplacement: ${eReplacement}\nPriority: ${r.priority || 0}\nTarget: ${targetLabel}">${eName}</button>` +
            `<span style="opacity:0.6;font-size:9px;">${targetLabel} p${r.priority || 0}${r.enabled ? "" : " off"}</span>` +
            `<button class="menu_button" style="padding:2px 4px;font-size:10px;" onclick="duplicatePromptReplacement('${eId}')" title="Duplicate to ${isGlobal ? 'character' : 'global'} scope">\u29C9</button>` +
            `<button class="menu_button" style="padding:2px 4px;font-size:10px;" onclick="deletePromptReplacement('${eId}')">×</button>` +
            `</div>`;
    };

    let html = "";
    if (globalRules.length) {
        html += `<div style="font-size:9px;font-weight:bold;opacity:0.7;margin:4px 0 2px;text-transform:uppercase;">Global Maps (${globalRules.length})</div>`;
        html += globalRules.map(renderRow).join("");
    }
    if (charRules.length) {
        html += `<div style="font-size:9px;font-weight:bold;opacity:0.7;margin:4px 0 2px;text-transform:uppercase;">${escapeHtml(charName || "Character")} Maps (${charRules.length})</div>`;
        html += charRules.map(renderRow).join("");
    }
    if (otherCount > 0) {
        html += `<div style="font-size:9px;opacity:0.5;margin:4px 0 2px;font-style:italic;">${otherCount} map(s) for other characters (hidden)</div>`;
    }
    if (!html) {
        html = `<div style="font-size:10px;opacity:0.65;margin:4px 0;">No replacement maps yet. Add one to get started.</div>`;
    }
    container.innerHTML = `<div style="max-height:200px;overflow-y:auto;margin-bottom:4px;">${html}</div>
        <button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearPromptReplacements()">Clear All</button>`;
}

window.addContextualFilter = addContextualFilter;
window.editContextualFilter = editContextualFilter;
window.deleteContextualFilter = deleteContextualFilter;
window.toggleContextualFilter = toggleContextualFilter;
window.clearContextualFilters = clearContextualFilters;
window.duplicateContextualFilter = duplicateContextualFilter;
window.copyContextualFilterToScope = copyContextualFilterToScope;
window.copyFilterPoolToCurrentScope = copyFilterPoolToCurrentScope;
window.showContextualFilterManager = showContextualFilterManager;
window.setContextualFilterManagerScope = setContextualFilterManagerScope;
window.setContextualFilterManagerHideInactive = setContextualFilterManagerHideInactive;
window.addFilterPoolGlobal = () => addFilterPool("global");
window.addFilterPoolForCurrentChar = () => addFilterPool("char");
window.renameFilterPool = renameFilterPool;
window.deleteFilterPool = deleteFilterPool;
window.toggleFilterPool = toggleFilterPool;
window.setVisiblePoolsEnabled = setVisiblePoolsEnabled;
window.addPromptReplacement = addPromptReplacement;
window.editPromptReplacement = editPromptReplacement;
window.deletePromptReplacement = deletePromptReplacement;
window.togglePromptReplacement = togglePromptReplacement;
window.duplicatePromptReplacement = duplicatePromptReplacement;
window.clearPromptReplacements = clearPromptReplacements;

// Character-specific settings
let charSettingsBaseState = null;
let charSettingsBaseCharId = null;

function getCurrentRefImages(s) {
    if (s.provider === "proxy") return s.proxyRefImages || [];
    if (s.provider === "nanobanana") return s.nanobananaRefImages || [];
    if (s.provider === "nanogpt") return s.nanogptRefImages || [];
    return [];
}

function cloneCharScopedState(s = getSettings()) {
    return {
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        style: s.style,
        width: s.width,
        height: s.height,
        proxyRefImages: [...(s.proxyRefImages || [])],
        nanobananaRefImages: [...(s.nanobananaRefImages || [])],
        nanogptRefImages: [...(s.nanogptRefImages || [])],
    };
}

function applyCharScopedState(state, s = getSettings()) {
    if (!state) return;
    s.prompt = state.prompt ?? defaultSettings.prompt;
    s.negativePrompt = state.negativePrompt ?? defaultSettings.negativePrompt;
    s.style = state.style ?? defaultSettings.style;
    s.width = state.width ?? defaultSettings.width;
    s.height = state.height ?? defaultSettings.height;
    s.proxyRefImages = [...(state.proxyRefImages || [])];
    s.nanobananaRefImages = [...(state.nanobananaRefImages || [])];
    s.nanogptRefImages = [...(state.nanogptRefImages || [])];

    const promptEl = document.getElementById("qig-prompt");
    const negativeEl = document.getElementById("qig-negative");
    const styleEl = document.getElementById("qig-style");
    const widthEl = document.getElementById("qig-width");
    const heightEl = document.getElementById("qig-height");
    if (promptEl) promptEl.value = s.prompt ?? "";
    if (negativeEl) negativeEl.value = s.negativePrompt ?? "";
    if (styleEl) styleEl.value = s.style ?? defaultSettings.style;
    if (widthEl) widthEl.value = s.width ?? defaultSettings.width;
    if (heightEl) heightEl.value = s.height ?? defaultSettings.height;

    if (s.provider === "novelai") {
        normalizeSize(s);
        syncNaiResolutionSelect();
    }
    syncSizeInputs(s.width, s.height);
    renderRefImages();
    renderNanobananaRefImages();
    renderNanogptRefImages();
}

function getCurrentCharId() {
    const ctx = getContext();
    return ctx?.characterId ?? null;
}

function getCurrentCharName() {
    const ctx = getContext();
    if (ctx?.characterId == null) return null;
    const char = ctx.characters?.[ctx.characterId];
    return char?.name || char?.avatar || null;
}

function getKnownFilterScopeCharacterMap(ctx = getContext()) {
    const known = new Map();
    for (const entry of getContextCharactersList(ctx)) {
        if (!entry?.id) continue;
        const key = String(entry.id);
        const name = String(entry.name || entry.avatar || `Character ${key}`).trim();
        if (!known.has(key) && name) known.set(key, name);
    }

    const profile = resolveChatProfileContext(ctx);
    profile.charIds.forEach((charId, index) => {
        const key = String(charId);
        if (known.has(key)) return;
        const name = String(profile.charNames[index] || `Character ${key}`).trim();
        if (name) known.set(key, name);
    });

    if (ctx?.characterId != null) {
        const key = String(ctx.characterId);
        if (!known.has(key)) {
            known.set(key, String(getCurrentCharName() || `Character ${key}`));
        }
    }

    return known;
}

function getCharacterNameForFilters(charId, knownMap = getKnownFilterScopeCharacterMap()) {
    const key = String(charId ?? "").trim();
    if (!key) return "Character";
    return knownMap.get(key) || `Character ${key}`;
}

function getDefaultFilterManagerScopeValue() {
    return getCurrentCharId() != null ? FILTER_MANAGER_SCOPE_CURRENT : FILTER_MANAGER_SCOPE_GLOBAL_ONLY;
}

function getSelectedFilterManagerCharId(selectedScopeValue = filterManagerUiState.selectedScopeCharId) {
    if (selectedScopeValue === FILTER_MANAGER_SCOPE_CURRENT) {
        const currentCharId = getCurrentCharId();
        return currentCharId != null ? String(currentCharId) : null;
    }
    if (selectedScopeValue == null || selectedScopeValue === FILTER_MANAGER_SCOPE_GLOBAL_ONLY || selectedScopeValue === "") {
        return null;
    }
    return String(selectedScopeValue);
}

function resetContextualFilterManagerState() {
    filterManagerUiState = {
        selectedScopeCharId: getDefaultFilterManagerScopeValue(),
        hideInactive: false,
        draggedFilterId: null,
        dropTargetFilterId: null,
        dropPosition: "after",
    };
}

function getContextualFilterScopeOptions() {
    const currentCharId = getCurrentCharId();
    const currentKey = currentCharId != null ? String(currentCharId) : null;
    const nameMap = getKnownFilterScopeCharacterMap();
    const otherCharIds = new Set();

    for (const filter of contextualFilters) {
        if (filter?.charId != null && filter.charId !== "") {
            otherCharIds.add(String(filter.charId));
        }
    }
    for (const pool of filterPools) {
        if (pool?.scope === "char" && pool.charId != null && pool.charId !== "") {
            otherCharIds.add(String(pool.charId));
        }
    }

    const options = [];
    if (currentKey != null) {
        options.push({
            value: FILTER_MANAGER_SCOPE_CURRENT,
            charId: currentKey,
            label: `Current: ${getCharacterNameForFilters(currentKey, nameMap)}`,
            isCurrent: true,
        });
    }

    options.push({
        value: FILTER_MANAGER_SCOPE_GLOBAL_ONLY,
        charId: null,
        label: "Global only",
        isCurrent: false,
    });

    const otherOptions = [...otherCharIds]
        .filter(charId => charId !== currentKey)
        .map(charId => ({
            value: charId,
            charId,
            label: getCharacterNameForFilters(charId, nameMap),
            isCurrent: false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    return [...options, ...otherOptions];
}

function ensureContextualFilterManagerScopeSelection(scopeOptions = getContextualFilterScopeOptions()) {
    const validValues = new Set(scopeOptions.map(option => String(option.value)));
    const currentSelection = String(filterManagerUiState.selectedScopeCharId ?? "");
    if (validValues.has(currentSelection)) return filterManagerUiState.selectedScopeCharId;

    const defaultValue = getDefaultFilterManagerScopeValue();
    if (validValues.has(String(defaultValue))) {
        filterManagerUiState.selectedScopeCharId = defaultValue;
        return filterManagerUiState.selectedScopeCharId;
    }

    filterManagerUiState.selectedScopeCharId = scopeOptions[0]?.value || FILTER_MANAGER_SCOPE_GLOBAL_ONLY;
    return filterManagerUiState.selectedScopeCharId;
}

function saveCharSettings() {
    const charId = getCurrentCharId();
    if (charId == null) return;
    const s = getSettings();
    charSettings[charId] = {
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        style: s.style,
        width: s.width,
        height: s.height
    };
    const savedCharSettings = safeSetStorage("qig_char_settings", JSON.stringify(charSettings), "Failed to save character settings. Browser storage may be full.");
    const refs = getCurrentRefImages(s);
    if (refs.length > 0) {
        charRefImages[charId] = refs;
    } else {
        delete charRefImages[charId];
    }
    const savedCharRefs = safeSetStorage("qig_char_ref_images", JSON.stringify(charRefImages), "Failed to save character reference images. Browser storage may be full.");
    if (!savedCharSettings || !savedCharRefs) return;
    backupToSettings("qig_char_settings", charSettings);
    backupToSettings("qig_char_ref_images", charRefImages);
    showStatus("💾 Saved settings for this character");
    setTimeout(hideStatus, 2000);
}

function loadCharSettings() {
    const s = getSettings();
    const charId = getCurrentCharId();
    if (!document.getElementById("qig-prompt")) return false;

    if (charId == null) {
        if (charSettingsBaseState) {
            applyCharScopedState(charSettingsBaseState, s);
            saveSettingsDebounced();
        }
        charSettingsBaseState = null;
        charSettingsBaseCharId = null;
        return false;
    }

    if (charSettingsBaseCharId !== charId) {
        if (charSettingsBaseState) {
            applyCharScopedState(charSettingsBaseState, s);
        }
        charSettingsBaseState = cloneCharScopedState(s);
        charSettingsBaseCharId = charId;
    }

    const hasSettings = !!charSettings[charId];
    const refs = Array.isArray(charRefImages[charId]) ? charRefImages[charId] : [];
    const hasRefs = refs.length > 0;
    if (!hasSettings && !hasRefs) {
        applyCharScopedState(charSettingsBaseState, s);
        saveSettingsDebounced();
        renderContextualFilters();
        renderPromptReplacements();
        return false;
    }

    const cs = charSettings[charId] || {};
    if (Object.prototype.hasOwnProperty.call(cs, "prompt")) {
        s.prompt = cs.prompt ?? "";
        document.getElementById("qig-prompt").value = s.prompt;
    }
    if (Object.prototype.hasOwnProperty.call(cs, "negativePrompt")) {
        s.negativePrompt = cs.negativePrompt ?? "";
        document.getElementById("qig-negative").value = s.negativePrompt;
    }
    if (Object.prototype.hasOwnProperty.call(cs, "style")) {
        s.style = cs.style ?? defaultSettings.style;
        document.getElementById("qig-style").value = s.style;
    }
    if (Object.prototype.hasOwnProperty.call(cs, "width")) {
        s.width = cs.width ?? defaultSettings.width;
        document.getElementById("qig-width").value = s.width;
    }
    if (Object.prototype.hasOwnProperty.call(cs, "height")) {
        s.height = cs.height ?? defaultSettings.height;
        document.getElementById("qig-height").value = s.height;
    }
    if (s.provider === "novelai") {
        normalizeSize(s);
        syncNaiResolutionSelect();
    }
    syncSizeInputs(s.width, s.height);

    s.proxyRefImages = [];
    s.nanobananaRefImages = [];
    s.nanogptRefImages = [];
    if (hasRefs) {
        if (s.provider === "proxy") {
            s.proxyRefImages = [...refs];
        } else if (s.provider === "nanobanana") {
            s.nanobananaRefImages = [...refs];
        } else if (s.provider === "nanogpt") {
            s.nanogptRefImages = [...refs];
        }
    }
    renderRefImages();
    renderNanobananaRefImages();
    renderNanogptRefImages();
    saveSettingsDebounced();
    renderContextualFilters();
    renderPromptReplacements();
    return true;
}

function saveConnectionProfile() {
    const s = getSettings();
    const provider = s.provider;
    const rawName = prompt("Profile name:");
    if (rawName == null) return;
    const name = rawName.trim();
    if (!name) {
        toastr.warning("Profile name cannot be empty");
        return;
    }
    const keys = PROVIDER_KEYS[provider] || [];
    const profile = {};
    keys.forEach(k => profile[k] = s[k]);
    const existing = !!connectionProfiles[provider]?.[name];
    if (existing && !confirm(`Profile "${name}" already exists. Overwrite it?`)) return;
    if (!connectionProfiles[provider]) connectionProfiles[provider] = {};
    connectionProfiles[provider][name] = profile;
    if (!safeSetStorage("qig_profiles", JSON.stringify(connectionProfiles), "Failed to save profile. Browser storage may be full.")) return;
    backupToSettings("qig_profiles", connectionProfiles);
    renderProfileSelect(name);
    showStatus(`${existing ? "♻️ Updated" : "💾 Saved"} profile: ${name}`);
    setTimeout(hideStatus, 2000);
}

function loadConnectionProfile(name) {
    const s = getSettings();
    const provider = s.provider;
    const profile = connectionProfiles[provider]?.[name];
    if (!profile) return;
    Object.assign(s, profile);
    saveSettingsDebounced();
    refreshProviderInputs(provider);
    renderProfileSelect(name);
    showStatus(`📂 Loaded profile: ${name}`);
    setTimeout(hideStatus, 2000);
}

function deleteConnectionProfile(name) {
    const provider = getSettings().provider;
    if (!confirm(`Delete profile "${name}"?`)) return;
    delete connectionProfiles[provider]?.[name];
    if (!safeSetStorage("qig_profiles", JSON.stringify(connectionProfiles), "Failed to delete profile. Browser storage may be full.")) return;
    backupToSettings("qig_profiles", connectionProfiles);
    renderProfileSelect();
}

function renderProfileSelect(selectedName = "") {
    const container = document.getElementById("qig-profile-select");
    if (!container) return;
    const provider = getSettings().provider;
    const profiles = Object.keys(connectionProfiles[provider] || {});
    const previousSelection = document.getElementById("qig-profile-dropdown")?.value || "";
    const selected = selectedName || previousSelection;
    container.innerHTML = profiles.length
        ? `<select id="qig-profile-dropdown"><option value="">-- Select Profile --</option>${profiles.map(p => `<option value="${escapeHtml(p)}" ${p === selected ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}</select><button id="qig-profile-del" class="menu_button" style="padding:2px 6px;">🗑️</button>`
        : "<span style='color:#888;font-size:11px;'>No saved profiles</span>";
    const dropdown = document.getElementById("qig-profile-dropdown");
    if (dropdown) dropdown.onchange = (e) => { if (e.target.value) loadConnectionProfile(e.target.value); };
    const delBtn = document.getElementById("qig-profile-del");
    if (delBtn) delBtn.onclick = () => { const dd = document.getElementById("qig-profile-dropdown"); if (dd?.value) deleteConnectionProfile(dd.value); };
}

const COMFY_WORKFLOW_KEYS = ["localModel", "comfyDenoise", "comfyClipSkip", "comfyScheduler", "comfyUpscale", "comfyUpscaleModel", "comfyLoras", "comfyWorkflow", "comfySkipNegativePrompt", "comfyFluxClipModel1", "comfyFluxClipModel2", "comfyFluxVaeModel", "comfyFluxClipType"];

function getComfyWorkflowSnapshot(s = getSettings()) {
    return {
        localModel: s.localModel || "",
        comfyDenoise: s.comfyDenoise ?? 1.0,
        comfyClipSkip: s.comfyClipSkip ?? 1,
        comfyScheduler: s.comfyScheduler || "normal",
        comfyUpscale: !!s.comfyUpscale,
        comfyUpscaleModel: s.comfyUpscaleModel || "RealESRGAN_x4plus.pth",
        comfyLoras: s.comfyLoras || "",
        comfyWorkflow: s.comfyWorkflow || "",
        comfySkipNegativePrompt: !!s.comfySkipNegativePrompt,
        comfyFluxClipModel1: s.comfyFluxClipModel1 || "",
        comfyFluxClipModel2: s.comfyFluxClipModel2 || "",
        comfyFluxVaeModel: s.comfyFluxVaeModel || "",
        comfyFluxClipType: s.comfyFluxClipType || "flux"
    };
}

function applyComfyWorkflowSnapshot(snapshot) {
    const s = getSettings();
    COMFY_WORKFLOW_KEYS.forEach(k => {
        if (snapshot[k] !== undefined) s[k] = snapshot[k];
    });
    s.localType = "comfyui";
}

function saveComfyWorkflowStore(errorMessage = "Failed to save workflow presets. Browser storage may be full.") {
    const result = safeSetStorage("qig_comfy_workflows", JSON.stringify(comfyWorkflows), errorMessage);
    if (result) backupToSettings("qig_comfy_workflows", comfyWorkflows);
    return result;
}

function setComfyWorkflowActionState(hasSelection) {
    ["qig-comfy-workflow-load", "qig-comfy-workflow-update", "qig-comfy-workflow-del"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !hasSelection;
    });
}

function renderComfyWorkflowPresets(selectedId = "") {
    const select = document.getElementById("qig-comfy-workflow-select");
    if (!select) return;
    const previousSelection = select.value || selectedComfyWorkflowId || "";
    const targetId = selectedId || previousSelection;
    const options = [
        `<option value="">-- Select Workflow Preset --</option>`,
        ...comfyWorkflows.map(w => `<option value="${escapeHtml(w.id || "")}" ${w.id === targetId ? "selected" : ""}>${escapeHtml(w.name || "(unnamed)")}</option>`)
    ];
    select.innerHTML = options.join("");
    const found = targetId && comfyWorkflows.some(w => w.id === targetId);
    selectedComfyWorkflowId = found ? targetId : "";
    if (selectedComfyWorkflowId) select.value = selectedComfyWorkflowId;
    setComfyWorkflowActionState(!!selectedComfyWorkflowId);
}

function getSelectedComfyWorkflowPreset() {
    const select = document.getElementById("qig-comfy-workflow-select");
    const id = select?.value || selectedComfyWorkflowId;
    if (!id) return null;
    return comfyWorkflows.find(w => w.id === id) || null;
}

function loadSelectedComfyWorkflowPreset() {
    const preset = getSelectedComfyWorkflowPreset();
    if (!preset) {
        toastr.warning("Select a workflow preset first");
        return;
    }
    applyComfyWorkflowSnapshot(preset);
    saveSettingsDebounced();
    refreshProviderInputs("local");
    renderComfyWorkflowPresets(preset.id);
    showStatus(`📂 Loaded workflow preset: ${preset.name}`);
    setTimeout(hideStatus, 2000);
}

function saveComfyWorkflowPresetAs() {
    const rawName = prompt("Workflow preset name:");
    if (rawName == null) return;
    const name = rawName.trim();
    if (!name) {
        toastr.warning("Workflow preset name cannot be empty");
        return;
    }
    const existing = comfyWorkflows.find(w => w.name === name);
    const snapshot = getComfyWorkflowSnapshot();
    if (existing) {
        if (!confirm(`Workflow preset "${name}" already exists. Overwrite it?`)) return;
        Object.assign(existing, snapshot, { updatedAt: new Date().toISOString() });
        if (!saveComfyWorkflowStore()) return;
        renderComfyWorkflowPresets(existing.id);
        showStatus(`♻️ Updated workflow preset: ${name}`);
        setTimeout(hideStatus, 2000);
        return;
    }
    const id = `cwf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    comfyWorkflows.push({ id, name, ...snapshot, updatedAt: new Date().toISOString() });
    if (!saveComfyWorkflowStore()) return;
    renderComfyWorkflowPresets(id);
    showStatus(`💾 Saved workflow preset: ${name}`);
    setTimeout(hideStatus, 2000);
}

function updateSelectedComfyWorkflowPreset() {
    const preset = getSelectedComfyWorkflowPreset();
    if (!preset) {
        toastr.warning("Select a workflow preset first");
        return;
    }
    if (!confirm(`Overwrite workflow preset "${preset.name}" with current Comfy settings?`)) return;
    Object.assign(preset, getComfyWorkflowSnapshot(), { updatedAt: new Date().toISOString() });
    if (!saveComfyWorkflowStore()) return;
    renderComfyWorkflowPresets(preset.id);
    showStatus(`♻️ Updated workflow preset: ${preset.name}`);
    setTimeout(hideStatus, 2000);
}

function deleteSelectedComfyWorkflowPreset() {
    const preset = getSelectedComfyWorkflowPreset();
    if (!preset) {
        toastr.warning("Select a workflow preset first");
        return;
    }
    if (!confirm(`Delete workflow preset "${preset.name}"?`)) return;
    comfyWorkflows = comfyWorkflows.filter(w => w.id !== preset.id);
    if (!saveComfyWorkflowStore()) return;
    renderComfyWorkflowPresets("");
    showStatus(`🗑️ Deleted workflow preset: ${preset.name}`);
    setTimeout(hideStatus, 2000);
}

// === Generation Presets ===
const PRESET_KEYS = ["provider", "style", "width", "height", "steps", "cfgScale", "sampler", "seed", "prompt", "negativePrompt", "qualityTags", "appendQuality", "useLastMessage", "useLLMPrompt", "llmPromptStyle", "llmPrefill", "llmCustomInstruction", "batchCount", "sequentialSeeds", "a1111Scheduler", "comfyScheduler", "a1111RestoreFaces", "a1111Tiling", "a1111Subseed", "a1111SubseedStrength"];

function savePreset() {
    const name = prompt("Preset name:");
    if (!name) return;
    ensureFilterPoolsState();
    const s = getSettings();
    const preset = { name };
    PRESET_KEYS.forEach(k => preset[k] = s[k]);
    // Always include contextual filters snapshot in preset
    preset.contextualFilters = JSON.parse(JSON.stringify(contextualFilters));
    preset.filterPools = JSON.parse(JSON.stringify(filterPools));
    preset.activeFilterPoolIdsGlobal = [...normalizePoolIdList(activeFilterPoolIdsGlobal)];
    preset.activeFilterPoolIdsByChar = JSON.parse(JSON.stringify(activeFilterPoolIdsByChar || {}));
    preset.promptReplacements = JSON.parse(JSON.stringify(promptReplacements));
    preset.activePromptReplacementIdsGlobal = [...normalizePoolIdList(activePromptReplacementIdsGlobal)];
    preset.activePromptReplacementIdsByChar = JSON.parse(JSON.stringify(activePromptReplacementIdsByChar || {}));
    // Include ST Style toggle state
    if (s.useSTStyle !== undefined) preset.useSTStyle = s.useSTStyle;
    // Include inject mode settings
    const injectKeys = ["injectEnabled", "injectTagName", "injectPrompt", "injectRegex", "injectPosition", "injectDepth", "injectInsertMode", "injectAutoClean", "paletteMode"];
    injectKeys.forEach(k => { if (s[k] !== undefined) preset[k] = s[k]; });
    generationPresets.push(preset);
    if (!safeSetStorage("qig_gen_presets", JSON.stringify(generationPresets), "Failed to save preset. Browser storage may be full.")) return;
    backupToSettings("qig_gen_presets", generationPresets);
    renderPresets();
    showStatus(`💾 Saved preset: ${name}`);
    setTimeout(hideStatus, 2000);
}

function loadPreset(i) {
    const p = generationPresets[i];
    if (!p) return;
    const s = getSettings();
    PRESET_KEYS.forEach(k => { if (p[k] !== undefined) s[k] = p[k]; });
    // Restore contextual filters if saved in preset
    if (p.contextualFilters) {
        contextualFilters = JSON.parse(JSON.stringify(p.contextualFilters));
    }
    if (p.filterPools) {
        filterPools = JSON.parse(JSON.stringify(p.filterPools));
    }
    if (p.activeFilterPoolIdsGlobal) {
        activeFilterPoolIdsGlobal = JSON.parse(JSON.stringify(p.activeFilterPoolIdsGlobal));
    }
    if (p.activeFilterPoolIdsByChar) {
        activeFilterPoolIdsByChar = JSON.parse(JSON.stringify(p.activeFilterPoolIdsByChar));
    }
    if (p.promptReplacements) {
        promptReplacements = JSON.parse(JSON.stringify(p.promptReplacements));
    }
    if (p.activePromptReplacementIdsGlobal) {
        activePromptReplacementIdsGlobal = JSON.parse(JSON.stringify(p.activePromptReplacementIdsGlobal));
    }
    if (p.activePromptReplacementIdsByChar) {
        activePromptReplacementIdsByChar = JSON.parse(JSON.stringify(p.activePromptReplacementIdsByChar));
    }
    ensureFilterPoolsState({ persist: true });
    ensurePromptReplacementState({ persist: true });
    renderContextualFilters();
    renderPromptReplacements();
    // Restore ST Style toggle
    if (p.useSTStyle !== undefined) { s.useSTStyle = p.useSTStyle; }
    // Restore inject mode settings
    const injectKeys = ["injectEnabled", "injectTagName", "injectPrompt", "injectRegex", "injectPosition", "injectDepth", "injectInsertMode", "injectAutoClean", "paletteMode"];
    injectKeys.forEach(k => { if (p[k] !== undefined) s[k] = p[k]; });
    saveSettingsDebounced();
    refreshAllUI(s);
    showStatus(`📂 Loaded preset: ${p.name}`);
    setTimeout(hideStatus, 2000);
}

function deletePreset(i) {
    generationPresets.splice(i, 1);
    if (!safeSetStorage("qig_gen_presets", JSON.stringify(generationPresets), "Failed to delete preset. Browser storage may be full.")) return;
    backupToSettings("qig_gen_presets", generationPresets);
    renderPresets();
}

function clearPresets() {
    if (confirm("Clear all presets?")) {
        generationPresets = [];
        localStorage.removeItem("qig_gen_presets");
        backupToSettings("qig_gen_presets", generationPresets);
        renderPresets();
    }
}

function renderPresets() {
    const container = document.getElementById("qig-presets");
    if (!container) return;
    const html = generationPresets.map((p, i) =>
        `<span style="display:inline-flex;align-items:center;margin:2px;">` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;" onclick="loadPreset(${i})">${escapeHtml(p.name || "")}</button>` +
        `<button class="menu_button" style="padding:2px 4px;font-size:10px;margin-left:1px;" onclick="deletePreset(${i})">×</button></span>`
    ).join('');
    container.innerHTML = generationPresets.length > 0
        ? `<div style="max-height:80px;overflow-y:auto;margin-bottom:4px;">${html}</div>` +
          `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearPresets()">Clear All</button>`
        : '';
}

function syncInjectTagUI(settings = getSettings()) {
    const safeTagName = getInjectTagName(settings);
    const tagInput = document.getElementById("qig-inject-tag-name");
    if (tagInput) tagInput.value = safeTagName;
    const preview = document.getElementById("qig-inject-tag-preview");
    if (preview) preview.textContent = getInjectTagPreview(safeTagName);
}

function syncInjectDefaultFields(settings = getSettings()) {
    const promptEl = document.getElementById("qig-inject-prompt");
    if (promptEl) promptEl.value = settings.injectPrompt ?? "";
    const regexEl = document.getElementById("qig-inject-regex");
    if (regexEl) regexEl.value = settings.injectRegex ?? "";
    syncInjectTagUI(settings);
}

function applyInjectTagNameChange(nextTagName) {
    const s = getSettings();
    const previousTagName = getInjectTagName(s);
    const normalizedTagName = normalizeInjectTagName(nextTagName);
    const shouldUpdatePrompt = isGeneratedInjectPrompt(s.injectPrompt, previousTagName);
    const shouldUpdateRegex = isGeneratedInjectRegex(s.injectRegex, previousTagName);

    s.injectTagName = normalizedTagName;
    if (shouldUpdatePrompt) s.injectPrompt = buildDefaultInjectPrompt(normalizedTagName);
    if (shouldUpdateRegex) s.injectRegex = buildDefaultInjectRegex(normalizedTagName);
    syncInjectDefaultFields(s);
    return normalizedTagName;
}

function refreshAllUI(s) {
    const fields = {
        "qig-prompt": "prompt", "qig-negative": "negativePrompt", "qig-quality": "qualityTags",
        "qig-width": "width", "qig-height": "height", "qig-steps": "steps",
        "qig-cfg": "cfgScale", "qig-sampler": "sampler", "qig-seed": "seed",
        "qig-batch": "batchCount", "qig-provider": "provider", "qig-style": "style",
        "qig-llm-style": "llmPromptStyle",
        "qig-llm-prefill": "llmPrefill",
        "qig-llm-custom": "llmCustomInstruction",
        "qig-inject-tag-name": "injectTagName",
        "qig-inject-prompt": "injectPrompt", "qig-inject-regex": "injectRegex",
        "qig-inject-position": "injectPosition", "qig-inject-depth": "injectDepth",
        "qig-inject-insert-mode": "injectInsertMode",
        "qig-palette-mode": "paletteMode"
    };
    Object.entries(fields).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.value = s[key] ?? "";
    });
    const checks = {
        "qig-append-quality": "appendQuality", "qig-use-last": "useLastMessage",
        "qig-use-llm": "useLLMPrompt", "qig-seq-seeds": "sequentialSeeds",
        "qig-use-st-style": "useSTStyle", "qig-inject-enabled": "injectEnabled",
        "qig-inject-autoclean": "injectAutoClean"
    };
    Object.entries(checks).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!s[key];
    });
    syncInjectDefaultFields(s);
    updateProviderUI();
    refreshProviderInputs(s.provider);
    renderProfileSelect();
    // Update seq seeds visibility
    const seqWrap = document.getElementById("qig-seq-seeds-wrap");
    if (seqWrap) seqWrap.style.display = (s.batchCount || 1) > 1 ? "" : "none";
    // Update inject mode visibility
    const injectOpts = document.getElementById("qig-inject-options");
    if (injectOpts) injectOpts.style.display = s.injectEnabled ? "block" : "none";
    const injectDepthWrap = document.getElementById("qig-inject-depth-wrap");
    if (injectDepthWrap) injectDepthWrap.style.display = s.injectPosition === "atDepth" ? "block" : "none";
    renderContextualFilters();
    renderPromptReplacements();
}

window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.clearPresets = clearPresets;

// === Export / Import Settings ===
function exportAllSettings() {
    const data = {
        version: 4,
        exportDate: new Date().toISOString(),
        connectionProfiles,
        comfyWorkflows,
        promptTemplates,
        generationPresets,
        charSettings,
        charRefImages,
        contextualFilters,
        filterPools,
        activeFilterPoolIdsGlobal,
        activeFilterPoolIdsByChar,
        promptReplacements,
        activePromptReplacementIdsGlobal,
        activePromptReplacementIdsByChar,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qig-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastr.success("Settings exported");
}

function importSettings() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.version) { toastr.error("Invalid settings file"); return; }
            if (!confirm(`Import settings from ${data.exportDate || 'unknown date'}? This will overwrite current settings.`)) return;
            if (data.connectionProfiles) {
                connectionProfiles = data.connectionProfiles;
                if (!safeSetStorage("qig_profiles", JSON.stringify(connectionProfiles))) throw new Error("Could not save imported profiles. Browser storage may be full.");
                backupToSettings("qig_profiles", connectionProfiles);
            }
            if (Array.isArray(data.comfyWorkflows)) {
                comfyWorkflows = data.comfyWorkflows;
                if (!safeSetStorage("qig_comfy_workflows", JSON.stringify(comfyWorkflows))) throw new Error("Could not save imported workflow presets. Browser storage may be full.");
                backupToSettings("qig_comfy_workflows", comfyWorkflows);
            }
            if (data.promptTemplates) {
                promptTemplates = data.promptTemplates;
                if (!safeSetStorage("qig_templates", JSON.stringify(promptTemplates))) throw new Error("Could not save imported templates. Browser storage may be full.");
                backupToSettings("qig_templates", promptTemplates);
            }
            if (data.generationPresets) {
                generationPresets = data.generationPresets;
                if (!safeSetStorage("qig_gen_presets", JSON.stringify(generationPresets))) throw new Error("Could not save imported presets. Browser storage may be full.");
                backupToSettings("qig_gen_presets", generationPresets);
            }
            if (data.charSettings) {
                charSettings = data.charSettings;
                if (!safeSetStorage("qig_char_settings", JSON.stringify(charSettings))) throw new Error("Could not save imported character settings. Browser storage may be full.");
                backupToSettings("qig_char_settings", charSettings);
            }
            if (data.charRefImages) {
                charRefImages = data.charRefImages;
                if (!safeSetStorage("qig_char_ref_images", JSON.stringify(charRefImages))) throw new Error("Could not save imported character reference images. Browser storage may be full.");
                backupToSettings("qig_char_ref_images", charRefImages);
            }
            if (data.contextualFilters) {
                contextualFilters = data.contextualFilters;
                if (!safeSetStorage("qig_contextual_filters", JSON.stringify(contextualFilters))) throw new Error("Could not save imported contextual filters. Browser storage may be full.");
                backupToSettings("qig_contextual_filters", contextualFilters);
            }
            if (Array.isArray(data.filterPools)) {
                filterPools = data.filterPools;
                if (!safeSetStorage("qig_filter_pools", JSON.stringify(filterPools))) throw new Error("Could not save imported filter pools. Browser storage may be full.");
                backupToSettings("qig_filter_pools", filterPools);
            }
            if (Array.isArray(data.activeFilterPoolIdsGlobal)) {
                activeFilterPoolIdsGlobal = data.activeFilterPoolIdsGlobal;
                if (!safeSetStorage("qig_active_pool_ids_global", JSON.stringify(activeFilterPoolIdsGlobal))) throw new Error("Could not save imported global pool states. Browser storage may be full.");
                backupToSettings("qig_active_pool_ids_global", activeFilterPoolIdsGlobal);
            }
            if (data.activeFilterPoolIdsByChar && typeof data.activeFilterPoolIdsByChar === "object") {
                activeFilterPoolIdsByChar = data.activeFilterPoolIdsByChar;
                if (!safeSetStorage("qig_active_pool_ids_by_char", JSON.stringify(activeFilterPoolIdsByChar))) throw new Error("Could not save imported character pool states. Browser storage may be full.");
                backupToSettings("qig_active_pool_ids_by_char", activeFilterPoolIdsByChar);
            }
            if (Array.isArray(data.promptReplacements)) {
                promptReplacements = data.promptReplacements;
                if (!safeSetStorage("qig_prompt_replacements", JSON.stringify(promptReplacements))) throw new Error("Could not save imported prompt replacement maps. Browser storage may be full.");
                backupToSettings("qig_prompt_replacements", promptReplacements);
            }
            if (Array.isArray(data.activePromptReplacementIdsGlobal)) {
                activePromptReplacementIdsGlobal = data.activePromptReplacementIdsGlobal;
                if (!safeSetStorage("qig_active_prompt_replacement_ids_global", JSON.stringify(activePromptReplacementIdsGlobal))) throw new Error("Could not save imported global prompt replacement map states. Browser storage may be full.");
                backupToSettings("qig_active_prompt_replacement_ids_global", activePromptReplacementIdsGlobal);
            }
            if (data.activePromptReplacementIdsByChar && typeof data.activePromptReplacementIdsByChar === "object") {
                activePromptReplacementIdsByChar = data.activePromptReplacementIdsByChar;
                if (!safeSetStorage("qig_active_prompt_replacement_ids_by_char", JSON.stringify(activePromptReplacementIdsByChar))) throw new Error("Could not save imported character prompt replacement map states. Browser storage may be full.");
                backupToSettings("qig_active_prompt_replacement_ids_by_char", activePromptReplacementIdsByChar);
            }
            ensureFilterPoolsState({ persist: true });
            ensurePromptReplacementState({ persist: true });
            renderTemplates();
            renderPresets();
            renderProfileSelect();
            renderComfyWorkflowPresets();
            renderContextualFilters();
            renderPromptReplacements();
            toastr.success("Settings imported successfully");
        } catch (err) {
            console.error("[Quick Image Gen] Import failed:", err);
            toastr.error("Failed to import: " + err.message);
        }
    };
    input.click();
}

function syncLocalTypeSections(localType) {
    const a1111Opts = document.getElementById("qig-local-a1111-opts");
    const comfyOpts = document.getElementById("qig-local-comfyui-opts");
    if (a1111Opts) a1111Opts.style.display = localType === "a1111" ? "block" : "none";
    if (comfyOpts) comfyOpts.style.display = localType === "comfyui" ? "block" : "none";
    const denoiseWrap = document.getElementById("qig-local-denoise-wrap");
    if (denoiseWrap) {
        const s = getSettings();
        denoiseWrap.style.display = localType === "a1111" && s.localRefImage ? "block" : "none";
    }
}

function syncA1111VisibilityFromSettings(s) {
    const hiresOpts = document.getElementById("qig-a1111-hires-opts");
    if (hiresOpts) hiresOpts.style.display = s.a1111HiresFix ? "block" : "none";
    const adetailerOpts = document.getElementById("qig-a1111-adetailer-opts");
    if (adetailerOpts) adetailerOpts.style.display = s.a1111Adetailer ? "block" : "none";
    const ad2Opts = document.getElementById("qig-a1111-ad2-opts");
    if (ad2Opts) ad2Opts.style.display = s.a1111Adetailer2 ? "block" : "none";
    const ipadapterOpts = document.getElementById("qig-a1111-ipadapter-opts");
    if (ipadapterOpts) ipadapterOpts.style.display = s.a1111IpAdapter ? "block" : "none";
    const controlnetOpts = document.getElementById("qig-a1111-controlnet-opts");
    if (controlnetOpts) controlnetOpts.style.display = s.a1111ControlNet ? "block" : "none";
}

function refreshProviderInputs(provider) {
    const s = getSettings();
    const map = {
        pollinations: [["qig-pollinations-model", "pollinationsModel"]],
        novelai: [["qig-nai-key", "naiKey"], ["qig-nai-model", "naiModel"], ["qig-nai-proxy-url", "naiProxyUrl"], ["qig-nai-proxy-key", "naiProxyKey"]],
        arliai: [["qig-arli-key", "arliKey"], ["qig-arli-model", "arliModel"]],
        nanogpt: [["qig-nanogpt-key", "nanogptKey"], ["qig-nanogpt-model", "nanogptModel"], ["qig-nanogpt-strength", "nanogptStrength"]],
        chutes: [["qig-chutes-key", "chutesKey"], ["qig-chutes-model", "chutesModel"]],
        civitai: [["qig-civitai-key", "civitaiKey"], ["qig-civitai-model", "civitaiModel"], ["qig-civitai-scheduler", "civitaiScheduler"], ["qig-civitai-loras", "civitaiLoras"]],
        nanobanana: [["qig-nanobanana-key", "nanobananaKey"], ["qig-nanobanana-model", "nanobananaModel"], ["qig-nanobanana-extra", "nanobananaExtraInstructions"]],
        local: [
            ["qig-local-url", "localUrl"],
            ["qig-local-type", "localType"],
            ["qig-local-model", "localModel"],
            ["qig-local-denoise", "localDenoise"],
            ["qig-comfy-denoise", "comfyDenoise"],
            ["qig-comfy-clip", "comfyClipSkip"],
            ["qig-comfy-scheduler", "comfyScheduler"],
            ["qig-comfy-timeout", "comfyTimeout"],
            ["qig-comfy-upscale", "comfyUpscale"],
            ["qig-comfy-upscale-model", "comfyUpscaleModel"],
            ["qig-comfy-workflow", "comfyWorkflow"],
            ["qig-comfy-loras", "comfyLoras"],
            ["qig-a1111-model", "a1111Model"],
            ["qig-a1111-clip", "a1111ClipSkip"],
            ["qig-a1111-scheduler", "a1111Scheduler"],
            ["qig-a1111-restore-faces", "a1111RestoreFaces"],
            ["qig-a1111-tiling", "a1111Tiling"],
            ["qig-a1111-subseed", "a1111Subseed"],
            ["qig-a1111-subseed-strength", "a1111SubseedStrength"],
            ["qig-a1111-loras", "a1111Loras"],
            ["qig-a1111-vae", "a1111Vae"],
            ["qig-a1111-hires", "a1111HiresFix"],
            ["qig-a1111-hires-upscaler", "a1111HiresUpscaler"],
            ["qig-a1111-hires-scale", "a1111HiresScale"],
            ["qig-a1111-hires-steps", "a1111HiresSteps"],
            ["qig-a1111-hires-denoise", "a1111HiresDenoise"],
            ["qig-a1111-hires-sampler", "a1111HiresSampler"],
            ["qig-a1111-hires-scheduler", "a1111HiresScheduler"],
            ["qig-a1111-hires-prompt", "a1111HiresPrompt"],
            ["qig-a1111-hires-negative", "a1111HiresNegative"],
            ["qig-a1111-hires-resize-x", "a1111HiresResizeX"],
            ["qig-a1111-hires-resize-y", "a1111HiresResizeY"],
            ["qig-a1111-adetailer", "a1111Adetailer"],
            ["qig-a1111-adetailer-model", "a1111AdetailerModel"],
            ["qig-a1111-ad-prompt", "a1111AdetailerPrompt"],
            ["qig-a1111-ad-negative", "a1111AdetailerNegative"],
            ["qig-a1111-ad-denoise", "a1111AdetailerDenoise"],
            ["qig-a1111-ad-confidence", "a1111AdetailerConfidence"],
            ["qig-a1111-ad-mask-blur", "a1111AdetailerMaskBlur"],
            ["qig-a1111-ad-dilate", "a1111AdetailerDilateErode"],
            ["qig-a1111-ad-inpaint-only", "a1111AdetailerInpaintOnlyMasked"],
            ["qig-a1111-ad-inpaint-padding", "a1111AdetailerInpaintPadding"],
            ["qig-a1111-ad2-enable", "a1111Adetailer2"],
            ["qig-a1111-ad2-model", "a1111Adetailer2Model"],
            ["qig-a1111-ad2-prompt", "a1111Adetailer2Prompt"],
            ["qig-a1111-ad2-negative", "a1111Adetailer2Negative"],
            ["qig-a1111-ad2-denoise", "a1111Adetailer2Denoise"],
            ["qig-a1111-ad2-confidence", "a1111Adetailer2Confidence"],
            ["qig-a1111-ad2-mask-blur", "a1111Adetailer2MaskBlur"],
            ["qig-a1111-ad2-dilate", "a1111Adetailer2DilateErode"],
            ["qig-a1111-ad2-inpaint-only", "a1111Adetailer2InpaintOnlyMasked"],
            ["qig-a1111-ad2-inpaint-padding", "a1111Adetailer2InpaintPadding"],
            ["qig-a1111-save-webui", "a1111SaveToWebUI"],
            ["qig-a1111-ipadapter", "a1111IpAdapter"],
            ["qig-a1111-ipadapter-mode", "a1111IpAdapterMode"],
            ["qig-a1111-ipadapter-weight", "a1111IpAdapterWeight"],
            ["qig-a1111-ipadapter-pixel", "a1111IpAdapterPixelPerfect"],
            ["qig-a1111-ipadapter-resize", "a1111IpAdapterResizeMode"],
            ["qig-a1111-ipadapter-control", "a1111IpAdapterControlMode"],
            ["qig-a1111-ipadapter-start", "a1111IpAdapterStartStep"],
            ["qig-a1111-ipadapter-end", "a1111IpAdapterEndStep"],
            ["qig-a1111-controlnet", "a1111ControlNet"],
            ["qig-a1111-cn-model", "a1111ControlNetModel"],
            ["qig-a1111-cn-module", "a1111ControlNetModule"],
            ["qig-a1111-cn-weight", "a1111ControlNetWeight"],
            ["qig-a1111-cn-pixel", "a1111ControlNetPixelPerfect"],
            ["qig-a1111-cn-resize", "a1111ControlNetResizeMode"],
            ["qig-a1111-cn-control", "a1111ControlNetControlMode"],
            ["qig-a1111-cn-start", "a1111ControlNetGuidanceStart"],
            ["qig-a1111-cn-end", "a1111ControlNetGuidanceEnd"],
            ["qig-comfy-skip-neg", "comfySkipNegativePrompt"],
            ["qig-comfy-flux-clip1", "comfyFluxClipModel1"],
            ["qig-comfy-flux-clip2", "comfyFluxClipModel2"],
            ["qig-comfy-flux-vae", "comfyFluxVaeModel"],
            ["qig-comfy-flux-clip-type", "comfyFluxClipType"]
        ],
        proxy: [["qig-proxy-url", "proxyUrl"], ["qig-proxy-key", "proxyKey"], ["qig-proxy-model", "proxyModel"], ["qig-proxy-loras", "proxyLoras"], ["qig-proxy-steps", "proxySteps"], ["qig-proxy-cfg", "proxyCfg"], ["qig-proxy-sampler", "proxySampler"], ["qig-proxy-seed", "proxySeed"], ["qig-proxy-extra", "proxyExtraInstructions"], ["qig-proxy-facefix", "proxyFacefix"], ["qig-proxy-comfy-mode", "proxyComfyMode"], ["qig-proxy-comfy-timeout", "proxyComfyTimeout"], ["qig-proxy-comfy-node-id", "proxyComfyNodeId"], ["qig-proxy-comfy-workflow", "proxyComfyWorkflow"]]
    };
    (map[provider] || []).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.type === "checkbox" ? el.checked = s[key] : el.value = s[key] ?? "";
    });

    if (provider === "local") {
        syncLocalTypeSections(s.localType);
        syncA1111VisibilityFromSettings(s);
        const fluxOpts = document.getElementById("qig-comfy-flux-opts");
        if (fluxOpts) fluxOpts.style.display = s.comfySkipNegativePrompt ? "block" : "none";
        const upscaleOpts = document.getElementById("qig-comfy-upscale-opts");
        if (upscaleOpts) upscaleOpts.style.display = s.comfyUpscale ? "block" : "none";
        const localDenoise = document.getElementById("qig-local-denoise-val");
        if (localDenoise) localDenoise.textContent = String(s.localDenoise ?? 0.75);
        const hiresDenoise = document.getElementById("qig-a1111-hires-denoise-val");
        if (hiresDenoise) hiresDenoise.textContent = String(s.a1111HiresDenoise ?? 0.55);
        const ipWeight = document.getElementById("qig-a1111-ipadapter-weight-val");
        if (ipWeight) ipWeight.textContent = String(s.a1111IpAdapterWeight ?? 0.7);
    }

    // Update reference images display
    if (provider === "proxy") {
        renderRefImages();
        const comfyOpts = document.getElementById("qig-proxy-comfy-opts");
        const stdOpts = document.getElementById("qig-proxy-standard-opts");
        if (comfyOpts) comfyOpts.style.display = s.proxyComfyMode ? "block" : "none";
        if (stdOpts) stdOpts.style.display = s.proxyComfyMode ? "none" : "block";
    }
    if (provider === "nanobanana") renderNanobananaRefImages();
    if (provider === "nanogpt") renderNanogptRefImages();
}

function updateProviderUI() {
    const s = getSettings();
    document.querySelectorAll(".qig-provider-section").forEach(el => el.style.display = "none");
    const section = document.getElementById(`qig-${s.provider}-settings`);
    if (section) section.style.display = "block";

    const showAdvanced = ["novelai", "arliai", "nanogpt", "chutes", "civitai", "local"].includes(s.provider);
    document.getElementById("qig-advanced-settings").style.display = showAdvanced ? "block" : "none";

    const isNai = s.provider === "novelai";
    const sizeCustomEl = document.getElementById("qig-size-custom");
    const naiResolutionEl = document.getElementById("qig-nai-resolution");
    if (sizeCustomEl) sizeCustomEl.style.display = "flex";
    if (naiResolutionEl) naiResolutionEl.style.display = isNai ? "block" : "none";
    if (isNai) {
        const changed = normalizeSize(s);
        syncSizeInputs(s.width, s.height);
        syncNaiResolutionSelect();
        if (changed) saveSettingsDebounced();
    }
}

function renderRefImages() {
    const container = getOrCacheElement("qig-proxy-refs");
    if (!container) return;
    const imgs = getSettings().proxyRefImages || [];
    container.innerHTML = imgs.map((src, i) =>
        `<div style="position:relative;"><img src="${escapeHtml(src || "")}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeRefImage = function (idx) {
    const s = getSettings();
    if (!s.proxyRefImages) s.proxyRefImages = [];
    s.proxyRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderRefImages();
};

function renderNanobananaRefImages() {
    const container = getOrCacheElement("qig-nanobanana-refs");
    if (!container) return;
    const imgs = getSettings().nanobananaRefImages || [];
    container.innerHTML = imgs.map((src, i) =>
        `<div style="position:relative;"><img src="${escapeHtml(src || "")}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeNanobananaRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeNanobananaRefImage = function (idx) {
    const s = getSettings();
    if (!s.nanobananaRefImages) s.nanobananaRefImages = [];
    s.nanobananaRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderNanobananaRefImages();
};

function renderNanogptRefImages() {
    const container = getOrCacheElement("qig-nanogpt-refs");
    if (!container) return;
    const imgs = getSettings().nanogptRefImages || [];
    container.innerHTML = imgs.map((src, i) =>
        `<div style="position:relative;"><img src="${escapeHtml(src || "")}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeNanogptRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeNanogptRefImage = function (idx) {
    const s = getSettings();
    if (!s.nanogptRefImages) s.nanogptRefImages = [];
    s.nanogptRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderNanogptRefImages();
};

function bind(id, key, isNum = false, isCheckbox = false, onChange = null) {
    if (typeof isNum === "function") {
        onChange = isNum;
        isNum = false;
    } else if (typeof isCheckbox === "function") {
        onChange = isCheckbox;
        isCheckbox = false;
    }
    const el = getOrCacheElement(id);
    if (!el) return;
    el.onchange = (e) => {
        const value = isCheckbox ? e.target.checked : (isNum ? parseFloat(e.target.value) : e.target.value);
        getSettings()[key] = value;
        if (typeof onChange === "function") onChange(value, e);
        saveSettingsDebounced();
    };
}

function bindCheckbox(id, key) {
    return bind(id, key, false, true);
}

function modelSelect(provider, settingKey, currentVal) {
    const models = PROVIDER_MODELS[provider];
    if (!models) return `<input id="qig-${settingKey}" type="text" value="${escapeHtml(currentVal ?? "")}" placeholder="Model ID">`;
    const opts = models.map(m => `<option value="${m.id}" ${currentVal === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    return `<select id="qig-${settingKey}">${opts}</select>`;
}

function buildOptions(items, selectedValue, labelFn) {
    return items.map(([k, v]) =>
        `<option value="${k}" ${selectedValue === k ? "selected" : ""}>${labelFn ? labelFn(v) : v}</option>`
    ).join("");
}

function createUI() {
    clearCache();
    const s = getSettings();
    if (s.provider === "novelai") normalizeSize(s);
    const esc = (v) => escapeHtml(v == null ? "" : String(v));
    const selectedNaiResolution = getNaiResolutionOptionValue(s.width, s.height);
    const samplerOpts = Object.entries(SAMPLER_GROUPS).map(([group, ids]) =>
        `<optgroup label="${group}">${ids.map(x => `<option value="${x}" ${s.sampler === x ? "selected" : ""}>${SAMPLER_DISPLAY_NAMES[x] || x}</option>`).join("")}</optgroup>`
    ).join("");
    const comfyWorkflowPresetOpts = [
        `<option value="">-- Select Workflow Preset --</option>`,
        ...comfyWorkflows.map(w => `<option value="${esc(w.id || "")}" ${w.id === selectedComfyWorkflowId ? "selected" : ""}>${esc(w.name || "(unnamed)")}</option>`)
    ].join("");
    const providerOpts = buildOptions(Object.entries(PROVIDERS), s.provider, v => v.name);
    const styleOpts = buildOptions(Object.entries(STYLES), s.style, v => v.name);

    const html = `
    <div id="qig-settings" class="qig-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Quick Image Gen</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <button id="qig-generate-btn" class="menu_button" title="Generate an image using current settings">🎨 Generate</button>
                <button id="qig-logs-btn" class="menu_button" title="View generation logs and errors">📋 Logs</button>
                <button id="qig-save-char-btn" class="menu_button" title="Save current settings as defaults for this character">💾 Save for Char</button>
                <button id="qig-gallery-settings-btn" class="menu_button" title="Browse images generated this session">🖼️ Gallery</button>
                <button id="qig-prompt-history-btn" class="menu_button" title="View and reuse past prompts">📝 Prompts</button>

                <label>Provider</label>
                <select id="qig-provider">${providerOpts}</select>
                <small style="opacity:0.6;font-size:10px;">Image generation service — cloud API or local server</small>
                
                <div style="display:flex;gap:4px;align-items:center;margin:4px 0;">
                    <div id="qig-profile-select" style="flex:1;"></div>
                    <button id="qig-profile-save" class="menu_button" style="padding:2px 6px;" title="Save current provider, API key, and model as a reusable profile">💾 Save Profile</button>
                </div>
                
                <label>Style</label>
                <select id="qig-style">${styleOpts}</select>
                <small style="opacity:0.6;font-size:10px;">Visual style preset applied to the prompt</small>
                
                <div id="qig-pollinations-settings" class="qig-provider-section">
                    <label>Model</label>
                    ${modelSelect("pollinations", "pollinations-model", s.pollinationsModel)}
                </div>
                
                <div id="qig-novelai-settings" class="qig-provider-section">
                    <label>NovelAI API Key</label>
                    <input id="qig-nai-key" type="password" value="${esc(s.naiKey)}">
                    <label>Model</label>
                    <input id="qig-nai-model" type="text" value="${esc(s.naiModel)}" placeholder="nai-diffusion-4-5-curated">
                    <label>Proxy URL <small>(optional — leave blank to use official API)</small></label>
                    <input id="qig-nai-proxy-url" type="text" value="${esc(s.naiProxyUrl)}" placeholder="https://your-proxy-url">
                    <label>Proxy Key <small>(optional — overrides API key above for proxy)</small></label>
                    <input id="qig-nai-proxy-key" type="password" value="${esc(s.naiProxyKey)}" placeholder="Leave blank to use API key above">
                </div>
                
                <div id="qig-arliai-settings" class="qig-provider-section">
                    <label>ArliAI API Key</label>
                    <input id="qig-arli-key" type="password" value="${esc(s.arliKey)}">
                    <label>Model</label>
                    <input id="qig-arli-model" type="text" value="${esc(s.arliModel)}" placeholder="arliai-realistic-v1">
                </div>
                
                <div id="qig-nanogpt-settings" class="qig-provider-section">
                    <label>NanoGPT API Key</label>
                    <input id="qig-nanogpt-key" type="password" value="${esc(s.nanogptKey)}">
                    <label>Model</label>
                    <input id="qig-nanogpt-model" type="text" value="${esc(s.nanogptModel)}" placeholder="image-flux-schnell">
                    <label>Strength <span id="qig-nanogpt-strength-val">${s.nanogptStrength ?? 0.75}</span></label>
                    <input id="qig-nanogpt-strength" type="range" min="0" max="1" step="0.05" value="${s.nanogptStrength ?? 0.75}" oninput="document.getElementById('qig-nanogpt-strength-val').textContent=this.value">
                    <label>Reference Images (up to 15)</label>
                    <div id="qig-nanogpt-refs" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;"></div>
                    <input type="file" id="qig-nanogpt-ref-input" accept="image/*" multiple style="display:none">
                    <button id="qig-nanogpt-ref-btn" class="menu_button" style="padding:4px 8px;">📎 Add Reference Images</button>
                </div>
                
                <div id="qig-chutes-settings" class="qig-provider-section">
                    <label>Chutes API Key</label>
                    <input id="qig-chutes-key" type="password" value="${esc(s.chutesKey)}">
                    <label>Model</label>
                    <input id="qig-chutes-model" type="text" value="${esc(s.chutesModel)}" placeholder="stabilityai/stable-diffusion-xl-base-1.0">
                </div>
                
                <div id="qig-civitai-settings" class="qig-provider-section">
                    <label>CivitAI API Key</label>
                    <input id="qig-civitai-key" type="password" value="${esc(s.civitaiKey)}">
                    <label>Model URN</label>
                    <input id="qig-civitai-model" type="text" value="${esc(s.civitaiModel)}" placeholder="urn:air:sd1:checkpoint:civitai:4201@130072">
                    <small style="opacity:0.6;font-size:10px;">Find this on the model page → API tab → copy the URN</small>
                    <label>Scheduler</label>
                    <select id="qig-civitai-scheduler">
                        <option value="EulerA" ${s.civitaiScheduler === "EulerA" ? "selected" : ""}>Euler A</option>
                        <option value="Euler" ${s.civitaiScheduler === "Euler" ? "selected" : ""}>Euler</option>
                        <option value="DPM++ 2M Karras" ${s.civitaiScheduler === "DPM++ 2M Karras" ? "selected" : ""}>DPM++ 2M Karras</option>
                        <option value="DPM++ SDE Karras" ${s.civitaiScheduler === "DPM++ SDE Karras" ? "selected" : ""}>DPM++ SDE Karras</option>
                        <option value="DDIM" ${s.civitaiScheduler === "DDIM" ? "selected" : ""}>DDIM</option>
                    </select>
                    <label>LoRAs (URN:weight, comma-separated)</label>
                    <small style="opacity:0.6;font-size:10px;">Always applied. For scene-specific LoRAs, use Contextual Filters.</small>
                    <input id="qig-civitai-loras" type="text" value="${esc(s.civitaiLoras || "")}" placeholder="urn:air:sd1:lora:civitai:82098@87153:0.8, urn:air:sdxl:lora:civitai:12345@67890:1.0">
                </div>
                
                <div id="qig-nanobanana-settings" class="qig-provider-section">
                    <label>Gemini API Key</label>
                    <input id="qig-nanobanana-key" type="password" value="${esc(s.nanobananaKey)}">
                    <label>Model</label>
                    <select id="qig-nanobanana-model">
                        <option value="gemini-2.5-flash-image" ${s.nanobananaModel === "gemini-2.5-flash-image" ? "selected" : ""}>Gemini 2.5 Flash Image</option>
                        <option value="gemini-2.0-flash-exp" ${s.nanobananaModel === "gemini-2.0-flash-exp" ? "selected" : ""}>Gemini 2.0 Flash Exp</option>
                    </select>
                    <label>Extra Instructions</label>
                    <textarea id="qig-nanobanana-extra" rows="2" placeholder="Additional instructions for Nanobanana Pro...">${esc(s.nanobananaExtraInstructions || "")}</textarea>
                    <label>Reference Images (up to 15)</label>
                    <div id="qig-nanobanana-refs" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;"></div>
                    <input type="file" id="qig-nanobanana-ref-input" accept="image/*" multiple style="display:none">
                    <button id="qig-nanobanana-ref-btn" class="menu_button" style="padding:4px 8px;">📎 Add Reference Images</button>
                </div>

                <div id="qig-stability-settings" class="qig-provider-section">
                    <label>Stability AI API Key</label>
                    <input id="qig-stability-key" type="password" value="${esc(s.stabilityKey)}">
                    <div class="form-hint">Uses SDXL 1.0</div>
                </div>

                <div id="qig-replicate-settings" class="qig-provider-section">
                    <label>Replicate API Key</label>
                    <input id="qig-replicate-key" type="password" value="${esc(s.replicateKey)}">
                    <label>Model Version</label>
                    <input id="qig-replicate-model" type="text" value="${esc(s.replicateModel)}" placeholder="stability-ai/sdxl:...">
                    <small style="opacity:0.6;font-size:10px;">owner/model:version format from the Replicate model page</small>
                </div>

                <div id="qig-fal-settings" class="qig-provider-section">
                    <label>Fal.ai API Key</label>
                    <input id="qig-fal-key" type="password" value="${esc(s.falKey)}">
                    <label>Model Endpoint</label>
                    <input id="qig-fal-model" type="text" value="${esc(s.falModel)}" placeholder="fal-ai/flux/schnell">
                    <small style="opacity:0.6;font-size:10px;">Model path from the Fal.ai dashboard (e.g., fal-ai/flux/schnell)</small>
                </div>

                <div id="qig-together-settings" class="qig-provider-section">
                    <label>Together AI API Key</label>
                    <input id="qig-together-key" type="password" value="${esc(s.togetherKey)}">
                    <label>Model</label>
                    <input id="qig-together-model" type="text" value="${esc(s.togetherModel)}" placeholder="stabilityai/stable-diffusion-xl-base-1.0">
                </div>
                
                <div id="qig-local-settings" class="qig-provider-section">
                    <label>Local URL</label>
                    <input id="qig-local-url" type="text" value="${esc(s.localUrl)}" placeholder="http://127.0.0.1:7860">
                    <label>Type</label>
                    <select id="qig-local-type">
                        <option value="a1111" ${s.localType === "a1111" ? "selected" : ""}>Automatic1111</option>
                        <option value="comfyui" ${s.localType === "comfyui" ? "selected" : ""}>ComfyUI</option>
                    </select>
                    <div id="qig-local-comfyui-opts" style="display:${s.localType === "comfyui" ? "block" : "none"}">
                         <label>Model</label>
                         <div style="display:flex;gap:4px;align-items:center;">
                             <select id="qig-local-model" style="flex:1;">
                                 <option value="${esc(s.localModel)}" selected>${esc(s.localModel || "-- Click Refresh --")}</option>
                             </select>
                             <button id="qig-comfy-model-refresh" class="menu_button" style="padding:4px 8px;" title="Refresh model list">🔄</button>
                         </div>
                         <div class="form-hint">Click Refresh to load checkpoints (standard mode) or diffusion UNETs (Flux/UNET mode) from ComfyUI, or type a model manually.</div>
                         <div class="qig-row">
                            <div><label>Denoise</label><input id="qig-comfy-denoise" type="number" value="${esc(s.comfyDenoise ?? 1.0)}" min="0" max="1" step="0.05"><small style="opacity:0.6;font-size:10px;">1.0 = full txt2img. For img2img: upload a Reference Image below and set Denoise &lt; 1.0</small></div>
                            <div><label>CLIP Skip</label><input id="qig-comfy-clip" type="number" value="${esc(s.comfyClipSkip || 1)}" min="1" max="12" step="1"><small style="opacity:0.6;font-size:10px;">1 for most models, 2 for anime/NAI-based</small></div>
                         </div>
                         <label>Scheduler</label>
                         <select id="qig-comfy-scheduler">${COMFY_SCHEDULERS.map(x => `<option value="${x}" ${s.comfyScheduler === x ? "selected" : ""}>${x}</option>`).join("")}</select>
                         <small style="opacity:0.6;font-size:10px;">Noise schedule for the sampler — karras is popular for DPM++, normal for others</small>
                         <label>Timeout (seconds)</label>
                         <input id="qig-comfy-timeout" type="number" value="${esc(s.comfyTimeout || 300)}" min="10" max="1800">
                         <small style="opacity:0.6;font-size:10px;">How long SillyTavern waits for ComfyUI to finish before giving up.</small>
                         <label style="display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;">
                            <input id="qig-comfy-upscale" type="checkbox" ${s.comfyUpscale ? "checked" : ""}>
                            <span>Upscale Output</span>
                            <small style="opacity:0.6;font-size:10px;">(run upscale model after generation)</small>
                         </label>
                         <div id="qig-comfy-upscale-opts" style="display:${s.comfyUpscale ? 'block' : 'none'}; margin-left:24px; border-left:2px solid rgba(255,255,255,0.1); padding-left:10px;">
                             <label>Upscale Model</label>
                             <input id="qig-comfy-upscale-model" type="text" value="${esc(s.comfyUpscaleModel || "RealESRGAN_x4plus.pth")}" placeholder="RealESRGAN_x4plus.pth">
                             <small style="opacity:0.6;font-size:10px;">Must match filename in ComfyUI models/upscale_models/</small>
                         </div>
                         <label style="display:flex;align-items:center;gap:6px;margin:6px 0;cursor:pointer;">
                            <input id="qig-comfy-skip-neg" type="checkbox" ${s.comfySkipNegativePrompt ? "checked" : ""}>
                            <span>Skip Negative Prompt</span>
                            <small style="opacity:0.6;font-size:10px;">(for Flux/UNET-only models that don't use negative conditioning)</small>
                         </label>
                         <div id="qig-comfy-flux-opts" style="display:${s.comfySkipNegativePrompt ? 'block' : 'none'}; margin-left:24px; border-left:2px solid rgba(255,255,255,0.1); padding-left:10px;">
                            <div class="form-hint">UNET-only models need separate CLIP and VAE loaders. Leave blank if your checkpoint already includes CLIP+VAE (full Flux checkpoints).</div>
                            <div class="qig-row">
                                <div><label>CLIP Model 1</label><input id="qig-comfy-flux-clip1" type="text" value="${esc(s.comfyFluxClipModel1 || "")}" placeholder="t5xxl_fp16.safetensors"><small style="opacity:0.6;font-size:10px;">From models/text_encoders/</small></div>
                                <div><label>CLIP Model 2</label><input id="qig-comfy-flux-clip2" type="text" value="${esc(s.comfyFluxClipModel2 || "")}" placeholder="clip_l.safetensors"><small style="opacity:0.6;font-size:10px;">From models/text_encoders/ (leave blank if single-CLIP)</small></div>
                            </div>
                            <label>CLIP Type</label>
                            <input id="qig-comfy-flux-clip-type" type="text" value="${esc(s.comfyFluxClipType || "flux")}" placeholder="flux">
                            <small style="opacity:0.6;font-size:10px;">DualCLIP (2 models): flux, sdxl, sd3, hunyuan_video. SingleCLIP (1 model): flux2, sd3, stable_diffusion, qwen_image, hunyuan_image, etc.</small>
                            <label>VAE Model</label>
                            <input id="qig-comfy-flux-vae" type="text" value="${esc(s.comfyFluxVaeModel || "")}" placeholder="ae.safetensors">
                            <small style="opacity:0.6;font-size:10px;">From models/vae/. Required for UNET-only models.</small>
                         </div>
                         <label>LoRAs (filename:weight, comma-separated)</label>
                         <small style="opacity:0.6;font-size:10px;">Always applied. For scene-specific LoRAs, use Contextual Filters. Filename must match your ComfyUI loras folder.</small>
                         <input id="qig-comfy-loras" type="text" value="${esc(s.comfyLoras || "")}" placeholder="my_lora.safetensors:0.8, style_lora.safetensors:0.6">
                         <label>Workflow Preset</label>
                         <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                             <select id="qig-comfy-workflow-select" style="flex:1;min-width:180px;">${comfyWorkflowPresetOpts}</select>
                             <button id="qig-comfy-workflow-load" class="menu_button" style="padding:2px 8px;">📂 Load</button>
                             <button id="qig-comfy-workflow-save-as" class="menu_button" style="padding:2px 8px;">💾 Save As</button>
                             <button id="qig-comfy-workflow-update" class="menu_button" style="padding:2px 8px;">♻️ Update</button>
                             <button id="qig-comfy-workflow-del" class="menu_button" style="padding:2px 8px;">🗑️</button>
                         </div>
                         <small style="opacity:0.6;font-size:10px;">Use presets for quick graph switching (e.g., with LoRA / without LoRA). Profiles save provider settings; workflow presets focus on Comfy graph fields.</small>
                         <label>Custom Workflow JSON</label>
                         <textarea id="qig-comfy-workflow" rows="3" placeholder='Paste workflow from ComfyUI "Save (API Format)". Use placeholders: %prompt%, %negative%, %seed%, %width%, %height%, %steps%, %cfg%, %denoise%, %clip_skip%, %sampler%, %scheduler%, %model%, %reference_image%'>${esc(s.comfyWorkflow || "")}</textarea>
                         <div class="form-hint">Optional for standard SD1.5/SDXL checkpoints. Required for non-standard pipelines (Flux/UNET-only, dual-CLIP, custom node graphs). Export from ComfyUI: Save → API Format. Use %reference_image% in a LoadImage node to include the uploaded reference image.</div>
                    </div>
                    <div id="qig-local-a1111-opts" style="display:${s.localType === "a1111" ? "block" : "none"}">
                         <label>Model</label>
                         <div style="display:flex;gap:4px;align-items:center;">
                             <select id="qig-a1111-model" style="flex:1;">
                                 <option value="">-- Click Refresh to load models --</option>
                             </select>
                             <button id="qig-a1111-model-refresh" class="menu_button" style="padding:4px 8px;" title="Refresh model list">🔄</button>
                         </div>
                         <label>LoRAs (name:weight, comma-separated)</label>
                         <small style="opacity:0.6;font-size:10px;">Always applied. For scene-specific LoRAs, use Contextual Filters.</small>
                         <input id="qig-a1111-loras" type="text" value="${esc(s.a1111Loras || "")}" placeholder="my_lora:0.8, detail_lora:0.6">
                         <label>VAE</label>
                         <select id="qig-a1111-vae">
                             <option value="" ${!s.a1111Vae ? "selected" : ""}>Automatic</option>
                         </select>
                         <small style="opacity:0.6;font-size:10px;">Override model's built-in VAE. Click Refresh to populate list.</small>
                         <div class="qig-row" style="margin-top:8px;">
                            <div><label>CLIP Skip</label><input id="qig-a1111-clip" type="number" value="${esc(s.a1111ClipSkip || 1)}" min="1" max="12" step="1"><small style="opacity:0.6;font-size:10px;">1 for most models, 2 for anime/NAI-based</small></div>
                            <div><label>Scheduler</label><select id="qig-a1111-scheduler">${A1111_SCHEDULERS.map(x => `<option value="${x}" ${s.a1111Scheduler === x ? "selected" : ""}>${x}</option>`).join("")}</select><small style="opacity:0.6;font-size:10px;">Noise schedule (A1111 1.6+)</small></div>
                         </div>
                         <div class="qig-row" style="margin-top:4px;">
                            <label class="checkbox_label" style="flex:1;">
                                <input id="qig-a1111-restore-faces" type="checkbox" ${s.a1111RestoreFaces ? "checked" : ""}>
                                <span>Restore Faces</span>
                            </label>
                            <label class="checkbox_label" style="flex:1;">
                                <input id="qig-a1111-tiling" type="checkbox" ${s.a1111Tiling ? "checked" : ""}>
                                <span>Tiling</span>
                            </label>
                         </div>
                         <div class="qig-row" style="margin-top:4px;">
                             <div><label>Variation Seed</label><input id="qig-a1111-subseed" type="number" value="${esc(s.a1111Subseed ?? -1)}"><small style="opacity:0.6;font-size:10px;">-1 = random. Blends with main seed</small></div>
                             <div><label>Variation Strength</label><input id="qig-a1111-subseed-strength" type="number" value="${esc(s.a1111SubseedStrength ?? 0)}" min="0" max="1" step="0.05"><small style="opacity:0.6;font-size:10px;">0 = no effect, 1 = full variation</small></div>
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-hires" type="checkbox" ${s.a1111HiresFix ? "checked" : ""}>
                             <span>Hires Fix (generate at low res, then upscale for detail)</span>
                         </label>
                         <div id="qig-a1111-hires-opts" style="display:${s.a1111HiresFix ? 'block' : 'none'}">
                             <label>Upscaler</label>
                             <select id="qig-a1111-hires-upscaler">
                                 <option value="Latent" selected>Latent</option>
                             </select>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Scale</label><input id="qig-a1111-hires-scale" type="number" value="${esc(s.a1111HiresScale || 2)}" min="1" max="4" step="0.25"></div>
                                 <div><label>2nd Pass Steps (0=same)</label><input id="qig-a1111-hires-steps" type="number" value="${esc(s.a1111HiresSteps || 0)}" min="0" max="150"></div>
                             </div>
                             <label>Denoise: <span id="qig-a1111-hires-denoise-val">${s.a1111HiresDenoise || 0.55}</span></label>
                             <input id="qig-a1111-hires-denoise" type="range" min="0" max="1" step="0.05" value="${esc(s.a1111HiresDenoise || 0.55)}">
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Hires Sampler</label><select id="qig-a1111-hires-sampler"><option value="" ${!s.a1111HiresSampler ? "selected" : ""}>Same as first pass</option>${Object.entries(SAMPLER_DISPLAY_NAMES).map(([k,v]) => `<option value="${v}" ${s.a1111HiresSampler === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
                                 <div><label>Hires Scheduler</label><select id="qig-a1111-hires-scheduler"><option value="" ${!s.a1111HiresScheduler ? "selected" : ""}>Same as first pass</option>${A1111_SCHEDULERS.map(x => `<option value="${x}" ${s.a1111HiresScheduler === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
                             </div>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Resize W (0=use scale)</label><input id="qig-a1111-hires-resize-x" type="number" value="${esc(s.a1111HiresResizeX || 0)}" min="0" max="4096" step="8"></div>
                                 <div><label>Resize H (0=use scale)</label><input id="qig-a1111-hires-resize-y" type="number" value="${esc(s.a1111HiresResizeY || 0)}" min="0" max="4096" step="8"></div>
                             </div>
                             <label>Hires Prompt (optional)</label>
                             <input id="qig-a1111-hires-prompt" type="text" value="${esc(s.a1111HiresPrompt || "")}" placeholder="Leave empty to use main prompt">
                             <label>Hires Negative (optional)</label>
                             <input id="qig-a1111-hires-negative" type="text" value="${esc(s.a1111HiresNegative || "")}" placeholder="Leave empty to use main negative">
                         </div>
                         <label class="checkbox_label">
                             <input id="qig-a1111-adetailer" type="checkbox" ${s.a1111Adetailer ? "checked" : ""}>
                             <span>ADetailer (auto-detect and fix faces/hands)</span>
                         </label>
                         <div id="qig-a1111-adetailer-opts" style="display:${s.a1111Adetailer ? 'block' : 'none'}">
                             <label>ADetailer Model</label>
                             <select id="qig-a1111-adetailer-model">
                                 <option value="face_yolov8n.pt" ${s.a1111AdetailerModel === "face_yolov8n.pt" ? "selected" : ""}>Face YOLOv8n</option>
                                 <option value="face_yolov8s.pt" ${s.a1111AdetailerModel === "face_yolov8s.pt" ? "selected" : ""}>Face YOLOv8s</option>
                                 <option value="hand_yolov8n.pt" ${s.a1111AdetailerModel === "hand_yolov8n.pt" ? "selected" : ""}>Hand YOLOv8n</option>
                                 <option value="person_yolov8n-seg.pt" ${s.a1111AdetailerModel === "person_yolov8n-seg.pt" ? "selected" : ""}>Person YOLOv8n</option>
                                 <option value="mediapipe_face_full" ${s.a1111AdetailerModel === "mediapipe_face_full" ? "selected" : ""}>MediaPipe Face Full</option>
                                 <option value="mediapipe_face_short" ${s.a1111AdetailerModel === "mediapipe_face_short" ? "selected" : ""}>MediaPipe Face Short</option>
                             </select>
                             <label>ADetailer Prompt (optional)</label>
                             <input id="qig-a1111-ad-prompt" type="text" value="${esc(s.a1111AdetailerPrompt || "")}" placeholder="Leave empty to use main prompt">
                             <label>ADetailer Negative (optional)</label>
                             <input id="qig-a1111-ad-negative" type="text" value="${esc(s.a1111AdetailerNegative || "")}" placeholder="Leave empty to use main negative">
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Denoise</label><input id="qig-a1111-ad-denoise" type="number" value="${esc(s.a1111AdetailerDenoise ?? 0.4)}" min="0" max="1" step="0.05"><small style="opacity:0.6;font-size:10px;">Inpaint strength for detected regions</small></div>
                                 <div><label>Confidence</label><input id="qig-a1111-ad-confidence" type="number" value="${esc(s.a1111AdetailerConfidence ?? 0.3)}" min="0" max="1" step="0.05"><small style="opacity:0.6;font-size:10px;">Detection threshold (lower = more detections)</small></div>
                             </div>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Mask Blur</label><input id="qig-a1111-ad-mask-blur" type="number" value="${esc(s.a1111AdetailerMaskBlur ?? 4)}" min="0" max="64" step="1"></div>
                                 <div><label>Dilate/Erode</label><input id="qig-a1111-ad-dilate" type="number" value="${esc(s.a1111AdetailerDilateErode ?? 4)}" min="-128" max="128" step="1"><small style="opacity:0.6;font-size:10px;">Positive = expand mask, negative = shrink</small></div>
                             </div>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Inpaint Padding</label><input id="qig-a1111-ad-inpaint-padding" type="number" value="${esc(s.a1111AdetailerInpaintPadding ?? 32)}" min="0" max="256" step="4"></div>
                                 <label class="checkbox_label" style="flex:1;margin-top:auto;">
                                     <input id="qig-a1111-ad-inpaint-only" type="checkbox" ${s.a1111AdetailerInpaintOnlyMasked ? "checked" : ""}>
                                     <span>Inpaint Only Masked</span>
                                 </label>
                             </div>
                             <hr style="margin:8px 0;opacity:0.15;">
                             <label class="checkbox_label">
                                 <input id="qig-a1111-ad2-enable" type="checkbox" ${s.a1111Adetailer2 ? "checked" : ""}>
                                 <span>ADetailer Unit 2 (e.g. hands)</span>
                             </label>
                             <div id="qig-a1111-ad2-opts" style="display:${s.a1111Adetailer2 ? 'block' : 'none'}; margin-left:12px; border-left:2px solid rgba(255,255,255,0.1); padding-left:10px;">
                                 <label>Model</label>
                                 <select id="qig-a1111-ad2-model">
                                     <option value="face_yolov8n.pt" ${s.a1111Adetailer2Model === "face_yolov8n.pt" ? "selected" : ""}>Face YOLOv8n</option>
                                     <option value="face_yolov8s.pt" ${s.a1111Adetailer2Model === "face_yolov8s.pt" ? "selected" : ""}>Face YOLOv8s</option>
                                     <option value="hand_yolov8n.pt" ${s.a1111Adetailer2Model === "hand_yolov8n.pt" ? "selected" : ""}>Hand YOLOv8n</option>
                                     <option value="person_yolov8n-seg.pt" ${s.a1111Adetailer2Model === "person_yolov8n-seg.pt" ? "selected" : ""}>Person YOLOv8n</option>
                                     <option value="mediapipe_face_full" ${s.a1111Adetailer2Model === "mediapipe_face_full" ? "selected" : ""}>MediaPipe Face Full</option>
                                     <option value="mediapipe_face_short" ${s.a1111Adetailer2Model === "mediapipe_face_short" ? "selected" : ""}>MediaPipe Face Short</option>
                                 </select>
                                 <label>Prompt (optional)</label>
                                 <input id="qig-a1111-ad2-prompt" type="text" value="${esc(s.a1111Adetailer2Prompt || "")}" placeholder="Leave empty to use main prompt">
                                 <label>Negative (optional)</label>
                                 <input id="qig-a1111-ad2-negative" type="text" value="${esc(s.a1111Adetailer2Negative || "")}" placeholder="Leave empty to use main negative">
                                 <div class="qig-row" style="margin-top:4px;">
                                     <div><label>Denoise</label><input id="qig-a1111-ad2-denoise" type="number" value="${esc(s.a1111Adetailer2Denoise ?? 0.4)}" min="0" max="1" step="0.05"></div>
                                     <div><label>Confidence</label><input id="qig-a1111-ad2-confidence" type="number" value="${esc(s.a1111Adetailer2Confidence ?? 0.3)}" min="0" max="1" step="0.05"></div>
                                 </div>
                                 <div class="qig-row" style="margin-top:4px;">
                                     <div><label>Mask Blur</label><input id="qig-a1111-ad2-mask-blur" type="number" value="${esc(s.a1111Adetailer2MaskBlur ?? 4)}" min="0" max="64" step="1"></div>
                                     <div><label>Dilate/Erode</label><input id="qig-a1111-ad2-dilate" type="number" value="${esc(s.a1111Adetailer2DilateErode ?? 4)}" min="-128" max="128" step="1"></div>
                                 </div>
                                 <div class="qig-row" style="margin-top:4px;">
                                     <div><label>Inpaint Padding</label><input id="qig-a1111-ad2-inpaint-padding" type="number" value="${esc(s.a1111Adetailer2InpaintPadding ?? 32)}" min="0" max="256" step="4"></div>
                                     <label class="checkbox_label" style="flex:1;margin-top:auto;">
                                         <input id="qig-a1111-ad2-inpaint-only" type="checkbox" ${s.a1111Adetailer2InpaintOnlyMasked ? "checked" : ""}>
                                         <span>Inpaint Only Masked</span>
                                     </label>
                                 </div>
                             </div>
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-save-webui" type="checkbox" ${s.a1111SaveToWebUI ? "checked" : ""}>
                             <span>Save images to WebUI output folder</span>
                         </label>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-ipadapter" type="checkbox" ${s.a1111IpAdapter ? "checked" : ""}>
                             <span>IP-Adapter (use a reference image to guide style/composition)</span>
                         </label>
                         <div id="qig-a1111-ipadapter-opts" style="display:${s.a1111IpAdapter ? 'block' : 'none'}">
                             <label>IP-Adapter Model</label>
                             <select id="qig-a1111-ipadapter-mode">
                                 <option value="ip-adapter-faceid-portrait_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait_sd15" ? "selected" : ""}>FaceID Portrait (SD1.5)</option>
                                 <option value="ip-adapter-faceid-portrait-v11_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait-v11_sd15" ? "selected" : ""}>FaceID Portrait v1.1 (SD1.5)</option>
                                 <option value="ip-adapter-faceid_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid_sd15" ? "selected" : ""}>FaceID (SD1.5)</option>
                                 <option value="ip-adapter-faceid-plusv2_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid-plusv2_sd15" ? "selected" : ""}>FaceID Plus v2 (SD1.5)</option>
                                 <option value="ip-adapter-faceid-portrait_sdxl" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait_sdxl" ? "selected" : ""}>FaceID Portrait (SDXL)</option>
                                 <option value="ip-adapter-faceid-portrait_sdxl_unnorm" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait_sdxl_unnorm" ? "selected" : ""}>FaceID Portrait Unnorm (SDXL)</option>
                                 <option value="ip-adapter-faceid_sdxl" ${s.a1111IpAdapterMode === "ip-adapter-faceid_sdxl" ? "selected" : ""}>FaceID (SDXL)</option>
                                 <option value="ip-adapter-faceid-plusv2_sdxl" ${s.a1111IpAdapterMode === "ip-adapter-faceid-plusv2_sdxl" ? "selected" : ""}>FaceID Plus v2 (SDXL)</option>
                             </select>
                             <label>Weight: <span id="qig-a1111-ipadapter-weight-val">${s.a1111IpAdapterWeight || 0.7}</span></label>
                             <input id="qig-a1111-ipadapter-weight" type="range" min="0" max="1.5" step="0.05" value="${esc(s.a1111IpAdapterWeight || 0.7)}">
                             
                             <label class="checkbox_label" style="margin-top:4px;">
                                 <input id="qig-a1111-ipadapter-pixel" type="checkbox" ${s.a1111IpAdapterPixelPerfect ? "checked" : ""}>
                                 <span>Pixel Perfect</span>
                             </label>

                             <div class="qig-row" style="margin-top:4px;">
                                 <div>
                                     <label>Control Mode</label>
                                     <select id="qig-a1111-ipadapter-control">
                                         <option value="Balanced" ${s.a1111IpAdapterControlMode === "Balanced" ? "selected" : ""}>Balanced</option>
                                         <option value="My prompt is more important" ${s.a1111IpAdapterControlMode === "My prompt is more important" ? "selected" : ""}>Prompt Priority</option>
                                         <option value="ControlNet is more important" ${s.a1111IpAdapterControlMode === "ControlNet is more important" ? "selected" : ""}>ControlNet Priority</option>
                                     </select>
                                 </div>
                                 <div>
                                     <label>Resize Mode</label>
                                     <select id="qig-a1111-ipadapter-resize">
                                         <option value="Just Resize" ${s.a1111IpAdapterResizeMode === "Just Resize" ? "selected" : ""}>Just Resize</option>
                                         <option value="Crop and Resize" ${s.a1111IpAdapterResizeMode === "Crop and Resize" ? "selected" : ""}>Crop & Resize</option>
                                         <option value="Resize and Fill" ${s.a1111IpAdapterResizeMode === "Resize and Fill" ? "selected" : ""}>Resize & Fill</option>
                                     </select>
                                 </div>
                             </div>

                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Start Step</label><input id="qig-a1111-ipadapter-start" type="number" min="0" max="1" step="0.05" value="${esc(s.a1111IpAdapterStartStep ?? 0)}"></div>
                                 <div><label>End Step</label><input id="qig-a1111-ipadapter-end" type="number" min="0" max="1" step="0.05" value="${esc(s.a1111IpAdapterEndStep ?? 1)}"></div>
                             </div>
                             <div class="form-hint">Requires ControlNet + IP-Adapter extension with FaceID models</div>
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-controlnet" type="checkbox" ${s.a1111ControlNet ? "checked" : ""}>
                             <span>ControlNet (structural guidance from a control image)</span>
                         </label>
                         <div id="qig-a1111-controlnet-opts" style="display:${s.a1111ControlNet ? 'block' : 'none'}">
                             <label>ControlNet Model</label>
                             <select id="qig-a1111-cn-model">
                                 <option value="">-- Click Refresh to load models --</option>
                             </select>
                             <label>Preprocessor</label>
                             <select id="qig-a1111-cn-module">
                                 <option value="none" ${s.a1111ControlNetModule === "none" ? "selected" : ""}>none</option>
                                 <option value="canny" ${s.a1111ControlNetModule === "canny" ? "selected" : ""}>canny</option>
                                 <option value="depth_midas" ${s.a1111ControlNetModule === "depth_midas" ? "selected" : ""}>depth_midas</option>
                                 <option value="depth_zoe" ${s.a1111ControlNetModule === "depth_zoe" ? "selected" : ""}>depth_zoe</option>
                                 <option value="openpose" ${s.a1111ControlNetModule === "openpose" ? "selected" : ""}>openpose</option>
                                 <option value="openpose_full" ${s.a1111ControlNetModule === "openpose_full" ? "selected" : ""}>openpose_full</option>
                                 <option value="lineart" ${s.a1111ControlNetModule === "lineart" ? "selected" : ""}>lineart</option>
                                 <option value="lineart_anime" ${s.a1111ControlNetModule === "lineart_anime" ? "selected" : ""}>lineart_anime</option>
                                 <option value="softedge_pidinet" ${s.a1111ControlNetModule === "softedge_pidinet" ? "selected" : ""}>softedge_pidinet</option>
                                 <option value="scribble_pidinet" ${s.a1111ControlNetModule === "scribble_pidinet" ? "selected" : ""}>scribble_pidinet</option>
                                 <option value="normal_bae" ${s.a1111ControlNetModule === "normal_bae" ? "selected" : ""}>normal_bae</option>
                                 <option value="shuffle" ${s.a1111ControlNetModule === "shuffle" ? "selected" : ""}>shuffle</option>
                                 <option value="tile_resample" ${s.a1111ControlNetModule === "tile_resample" ? "selected" : ""}>tile_resample</option>
                                 <option value="inpaint_only" ${s.a1111ControlNetModule === "inpaint_only" ? "selected" : ""}>inpaint_only</option>
                             </select>
                             <label>Weight: <span id="qig-a1111-cn-weight-val">${s.a1111ControlNetWeight ?? 1.0}</span></label>
                             <input id="qig-a1111-cn-weight" type="range" min="0" max="2" step="0.05" value="${esc(s.a1111ControlNetWeight ?? 1.0)}">
                             <label class="checkbox_label" style="margin-top:4px;">
                                 <input id="qig-a1111-cn-pixel" type="checkbox" ${s.a1111ControlNetPixelPerfect ? "checked" : ""}>
                                 <span>Pixel Perfect</span>
                             </label>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div>
                                     <label>Control Mode</label>
                                     <select id="qig-a1111-cn-control">
                                         <option value="Balanced" ${s.a1111ControlNetControlMode === "Balanced" ? "selected" : ""}>Balanced</option>
                                         <option value="My prompt is more important" ${s.a1111ControlNetControlMode === "My prompt is more important" ? "selected" : ""}>Prompt Priority</option>
                                         <option value="ControlNet is more important" ${s.a1111ControlNetControlMode === "ControlNet is more important" ? "selected" : ""}>ControlNet Priority</option>
                                     </select>
                                 </div>
                                 <div>
                                     <label>Resize Mode</label>
                                     <select id="qig-a1111-cn-resize">
                                         <option value="Just Resize" ${s.a1111ControlNetResizeMode === "Just Resize" ? "selected" : ""}>Just Resize</option>
                                         <option value="Crop and Resize" ${s.a1111ControlNetResizeMode === "Crop and Resize" ? "selected" : ""}>Crop & Resize</option>
                                         <option value="Resize and Fill" ${s.a1111ControlNetResizeMode === "Resize and Fill" ? "selected" : ""}>Resize & Fill</option>
                                     </select>
                                 </div>
                             </div>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Guidance Start</label><input id="qig-a1111-cn-start" type="number" min="0" max="1" step="0.05" value="${esc(s.a1111ControlNetGuidanceStart ?? 0)}"></div>
                                 <div><label>Guidance End</label><input id="qig-a1111-cn-end" type="number" min="0" max="1" step="0.05" value="${esc(s.a1111ControlNetGuidanceEnd ?? 1)}"></div>
                             </div>
                             <label>Control Image</label>
                             <div style="display:flex;gap:4px;align-items:center;">
                                 <img id="qig-a1111-cn-preview" src="${esc(s.a1111ControlNetImage || '')}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;display:${s.a1111ControlNetImage ? 'block' : 'none'};background:#333;">
                                 <button id="qig-a1111-cn-upload-btn" class="menu_button" style="flex:1;">📎 Upload Control Image</button>
                                 <button id="qig-a1111-cn-clear-btn" class="menu_button" style="width:30px;color:#e94560;display:${s.a1111ControlNetImage ? 'block' : 'none'};">×</button>
                             </div>
                             <input type="file" id="qig-a1111-cn-upload" accept="image/*" style="display:none">
                             <div class="form-hint">Upload a preprocessed control image (edge map, depth map, pose, etc.) or let the preprocessor extract it</div>
                         </div>
                    </div>
                    <hr style="margin:8px 0;opacity:0.2;">
                    <label>Reference Image</label>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <img id="qig-local-ref-preview" src="${esc(s.localRefImage || '')}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;display:${s.localRefImage ? 'block' : 'none'};background:#333;">
                        <button id="qig-local-ref-btn" class="menu_button" style="flex:1;">📎 Upload Source</button>
                        <button id="qig-local-ref-clear" class="menu_button" style="width:30px;color:#e94560;display:${s.localRefImage ? 'block' : 'none'};">×</button>
                    </div>
                    <input type="file" id="qig-local-ref-input" accept="image/*" style="display:none">
                    <div id="qig-local-denoise-wrap" style="display:${s.localType === "a1111" && s.localRefImage ? "block" : "none"};margin-top:4px;">
                       <label>Denoising Strength: <span id="qig-local-denoise-val">${s.localDenoise}</span></label>
                       <input id="qig-local-denoise" type="range" min="0" max="1" step="0.05" value="${esc(s.localDenoise)}">
                    </div>
                    <div class="form-hint" style="margin-top:4px;">Upload a source image for img2img. ${s.localType === "comfyui" ? "Use the Denoise slider in ComfyUI settings above to control strength." : "Adjust Denoising Strength to control how much the output differs."}</div>
                </div>
                
                <div id="qig-proxy-settings" class="qig-provider-section">
                    <label>Proxy URL</label>
                    <input id="qig-proxy-url" type="text" value="${esc(s.proxyUrl)}" placeholder="https://proxy.com/v1">
                    <label>API Key (optional)</label>
                    <input id="qig-proxy-key" type="password" value="${esc(s.proxyKey)}">
                    <label class="checkbox_label">
                        <input id="qig-proxy-comfy-mode" type="checkbox" ${s.proxyComfyMode ? "checked" : ""}>
                        <span>ComfyUI Proxy Mode</span>
                    </label>
                    <div id="qig-proxy-comfy-opts" style="display:${s.proxyComfyMode ? "block" : "none"}">
                        <small style="opacity:0.6;font-size:10px;">Connects to a ComfyUI proxy server (GET /prompt/{text}?token=key → PNG). URL and API Key above are reused as the proxy address and token.</small>
                        <label>Timeout (seconds)</label>
                        <input id="qig-proxy-comfy-timeout" type="number" value="${esc(s.proxyComfyTimeout || 300)}" min="10" max="600">
                        <label>Prompt Node ID (optional)</label>
                        <input id="qig-proxy-comfy-node-id" type="text" value="${esc(s.proxyComfyNodeId || "")}" placeholder="e.g. 972">
                        <small style="opacity:0.6;font-size:10px;">Sent as query param if your proxy supports it</small>
                        <label>Workflow JSON (optional)</label>
                        <textarea id="qig-proxy-comfy-workflow" rows="3" placeholder="Paste workflow_api.json or leave empty to use server default">${esc(s.proxyComfyWorkflow || "")}</textarea>
                    </div>
                    <div id="qig-proxy-standard-opts" style="display:${s.proxyComfyMode ? "none" : "block"}">
                    <label>Model</label>
                    <input id="qig-proxy-model" type="text" value="${esc(s.proxyModel)}" placeholder="PixAI model ID">
                    <label>LoRAs (id:weight, comma-separated)</label>
                    <small style="opacity:0.6;font-size:10px;">Always applied. For scene-specific LoRAs, use Contextual Filters.</small>
                    <input id="qig-proxy-loras" type="text" value="${esc(s.proxyLoras || "")}" placeholder="123456:0.8, 789012:0.6">
                    <div class="qig-row">
                        <div><label>Steps</label><input id="qig-proxy-steps" type="number" value="${esc(s.proxySteps || 25)}" min="8" max="50"></div>
                        <div><label>CFG</label><input id="qig-proxy-cfg" type="number" value="${esc(s.proxyCfg || 6)}" min="1" max="15" step="0.5"></div>
                        <div><label>Seed</label><input id="qig-proxy-seed" type="number" value="${esc(s.proxySeed ?? -1)}"></div>
                    </div>
                    <label>Sampler</label>
                    <select id="qig-proxy-sampler">
                        <option value="Euler a" ${s.proxySampler === "Euler a" ? "selected" : ""}>Euler a</option>
                        <option value="Euler" ${s.proxySampler === "Euler" ? "selected" : ""}>Euler</option>
                        <option value="DPM++ 2M Karras" ${s.proxySampler === "DPM++ 2M Karras" ? "selected" : ""}>DPM++ 2M Karras</option>
                        <option value="DPM++ SDE Karras" ${s.proxySampler === "DPM++ SDE Karras" ? "selected" : ""}>DPM++ SDE Karras</option>
                        <option value="DPM++ 2M SDE Karras" ${s.proxySampler === "DPM++ 2M SDE Karras" ? "selected" : ""}>DPM++ 2M SDE Karras</option>
                        <option value="DDIM" ${s.proxySampler === "DDIM" ? "selected" : ""}>DDIM</option>
                    </select>
                    <label class="checkbox_label">
                        <input id="qig-proxy-facefix" type="checkbox" ${s.proxyFacefix ? "checked" : ""}>
                        <span>Enable Face Fix (PixAI ADetailer)</span>
                    </label>
                    <label>Extra Instructions</label>
                    <textarea id="qig-proxy-extra" rows="2" placeholder="Additional instructions for the image model...">${esc(s.proxyExtraInstructions || "")}</textarea>
                    <label>Reference Images (up to 15)</label>
                    <div id="qig-proxy-refs" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;"></div>
                    <input type="file" id="qig-proxy-ref-input" accept="image/*" multiple style="display:none">
                    <button id="qig-proxy-ref-btn" class="menu_button" style="padding:4px 8px;">📎 Add Reference Images</button>
                    </div>
                </div>
                
                <hr style="margin:8px 0;opacity:0.2;">
                <div class="inline-drawer" style="margin:4px 0;">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b style="font-size:12px;">Prompt & Templates</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <small style="opacity:0.7;">Base prompt used for direct generation, or as scene context when LLM prompt is enabled</small>
                        <label>Prompt <button id="qig-save-template" class="menu_button" style="float:right;padding:2px 8px;font-size:11px;" title="Save the current prompt text as a reusable template">💾 Save Template</button></label>
                        <textarea id="qig-prompt" rows="2">${esc(s.prompt)}</textarea>
                        <div id="qig-templates" style="margin:4px 0;"></div>
                        <div style="display:flex;gap:4px;margin:4px 0;">
                            <button id="qig-save-preset" class="menu_button" style="padding:2px 8px;font-size:11px;" title="Save all generation settings (prompt, negative, size, steps, etc.) as a preset">💾 Save Preset</button>
                            <button id="qig-export-btn" class="menu_button" style="padding:2px 8px;font-size:11px;">Export</button>
                            <button id="qig-import-btn" class="menu_button" style="padding:2px 8px;font-size:11px;">Import</button>
                        </div>
                        <div id="qig-presets" style="margin:4px 0;"></div>
                        <small style="opacity:0.6;font-size:10px;">Profiles save provider config · Templates save prompt text · Presets save all settings</small>
                    </div>
                </div>
                <hr style="margin:8px 0;opacity:0.2;">
                <div class="inline-drawer" style="margin:4px 0;">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b style="font-size:12px;">Contextual Filters</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <small style="opacity:0.7;">Open a larger manager to organize pools, character-scoped filters, and per-filter seed overrides.</small>
                        <div id="qig-contextual-filters" style="margin:4px 0;"></div>
                    </div>
                </div>
                <label>Negative Prompt</label>
                <small style="opacity:0.6;font-size:10px;">Things to avoid in the image (e.g., "bad hands, blurry, watermark")</small>
                <textarea id="qig-negative" rows="2">${esc(s.negativePrompt)}</textarea>
                
                <label>Quality Tags</label>
                <small style="opacity:0.6;font-size:10px;">Tags prepended to every prompt to improve output quality</small>
                <textarea id="qig-quality" rows="1">${esc(s.qualityTags)}</textarea>
                <label class="checkbox_label">
                    <input id="qig-append-quality" type="checkbox" ${s.appendQuality ? "checked" : ""}>
                    <span>Prepend quality tags to prompt</span>
                </label>
                <label class="checkbox_label">
                    <input id="qig-use-last" type="checkbox" ${s.useLastMessage ? "checked" : ""}>
                    <span>Use chat message as prompt</span>
                </label>
                <small style="opacity:0.6;font-size:10px;">Feeds the selected chat message to the image generator as scene context</small>
                <div id="qig-msg-index-wrap" style="display:${s.useLastMessage ? "block" : "none"}">
                    <label>Message selection</label>
                    <input id="qig-msg-range" type="text" value="${esc(s.messageRange)}" placeholder="-1"
                           title="-1 (last), 5 (single), 3-7 (range), 3,5,7 (specific), last5 (last N)">
                    <small style="color:var(--SmartThemeBodyColor);opacity:0.6;font-size:10px;margin-top:2px;display:block;">
                        -1 = last | 3-7 = range | 3,5,7 = pick | last5 = last N
                    </small>
                    <label class="checkbox_label" style="margin-top:6px;">
                        <input id="qig-paragraph-picker" type="checkbox" ${s.enableParagraphPicker ? "checked" : ""}>
                        <span>Show paragraph picker before generation</span>
                    </label>
                </div>
                <label class="checkbox_label">
                    <input id="qig-use-llm" type="checkbox" ${s.useLLMPrompt ? "checked" : ""}>
                    <span>Use LLM to create image prompt</span>
                </label>
                <small style="opacity:0.6;font-size:10px;">Sends the scene to your AI to write an optimized image prompt</small>
                <div id="qig-llm-options" style="display:${s.useLLMPrompt ? "block" : "none"};margin-left:16px;">
                    <label>Prompt Style</label>
                    <select id="qig-llm-style">
                        <option value="tags" ${s.llmPromptStyle === "tags" ? "selected" : ""}>Danbooru Tags (anime)</option>
                        <option value="natural" ${s.llmPromptStyle === "natural" ? "selected" : ""}>Natural Description (realistic)</option>
                        <option value="custom" ${s.llmPromptStyle === "custom" ? "selected" : ""}>Custom Instruction</option>
                    </select>
                    <small style="opacity:0.6;font-size:10px;">How the AI formats the image prompt</small>
                    <label class="checkbox_label">
                        <input id="qig-llm-edit" type="checkbox" ${s.llmEditPrompt ? "checked" : ""}>
                        <span>Edit LLM prompt before generation</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="qig-llm-quality" type="checkbox" ${s.llmAddQuality ? "checked" : ""}>
                        <span>Add enhanced quality tags</span>
                    </label>
                    <small style="opacity:0.6;font-size:10px;margin-left:24px;">Appends detail/quality boosters to the AI-generated prompt</small>
                    <label class="checkbox_label">
                        <input id="qig-llm-lighting" type="checkbox" ${s.llmAddLighting ? "checked" : ""}>
                        <span>Add lighting tags</span>
                    </label>
                    <small style="opacity:0.6;font-size:10px;margin-left:24px;">Appends cinematic lighting descriptors</small>
                    <label class="checkbox_label">
                        <input id="qig-llm-artist" type="checkbox" ${s.llmAddArtist ? "checked" : ""}>
                        <span>Add random artist tags</span>
                    </label>
                    <small style="opacity:0.6;font-size:10px;margin-left:24px;">Appends a random artist name for stylistic influence</small>
                    <div style="margin-top:8px;">
                        <label>Prefill (start LLM response with):</label>
                        <small style="opacity:0.6;font-size:10px;">Pre-fills the start of the AI's response to guide its output format</small>
                        <input id="qig-llm-prefill" type="text" value="${esc(s.llmPrefill || '')}"
                               placeholder="e.g., Image prompt:" style="width:100%;">
                    </div>
                    <div id="qig-llm-custom-wrap" style="display:${s.llmPromptStyle === "custom" ? "block" : "none"};margin-top:8px;">
                        <label>Custom LLM Instruction</label>
                        <textarea id="qig-llm-custom" style="width:100%;height:120px;resize:vertical;" placeholder="Write your custom instruction for the LLM. Use {{scene}} for the current scene text.">${esc(s.llmCustomInstruction || "")}</textarea>
                    </div>
                </div>
                <div class="inline-drawer" style="margin:4px 0;">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b style="font-size:12px;">Prompt Replacement Maps</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <small style="opacity:0.7;">Exact-token replacement maps for prompt tags/text (global or per-character)</small>
                        <div id="qig-prompt-replacements" style="margin:4px 0;"></div>
                        <button id="qig-add-replacement-btn" class="menu_button" style="padding:4px 8px;">+ Add Replacement Map</button>
                    </div>
                </div>

                <label class="checkbox_label">
                    <input id="qig-use-st-style" type="checkbox" ${s.useSTStyle !== false ? "checked" : ""}>
                    <span>Use SillyTavern's Style panel (applies its prefix, negative prompt, and character-specific settings)</span>
                </label>

                <hr style="margin:8px 0;opacity:0.2;">
                <style>
                .qig-mode-tab.active { background: var(--SmartThemeQuoteColor, #4a6); color: #fff; opacity: 1; }
                .qig-mode-tab:not(.active) { opacity: 0.6; }
                </style>
                <div style="margin:4px 0;">
                    <div id="qig-mode-tabs" style="display:flex;gap:0;margin-bottom:8px;">
                        <button class="qig-mode-tab menu_button" data-tab="direct"
                            style="flex:1;border-radius:4px 0 0 4px;padding:4px 8px;font-size:12px;"
                            title="Generate images on demand or auto-trigger after AI messages">
                            Direct Mode</button>
                        <button class="qig-mode-tab menu_button" data-tab="inject"
                            style="flex:1;border-radius:0 4px 4px 0;padding:4px 8px;font-size:12px;"
                            title="AI writes image descriptions in its responses, images auto-generate from them">
                            Inject Mode</button>
                    </div>

                    <!-- Direct tab -->
                    <div id="qig-tab-direct" class="qig-tab-panel">
                        <small style="opacity:0.7;">Generate images on demand or automatically after AI messages</small>
                        <label class="checkbox_label" style="margin-top:6px;">
                            <input id="qig-auto-generate" type="checkbox" ${s.autoGenerate ? "checked" : ""}>
                            <span>Auto-generate after AI response</span>
                        </label>
                        <label class="checkbox_label">
                            <input id="qig-confirm-generate" type="checkbox" ${s.confirmBeforeGenerate ? "checked" : ""}>
                            <span>Confirm before generating</span>
                        </label>
                    </div>

                    <!-- Inject tab -->
                    <div id="qig-tab-inject" class="qig-tab-panel" style="display:none;">
                        <small style="opacity:0.7;">Let the RP AI describe scenes with image tags, then auto-generate images from them</small>
                        <label class="checkbox_label" style="margin-top:6px;">
                            <input id="qig-inject-enabled" type="checkbox" ${s.injectEnabled ? "checked" : ""}>
                            <span>Enable inject mode</span>
                        </label>
                        <div id="qig-inject-options" style="display:${s.injectEnabled ? "block" : "none"};margin-left:16px;">
                            <label>Tag name</label>
                            <input id="qig-inject-tag-name" type="text" value="${esc(getInjectTagName(s))}" placeholder="image" style="width:100%;text-transform:lowercase;">
                            <small style="opacity:0.6;font-size:10px;">Preview: <code id="qig-inject-tag-preview">${esc(getInjectTagPreview(getInjectTagName(s)))}</code>. Change this if your preset/model tends to swallow &lt;image&gt; tags inside reasoning.</small>
                            <label>Inject prompt template</label>
                            <textarea id="qig-inject-prompt" rows="3" style="width:100%;resize:vertical;">${esc(s.injectPrompt || "")}</textarea>
                            <small style="opacity:0.6;font-size:10px;">Supports {{char}}, {{user}}. Default prompt tells the AI to put the image tag in the final visible reply, not inside reasoning or &lt;think&gt;.</small>
                            <label>Extraction regex</label>
                            <input id="qig-inject-regex" type="text" value="${esc(s.injectRegex || '')}" style="width:100%;font-family:monospace;font-size:11px;">
                            <small style="opacity:0.6;font-size:10px;">Capture groups extract the image prompt. Default matches your custom paired tag plus legacy &lt;pic prompt="..."&gt; tags.</small>
                            <label>Injection position</label>
                            <select id="qig-inject-position">
                                <option value="afterScenario" ${s.injectPosition === "afterScenario" ? "selected" : ""}>After Scenario</option>
                                <option value="inUser" ${s.injectPosition === "inUser" ? "selected" : ""}>Before User Message</option>
                                <option value="atDepth" ${s.injectPosition === "atDepth" ? "selected" : ""}>At Depth</option>
                            </select>
                            <small style="opacity:0.6;font-size:10px;">Before User Message may interfere with thinking/reasoning presets.</small>
                            <div id="qig-inject-depth-wrap" style="display:${s.injectPosition === "atDepth" ? "block" : "none"};">
                                <label>Depth</label>
                                <input id="qig-inject-depth" type="number" value="${esc(s.injectDepth || 0)}" min="0" max="100">
                            </div>
                            <label>Tag handling</label>
                            <select id="qig-inject-insert-mode">
                                <option value="replace" ${s.injectInsertMode === "replace" ? "selected" : ""}>Replace tag with image</option>
                                <option value="inline" ${s.injectInsertMode === "inline" ? "selected" : ""}>Insert image after message</option>
                                <option value="new" ${s.injectInsertMode === "new" ? "selected" : ""}>New message with image</option>
                            </select>
                            <label class="checkbox_label">
                                <input id="qig-inject-autoclean" type="checkbox" ${s.injectAutoClean !== false ? "checked" : ""}>
                                <span>Remove detected image tags from the stored/displayed message</span>
                            </label>
                            <button id="qig-test-inject" style="margin-top:8px;padding:4px 8px;cursor:pointer;">🔍 Test Inject Detection</button>
                        </div>
                    </div>
                </div>

                <label class="checkbox_label" style="margin-top:4px;">
                    <input id="qig-disable-palette" type="checkbox" ${s.disablePaletteButton ? "checked" : ""}>
                    <span>Hide palette button</span>
                </label>
                <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                    <label style="font-size:12px;white-space:nowrap;">Palette button mode</label>
                    <select id="qig-palette-mode" style="flex:1;">
                        <option value="direct" ${s.paletteMode === "inject" ? "" : "selected"}>Direct (manual prompt)</option>
                        <option value="inject" ${s.paletteMode === "inject" ? "selected" : ""}>Inject (extract/generate image tags)</option>
                    </select>
                </div>
                <small style="opacity:0.6;font-size:10px;">Direct = opens prompt editor · Inject = generates from AI-written image tags</small>

                <div style="margin:6px 0;padding:8px;border:1px solid #555;border-radius:4px;">
                    <label class="checkbox_label">
                        <input id="qig-llm-override" type="checkbox" ${s.llmOverrideEnabled ? "checked" : ""}>
                        <span>Use separate AI for image prompts</span>
                    </label>
                    <small style="opacity:0.6;font-size:10px;">Route image prompt generation to a different AI model than your main chat</small>
                    <div id="qig-llm-override-options" style="display:${s.llmOverrideEnabled ? 'block' : 'none'};margin-top:6px;">
                        <label style="font-size:11px;">Connection Profile</label>
                        <select id="qig-llm-override-profile" style="width:100%;"></select>
                        <label style="font-size:11px;margin-top:4px;">Completion Preset (optional)</label>
                        <select id="qig-llm-override-preset-select" style="width:100%;"></select>
                        <label style="font-size:11px;margin-top:4px;">Max Tokens</label>
                        <input id="qig-llm-override-max" type="number" value="${esc(s.llmOverrideMaxTokens || 500)}" min="50" max="4096" style="width:100%;">
                    </div>
                </div>

                <label class="checkbox_label">
                    <input id="qig-auto-insert" type="checkbox" ${s.autoInsert ? "checked" : ""}>
                    <span>Auto-insert into chat (skip popup)</span>
                </label>
                <label class="checkbox_label" style="margin-left:16px;opacity:${s.autoInsert ? "1" : "0.6"};">
                    <input id="qig-insert-hidden-reply" type="checkbox" ${s.insertAsHiddenReply ? "checked" : ""} ${s.autoInsert ? "" : "disabled"}>
                    <span>Send as hidden reply (prevents payload errors)</span>
                </label>
                <label class="checkbox_label" style="margin-top:4px;">
                    <input id="qig-save-to-server" type="checkbox" ${s.saveToServer ? "checked" : ""}>
                    <span>Save images to ST server (persistent)</span>
                </label>
                <label class="checkbox_label" style="margin-left:16px;opacity:${s.saveToServer ? "1" : "0.6"};">
                    <input id="qig-save-to-server-meta" type="checkbox" ${s.saveToServerEmbedMetadata ? "checked" : ""} ${s.saveToServer ? "" : "disabled"}>
                    <span>Embed metadata in saved PNGs</span>
                </label>

                <label>Size</label>
                <small style="opacity:0.6;font-size:10px;">Output resolution in pixels — larger = slower and more VRAM</small>
                <div id="qig-size-custom" class="qig-row">
                    <input id="qig-width" type="number" value="${esc(s.width)}" min="256" max="2048" step="64">
                    <span>×</span>
                    <input id="qig-height" type="number" value="${esc(s.height)}" min="256" max="2048" step="64">
                    <select id="qig-aspect" style="width:70px;margin-left:4px">
                        <option value="">-</option>
                        <option value="1:1">1:1</option>
                        <option value="3:2">3:2</option>
                        <option value="2:3">2:3</option>
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                    </select>
                </div>
                <select id="qig-nai-resolution" style="display:none;width:100%">
                    ${NAI_RESOLUTIONS.map(r => `<option value="${r.w}x${r.h}" ${selectedNaiResolution === `${r.w}x${r.h}` ? "selected" : ""}>${r.label}</option>`).join("")}
                    <option value="${NAI_CUSTOM_RESOLUTION_VALUE}" ${selectedNaiResolution === NAI_CUSTOM_RESOLUTION_VALUE ? "selected" : ""}>Custom (${esc(s.width)}×${esc(s.height)})</option>
                </select>
                
                <label>Batch Count</label>
                <small style="opacity:0.6;font-size:10px;">Number of images to generate per click (1-10)</small>
                <input id="qig-batch" type="number" value="${esc(s.batchCount)}" min="1" max="10">
                <label class="checkbox_label" id="qig-seq-seeds-wrap" style="display:${(s.batchCount || 1) > 1 ? '' : 'none'}">
                    <input id="qig-seq-seeds" type="checkbox" ${s.sequentialSeeds ? "checked" : ""}>
                    <span>Sequential seeds (seed, seed+1, seed+2...)</span>
                </label>
                
                <div class="inline-drawer" style="margin:4px 0;">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b style="font-size:12px;">Advanced Settings</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" id="qig-advanced-settings">
                    <label>Steps</label>
                    <small style="opacity:0.6;font-size:10px;">More steps = higher quality but slower (20-30 is typical)</small>
                    <input id="qig-steps" type="number" value="${esc(s.steps)}" min="1" max="150">
                    <label>CFG Scale</label>
                    <small style="opacity:0.6;font-size:10px;">How strictly the image follows the prompt — higher = more literal (5-10 typical)</small>
                    <input id="qig-cfg" type="number" value="${esc(s.cfgScale)}" min="1" max="30" step="0.5">
                    <label>Sampler</label>
                    <small style="opacity:0.6;font-size:10px;">Algorithm used to generate the image — euler_a is a good default</small>
                    <select id="qig-sampler">${samplerOpts}</select>
                    <label>Seed (-1 = random)</label>
                    <small style="opacity:0.6;font-size:10px;">Same seed + same prompt = same image. -1 for random each time</small>
                    <input id="qig-seed" type="number" value="${esc(s.seed)}">
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.getElementById("extensions_settings").insertAdjacentHTML("beforeend", html);

    document.getElementById("qig-generate-btn").onclick = () => {
        const mode = getSettings().paletteMode || "direct";
        if (mode === "inject") generateImageInjectPalette();
        else generateImage();
    };
    document.getElementById("qig-logs-btn").onclick = showLogs;
    document.getElementById("qig-save-char-btn").onclick = saveCharSettings;
    document.getElementById("qig-gallery-settings-btn").onclick = showGallery;
    document.getElementById("qig-prompt-history-btn").onclick = showPromptHistory;
    document.getElementById("qig-save-template").onclick = saveTemplate;
    document.getElementById("qig-profile-save").onclick = saveConnectionProfile;
    document.getElementById("qig-save-preset").onclick = savePreset;
    document.getElementById("qig-export-btn").onclick = exportAllSettings;
    document.getElementById("qig-import-btn").onclick = importSettings;
    document.getElementById("qig-add-replacement-btn").onclick = addPromptReplacement;
    renderTemplates();
    renderPresets();
    renderProfileSelect();
    renderComfyWorkflowPresets();
    renderContextualFilters();
    renderPromptReplacements();

    document.getElementById("qig-provider").onchange = (e) => {
        getSettings().provider = e.target.value;
        saveSettingsDebounced();
        updateProviderUI();
        renderProfileSelect();
    };
    document.getElementById("qig-style").onchange = (e) => {
        getSettings().style = e.target.value;
        saveSettingsDebounced();
    };

    bind("qig-pollinations-model", "pollinationsModel");
    bind("qig-nai-key", "naiKey");
    bind("qig-nai-model", "naiModel");
    bind("qig-nai-proxy-url", "naiProxyUrl");
    bind("qig-nai-proxy-key", "naiProxyKey");
    bind("qig-arli-key", "arliKey");
    bind("qig-arli-model", "arliModel");
    bind("qig-nanogpt-key", "nanogptKey");
    bind("qig-nanogpt-model", "nanogptModel");
    bind("qig-nanogpt-strength", "nanogptStrength", true);
    bind("qig-chutes-key", "chutesKey");
    bind("qig-chutes-model", "chutesModel");
    bind("qig-civitai-key", "civitaiKey");
    bind("qig-civitai-model", "civitaiModel");
    bind("qig-civitai-scheduler", "civitaiScheduler");
    bind("qig-civitai-loras", "civitaiLoras");
    bind("qig-nanobanana-key", "nanobananaKey");
    bind("qig-nanobanana-model", "nanobananaModel");
    bind("qig-nanobanana-extra", "nanobananaExtraInstructions");
    bind("qig-stability-key", "stabilityKey");
    bind("qig-replicate-key", "replicateKey");
    bind("qig-replicate-model", "replicateModel");
    bind("qig-fal-key", "falKey");
    bind("qig-fal-model", "falModel");
    bind("qig-together-key", "togetherKey");
    bind("qig-together-model", "togetherModel");
    bind("qig-local-url", "localUrl");
    bind("qig-local-model", "localModel");
    document.getElementById("qig-local-model").addEventListener("change", (e) => {
        const val = (e.target.value || "").toLowerCase();
        if (/flux|unet|\.gguf/.test(val) && !getSettings().comfySkipNegativePrompt) {
            toastr.warning(
                'This looks like a Flux/UNET model. Enable "Skip Negative Prompt" and set your CLIP/VAE model names for UNET-only models, or paste a custom workflow.',
                "Flux/UNET Model Detected",
                { timeOut: 8000 }
            );
        }
    });
    document.getElementById("qig-comfy-workflow-select").onchange = (e) => {
        selectedComfyWorkflowId = e.target.value || "";
        setComfyWorkflowActionState(!!selectedComfyWorkflowId);
    };
    document.getElementById("qig-comfy-workflow-load").onclick = loadSelectedComfyWorkflowPreset;
    document.getElementById("qig-comfy-workflow-save-as").onclick = saveComfyWorkflowPresetAs;
    document.getElementById("qig-comfy-workflow-update").onclick = updateSelectedComfyWorkflowPreset;
    document.getElementById("qig-comfy-workflow-del").onclick = deleteSelectedComfyWorkflowPreset;
    // ComfyUI model refresh
    document.getElementById("qig-comfy-model-refresh").onclick = async () => {
        const s = getSettings();
        const modelSelect = document.getElementById("qig-local-model");
        modelSelect.innerHTML = '<option value="">Loading...</option>';
        let models;
        try {
            models = await fetchComfyUIModels(s.localUrl, isComfyFluxMode(s));
        } catch (e) {
            if (e.message?.includes("403 Forbidden")) {
                modelSelect.innerHTML = '<option value="">-- 403 Forbidden (see error) --</option>';
                toastr?.error?.(e.message, "ComfyUI Connection Error", { timeOut: 0, extendedTimeOut: 0 });
                return;
            }
            models = [];
        }
        if (models.length > 0) {
            const cur = s.localModel || "";
            modelSelect.innerHTML = models.map(m =>
                `<option value="${m}" ${m === cur ? "selected" : ""}>${m}</option>`
            ).join("");
            if (!cur && models.length > 0) {
                s.localModel = models[0];
                modelSelect.value = models[0];
                saveSettingsDebounced();
            }
        } else {
            modelSelect.innerHTML = '<option value="">-- Failed to load (check if ComfyUI running) --</option>';
        }
    };
    document.getElementById("qig-local-type").onchange = (e) => {
        getSettings().localType = e.target.value;
        syncLocalTypeSections(e.target.value);
        saveSettingsDebounced();
    };
    bind("qig-local-denoise", "localDenoise", true);
    document.getElementById("qig-local-denoise").oninput = (e) => {
        document.getElementById("qig-local-denoise-val").textContent = e.target.value;
    };
    // ComfyUI specific bindings
    bind("qig-comfy-denoise", "comfyDenoise", true);
    bind("qig-comfy-clip", "comfyClipSkip", true);
    bind("qig-comfy-scheduler", "comfyScheduler");
    bind("qig-comfy-timeout", "comfyTimeout", true);
    bindCheckbox("qig-comfy-upscale", "comfyUpscale");
    bind("qig-comfy-upscale-model", "comfyUpscaleModel");
    document.getElementById("qig-comfy-upscale").onchange = (e) => {
        getSettings().comfyUpscale = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-comfy-upscale-opts").style.display = e.target.checked ? "block" : "none";
    };
    bind("qig-comfy-workflow", "comfyWorkflow");
    bind("qig-comfy-loras", "comfyLoras");
    document.getElementById("qig-comfy-skip-neg").onchange = (e) => {
        getSettings().comfySkipNegativePrompt = e.target.checked;
        saveSettingsDebounced();
        const fluxOpts = document.getElementById("qig-comfy-flux-opts");
        if (fluxOpts) fluxOpts.style.display = e.target.checked ? "block" : "none";
    };
    bind("qig-comfy-flux-clip1", "comfyFluxClipModel1");
    bind("qig-comfy-flux-clip2", "comfyFluxClipModel2");
    bind("qig-comfy-flux-vae", "comfyFluxVaeModel");
    bind("qig-comfy-flux-clip-type", "comfyFluxClipType");

    // A1111 specific bindings
    bind("qig-a1111-clip", "a1111ClipSkip", true);
    bind("qig-a1111-scheduler", "a1111Scheduler");
    bindCheckbox("qig-a1111-restore-faces", "a1111RestoreFaces");
    bindCheckbox("qig-a1111-tiling", "a1111Tiling");
    bind("qig-a1111-subseed", "a1111Subseed", true);
    bind("qig-a1111-subseed-strength", "a1111SubseedStrength", true);
    bind("qig-a1111-loras", "a1111Loras");
    bind("qig-a1111-vae", "a1111Vae");

    // Hires Fix bindings
    bindCheckbox("qig-a1111-hires", "a1111HiresFix");
    bind("qig-a1111-hires-upscaler", "a1111HiresUpscaler");
    bind("qig-a1111-hires-steps", "a1111HiresSteps", true);
    bind("qig-a1111-hires-sampler", "a1111HiresSampler");
    bind("qig-a1111-hires-scheduler", "a1111HiresScheduler");
    bind("qig-a1111-hires-prompt", "a1111HiresPrompt");
    bind("qig-a1111-hires-negative", "a1111HiresNegative");
    bind("qig-a1111-hires-resize-x", "a1111HiresResizeX", true);
    bind("qig-a1111-hires-resize-y", "a1111HiresResizeY", true);
    document.getElementById("qig-a1111-hires-scale").onchange = (e) => {
        getSettings().a1111HiresScale = parseFloat(e.target.value);
        saveSettingsDebounced();
    };
    document.getElementById("qig-a1111-hires-denoise").oninput = (e) => {
        document.getElementById("qig-a1111-hires-denoise-val").textContent = e.target.value;
    };
    document.getElementById("qig-a1111-hires-denoise").onchange = (e) => {
        getSettings().a1111HiresDenoise = parseFloat(e.target.value);
        saveSettingsDebounced();
    };
    document.getElementById("qig-a1111-hires").onchange = (e) => {
        getSettings().a1111HiresFix = e.target.checked;
        document.getElementById("qig-a1111-hires-opts").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced();
    };

    // ADetailer bindings
    bind("qig-a1111-adetailer-model", "a1111AdetailerModel");
    bind("qig-a1111-ad-prompt", "a1111AdetailerPrompt");
    bind("qig-a1111-ad-negative", "a1111AdetailerNegative");
    bind("qig-a1111-ad-denoise", "a1111AdetailerDenoise", true);
    bind("qig-a1111-ad-confidence", "a1111AdetailerConfidence", true);
    bind("qig-a1111-ad-mask-blur", "a1111AdetailerMaskBlur", true);
    bind("qig-a1111-ad-dilate", "a1111AdetailerDilateErode", true);
    bindCheckbox("qig-a1111-ad-inpaint-only", "a1111AdetailerInpaintOnlyMasked");
    bind("qig-a1111-ad-inpaint-padding", "a1111AdetailerInpaintPadding", true);
    document.getElementById("qig-a1111-adetailer").onchange = (e) => {
        getSettings().a1111Adetailer = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-a1111-adetailer-opts").style.display = e.target.checked ? "block" : "none";
    };

    // ADetailer Unit 2 bindings
    bind("qig-a1111-ad2-model", "a1111Adetailer2Model");
    bind("qig-a1111-ad2-prompt", "a1111Adetailer2Prompt");
    bind("qig-a1111-ad2-negative", "a1111Adetailer2Negative");
    bind("qig-a1111-ad2-denoise", "a1111Adetailer2Denoise", true);
    bind("qig-a1111-ad2-confidence", "a1111Adetailer2Confidence", true);
    bind("qig-a1111-ad2-mask-blur", "a1111Adetailer2MaskBlur", true);
    bind("qig-a1111-ad2-dilate", "a1111Adetailer2DilateErode", true);
    bindCheckbox("qig-a1111-ad2-inpaint-only", "a1111Adetailer2InpaintOnlyMasked");
    bind("qig-a1111-ad2-inpaint-padding", "a1111Adetailer2InpaintPadding", true);
    document.getElementById("qig-a1111-ad2-enable").onchange = (e) => {
        getSettings().a1111Adetailer2 = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-a1111-ad2-opts").style.display = e.target.checked ? "block" : "none";
    };

    // Save to WebUI binding
    bindCheckbox("qig-a1111-save-webui", "a1111SaveToWebUI");

    // IP-Adapter bindings
    bind("qig-a1111-ipadapter-mode", "a1111IpAdapterMode");
    bind("qig-a1111-ipadapter-weight", "a1111IpAdapterWeight", true);
    document.getElementById("qig-a1111-ipadapter").onchange = (e) => {
        getSettings().a1111IpAdapter = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-a1111-ipadapter-opts").style.display = e.target.checked ? "block" : "none";
    };
    document.getElementById("qig-a1111-ipadapter-weight").oninput = (e) => {
        document.getElementById("qig-a1111-ipadapter-weight-val").textContent = e.target.value;
    };
    bindCheckbox("qig-a1111-ipadapter-pixel", "a1111IpAdapterPixelPerfect");
    bind("qig-a1111-ipadapter-resize", "a1111IpAdapterResizeMode");
    bind("qig-a1111-ipadapter-control", "a1111IpAdapterControlMode");
    bind("qig-a1111-ipadapter-start", "a1111IpAdapterStartStep", true);
    bind("qig-a1111-ipadapter-end", "a1111IpAdapterEndStep", true);

    // Generic ControlNet bindings
    bind("qig-a1111-cn-model", "a1111ControlNetModel");
    bind("qig-a1111-cn-module", "a1111ControlNetModule");
    bind("qig-a1111-cn-weight", "a1111ControlNetWeight", true);
    bindCheckbox("qig-a1111-cn-pixel", "a1111ControlNetPixelPerfect");
    bind("qig-a1111-cn-resize", "a1111ControlNetResizeMode");
    bind("qig-a1111-cn-control", "a1111ControlNetControlMode");
    bind("qig-a1111-cn-start", "a1111ControlNetGuidanceStart", true);
    bind("qig-a1111-cn-end", "a1111ControlNetGuidanceEnd", true);
    document.getElementById("qig-a1111-controlnet").onchange = (e) => {
        getSettings().a1111ControlNet = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-a1111-controlnet-opts").style.display = e.target.checked ? "block" : "none";
    };
    document.getElementById("qig-a1111-cn-weight").oninput = (e) => {
        document.getElementById("qig-a1111-cn-weight-val").textContent = e.target.value;
    };
    // ControlNet image upload
    const cnUploadInput = document.getElementById("qig-a1111-cn-upload");
    document.getElementById("qig-a1111-cn-upload-btn").onclick = () => cnUploadInput.click();
    document.getElementById("qig-a1111-cn-clear-btn").onclick = () => {
        getSettings().a1111ControlNetImage = "";
        saveSettingsDebounced();
        document.getElementById("qig-a1111-cn-preview").style.display = "none";
        document.getElementById("qig-a1111-cn-clear-btn").style.display = "none";
    };
    cnUploadInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            getSettings().a1111ControlNetImage = ev.target.result;
            saveSettingsDebounced();
            const preview = document.getElementById("qig-a1111-cn-preview");
            preview.src = ev.target.result;
            preview.style.display = "block";
            document.getElementById("qig-a1111-cn-clear-btn").style.display = "block";
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    // A1111 Model dropdown
    const a1111ModelSelect = document.getElementById("qig-a1111-model");
    const a1111ModelRefresh = document.getElementById("qig-a1111-model-refresh");

    async function populateA1111Models() {
        const s = getSettings();
        a1111ModelSelect.innerHTML = '<option value="">Loading...</option>';

        // Fetch SD Checkpoints
        const models = await fetchA1111Models(s.localUrl);
        const currentModel = s.a1111Model || await getCurrentA1111Model(s.localUrl);

        if (models.length === 0) {
            a1111ModelSelect.innerHTML = '<option value="">-- Failed to load (check if A1111 running) --</option>';
        } else {
            a1111ModelSelect.innerHTML = models.map(m =>
                `<option value="${m.title}" ${m.title === currentModel ? 'selected' : ''}>${m.name}</option>`
            ).join('');

            if (currentModel && !s.a1111Model) {
                s.a1111Model = currentModel;
                saveSettingsDebounced();
            }
        }

        // Fetch ControlNet Models for IP-Adapter
        const cnModels = await fetchControlNetModels(s.localUrl);
        const cnSelect = document.getElementById("qig-a1111-ipadapter-mode");

        // Filter for IP-Adapter/FaceID models
        const ipModels = cnModels.filter(m => m.toLowerCase().includes("ip-adapter") || m.toLowerCase().includes("faceid"));

        if (ipModels.length > 0) {
            // Preserve current selection if possible, otherwise default
            const currentCn = s.a1111IpAdapterMode;

            cnSelect.innerHTML = ipModels.map(m =>
                `<option value="${m}" ${m === currentCn ? 'selected' : ''}>${m}</option>`
            ).join('');

            // Add a separator and the standard presets if they aren't in the list?
            // Actually, best to just show what's available to ensure it works.
            // But maybe keep the standard ones as a reference if list is huge?
            // Let's just stick to detected models to fix the "silent failure" issue.
            cnSelect.insertAdjacentHTML('afterbegin', '<option value="" disabled>-- Detected Models --</option>');
        } else {
            // Fallback to presets if no API or no models found
            console.log("No IP-Adapter models detected via API, using presets.");
            const hasNoModelsOption = Array.from(cnSelect.options || []).some(opt =>
                opt.disabled && opt.textContent.includes("No IP-Adapter models detected")
            );
            if (!hasNoModelsOption) {
                cnSelect.insertAdjacentHTML('beforeend', '<option value="" disabled>-- No IP-Adapter models detected --</option>');
            }
        }

        // Fetch Upscalers for Hires Fix
        const upscalers = await fetchA1111Upscalers(s.localUrl);
        const upscalerSelect = document.getElementById("qig-a1111-hires-upscaler");
        if (upscalers.length > 0 && upscalerSelect) {
            const cur = s.a1111HiresUpscaler || "Latent";
            upscalerSelect.innerHTML = upscalers.map(u =>
                `<option value="${u}" ${u === cur ? 'selected' : ''}>${u}</option>`
            ).join('');
        }

        // Fetch VAEs
        const vaes = await fetchA1111VAEs(s.localUrl);
        const vaeSelect = document.getElementById("qig-a1111-vae");
        if (vaeSelect) {
            const curVae = s.a1111Vae || "";
            vaeSelect.innerHTML = `<option value="" ${!curVae ? "selected" : ""}>Automatic</option>` +
                vaes.map(v => `<option value="${v}" ${v === curVae ? "selected" : ""}>${v}</option>`).join("");
        }

        // Populate generic ControlNet model list (all models, not just IP-Adapter)
        const genericCnSelect = document.getElementById("qig-a1111-cn-model");
        if (genericCnSelect && cnModels.length > 0) {
            const curCn = s.a1111ControlNetModel || "";
            genericCnSelect.innerHTML = `<option value="">-- Select Model --</option>` +
                cnModels.map(m => `<option value="${m}" ${m === curCn ? "selected" : ""}>${m}</option>`).join("");
        } else if (genericCnSelect) {
            genericCnSelect.innerHTML = '<option value="">-- No ControlNet models found --</option>';
        }
    }

    a1111ModelSelect.onchange = async (e) => {
        const s = getSettings();
        const newModel = e.target.value;
        if (!newModel) return;

        a1111ModelSelect.disabled = true;
        const success = await switchA1111Model(s.localUrl, newModel);
        if (success) {
            s.a1111Model = newModel;
            saveSettingsDebounced();
            toastr?.success?.('Model switched');
        } else {
            toastr?.error?.('Failed to switch model');
        }
        a1111ModelSelect.disabled = false;
    };

    a1111ModelRefresh.onclick = () => populateA1111Models();

    // Local Ref Image
    const localRefInput = getOrCacheElement("qig-local-ref-input");
    const localRefBtn = getOrCacheElement("qig-local-ref-btn");
    const localRefClear = getOrCacheElement("qig-local-ref-clear");
    if (localRefBtn) localRefBtn.onclick = () => localRefInput.click();
    if (localRefClear) localRefClear.onclick = () => {
        const s = getSettings();
        s.localRefImage = "";
        saveSettingsDebounced();
        document.getElementById("qig-local-ref-preview").style.display = "none";
        document.getElementById("qig-local-ref-preview").src = "";
        localRefClear.style.display = "none";
        document.getElementById("qig-local-denoise-wrap").style.display = "none";
    };
    localRefInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const s = getSettings();
            s.localRefImage = ev.target.result;
            saveSettingsDebounced();
            document.getElementById("qig-local-ref-preview").src = s.localRefImage;
            document.getElementById("qig-local-ref-preview").style.display = "block";
            localRefClear.style.display = "block";
            document.getElementById("qig-local-denoise-wrap").style.display = s.localType === "a1111" ? "block" : "none";
            localRefInput.value = "";
        };
        reader.readAsDataURL(file);
    };

    bind("qig-proxy-url", "proxyUrl");
    bind("qig-proxy-key", "proxyKey");
    bind("qig-proxy-model", "proxyModel");
    bind("qig-proxy-loras", "proxyLoras");
    bind("qig-proxy-steps", "proxySteps", true);
    bind("qig-proxy-cfg", "proxyCfg", true);
    bind("qig-proxy-sampler", "proxySampler");
    bind("qig-proxy-seed", "proxySeed", true);
    bindCheckbox("qig-proxy-facefix", "proxyFacefix");
    bind("qig-proxy-extra", "proxyExtraInstructions");
    bind("qig-proxy-comfy-timeout", "proxyComfyTimeout", true);
    bind("qig-proxy-comfy-node-id", "proxyComfyNodeId");
    bind("qig-proxy-comfy-workflow", "proxyComfyWorkflow");
    const comfyModeEl = getOrCacheElement("qig-proxy-comfy-mode");
    if (comfyModeEl) comfyModeEl.onchange = (e) => {
        const s = getSettings();
        s.proxyComfyMode = e.target.checked;
        saveSettingsDebounced();
        const comfyOpts = document.getElementById("qig-proxy-comfy-opts");
        const stdOpts = document.getElementById("qig-proxy-standard-opts");
        if (comfyOpts) comfyOpts.style.display = s.proxyComfyMode ? "block" : "none";
        if (stdOpts) stdOpts.style.display = s.proxyComfyMode ? "none" : "block";
    };

    // Reference images handling
    const refInput = getOrCacheElement("qig-proxy-ref-input");
    const refBtn = getOrCacheElement("qig-proxy-ref-btn");
    if (refBtn) refBtn.onclick = () => refInput.click();
    refInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        const s = getSettings();
        if (!s.proxyRefImages) s.proxyRefImages = [];
        const remaining = 15 - s.proxyRefImages.length;
        const filesToProcess = files.slice(0, remaining);

        const readPromises = filesToProcess.map(file =>
            new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            })
        );

        const results = await Promise.all(readPromises);
        s.proxyRefImages.push(...results);
        saveSettingsDebounced();
        renderRefImages();
        refInput.value = "";
    };
    renderRefImages();

    // Nanobanana reference images handling
    const nanoRefInput = getOrCacheElement("qig-nanobanana-ref-input");
    const nanoRefBtn = getOrCacheElement("qig-nanobanana-ref-btn");
    if (nanoRefBtn) nanoRefBtn.onclick = () => nanoRefInput.click();
    nanoRefInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        const s = getSettings();
        if (!s.nanobananaRefImages) s.nanobananaRefImages = [];
        const remaining = 15 - s.nanobananaRefImages.length;
        const filesToProcess = files.slice(0, remaining);

        const readPromises = filesToProcess.map(file =>
            new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            })
        );

        const results = await Promise.all(readPromises);
        s.nanobananaRefImages.push(...results);
        saveSettingsDebounced();
        renderNanobananaRefImages();
        nanoRefInput.value = "";
    };
    renderNanobananaRefImages();

    // NanoGPT reference images handling
    const nanogptRefInput = getOrCacheElement("qig-nanogpt-ref-input");
    const nanogptRefBtn = getOrCacheElement("qig-nanogpt-ref-btn");
    if (nanogptRefBtn) nanogptRefBtn.onclick = () => nanogptRefInput.click();
    nanogptRefInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        const s = getSettings();
        if (!s.nanogptRefImages) s.nanogptRefImages = [];
        const remaining = 15 - s.nanogptRefImages.length;
        const filesToProcess = files.slice(0, remaining);

        const readPromises = filesToProcess.map(file =>
            new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            })
        );

        const results = await Promise.all(readPromises);
        s.nanogptRefImages.push(...results);
        saveSettingsDebounced();
        renderNanogptRefImages();
        nanogptRefInput.value = "";
    };
    renderNanogptRefImages();

    bind("qig-prompt", "prompt");
    bind("qig-negative", "negativePrompt");
    bind("qig-quality", "qualityTags");
    bindCheckbox("qig-append-quality", "appendQuality");
    document.getElementById("qig-use-last").onchange = (e) => {
        getSettings().useLastMessage = e.target.checked;
        document.getElementById("qig-msg-index-wrap").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-msg-range", "messageRange", false);
    bindCheckbox("qig-paragraph-picker", "enableParagraphPicker");
    document.getElementById("qig-use-llm").onchange = (e) => {
        getSettings().useLLMPrompt = e.target.checked;
        document.getElementById("qig-llm-options").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-llm-custom", "llmCustomInstruction");
    bindCheckbox("qig-llm-edit", "llmEditPrompt");
    bindCheckbox("qig-llm-quality", "llmAddQuality");
    bindCheckbox("qig-llm-lighting", "llmAddLighting");
    bindCheckbox("qig-llm-artist", "llmAddArtist");
    bind("qig-llm-prefill", "llmPrefill");
    document.getElementById("qig-llm-style").onchange = e => {
        getSettings().llmPromptStyle = e.target.value;
        saveSettingsDebounced();
        document.getElementById("qig-llm-custom-wrap").style.display = e.target.value === "custom" ? "block" : "none";
    };
    bind("qig-auto-generate", "autoGenerate", false, true, (checked) => {
        if (!checked && _autoGenTimeout) {
            clearTimeout(_autoGenTimeout);
            _autoGenTimeout = null;
        }
    });
    bindCheckbox("qig-auto-insert", "autoInsert");
    const hiddenReplyEl = document.getElementById("qig-insert-hidden-reply");
    bindCheckbox("qig-insert-hidden-reply", "insertAsHiddenReply");
    document.getElementById("qig-auto-insert").addEventListener("change", e => {
        if (hiddenReplyEl) {
            hiddenReplyEl.disabled = !e.target.checked;
            const label = hiddenReplyEl.closest("label");
            if (label) label.style.opacity = e.target.checked ? "1" : "0.6";
        }
    });
    const saveToServerEl = document.getElementById("qig-save-to-server");
    const saveToServerMetaEl = document.getElementById("qig-save-to-server-meta");
    const updateSaveToServerMetaState = () => {
        if (!saveToServerMetaEl) return;
        const enabled = !!saveToServerEl?.checked;
        saveToServerMetaEl.disabled = !enabled;
        const label = saveToServerMetaEl.closest("label");
        if (label) label.style.opacity = enabled ? "1" : "0.6";
    };
    if (saveToServerEl) {
        saveToServerEl.onchange = (e) => {
            getSettings().saveToServer = e.target.checked;
            saveSettingsDebounced();
            updateSaveToServerMetaState();
        };
    }
    if (saveToServerMetaEl) {
        saveToServerMetaEl.onchange = (e) => {
            getSettings().saveToServerEmbedMetadata = e.target.checked;
            saveSettingsDebounced();
        };
    }
    updateSaveToServerMetaState();
    document.getElementById("qig-disable-palette").onchange = (e) => {
        getSettings().disablePaletteButton = e.target.checked;
        saveSettingsDebounced();
        const btn = document.getElementById("qig-input-btn");
        if (e.target.checked) {
            if (btn) btn.style.display = "none";
        } else {
            if (btn) btn.style.display = "";
            else addInputButton();
        }
    };
    document.getElementById("qig-confirm-generate").onchange = (e) => {
        getSettings().confirmBeforeGenerate = e.target.checked;
        saveSettingsDebounced();
    };
    bindCheckbox("qig-use-st-style", "useSTStyle");
    // Inject mode bindings
    document.getElementById("qig-inject-enabled").onchange = (e) => {
        getSettings().injectEnabled = e.target.checked;
        document.getElementById("qig-inject-options").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced();
    };
    document.getElementById("qig-inject-tag-name").onchange = (e) => {
        e.target.value = applyInjectTagNameChange(e.target.value);
        saveSettingsDebounced();
    };
    bind("qig-inject-prompt", "injectPrompt");
    bind("qig-inject-regex", "injectRegex", (value) => {
        try {
            const sampleTag = getInjectTagPreview(getInjectTagName(getSettings()));
            const testMatch = extractInjectMatchesFromText(sampleTag, value);
            if (testMatch.length === 0) {
                toastr.warning("Regex may not capture image descriptions. Test with sample tags.");
            }
        } catch (e) {
            toastr.error("Invalid regex pattern: " + e.message);
        }
    });
    document.getElementById("qig-inject-position").onchange = (e) => {
        getSettings().injectPosition = e.target.value;
        document.getElementById("qig-inject-depth-wrap").style.display = e.target.value === "atDepth" ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-inject-depth", "injectDepth", true);
    bind("qig-inject-insert-mode", "injectInsertMode");
    bindCheckbox("qig-inject-autoclean", "injectAutoClean");

    // Test inject detection button
    document.getElementById("qig-test-inject").onclick = async () => {
        const s = getSettings();
        const ctx = getContext();
        const chat = ctx.chat;

        if (!chat || chat.length === 0) {
            toastr.info("No chat messages to test");
            return;
        }

        // Find last AI message
        const lastAiMessage = findLastInjectCandidateMessage(chat, s);
        if (!lastAiMessage) {
            toastr.info("No AI messages with inject tags found");
            return;
        }

        const detection = lastAiMessage.runInfo?.detection;
        const sourceSummary = lastAiMessage.runInfo?.sourceSummary || "none";
        const visiblePreview = detection?.sources?.[0]?.text?.substring(0, 200) || "";
        const result = detection && detection.matches.length > 0
            ? `Found ${detection.matches.length} tag(s):\n${detection.matches.map(match => `[${match.sources.join(", ")}] ${match.prompt}`).join("\n")}`
            : `No tags found in last AI message or reasoning.\n\nScanned sources: ${sourceSummary}\n\nMessage preview:\n${visiblePreview}...\n\nRegex used:\n${lastAiMessage.runInfo?.regexPattern || ""}`;

        alert(result);
    };

    // Mode tab switching
    document.querySelectorAll(".qig-mode-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".qig-mode-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".qig-tab-panel").forEach(p => p.style.display = "none");
            tab.classList.add("active");
            document.getElementById("qig-tab-" + tab.dataset.tab).style.display = "block";
        });
    });
    bind("qig-palette-mode", "paletteMode");
    // LLM Override bindings
    document.getElementById("qig-llm-override").onchange = (e) => {
        getSettings().llmOverrideEnabled = e.target.checked;
        document.getElementById("qig-llm-override-options").style.display = e.target.checked ? "block" : "none";
        if (e.target.checked) {
            populateConnectionProfiles("qig-llm-override-profile", getSettings().llmOverrideProfileId);
            populatePresetList("qig-llm-override-preset-select", getSettings().llmOverridePreset);
        }
        saveSettingsDebounced();
    };
    document.getElementById("qig-llm-override-profile").onchange = (e) => {
        getSettings().llmOverrideProfileId = e.target.value;
        saveSettingsDebounced();
    };
    document.getElementById("qig-llm-override-preset-select").onchange = (e) => {
        getSettings().llmOverridePreset = e.target.value;
        saveSettingsDebounced();
    };
    bind("qig-llm-override-max", "llmOverrideMaxTokens", true);
    document.querySelector('.qig-mode-tab[data-tab="direct"]').classList.add("active");
    const widthEl = document.getElementById("qig-width");
    const heightEl = document.getElementById("qig-height");
    const onSizeChange = () => {
        const s = getSettings();
        const currentWidth = Number.isFinite(s.width) ? s.width : SIZE_DEFAULT;
        const currentHeight = Number.isFinite(s.height) ? s.height : SIZE_DEFAULT;
        s.width = parseIntOr(widthEl?.value, currentWidth);
        s.height = parseIntOr(heightEl?.value, currentHeight);
        if (s.provider === "novelai") {
            normalizeSize(s);
            syncNaiResolutionSelect();
        }
        syncSizeInputs(s.width, s.height);
        saveSettingsDebounced();
    };
    if (widthEl) widthEl.onchange = onSizeChange;
    if (heightEl) heightEl.onchange = onSizeChange;
    document.getElementById("qig-aspect").onchange = (e) => {
        const v = e.target.value;
        if (!v) return;
        const s = getSettings();
        const base = Math.min(s.width, s.height) || 512;
        const [w, h] = v.split(":").map(Number);
        if (isNaN(w) || isNaN(h) || h === 0) return;
        if (w > h) { s.width = Math.round(base * w / h); s.height = base; }
        else { s.width = base; s.height = Math.round(base * h / w); }
        if (s.provider === "novelai") {
            normalizeSize(s);
            syncNaiResolutionSelect();
        }
        syncSizeInputs(s.width, s.height);
        saveSettingsDebounced();
    };
    document.getElementById("qig-nai-resolution").onchange = (e) => {
        if (e.target.value === NAI_CUSTOM_RESOLUTION_VALUE) {
            syncNaiResolutionSelect();
            return;
        }
        const [w, h] = e.target.value.split("x").map(Number);
        if (isNaN(w) || isNaN(h)) return;
        const s = getSettings();
        s.width = w;
        s.height = h;
        normalizeSize(s);
        syncSizeInputs(s.width, s.height);
        syncNaiResolutionSelect();
        saveSettingsDebounced();
    };
    bind("qig-batch", "batchCount", true);
    document.getElementById("qig-batch").addEventListener("input", (e) => {
        const wrap = document.getElementById("qig-seq-seeds-wrap");
        if (wrap) wrap.style.display = parseInt(e.target.value) > 1 ? "" : "none";
    });
    bindCheckbox("qig-seq-seeds", "sequentialSeeds");
    bind("qig-steps", "steps", true);
    bind("qig-cfg", "cfgScale", true);
    bind("qig-sampler", "sampler");
    bind("qig-seed", "seed", true);

    updateProviderUI();

    // Drag and Drop Metadata Listener
    const settingsPanel = document.getElementById("qig-settings");
    if (settingsPanel) {
        settingsPanel.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); };
        settingsPanel.ondrop = handleMetadataDrop;
    }
}

function addInputButton() {
    if (document.getElementById("qig-input-btn")) return;
    if (getSettings().disablePaletteButton) return;

    const btn = document.createElement("div");
    btn.id = "qig-input-btn";
    btn.className = "fa-solid fa-palette interactable";
    btn.title = "Generate Image";
    btn.style.cssText = "cursor:pointer;padding:5px;font-size:1.2em;opacity:0.7;";
    btn.onclick = () => {
        const now = Date.now();
        if (isGenerating) {
            if (!requestGenerationCancel()) return;
            log("User cancelled generation via palette button");
            toastr.warning("Cancelling generation...");
            return;
        }
        if (now < paletteGenerateLockUntil) {
            log("Palette: Ignored rapid duplicate generate click");
            return;
        }
        paletteGenerateLockUntil = now + PALETTE_GENERATE_LOCK_MS;
        if (_autoGenTimeout) { clearTimeout(_autoGenTimeout); _autoGenTimeout = null; }
        const mode = getSettings().paletteMode || "direct";
        if (mode === "inject") generateImageInjectPalette();
        else generateImage();
    };

    // Add to left side area (away from send button)
    const leftArea = document.getElementById("leftSendForm") || document.querySelector("#send_form .left_menu_buttons");
    if (leftArea) {
        leftArea.appendChild(btn);
    }
}

async function generateImageInjectPalette() {
    if (isGenerating) return;
    const mySerial = ++_paletteInjectSerial;
    beginGeneration({ clearPendingAuto: true });
    _paletteInjectActive = true;
    const s = getSettings();
    const cancelCheckpoint = getCancelCheckpoint();
    let candidateRunInfo = null;
    let candidateRunCompleted = false;
    let ownsCandidateFingerprint = false;
    let lastAiMessage = null;

    try {
        checkAborted(cancelCheckpoint);
        const ctx = getContext();
        const chat = ctx.chat;
        let regexPattern;
        let initialDetection = null;
        let matches = [];

        try {
            regexPattern = getInjectRegexPattern(s);
            lastAiMessage = findLastInjectCandidateMessage(chat, s);
            if (lastAiMessage) {
                const nextRunInfo = lastAiMessage.runInfo;
                const existingRun = getInjectFingerprintEntry(nextRunInfo.fingerprint);
                if (existingRun) {
                    logInjectFingerprintSkip("Palette inject", nextRunInfo, existingRun);
                    toastr.info("Latest inject tags were already processed. Send a new reply or change the tag text to generate again.");
                    return;
                }
                candidateRunInfo = nextRunInfo;
                setInjectFingerprintState(candidateRunInfo.fingerprint, "processing", {
                    index: lastAiMessage.index,
                    source: "palette",
                });
                ownsCandidateFingerprint = true;
                initialDetection = candidateRunInfo.detection;
                matches = candidateRunInfo.matches;
                log(`Palette inject: Using message ${lastAiMessage.index} from ${candidateRunInfo.sourceSummary} [${candidateRunInfo.fingerprint}]`);
            }
        } catch (e) {
            if (ownsCandidateFingerprint) releaseInjectFingerprint(candidateRunInfo?.fingerprint);
            log(`Palette inject: Invalid regex: ${e.message}`);
            toastr.error("Invalid inject regex: " + e.message);
            return;
        }

        // Step 2: LLM fallback if no tags found
        if (matches.length === 0) {
            log("Palette inject: No image tags found, calling LLM...");
            showStatus("🔍 No image tags found — asking LLM to generate them...");

            const sceneContext = getMessages() || "the current scene";
            const injectInstruction = resolvePrompt(getInjectPromptTemplate(s));
            const timestamp = Date.now();
            const fullInstruction = `${injectInstruction}\n\nBased on this scene context, generate image tags for the key visual moments. YOU MUST use the exact tag format shown above.\n\nScene context:\n${sceneContext}\n\nRespond with image tags only.\n\n[${timestamp}]`;

            let llmResponse;
            if (s.llmOverrideEnabled && s.llmOverrideProfileId) {
                log("Using LLM Override for inject palette");
                llmResponse = await callOverrideLLM(fullInstruction);
            } else {
                const quietOptions = {
                    skipWIAN: true,
                    quietName: `ImageGenInject_${timestamp}`,
                    quietToLoud: false
                };
                try {
                    llmResponse = await generateQuietPrompt(fullInstruction, quietOptions);
                } catch (e) {
                    log(`Palette inject: generateQuietPrompt with options failed: ${e.message}, using simple call`);
                    llmResponse = await generateQuietPrompt(fullInstruction, false);
                }
            }
            checkAborted(cancelCheckpoint);

            log(`Palette inject: LLM response: ${(llmResponse || "").substring(0, 200)}...`);

            if (llmResponse) {
                matches = [...new Set(extractInjectMatchesFromText(llmResponse, regexPattern))];
            }

            if (matches.length === 0) {
                // Enhanced diagnostic logging
                const aiSources = initialDetection?.scannedSources?.join(", ") || "none";
                const aiMsgPreview = initialDetection?.sources?.[0]?.text?.substring(0, 200) || 'none';
                const llmPreview = (llmResponse || 'none').substring(0, 200);
                const regexPreview = regexPattern.substring(0, 100);

                log(`Palette inject: Regex pattern used: ${regexPattern}`);
                log(`Palette inject: AI sources scanned: ${aiSources}`);
                log(`Palette inject: AI message scanned: ${aiMsgPreview}...`);
                log(`Palette inject: LLM response received: ${llmPreview}...`);
                log(`Palette inject: Full instruction sent: ${fullInstruction.substring(0, 300)}...`);

                const debugInfo = `Regex: ${regexPreview}${regexPattern.length > 100 ? '...' : ''} | AI sources: ${aiSources} | AI msg: ${aiMsgPreview.substring(0, 50)}... | LLM: ${llmPreview.substring(0, 50)}...`;
                toastr.warning("No image tags found. Check console for details.", "Image Generation");
                log(`Palette inject: DIAGNOSTIC INFO - ${debugInfo}`);
                console.warn("QIG Inject Mode Debug:", {
                    regexPattern,
                    aiSources,
                    aiMessage: initialDetection?.sources?.map(source => ({ label: source.label, text: source.text })),
                    llmResponse,
                    instruction: fullInstruction
                });
                return;
            }
        }

        log(`Palette inject: Found ${matches.length} image tag(s), generating images...`);

        // Step 3: Generate images for each extracted prompt (same pipeline as processInjectMessage)
        const sceneTextForFilters = getMessages() || "";
        for (const extractedPrompt of matches) {
            checkAborted(cancelCheckpoint);
            showStatus(`🖼️ Generating palette-inject image...`);

            let prompt = await generateLLMPrompt(s, extractedPrompt, currentAbortController?.signal);
            checkAborted(cancelCheckpoint);

            // Show prompt editing dialog if enabled
            if (s.useLLMPrompt && s.llmEditPrompt && prompt !== extractedPrompt) {
                const editedPrompt = await showPromptEditDialog(prompt);
                if (editedPrompt !== null) {
                    prompt = editedPrompt;
                } else {
                    continue;
                }
            }

            let negative = resolvePrompt(s.negativePrompt);

            // Apply style
            prompt = applyStyle(prompt, s);

            // Apply quality tags
            if (s.appendQuality && s.qualityTags) {
                prompt = `${s.qualityTags}, ${prompt}`;
            }

            // Apply ST Style
            if (s.useSTStyle !== false) {
                const stStyle = getSTStyleSettings();
                if (stStyle.prefix) prompt = `${stStyle.prefix}, ${prompt}`;
                if (stStyle.charPositive) prompt = `${prompt}, ${stStyle.charPositive}`;
                if (stStyle.negative) negative = `${negative}, ${stStyle.negative}`;
                if (stStyle.charNegative) negative = `${negative}, ${stStyle.charNegative}`;
            }

            const contextualApplied = await applyResolvedContextualFilters(prompt, negative, {
                matchText: sceneTextForFilters || prompt,
                llmSceneText: sceneTextForFilters || extractedPrompt,
                signal: currentAbortController?.signal,
            });
            checkAborted(cancelCheckpoint);
            prompt = contextualApplied.prompt;
            negative = contextualApplied.negative;

            const replacementApplied = applyPromptReplacementMaps(prompt, negative);
            prompt = replacementApplied.prompt;
            negative = replacementApplied.negative;

            lastPrompt = prompt;
            lastNegative = negative;
            lastPromptWasLLM = (s.useLLMPrompt && prompt !== extractedPrompt);

            const batchCount = s.batchCount || 1;
            const results = [];
            const originalSeed = getGenerationSeedValue(s);
            const useSequentialSeeds = s.sequentialSeeds && batchCount > 1;
            const baseSeed = getBatchBaseSeed(s, batchCount, contextualApplied.seedOverride);
            for (let i = 0; i < batchCount; i++) {
                checkAborted(cancelCheckpoint);
                setGenerationSeedValue(s, useSequentialSeeds ? baseSeed + i : baseSeed);
                showStatus(`🖼️ Generating palette-inject image ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(prompt);
                const expandedNegative = expandWildcards(negative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s, currentAbortController?.signal);
                if (result) {
                    const entry = await finalizeGeneratedEntry(result, expandedPrompt, expandedNegative, s, { promptWasLLM: lastPromptWasLLM });
                    if (entry) results.push(entry);
                }
            }
            setGenerationSeedValue(s, originalSeed);

                if (results.length > 0) {
                    if (results.length === 1) {
                        if (s.autoInsert) {
                            addToGallery(results[0]);
                            try {
                                await autoInsertInjectImage(results[0].url, {
                                    messageIndex: lastAiMessage?.index,
                                    insertMode: s.insertAsHiddenReply ? "hidden" : s.injectInsertMode,
                                });
                            } catch (err) {
                                log(`Palette inject: Auto-insert failed: ${err.message}`);
                                displayImage(results[0]);
                        }
                    } else {
                        displayImage(results[0]);
                    }
                } else {
                    // Always show batch picker for multiple images
                    displayBatchResults(results);
                }
                toastr.success(`Palette inject: ${results.length} image(s) generated`);
            }
        }
        if (ownsCandidateFingerprint) {
            candidateRunCompleted = true;
        }
    } catch (e) {
        if (e.name === "AbortError") {
            log("Palette inject: Generation cancelled by user");
            toastr.info("Generation cancelled");
        } else {
            log(`Palette inject: Error: ${e.message}`);
            toastr.error("Palette inject failed: " + e.message, "", { timeOut: 0, extendedTimeOut: 0, closeButton: true });
        }
    } finally {
        if (candidateRunCompleted && ownsCandidateFingerprint) {
            setInjectFingerprintState(candidateRunInfo.fingerprint, "completed", {
                index: lastAiMessage?.index,
                matchCount: candidateRunInfo.matches.length,
                source: "palette",
            });
            log(`Palette inject: Completed run ${candidateRunInfo.fingerprint}`);
        }
        if (!candidateRunCompleted && ownsCandidateFingerprint) {
            releaseInjectFingerprint(candidateRunInfo?.fingerprint);
        }
        endGeneration();
        setTimeout(() => {
            if (_paletteInjectSerial === mySerial) _paletteInjectActive = false;
        }, 2000);
        clearStyleCache();
        log("Palette inject: Cleared caches after generation");
    }
}

async function generateImage() {
    if (isGenerating) return;
    if (getSettings().confirmBeforeGenerate && !confirm("Generate image?")) return;
    beginGeneration({ disableGenerateButton: true, clearPendingAuto: true });
    const s = getSettings();
    const cancelCheckpoint = getCancelCheckpoint();
    const originalSeed = getGenerationSeedValue(s);

    try {
    checkAborted(cancelCheckpoint);
    let basePrompt = resolvePrompt(s.prompt);
    let scenePrompt = "";

    if (s.useLastMessage) {
        const messages = getMessages();
        if (messages) {
            scenePrompt = messages;
            basePrompt = messages;
            if (s.enableParagraphPicker) {
                const filtered = await showParagraphPicker(messages);
                if (filtered === null) {
                    return; // finally block handles cleanup
                }
                scenePrompt = filtered;
                basePrompt = filtered;
            }
        }
    }

    log(`Base prompt: ${basePrompt.substring(0, 100)}...`);
    const batchCount = s.batchCount || 1;
    showStatus(`🎨 Generating ${batchCount} image(s)...`);

    let prompt = await generateLLMPrompt(s, scenePrompt || basePrompt, currentAbortController?.signal);
    checkAborted(cancelCheckpoint);
    lastPromptWasLLM = (s.useLLMPrompt && prompt !== (scenePrompt || basePrompt));

    // Show prompt editing dialog if enabled
    if (s.useLLMPrompt && s.llmEditPrompt && prompt !== basePrompt) {
        const editedPrompt = await showPromptEditDialog(prompt);
        if (editedPrompt !== null) {
            prompt = editedPrompt;
        } else {
            return; // finally block handles cleanup
        }
    }

    prompt = applyStyle(prompt, s);

    if (s.appendQuality && s.qualityTags) {
        prompt = `${s.qualityTags}, ${prompt}`;
    }
    let negative = resolvePrompt(s.negativePrompt);

    // Apply ST Style panel settings (prefix, char-specific, negative)
    if (s.useSTStyle !== false) {
        const stStyle = getSTStyleSettings();
        if (stStyle.prefix) prompt = `${stStyle.prefix}, ${prompt}`;
        if (stStyle.charPositive) prompt = `${prompt}, ${stStyle.charPositive}`;
        if (stStyle.negative) negative = `${negative}, ${stStyle.negative}`;
        if (stStyle.charNegative) negative = `${negative}, ${stStyle.charNegative}`;
    }

    const llmSceneText = scenePrompt || basePrompt;
    const contextualApplied = await applyResolvedContextualFilters(prompt, negative, {
        matchText: prompt,
        llmSceneText,
        signal: currentAbortController?.signal,
    });
    checkAborted(cancelCheckpoint);
    prompt = contextualApplied.prompt;
    negative = contextualApplied.negative;

    const replacementApplied = applyPromptReplacementMaps(prompt, negative);
    prompt = replacementApplied.prompt;
    negative = replacementApplied.negative;

    lastPrompt = prompt;
    lastNegative = negative;
    promptHistory.unshift({ prompt, negative, time: new Date().toLocaleTimeString() });
    if (promptHistory.length > 50) promptHistory.pop();
    savePromptHistory();

    log(`Final prompt: ${prompt.substring(0, 100)}...`);
    log(`Negative: ${negative.substring(0, 50)}...`);

            const results = [];
            log(`Using provider: ${s.provider}, batch: ${batchCount}`);
            const useSequentialSeeds = s.sequentialSeeds && batchCount > 1;
            const baseSeed = getBatchBaseSeed(s, batchCount, contextualApplied.seedOverride);
        for (let i = 0; i < batchCount; i++) {
            checkAborted(cancelCheckpoint);
            setGenerationSeedValue(s, useSequentialSeeds ? baseSeed + i : baseSeed);
                showStatus(`🖼️ Generating image ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(prompt);
                const expandedNegative = expandWildcards(negative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s, currentAbortController?.signal);
                if (result) {
                    const entry = await finalizeGeneratedEntry(result, expandedPrompt, expandedNegative, s, { promptWasLLM: lastPromptWasLLM });
                    if (entry) results.push(entry);
                }
            }
            log(`Generated ${results.length} image(s) successfully`);
            // Find last non-user message for insertion target
            const ctx2 = getContext();
            const lastCharIdx = (() => {
                const chat = ctx2.chat;
                if (!chat) return undefined;
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (!chat[i]?.is_user) return i;
                }
                return undefined;
            })();
            if (s.autoInsert) {
                for (const r of results) {
                    addToGallery(r);
                    try {
                        if (s.insertAsHiddenReply) {
                            await insertImageAsHiddenReply(r.url);
                        } else {
                            await insertImageIntoMessage(r.url, lastCharIdx);
                        }
                    } catch (err) {
                        console.error("[Quick Image Gen] Auto-insert failed:", err);
                    }
                }
            toastr.success(`Image${results.length > 1 ? 's' : ''} inserted into chat`);
        } else if (results.length === 1) {
            displayImage(results[0]);
        } else {
            displayBatchResults(results);
        }
    } catch (e) {
        if (e.name === "AbortError") {
            log("Generation cancelled by user");
            toastr.info("Generation cancelled");
        } else {
            log(`Error: ${e.message}`);
            toastr.error("Generation failed: " + e.message, "", { timeOut: 0, extendedTimeOut: 0, closeButton: true });
        }
    } finally {
        setGenerationSeedValue(s, originalSeed);
        endGeneration({ disableGenerateButton: true });
        // Clear caches after each generation to prevent reusing stale prompts
        clearStyleCache();
        log("Cleared all caches after generation");
    }
}


// === Inject Mode (AI-driven image generation via image tags) ===

function extractInjectMatchesFromText(text, regexPattern) {
    if (typeof text !== "string" || !text.trim()) return [];
    const regex = new RegExp(regexPattern, "gi");
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const captured = match.slice(1).find(group => typeof group === "string" && group.trim() !== "");
        if (captured) matches.push(captured.trim());
        if (match[0] === "") regex.lastIndex++;
    }
    return matches;
}

function getInjectCurrentSwipeText(message) {
    if (!Array.isArray(message?.swipes)) return "";
    const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
    return typeof message.swipes[swipeId] === "string" ? message.swipes[swipeId] : "";
}

function getInjectMessageSources(message) {
    if (!message || typeof message !== "object") return [];

    const sources = [];
    const seenTexts = new Set();
    const pushSource = (key, label, text) => {
        if (typeof text !== "string") return;
        const trimmed = text.trim();
        if (!trimmed || seenTexts.has(trimmed)) return;
        seenTexts.add(trimmed);
        sources.push({ key, label, text });
    };

    pushSource("extra.display_text", "display text", message?.extra?.display_text);
    pushSource("mes", "message", message?.mes);
    pushSource("swipes.current", "current swipe", getInjectCurrentSwipeText(message));
    pushSource("extra.reasoning_display_text", "reasoning display", message?.extra?.reasoning_display_text);
    pushSource("extra.reasoning", "reasoning", message?.extra?.reasoning);

    return sources;
}

function extractInjectPromptsFromMessage(message, settings = getSettings()) {
    const regexPattern = getInjectRegexPattern(settings);
    const sources = getInjectMessageSources(message);
    const promptMap = new Map();
    const matches = [];

    for (const source of sources) {
        for (const prompt of extractInjectMatchesFromText(source.text, regexPattern)) {
            if (!promptMap.has(prompt)) {
                const entry = { prompt, sources: [source.label] };
                promptMap.set(prompt, entry);
                matches.push(entry);
            } else if (!promptMap.get(prompt).sources.includes(source.label)) {
                promptMap.get(prompt).sources.push(source.label);
            }
        }
    }

    return {
        matches,
        regexPattern,
        sources,
        scannedSources: sources.map(source => source.label),
    };
}

function normalizeInjectFingerprintText(text) {
    return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

function hashInjectFingerprintText(text) {
    const source = String(text || "");
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function pruneInjectFingerprintRegistry(now = Date.now()) {
    for (const [fingerprint, entry] of _processedInjectFingerprints.entries()) {
        if (!entry || entry.expiresAt <= now) {
            _processedInjectFingerprints.delete(fingerprint);
        }
    }
}

function getInjectFingerprintEntry(fingerprint) {
    if (!fingerprint) return null;
    pruneInjectFingerprintRegistry();
    return _processedInjectFingerprints.get(fingerprint) || null;
}

function setInjectFingerprintState(fingerprint, status, meta = {}) {
    if (!fingerprint) return null;
    const now = Date.now();
    pruneInjectFingerprintRegistry(now);
    const entry = {
        status,
        updatedAt: now,
        expiresAt: now + INJECT_FINGERPRINT_TTL_MS,
        ...meta,
    };
    _processedInjectFingerprints.set(fingerprint, entry);
    return entry;
}

function releaseInjectFingerprint(fingerprint) {
    if (fingerprint) _processedInjectFingerprints.delete(fingerprint);
}

function getInjectChatScopeKey(ctx = (typeof getContext === "function" ? getContext() : null)) {
    try {
        if (!ctx) return "chat:unknown";
        if (ctx.groupId != null) return `group:${ctx.groupId}`;
        if (ctx.characterId != null) return `char:${ctx.characterId}`;
        const fallbackName = String(ctx.name2 || "").trim();
        if (fallbackName) return `name:${fallbackName}`;
    } catch (e) {
        log(`Inject: Failed to resolve chat scope: ${e.message}`);
    }
    return "chat:unknown";
}

function buildInjectFingerprint({ message, messageIndex, regexPattern, matches, sourceTexts, mode = "message" }) {
    const normalizedMatches = [...new Set((matches || []).map(normalizeInjectFingerprintText).filter(Boolean))].sort();
    const normalizedSourceHashes = [...new Set((sourceTexts || [])
        .map(normalizeInjectFingerprintText)
        .filter(Boolean)
        .map(hashInjectFingerprintText))].sort();
    const parts = [
        mode,
        getInjectChatScopeKey(),
        Number.isInteger(messageIndex) ? `idx:${messageIndex}` : "idx:none",
    ];
    const sendDate = typeof message?.send_date === "string" ? message.send_date.trim() : "";
    if (sendDate) parts.push(`send:${sendDate}`);
    if (Number.isInteger(message?.swipe_id)) parts.push(`swipe:${message.swipe_id}`);
    if (regexPattern) parts.push(`regex:${hashInjectFingerprintText(regexPattern)}`);
    if (normalizedMatches.length) parts.push(`matches:${normalizedMatches.map(hashInjectFingerprintText).join(",")}`);
    if (normalizedSourceHashes.length) parts.push(`sources:${normalizedSourceHashes.join(",")}`);
    return `inject:${hashInjectFingerprintText(parts.join("|"))}`;
}

function buildInjectRunInfo({ message, messageText = "", messageIndex, settings = getSettings(), mode = "message" } = {}) {
    const regexPattern = getInjectRegexPattern(settings);
    const rawMatches = extractInjectMatchesFromText(messageText, regexPattern);

    let detection = null;
    let matches = [];
    let sourceTexts = [];
    let sourceSummary = "message";

    if (rawMatches.length > 0) {
        matches = [...new Set(rawMatches)];
        sourceTexts = [messageText];
        sourceSummary = "raw message text";
    } else if (message) {
        detection = extractInjectPromptsFromMessage(message, settings);
        matches = detection.matches.map(match => match.prompt);
        sourceTexts = detection.sources.map(source => source.text);
        sourceSummary = detection.scannedSources.join(", ") || "message";
    }

    return {
        detection,
        fingerprint: matches.length > 0 ? buildInjectFingerprint({
            message,
            messageIndex,
            regexPattern,
            matches,
            sourceTexts,
            mode,
        }) : null,
        matches,
        messageIndex,
        mode,
        regexPattern,
        sourceSummary,
        sourceTexts,
    };
}

function logInjectFingerprintSkip(prefix, runInfo, entry) {
    if (!runInfo?.fingerprint) return;
    const indexLabel = Number.isInteger(runInfo.messageIndex) ? `message ${runInfo.messageIndex}` : "message";
    log(`${prefix}: Skipping ${indexLabel}; fingerprint ${runInfo.fingerprint} is already ${entry?.status || "tracked"}`);
}

function findLastInjectCandidateMessage(chat, settings = getSettings()) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (message?.is_user || message?.extra?.inline_image) continue;
        const runInfo = buildInjectRunInfo({
            message,
            messageIndex: i,
            settings,
        });
        if (runInfo.matches.length > 0) {
            return { message, index: i, runInfo };
        }
    }
    return null;
}

function cleanInjectTagsFromMessage(message, regexPattern) {
    if (!message || typeof message !== "object") return false;

    let changed = false;
    const replaceInField = (holder, key) => {
        if (!holder || typeof holder[key] !== "string" || !holder[key].trim()) return;
        const nextValue = holder[key].replace(new RegExp(regexPattern, "gi"), "").trim();
        if (nextValue !== holder[key]) {
            holder[key] = nextValue;
            changed = true;
        }
    };

    replaceInField(message, "mes");
    replaceInField(message?.extra, "display_text");
    replaceInField(message?.extra, "reasoning_display_text");
    replaceInField(message?.extra, "reasoning");

    if (Array.isArray(message.swipes)) {
        const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
        if (typeof message.swipes[swipeId] === "string") {
            const nextValue = message.swipes[swipeId].replace(new RegExp(regexPattern, "gi"), "").trim();
            if (nextValue !== message.swipes[swipeId]) {
                message.swipes[swipeId] = nextValue;
                changed = true;
            }
        }
    }

    return changed;
}

function onChatCompletionPromptReady(eventData) {
    if (isGenerating) return; // Don't inject into our own internal LLM calls
    const s = getSettings();
    if (!s.injectEnabled) return;

    const promptText = resolvePrompt(getInjectPromptTemplate(s));
    const position = s.injectPosition || "afterScenario";
    const depth = s.injectDepth || 0;

    try {
        // eventData is the prompt array (array of {role, content} objects)
        const prompts = Array.isArray(eventData) ? eventData : eventData?.chat;
        if (!prompts || !Array.isArray(prompts)) {
            log("Inject: Could not find prompt array in event data");
            return;
        }

        const injectMsg = { role: "system", content: promptText };

        if (position === "afterScenario") {
            // Insert after the first system message (scenario)
            const firstSystemEnd = prompts.findIndex((m, i) => i > 0 && m.role !== "system");
            if (firstSystemEnd > 0) {
                prompts.splice(firstSystemEnd, 0, injectMsg);
            } else {
                prompts.push(injectMsg);
            }
        } else if (position === "inUser") {
            // Insert as system message before the last user message
            for (let i = prompts.length - 1; i >= 0; i--) {
                if (prompts[i].role === "user") {
                    prompts.splice(i, 0, injectMsg);
                    break;
                }
            }
        } else if (position === "atDepth") {
            // Insert at specific depth from the end
            const insertIdx = Math.max(0, prompts.length - depth);
            prompts.splice(insertIdx, 0, injectMsg);
        }

        log(`Inject: Injected prompt at position '${position}'${position === "atDepth" ? ` depth ${depth}` : ""}`);
    } catch (e) {
        log(`Inject: Error injecting prompt: ${e.message}`);
    }
}

async function processInjectMessage(messageText, messageIndex, initialRunInfo = null) {
    const cancelCheckpoint = getCancelCheckpoint();
    let activeRunInfo = initialRunInfo;
    let keepFingerprint = false;
    let ownsFingerprint = !!initialRunInfo?.fingerprint;
    let runAborted = false;

    try {
        _injectProcessingCount++;
        const s = getSettings();
        if (!s.injectEnabled) {
            if (ownsFingerprint) releaseInjectFingerprint(activeRunInfo?.fingerprint);
            return;
        }

        const ctx = getContext();
        const chat = ctx?.chat;
        const idx = typeof messageIndex === "number" ? messageIndex : (chat ? chat.length - 1 : -1);
        const message = idx >= 0 ? chat?.[idx] : (typeof messageText === "string" ? { mes: messageText } : null);
        if (!message) {
            if (ownsFingerprint) releaseInjectFingerprint(activeRunInfo?.fingerprint);
            return;
        }

        try {
            if (!activeRunInfo) {
                activeRunInfo = buildInjectRunInfo({
                    message,
                    messageIndex: idx,
                    messageText,
                    mode: "message",
                    settings: s,
                });
                const existingRun = getInjectFingerprintEntry(activeRunInfo.fingerprint);
                if (existingRun) {
                    logInjectFingerprintSkip("Inject", activeRunInfo, existingRun);
                    return;
                }
            }
            setInjectFingerprintState(activeRunInfo.fingerprint, "processing", {
                index: idx,
                source: "message",
            });
            ownsFingerprint = true;
        } catch (e) {
            if (ownsFingerprint) releaseInjectFingerprint(activeRunInfo?.fingerprint);
            log(`Inject: Invalid regex: ${e.message}`);
            return;
        }

        const detection = activeRunInfo?.detection || null;
        const matches = activeRunInfo?.matches || [];
        if (matches.length === 0) {
            if (ownsFingerprint) releaseInjectFingerprint(activeRunInfo?.fingerprint);
            log(`Inject: No tags found for message ${idx}; skipping queue`);
            return;
        }

        log(`Inject: Processing ${matches.length} image tag(s) from ${activeRunInfo.sourceSummary} [${activeRunInfo.fingerprint}]`);

        // Clean tags from displayed message if enabled
        if (s.injectAutoClean !== false && idx >= 0 && chat?.[idx]) {
            try {
                if (cleanInjectTagsFromMessage(chat[idx], activeRunInfo.regexPattern)) {
                    await ctx.saveChat();
                    if (typeof ctx.reloadCurrentChat === 'function') {
                        await ctx.reloadCurrentChat();
                    }
                    log("Inject: Cleaned image tags from message");
                }
            } catch (e) {
                log(`Inject: Error cleaning tags: ${e.message}`);
            }
        }

        // Generate images for each extracted prompt
        const sceneTextForFilters = getMessages() || "";
        for (const extractedPrompt of matches) {
            const originalSeed = getGenerationSeedValue(s);
            let startedGeneration = false;
            try {
                checkAborted(cancelCheckpoint);
                if (isGenerating) {
                    log("Inject: Waiting for current generation to finish...");
                    await new Promise((resolve, reject) => {
                        let elapsed = 0;
                        const check = setInterval(() => {
                            elapsed += 500;
                            if (!isGenerating) { clearInterval(check); resolve(); }
                            else if (wasCancelRequestedSince(cancelCheckpoint)) {
                                clearInterval(check);
                                reject(new DOMException("Generation cancelled by user", "AbortError"));
                            }
                            else if (elapsed >= 60000) { clearInterval(check); reject(new Error("Timed out waiting for generation")); }
                        }, 500);
                    });
                }
                checkAborted(cancelCheckpoint);
                beginGeneration();
                startedGeneration = true;
                checkAborted(cancelCheckpoint);
                log(`Inject: Generating image for: ${extractedPrompt.substring(0, 80)}...`);
                showStatus("🖼️ Generating inject-mode image...");

                let prompt = await generateLLMPrompt(s, extractedPrompt, currentAbortController?.signal);
                checkAborted(cancelCheckpoint);

                // Show prompt editing dialog if enabled
                if (s.useLLMPrompt && s.llmEditPrompt && prompt !== extractedPrompt) {
                    const editedPrompt = await showPromptEditDialog(prompt);
                    if (editedPrompt !== null) {
                        prompt = editedPrompt;
                    } else {
                        continue;
                    }
                }

                let negative = resolvePrompt(s.negativePrompt);

                // Apply style
                prompt = applyStyle(prompt, s);

                // Apply quality tags
                if (s.appendQuality && s.qualityTags) {
                    prompt = `${s.qualityTags}, ${prompt}`;
                }

                // Apply ST Style
                if (s.useSTStyle !== false) {
                    const stStyle = getSTStyleSettings();
                    if (stStyle.prefix) prompt = `${stStyle.prefix}, ${prompt}`;
                    if (stStyle.charPositive) prompt = `${prompt}, ${stStyle.charPositive}`;
                    if (stStyle.negative) negative = `${negative}, ${stStyle.negative}`;
                    if (stStyle.charNegative) negative = `${negative}, ${stStyle.charNegative}`;
                }

                const contextualApplied = await applyResolvedContextualFilters(prompt, negative, {
                    matchText: sceneTextForFilters || prompt,
                    llmSceneText: sceneTextForFilters || extractedPrompt,
                    signal: currentAbortController?.signal,
                });
                checkAborted(cancelCheckpoint);
                prompt = contextualApplied.prompt;
                negative = contextualApplied.negative;

                const replacementApplied = applyPromptReplacementMaps(prompt, negative);
                prompt = replacementApplied.prompt;
                negative = replacementApplied.negative;

                lastPrompt = prompt;
                lastNegative = negative;
                lastPromptWasLLM = (s.useLLMPrompt && prompt !== extractedPrompt);

                const batchCount = s.batchCount || 1;
                const results = [];
                const useSequentialSeeds = s.sequentialSeeds && batchCount > 1;
                const baseSeed = getBatchBaseSeed(s, batchCount, contextualApplied.seedOverride);
                for (let i = 0; i < batchCount; i++) {
                    checkAborted(cancelCheckpoint);
                    setGenerationSeedValue(s, useSequentialSeeds ? baseSeed + i : baseSeed);
                    showStatus(`🖼️ Generating inject image ${i + 1}/${batchCount}...`);
                    const expandedPrompt = expandWildcards(prompt);
                    const expandedNegative = expandWildcards(negative);
                    const result = await generateForProvider(expandedPrompt, expandedNegative, s, currentAbortController?.signal);
                    if (result) {
                        const entry = await finalizeGeneratedEntry(result, expandedPrompt, expandedNegative, s, { promptWasLLM: lastPromptWasLLM });
                        if (entry) results.push(entry);
                    }
                }
                setGenerationSeedValue(s, originalSeed);

                if (results.length > 0) {
                    if (results.length === 1) {
                        if (s.autoInsert) {
                            addToGallery(results[0]);
                            try {
                                await autoInsertInjectImage(results[0].url, {
                                    messageIndex,
                                    insertMode: s.injectInsertMode,
                                });
                            } catch (err) {
                                log(`Inject: Auto-insert failed: ${err.message}`);
                                displayImage(results[0]);
                            }
                        } else {
                            displayImage(results[0]);
                        }
                    } else {
                        // Always show batch picker for multiple images
                        displayBatchResults(results);
                    }
                    toastr.success(`Inject mode: ${results.length} image(s) generated`);
                }
            } catch (e) {
                if (e.name === "AbortError") {
                    runAborted = true;
                    log("Inject: Generation cancelled by user");
                    toastr.info("Generation cancelled");
                    break; // Exit the entire match loop on cancel
                } else {
                    log(`Inject: Generation error: ${e.message}`);
                    toastr.error("Inject generation failed: " + e.message, "", { timeOut: 0, extendedTimeOut: 0, closeButton: true });
                }
            } finally {
                setGenerationSeedValue(s, originalSeed);
                if (startedGeneration || cancelRequested) endGeneration();
            }
        }
        if (!runAborted) {
            keepFingerprint = true;
            setInjectFingerprintState(activeRunInfo.fingerprint, "completed", {
                index: idx,
                matchCount: matches.length,
                source: "message",
            });
            log(`Inject: Completed run ${activeRunInfo.fingerprint}`);
        }
    } finally {
        _injectProcessingCount--;
        if (!keepFingerprint && ownsFingerprint) {
            releaseInjectFingerprint(activeRunInfo?.fingerprint);
        }
    }
}


jQuery(function () {
    // Non-blocking async initialization
    (async () => {
        try {
            const extensionsModule = await import("../../../extensions.js");
            const scriptModule = await import("../../../../script.js");
            extension_settings = extensionsModule.extension_settings;
            getContext = extensionsModule.getContext;
            saveSettingsDebounced = scriptModule.saveSettingsDebounced;
            generateQuietPrompt = scriptModule.generateQuietPrompt;
            getRequestHeaders = scriptModule.getRequestHeaders;

            try {
                const utilsModule = await import("../../../utils.js");
                saveBase64AsFile = utilsModule.saveBase64AsFile;
                getSanitizedFilename = utilsModule.getSanitizedFilename;
            } catch (e) {
                console.warn("[ImageGen] Could not import utils module:", e.message);
            }

            try {
                const rossModule = await import("../../../RossAscends-mods.js");
                humanizedDateTime = rossModule.humanizedDateTime;
            } catch (e) {
                console.warn("[ImageGen] Could not import RossAscends-mods:", e.message);
            }

            try {
                const secretsModule = await import("../../../../scripts/secrets.js");
                secret_state = secretsModule.secret_state;
                rotateSecret = secretsModule.rotateSecret;
            } catch (e) {
                console.warn("[ImageGen] Could not import secrets module:", e.message);
            }

            await loadSettings();
            createUI();
            addInputButton();
            loadCharSettings();

            // Ensure paletteMode select reflects saved setting after DOM insertion
            const palModeEl = document.getElementById("qig-palette-mode");
            if (palModeEl) palModeEl.value = getSettings().paletteMode || "direct";

            // Populate LLM override dropdowns if enabled
            const initSettings = getSettings();
            if (initSettings.llmOverrideEnabled) {
                populateConnectionProfiles("qig-llm-override-profile", initSettings.llmOverrideProfileId);
                populatePresetList("qig-llm-override-preset-select", initSettings.llmOverridePreset);
            }

            const { eventSource, event_types } = scriptModule;
            if (eventSource) {
                eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
                    if (_paletteInjectActive || _injectProcessingCount > 0) return;
                    const s = getSettings();
                    if (!s.autoGenerate) return;
                    // Inject mode: extract image tags from AI response/reasoning
                    // Checked first — if active, skip autoGenerate to prevent double generation
                    if (s.injectEnabled) {
                        const ctx = getContext();
                        const chat = ctx?.chat;
                        const idx = typeof messageIndex === "number" ? messageIndex : (chat ? chat.length - 1 : -1);
                        const msg = chat?.[idx];
                        if (msg && !msg.is_user && !msg.extra?.inline_image) {
                            let runInfo;
                            try {
                                runInfo = buildInjectRunInfo({
                                    message: msg,
                                    messageIndex: idx,
                                    messageText: msg.mes || "",
                                    settings: s,
                                });
                            } catch (e) {
                                log(`Inject: Invalid regex while scanning message ${idx}: ${e.message}`);
                                return;
                            }
                            if (runInfo.matches.length === 0) {
                                log(`Inject: Hook skipped message ${idx}; no tags found`);
                                return;
                            }
                            const existingRun = getInjectFingerprintEntry(runInfo.fingerprint);
                            if (existingRun) {
                                logInjectFingerprintSkip("Inject hook", runInfo, existingRun);
                                return;
                            }
                            setInjectFingerprintState(runInfo.fingerprint, "queued", {
                                index: idx,
                                source: "message-hook",
                            });
                            log(`Inject: Queueing message ${idx} with ${runInfo.matches.length} tag(s) [${runInfo.fingerprint}]`);
                            setTimeout(() => processInjectMessage(msg.mes || "", idx, runInfo), 300);
                        }
                        return;
                    }
                    // Auto-generate mode (debounced — only one pending timeout at a time)
                    if (s.autoGenerate && !isGenerating) {
                        if (_autoGenTimeout) clearTimeout(_autoGenTimeout);
                        _autoGenTimeout = setTimeout(() => {
                            _autoGenTimeout = null;
                            if (!isGenerating) generateImage();
                        }, 500);
                    }
                });
                // Inject mode: inject prompt into chat completion
                if (event_types.CHAT_COMPLETION_PROMPT_READY) {
                    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
                }
                eventSource.on(event_types.CHAT_CHANGED, () => {
                    if (_autoGenTimeout) {
                        clearTimeout(_autoGenTimeout);
                        _autoGenTimeout = null;
                    }
                    pruneInjectFingerprintRegistry();
                    loadCharSettings();
                    renderContextualFilters();
                    renderPromptReplacements();
                });
            }
        } catch (err) {
            console.error("[Quick Image Gen] Initialization failed:", err);
        }
    })();
});


let _saveToServerToastTs = 0;
function warnSaveToServer(msg) {
    log(msg);
    if (typeof toastr !== "undefined") {
        const now = Date.now();
        if (now - _saveToServerToastTs > 4000) {
            toastr.warning(msg);
            _saveToServerToastTs = now;
        }
    }
}

function getProviderModelId(settings, provider = settings?.provider) {
    switch (provider) {
        case "pollinations": return settings?.pollinationsModel || "flux";
        case "novelai": return settings?.naiModel || null;
        case "arliai": return settings?.arliModel || null;
        case "nanogpt": return settings?.nanogptModel || null;
        case "chutes": return settings?.chutesModel || null;
        case "civitai": return settings?.civitaiModel || null;
        case "nanobanana": return settings?.nanobananaModel || null;
        case "stability": return "stable-diffusion-xl-1024-v1-0";
        case "replicate": return settings?.replicateModel || null;
        case "fal": return settings?.falModel || null;
        case "together": return settings?.togetherModel || null;
        case "local": return settings?.localType === "a1111" ? (settings?.a1111Model || settings?.localModel || null) : (settings?.localModel || null);
        case "proxy": return settings?.proxyModel || null;
        default: return null;
    }
}

function getMetadataSettings(s, options = {}) {
    const provider = options.provider || s.provider;
    const isProxy = provider === "proxy";
    const currentSeed = isProxy ? (s.proxySeed ?? s.seed) : s.seed;
    const seed = Number.isFinite(options.resolvedSeed)
        ? options.resolvedSeed
        : (Number.isFinite(currentSeed) && currentSeed >= 0 ? currentSeed : undefined);

    const metadata = {
        steps: isProxy ? (s.proxySteps ?? s.steps) : s.steps,
        sampler: isProxy ? (s.proxySampler || s.sampler) : s.sampler,
        cfgScale: isProxy ? (s.proxyCfg ?? s.cfgScale) : s.cfgScale,
        seed,
        width: s.width,
        height: s.height,
        provider,
        model: getProviderModelId(s, provider),
        saveToServer: s.saveToServer,
        saveToServerEmbedMetadata: s.saveToServerEmbedMetadata,
    };

    if (provider === "local") {
        metadata.backend = s.localType || "a1111";
        metadata.scheduler = s.localType === "a1111" ? s.a1111Scheduler : (s.comfyScheduler || undefined);
    } else if (provider === "civitai") {
        metadata.scheduler = s.civitaiScheduler || undefined;
    } else if (provider === "proxy" && s.proxyComfyMode) {
        metadata.backend = "comfyui";
    }

    return metadata;
}

function getServerSubfolder() {
    try {
        const ctx = getContext?.();
        if (!ctx) return "QuickImageGen";
        if (ctx.groupId) {
            const groupKey = Object.keys(ctx.groups || {}).find(k => ctx.groups[k]?.id === ctx.groupId);
            const groupId = groupKey ? ctx.groups[groupKey]?.id : null;
            if (groupId != null) return String(groupId);
        }
        const name = ctx.characters?.[ctx.characterId]?.name;
        if (name) return name;
    } catch (e) {
        log(`SaveToServer: Failed to resolve subfolder: ${e.message}`);
    }
    return "QuickImageGen";
}

async function fetchImageBuffer(url) {
    const isDataLike = url.startsWith("data:") || url.startsWith("blob:");
    const res = isDataLike ? await fetch(url) : await corsFetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
    const contentType = res.headers.get("content-type") || "";
    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
}

function detectImageFormat(buffer, contentType = "", url = "") {
    const bytes = new Uint8Array(buffer);
    const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    if (isPng) return { ext: "png", mime: "image/png", isPng: true };
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    if (isJpeg) return { ext: "jpg", mime: "image/jpeg", isPng: false };
    const isWebp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (isWebp) return { ext: "webp", mime: "image/webp", isPng: false };
    const isGif = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
    if (isGif) return { ext: "gif", mime: "image/gif", isPng: false };
    const ct = contentType.toLowerCase();
    if (ct.includes("png")) return { ext: "png", mime: "image/png", isPng: true };
    if (ct.includes("webp")) return { ext: "webp", mime: "image/webp", isPng: false };
    if (ct.includes("jpeg") || ct.includes("jpg")) return { ext: "jpg", mime: "image/jpeg", isPng: false };
    if (ct.includes("gif")) return { ext: "gif", mime: "image/gif", isPng: false };

    let urlPath = "";
    try {
        urlPath = new URL(url, window.location?.href || "http://localhost/").pathname.toLowerCase();
    } catch {
        urlPath = String(url || "").split(/[?#]/, 1)[0].toLowerCase();
    }

    if (urlPath.endsWith(".png")) return { ext: "png", mime: "image/png", isPng: true };
    if (urlPath.endsWith(".webp")) return { ext: "webp", mime: "image/webp", isPng: false };
    if (urlPath.endsWith(".gif")) return { ext: "gif", mime: "image/gif", isPng: false };
    if (urlPath.endsWith(".jpg") || urlPath.endsWith(".jpeg")) return { ext: "jpg", mime: "image/jpeg", isPng: false };
    return { ext: "jpg", mime: "image/jpeg", isPng: false };
}

function replaceFilenameExtension(filename, ext) {
    const safeExt = (ext || "png").replace(/^\./, "");
    if (!filename) return `generated.${safeExt}`;
    return /\.[^./\\]+$/.test(filename)
        ? filename.replace(/\.[^./\\]+$/, `.${safeExt}`)
        : `${filename}.${safeExt}`;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function saveImageToServer(url, prompt, negative, settings) {
    const { buffer, contentType } = await fetchImageBuffer(url);
    const formatInfo = detectImageFormat(buffer, contentType, url);
    let finalBuffer = buffer;

    if (formatInfo.isPng && settings?.saveToServerEmbedMetadata !== false) {
        const metaText = buildMetadataString(prompt, negative, settings || {});
        finalBuffer = embedPNGMetadata(buffer, metaText);
    }

    const base64 = arrayBufferToBase64(finalBuffer);
    const subFolder = getServerSubfolder();
    let filename = `qig_${typeof humanizedDateTime === "function" ? humanizedDateTime() : Date.now()}`;
    if (typeof getSanitizedFilename === "function") {
        try {
            filename = await getSanitizedFilename(filename);
        } catch (e) {
            log(`SaveToServer: filename sanitize failed: ${e.message}`);
        }
    }
    return await saveBase64AsFile(base64, subFolder, filename, formatInfo.ext);
}

async function maybeFinalizeUrl(url, prompt, negative, settings) {
    const s = settings || getSettings();
    if (!s?.saveToServer) return url;
    if (typeof saveBase64AsFile !== "function") {
        warnSaveToServer("Save to server unavailable (missing API)");
        return url;
    }
    try {
        const path = await saveImageToServer(url, prompt, negative, s);
        return path || url;
    } catch (e) {
        warnSaveToServer(`Save to server failed: ${e.message}`);
        return url;
    }
}

// === PNG Metadata Embedding ===
function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildMetadataString(prompt, negative, settings) {
    const parts = [prompt];
    if (negative) parts.push(`Negative prompt: ${negative}`);
    const params = [];
    const steps = Number(settings.steps);
    const cfgScale = Number(settings.cfgScale);
    const width = Number(settings.width);
    const height = Number(settings.height);

    if (Number.isFinite(steps) && steps > 0) params.push(`Steps: ${steps}`);
    if (settings.sampler) params.push(`Sampler: ${SAMPLER_DISPLAY_NAMES[settings.sampler] || settings.sampler}`);
    if (settings.scheduler && settings.scheduler !== "Automatic") params.push(`Scheduler: ${settings.scheduler}`);
    if (Number.isFinite(cfgScale)) params.push(`CFG scale: ${cfgScale}`);
    if (Number.isFinite(settings.seed) && settings.seed >= 0) params.push(`Seed: ${settings.seed}`);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) params.push(`Size: ${width}x${height}`);
    if (settings.provider) params.push(`Provider: ${settings.provider}`);
    if (settings.model) params.push(`Model: ${settings.model}`);
    if (settings.backend) params.push(`Backend: ${settings.backend}`);
    if (params.length) parts.push(params.join(', '));
    return parts.join('\n');
}

function embedPNGMetadata(arrayBuffer, text) {
    const src = new Uint8Array(arrayBuffer);
    // Verify PNG signature
    if (src[0] !== 0x89 || src[1] !== 0x50) return arrayBuffer;

    const keyword = "parameters";
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(keyword);
    const valBytes = encoder.encode(text);
    const dataLen = keyBytes.length + 1 + valBytes.length; // keyword + null separator + value
    const typeBytes = encoder.encode("tEXt");

    // Build chunk: length(4) + type(4) + data + crc(4)
    const chunk = new Uint8Array(12 + dataLen);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, dataLen);
    chunk.set(typeBytes, 4);
    chunk.set(keyBytes, 8);
    chunk[8 + keyBytes.length] = 0; // null separator
    chunk.set(valBytes, 8 + keyBytes.length + 1);

    // CRC over type + data
    const crcData = new Uint8Array(4 + dataLen);
    crcData.set(typeBytes, 0);
    crcData.set(keyBytes, 4);
    crcData[4 + keyBytes.length] = 0;
    crcData.set(valBytes, 4 + keyBytes.length + 1);
    view.setUint32(8 + dataLen, crc32(crcData));

    // Find IEND position
    let iendPos = src.length;
    let offset = 8;
    while (offset < src.length) {
        if (offset + 12 > src.length) break;
        const len = (src[offset] << 24 | src[offset+1] << 16 | src[offset+2] << 8 | src[offset+3]) >>> 0;
        const type = String.fromCharCode(src[offset+4], src[offset+5], src[offset+6], src[offset+7]);
        if (type === 'IEND') { iendPos = offset; break; }
        if (len === 0 && type === '\0\0\0\0' || offset + len + 12 > src.length) break;
        offset += len + 12;
    }

    // Insert chunk before IEND
    const result = new Uint8Array(src.length + chunk.length);
    result.set(src.subarray(0, iendPos), 0);
    result.set(chunk, iendPos);
    result.set(src.subarray(iendPos), iendPos + chunk.length);
    return result.buffer;
}

async function downloadWithMetadata(url, filename, prompt, negative, settings) {
    try {
        const { buffer: arrayBuffer, contentType } = await fetchImageBuffer(url);
        const formatInfo = detectImageFormat(arrayBuffer, contentType, url);
        const metaText = buildMetadataString(prompt, negative, settings || {});
        const finalBuffer = formatInfo.isPng ? embedPNGMetadata(arrayBuffer, metaText) : arrayBuffer;
        const blob = new Blob([finalBuffer], { type: formatInfo.mime });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = replaceFilenameExtension(filename, formatInfo.ext);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
        console.error("Download with metadata failed:", err);
        toastr?.warning?.("Could not embed metadata for this image; opening original file.");
        window.open(url, '_blank');
    }
}

// Metadata Drag and Drop Handlers
async function decompressPngTextData(data) {
    if (typeof DecompressionStream !== "function") return null;
    try {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
    } catch {
        return null;
    }
}

async function readPngParametersChunk(type, data) {
    const keywordEnd = data.indexOf(0);
    if (keywordEnd < 0) return null;

    const keyword = new TextDecoder().decode(data.slice(0, keywordEnd));
    if (keyword !== "parameters") return null;

    if (type === "tEXt") {
        return new TextDecoder().decode(data.slice(keywordEnd + 1));
    }

    if (type === "zTXt") {
        const compressionMethod = data[keywordEnd + 1];
        if (compressionMethod !== 0) return null;
        const decompressed = await decompressPngTextData(data.slice(keywordEnd + 2));
        return decompressed ? new TextDecoder().decode(decompressed) : null;
    }

    if (type === "iTXt") {
        let cursor = keywordEnd + 1;
        if (cursor + 2 > data.length) return null;
        const compressionFlag = data[cursor++];
        const compressionMethod = data[cursor++];

        while (cursor < data.length && data[cursor] !== 0) cursor++;
        cursor++;
        while (cursor < data.length && data[cursor] !== 0) cursor++;
        cursor++;

        const textBytes = data.slice(cursor);
        if (compressionFlag === 1) {
            if (compressionMethod !== 0) return null;
            const decompressed = await decompressPngTextData(textBytes);
            return decompressed ? new TextDecoder().decode(decompressed) : null;
        }
        return new TextDecoder().decode(textBytes);
    }

    return null;
}

async function readInfoFromPNG(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const buffer = e.target.result;
            const view = new DataView(buffer);
            let offset = 8; // Skip PNG signature

            while (offset < view.byteLength) {
                if (offset + 12 > view.byteLength) break;
                const length = view.getUint32(offset);
                if (offset + length + 12 > view.byteLength) break;
                const type = String.fromCharCode(
                    view.getUint8(offset + 4),
                    view.getUint8(offset + 5),
                    view.getUint8(offset + 6),
                    view.getUint8(offset + 7)
                );

                if (type === 'IEND') break;

                if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
                    const dataOffset = offset + 8;
                    const data = new Uint8Array(buffer, dataOffset, length);
                    const text = await readPngParametersChunk(type, data);
                    if (text) {
                        resolve(text);
                        return;
                    }
                }

                offset += length + 12; // Length + Type + Data + CRC
            }
            resolve(null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(file);
    });
}

function parseGenerationParameters(text) {
    if (!text) return null;

    // Split into prompt and negative/params
    const parts = text.split(/Negative prompt: /);
    let prompt = parts[0].trim();
    let negative = "";
    let params = "";

    if (parts.length > 1) {
        const remaining = parts[1];
        const lastLineIdx = remaining.lastIndexOf("\nSteps: ");
        if (lastLineIdx !== -1) {
            negative = remaining.substring(0, lastLineIdx).trim();
            params = remaining.substring(lastLineIdx).trim();
        } else {
            // No params line found
            negative = remaining.trim();
        }
    } else {
        // Look for Steps: in the first part if no negative prompt
        const lastLineIdx = text.lastIndexOf("\nSteps: ");
        if (lastLineIdx !== -1) {
            prompt = text.substring(0, lastLineIdx).trim();
            params = text.substring(lastLineIdx).trim();
        }
    }

    const result = { prompt, negativePrompt: negative };

    // Parse key-value params
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const getParam = (key) => {
        const match = params.match(new RegExp(`${escapeRegex(key)}: ([^,\n]+)`));
        return match ? match[1].trim() : null;
    };

    const steps = getParam("Steps");
    const sampler = getParam("Sampler");
    const scheduler = getParam("Scheduler");
    const cfg = getParam("CFG scale");
    const seed = getParam("Seed");
    const size = getParam("Size");
    const provider = getParam("Provider");
    const model = getParam("Model");
    const backend = getParam("Backend");

    if (steps !== null) result.steps = parseInt(steps, 10);
    if (sampler) result.sampler = sampler;
    if (scheduler) result.scheduler = scheduler;
    if (cfg !== null) result.cfgScale = parseFloat(cfg);
    if (seed !== null) result.seed = parseInt(seed, 10);
    if (size) {
        const [w, h] = size.split("x").map(Number);
        result.width = w;
        result.height = h;
    }
    if (provider) result.provider = provider;
    if (model) result.model = model;
    if (backend) result.backend = backend;

    return result;
}

async function handleMetadataDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file) return;
    const fileType = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();
    const isPngMime = fileType.startsWith('image/png');
    const isPngName = fileName.endsWith('.png');
    const hasNoMime = !fileType;
    if (!isPngMime && !(hasNoMime && isPngName)) return;

    showStatus("🔍 Reading metadata...");
    try {
        const info = await readInfoFromPNG(file);
        if (!info) {
            showStatus("❌ No generation parameters found");
            setTimeout(() => showStatus(null), 2000);
            return;
        }

        const params = parseGenerationParameters(info);
        if (params) {
            const s = getSettings();
            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (el && value !== undefined && value !== null) el.value = value;
            };
            const explicitProvider = params.provider && PROVIDERS[params.provider] ? params.provider : null;
            const legacyProvider = !explicitProvider && params.model && PROVIDERS[params.model] ? params.model : null;
            const importedProvider = explicitProvider || legacyProvider || s.provider;

            if (importedProvider !== s.provider) {
                s.provider = importedProvider;
                setValue("qig-provider", s.provider);
                updateProviderUI();
                renderProfileSelect();
            }

            if (importedProvider === "local" && params.backend) {
                s.localType = params.backend === "comfyui" ? "comfyui" : "a1111";
                setValue("qig-local-type", s.localType);
                syncLocalTypeSections(s.localType);
            }

            if (params.prompt) {
                s.prompt = params.prompt;
                setValue("qig-prompt", s.prompt);
            }
            if (params.negativePrompt) {
                s.negativePrompt = params.negativePrompt;
                setValue("qig-negative", s.negativePrompt);
            }
            if (params.steps !== undefined && !Number.isNaN(params.steps)) {
                if (importedProvider === "proxy") {
                    s.proxySteps = params.steps;
                } else {
                    s.steps = params.steps;
                    setValue("qig-steps", s.steps);
                }
            }
            if (params.cfgScale !== undefined && !Number.isNaN(params.cfgScale)) {
                if (importedProvider === "proxy") {
                    s.proxyCfg = params.cfgScale;
                } else {
                    s.cfgScale = params.cfgScale;
                    setValue("qig-cfg", s.cfgScale);
                }
            }
            if (params.seed !== undefined && !Number.isNaN(params.seed)) {
                if (importedProvider === "proxy") {
                    s.proxySeed = params.seed;
                } else {
                    s.seed = params.seed;
                    setValue("qig-seed", s.seed);
                }
            }
            if (params.width && params.height) {
                s.width = params.width;
                s.height = params.height;
                if (importedProvider === "novelai") normalizeSize(s);
                syncSizeInputs(s.width, s.height);
                if (importedProvider === "novelai") syncNaiResolutionSelect();
            }

            if (explicitProvider && params.model) {
                switch (importedProvider) {
                    case "pollinations":
                        s.pollinationsModel = params.model === "flux" ? "" : params.model;
                        break;
                    case "novelai": s.naiModel = params.model; break;
                    case "arliai": s.arliModel = params.model; break;
                    case "nanogpt": s.nanogptModel = params.model; break;
                    case "chutes": s.chutesModel = params.model; break;
                    case "civitai": s.civitaiModel = params.model; break;
                    case "nanobanana": s.nanobananaModel = params.model; break;
                    case "replicate": s.replicateModel = params.model; break;
                    case "fal": s.falModel = params.model; break;
                    case "together": s.togetherModel = params.model; break;
                    case "local":
                        if ((params.backend || s.localType) === "comfyui") {
                            s.localModel = params.model;
                        } else {
                            s.a1111Model = params.model;
                            if (!s.localModel) s.localModel = params.model;
                        }
                        break;
                    case "proxy": s.proxyModel = params.model; break;
                }
            }

            // Try to map sampler (approximate match)
            if (params.sampler) {
                if (importedProvider === "proxy") {
                    s.proxySampler = params.sampler;
                } else {
                    const samplerMap = {
                    "Euler a": "euler_a", "Euler": "euler",
                    "DPM++ 2M Karras": "dpm++_2m", "DPM++ 2M": "dpm++_2m",
                    "DPM++ SDE Karras": "dpm++_sde", "DPM++ SDE": "dpm++_sde",
                    "DPM++ 2M SDE Karras": "dpm++_2m_sde", "DPM++ 2M SDE": "dpm++_2m_sde",
                    "DPM++ 3M SDE Karras": "dpm++_3m_sde", "DPM++ 3M SDE": "dpm++_3m_sde",
                    "DPM++ 2S a Karras": "dpm++_2s_ancestral", "DPM++ 2S a": "dpm++_2s_ancestral",
                    "DPM2": "dpm_2", "DPM2 a": "dpm_2_ancestral",
                    "DPM2 Karras": "dpm_2", "DPM2 a Karras": "dpm_2_ancestral",
                    "DPM fast": "dpm_fast", "DPM adaptive": "dpm_adaptive",
                    "DDIM": "ddim", "DDPM": "ddpm",
                    "LMS": "lms", "LMS Karras": "lms",
                    "Heun": "heun", "Heun++ 2": "heunpp2",
                    "PLMS": "plms",
                    "UniPC": "uni_pc", "UniPC BH2": "uni_pc_bh2",
                    "LCM": "lcm", "DEIS": "deis", "Restart": "restart"
                };
                    const mapped = samplerMap[params.sampler];
                    if (mapped) {
                        const oldSampler = s.sampler;
                        s.sampler = mapped;
                        setValue("qig-sampler", s.sampler);
                        if (oldSampler !== mapped) {
                            toastr.info(`Sampler changed from "${oldSampler}" to "${mapped}" (from image metadata: "${params.sampler}")`);
                        }
                    }
                }
            }
            // Apply scheduler from metadata
            if (params.scheduler) {
                if (importedProvider === "local") {
                    if ((params.backend || s.localType) === "comfyui") {
                        s.comfyScheduler = params.scheduler;
                    } else {
                        s.a1111Scheduler = params.scheduler;
                    }
                } else if (importedProvider === "civitai") {
                    s.civitaiScheduler = params.scheduler;
                }
            }

            if (importedProvider) refreshProviderInputs(importedProvider);

            saveSettingsDebounced();
            showStatus("✅ Settings updated from image!");
            setTimeout(() => showStatus(null), 2000);
        }
    } catch (err) {
        log("Error reading metadata: " + err);
        showStatus("❌ Error reading metadata");
    }
}

// Export module info for SillyTavern
export { extensionName };
