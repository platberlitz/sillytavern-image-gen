// Artist lists for random selection
const ARTISTS_NATURAL = ["abubu", "afrobull", "aiue oka", "akairiot", "akamatsu ken", "alex ahad", "alzi xiaomi", "amazuyu tatsuki", "ask (askzy)", "atdan", "ayami kojima", "azto dio", "bkub", "butcha-u", "ciloranko", "dino (dinoartforame)", "dishwasher1910", "dsmile", "ebifurya", "eroquis", "fkey", "fuzichoco", "gomennasai", "hews", "hiten", "hoshi (snacherubi)", "kantoku", "kawacy", "ke-ta", "kuavera", "kuon (kwonchan)", "lack", "lm7", "mika pikazo", "mikeinel", "morikura en", "nardack", "neco", "nian", "nixeu", "pochi (pochi-goya)", "redjuice", "rei (sanbonzakura)", "rurudo", "shirataki", "sky-freedom", "tofuubear", "wanke", "yaegashi nan", "yamakaze", "yoshiaki", "yuuki tatsuya"];

const ARTISTS_TAGS = ["abubu", "afrobull", "aiue_oka", "akairiot", "akamatsu_ken", "alex_ahad", "alzi_xiaomi", "amazuyu_tatsuki", "ask_(askzy)", "atdan", "ayami_kojima", "azto_dio", "bkub", "butcha-u", "ciloranko", "dino_(dinoartforame)", "dishwasher1910", "dsmile", "ebifurya", "eroquis", "fkey", "fuzichoco", "gomennasai", "hews", "hiten", "hoshi_(snacherubi)", "kantoku", "kawacy", "ke-ta", "kuavera", "kuon_(kwonchan)", "lack", "lm7", "mika_pikazo", "mikeinel", "morikura_en", "nardack", "neco", "nian", "nixeu", "pochi_(pochi-goya)", "redjuice", "rei_(sanbonzakura)", "rurudo", "shirataki", "sky-freedom", "tofuubear", "wanke", "yaegashi_nan", "yamakaze", "yoshiaki", "yuuki_tatsuya"];

function getRandomArtist(useTagFormat = false) {
    const artists = useTagFormat ? ARTISTS_TAGS : ARTISTS_NATURAL;
    return artists[Math.floor(Math.random() * artists.length)];
}

const extensionName = "quick-image-gen";
let extension_settings, getContext, saveSettingsDebounced, generateQuietPrompt;
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
    // NovelAI
    naiKey: "",
    naiModel: "nai-diffusion-4-5-curated",
    // ArliAI
    arliKey: "",
    arliModel: "arliai-realistic-v1",
    // NanoGPT
    nanogptKey: "",
    nanogptModel: "image-flux-schnell",
    // Chutes
    chutesKey: "",
    chutesModel: "stabilityai/stable-diffusion-xl-base-1.0",
    // CivitAI
    civitaiKey: "",
    civitaiModel: "urn:air:sd1:checkpoint:civitai:4201@130072",
    civitaiScheduler: "EulerA",
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
    a1111Adetailer: false,
    a1111AdetailerModel: "face_yolov8n.pt",
    a1111AdetailerPrompt: "",
    a1111AdetailerNegative: "",
    a1111Loras: "",
    a1111HiresFix: false,
    a1111HiresUpscaler: "Latent",
    a1111HiresScale: 2,
    a1111HiresSteps: 0,
    a1111HiresDenoise: 0.55,
    a1111IpAdapter: false,
    a1111IpAdapterMode: "ip-adapter-faceid-portrait_sd15",
    a1111IpAdapterWeight: 0.7,
    a1111IpAdapterPixelPerfect: true,
    a1111IpAdapterResizeMode: "Crop and Resize",
    a1111IpAdapterControlMode: "Balanced",
    a1111IpAdapterStartStep: 0,
    a1111IpAdapterEndStep: 1,
    a1111SaveToWebUI: true,
    // ComfyUI specific
    comfyWorkflow: "",
    comfyClipSkip: 1,
    comfyDenoise: 1.0,
    // ST Style integration
    useSTStyle: true,
    // Inject Mode (wickedcode01-style)
    injectEnabled: false,
    injectPrompt: 'When describing a scene visually, include an image tag: <pic prompt="detailed visual description">\nUse this for important visual moments. The prompt should describe the scene in detail including character appearances, poses, expressions, clothing, and setting.',
    injectRegex: '<pic\\s+prompt="([^"]+)"\\s*/?>',
    injectPosition: "afterScenario",
    injectDepth: 0,
    injectInsertMode: "replace",
    injectAutoClean: true,
    // LLM Override (separate AI for image prompts via Connection Manager)
    llmOverrideEnabled: false,
    llmOverrideProfileId: "",
    llmOverridePreset: "",
    llmOverrideMaxTokens: 500,
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
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
let sessionGallery = safeParse("qig_gallery", []);
let promptHistory = safeParse("qig_prompt_history", []);
let promptTemplates = safeParse("qig_templates", []);
let charSettings = safeParse("qig_char_settings", {});
let connectionProfiles = safeParse("qig_profiles", {});
let charRefImages = safeParse("qig_char_ref_images", {});
let generationPresets = safeParse("qig_gen_presets", []);
let contextualFilters = safeParse("qig_contextual_filters", []);
let isGenerating = false;

const PROVIDER_KEYS = {
    pollinations: ["pollinationsModel"],
    novelai: ["naiKey", "naiModel"],
    arliai: ["arliKey", "arliModel"],
    nanogpt: ["nanogptKey", "nanogptModel"],
    chutes: ["chutesKey", "chutesModel"],
    civitai: ["civitaiKey", "civitaiModel", "civitaiScheduler"],
    nanobanana: ["nanobananaKey", "nanobananaModel", "nanobananaExtraInstructions", "nanobananaRefImages"],
    stability: ["stabilityKey"],
    replicate: ["replicateKey", "replicateModel"],
    fal: ["falKey", "falModel"],
    together: ["togetherKey", "togetherModel"],
    local: ["localUrl", "localType", "localModel", "localRefImage", "localDenoise", "a1111Model", "a1111ClipSkip", "a1111Adetailer", "a1111AdetailerModel", "a1111AdetailerPrompt", "a1111AdetailerNegative", "a1111Loras", "a1111HiresFix", "a1111HiresUpscaler", "a1111HiresScale", "a1111HiresSteps", "a1111HiresDenoise", "a1111IpAdapter", "a1111IpAdapterMode", "a1111IpAdapterWeight", "a1111IpAdapterPixelPerfect", "a1111IpAdapterResizeMode", "a1111IpAdapterControlMode", "a1111IpAdapterStartStep", "a1111IpAdapterEndStep", "comfyWorkflow", "comfyClipSkip", "comfyDenoise"],
    proxy: ["proxyUrl", "proxyKey", "proxyModel", "proxyLoras", "proxyFacefix", "proxySteps", "proxyCfg", "proxySampler", "proxySeed", "proxyExtraInstructions", "proxyRefImages"]
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

const SAMPLERS = ["euler_a", "euler", "dpm++_2m", "dpm++_sde", "ddim", "lms", "heun"];

const logs = [];
function log(msg) {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logs.length > 100) logs.shift();
    console.log("[QIG]", msg);
}

// A1111 Model API helpers
let a1111ModelsCache = [];
async function fetchA1111Models(url) {
    try {
        const baseUrl = url.replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/sdapi/v1/sd-models`);
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
    try {
        let fetchUrl = `${url}/controlnet/model_list`;
        // Check if using sd-proxy (url ends with 3000 typically, or just try proxy endpoint first?)
        // Better: if the normal fetch fails, try the proxy endpoint? 
        // Or if the url refers to the proxy... 
        // Let's assume if it looks like a proxy URL we use the proxy endpoint.
        // Actually, simpler: The proxy endpoint is /api/proxy/controlnet/model_list
        // If s.localUrl is http://localhost:3000, then fetchUrl becomes http://localhost:3000/controlnet/model_list which fails.
        // The endpoint is at /api/proxy/controlnet/model_list

        // If url points to sd-proxy, it likely doesn't have /controlnet/model_list natively.
        // Try standard first, if 404, try proxy path?

        let res = await fetch(fetchUrl);
        if (res.status === 404) {
            res = await fetch(`${url}/api/proxy/controlnet/model_list`, {
                headers: { 'x-local-url': getSettings().localUrl } // This might be circular if url=localUrl.
                // Wait, in fetchA1111Models(s.localUrl), url IS s.localUrl.
                // If s.localUrl is the PROXY url, we need to send the TARGET url in header?
                // But in proxy mode, usually s.localUrl IS the proxy url.
                // But the proxy needs to know where the REAL A1111 is.
                // The proxy reads 'x-local-url' header.
                // We don't have the real A1111 url stored if we are in "Local" mode pointing to proxy?
                // Actually, sd-proxy 'local' backend handler reads 'x-local-url'.
                // Users usually set 'x-local-url' in headers or default to localhost:7860.
                // We should pass the header if we have custom header settings? 
                // Currently we don't have generic custom headers for "Local" provider.
                // We only have `s.localUrl`.
            });
        }

        if (!res.ok) return [];
        const data = await res.json();
        return data.model_list || [];
    } catch (e) {
        // Retry with proxy path if first attempt failed with network error (e.g. CORS or Connection Refused on incorrect path)
        try {
            const res = await fetch(`${url}/api/proxy/controlnet/model_list`);
            if (res.ok) {
                const data = await res.json();
                return data.model_list || [];
            }
        } catch (e2) { }
        return [];
    }
}

async function switchA1111Model(url, modelTitle) {
    try {
        const baseUrl = url.replace(/\/$/, "");
        log(`A1111: Switching to model: ${modelTitle}`);
        const res = await fetch(`${baseUrl}/sdapi/v1/options`, {
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
        const res = await fetch(`${baseUrl}/sdapi/v1/options`);
        if (!res.ok) return null;
        const opts = await res.json();
        return opts.sd_model_checkpoint || null;
    } catch {
        return null;
    }
}

async function fetchA1111Upscalers(url) {
    try {
        const res = await fetch(`${url.replace(/\/$/, "")}/sdapi/v1/upscalers`);
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()).map(u => u.name);
    } catch (e) {
        return ["Latent", "Latent (antialiased)", "Latent (bicubic)",
                "Latent (bicubic antialiased)", "Latent (nearest)",
                "Latent (nearest-exact)", "None"];
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

async function loadSettings() {
    const saved = extension_settings[extensionName];
    extension_settings[extensionName] = { ...defaultSettings, ...saved };
    const s = extension_settings[extensionName];
    // Migrate old messageIndex to messageRange
    if (saved && "messageIndex" in saved && !("messageRange" in saved)) {
        s.messageRange = String(saved.messageIndex);
    }
    delete s.messageIndex;
}

function getSettings() {
    return extension_settings[extensionName];
}

function resolvePrompt(template) {
    const ctx = getContext();
    return template
        .replace(/\{\{char\}\}/gi, ctx.name2 || "character")
        .replace(/\{\{user\}\}/gi, ctx.name1 || "user");
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
    const chat = ctx.chat;
    if (!chat || chat.length === 0) return "";
    const s = getSettings();
    const indices = parseMessageRange(s.messageRange, chat.length);
    if (indices.length === 0) return "";

    // Single message: return plain text (backward compatible, no labels)
    if (indices.length === 1) {
        const msg = chat[indices[0]];
        return msg?.mes || "";
    }

    // Multiple messages: return speaker-labeled concatenation
    const lines = [];
    for (const i of indices) {
        const msg = chat[i];
        if (!msg || !msg.mes) continue;
        const name = msg.name || (msg.is_user ? ctx.name1 : ctx.name2) || "Unknown";
        lines.push(`[${name}]: ${msg.mes}`);
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

function applyContextualFilters(prompt, negative, sceneText) {
    if (!contextualFilters.length || !sceneText) return { prompt, negative };
    const scene = sceneText.toLowerCase();
    const matched = [];
    for (const f of contextualFilters) {
        if (!f.enabled) continue;
        if (f.matchMode === "LLM") continue;
        const keywords = f.keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
        if (!keywords.length) continue;
        const hit = f.matchMode === "AND"
            ? keywords.every(kw => scene.includes(kw))
            : keywords.some(kw => scene.includes(kw));
        if (hit) matched.push({ ...f, _keywords: new Set(keywords) });
    }
    if (!matched.length) return { prompt, negative };
    matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    // Suppress OR filters whose keywords are a subset of a higher-priority AND filter
    const andFilters = matched.filter(f => f.matchMode === "AND");
    const surviving = matched.filter(f => {
        if (f.matchMode === "AND") return true;
        return !andFilters.some(af =>
            (af.priority || 0) >= (f.priority || 0) &&
            [...f._keywords].every(kw => af._keywords.has(kw))
        );
    });
    let p = prompt, n = negative;
    for (const f of surviving) {
        if (f.positive) p = p ? `${p}, ${f.positive}` : f.positive;
        if (f.negative) n = n ? `${n}, ${f.negative}` : f.negative;
    }
    log(`Contextual filters: ${surviving.length} applied (${matched.length - surviving.length} suppressed)`);
    return { prompt: p, negative: n };
}

async function matchLLMFilters(sceneText) {
    const llmFilters = contextualFilters.filter(f => f.enabled && f.matchMode === "LLM" && f.description);
    if (!llmFilters.length || !sceneText) return [];

    const conceptList = llmFilters.map((f, i) => `${i + 1}. "${f.name}": ${f.description}`).join('\n');

    const instruction = `Given the following scene, identify which concepts are present.
Reply ONLY with the numbers of matching concepts, comma-separated. If none match, reply "none".

Scene:
${sceneText.substring(0, 2000)}

Concepts:
${conceptList}`;

    const s = getSettings();
    let response;
    try {
        if (s.llmOverrideEnabled && s.llmOverrideProfileId) {
            response = await callOverrideLLM(instruction, "You are a scene analyst. Reply only with numbers.");
        } else {
            const quietOptions = { skipWIAN: true, quietName: `FilterMatch_${Date.now()}`, quietToLoud: false };
            try {
                response = await generateQuietPrompt(instruction, quietOptions);
            } catch {
                response = await generateQuietPrompt(instruction);
            }
        }
    } catch (e) {
        log(`LLM filter matching failed: ${e.message}`);
        return [];
    }

    const nums = (response || "").match(/\d+/g)?.map(Number) || [];
    const matched = llmFilters.filter((_, i) => nums.includes(i + 1));
    log(`LLM filter matching: ${matched.length}/${llmFilters.length} concepts matched`);
    return matched;
}

const skinPattern = /\b(dark[- ]?skin(?:ned)?|brown[- ]?skin(?:ned)?|black[- ]?skin(?:ned)?|tan(?:ned)?[- ]?skin|ebony|melanin|mocha|chocolate[- ]?skin|caramel[- ]?skin)\b/gi;

async function callOverrideLLM(instruction, systemPrompt = "") {
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
            return await generateQuietPrompt(instruction, quietOptions);
        } catch {
            return await generateQuietPrompt(instruction);
        }
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: instruction });

    log(`LLM Override: Using connection profile '${s.llmOverrideProfileId}'`);
    const response = await CMRS.sendRequest(
        s.llmOverrideProfileId,
        messages,
        s.llmOverrideMaxTokens || 500,
        { extractData: true, includePreset: !!s.llmOverridePreset, stream: false }
    );
    return typeof response === "string" ? response : (response?.content || response?.message?.content || String(response));
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

async function generateLLMPrompt(s, basePrompt) {
    if (!s.useLLMPrompt) return basePrompt;

    // Clear any cached styles before generating new prompt
    clearStyleCache();

    log("Generating prompt via SillyTavern LLM...");
    showStatus("🤖 Creating image prompt...");

    try {
        const ctx = getContext();
        const charName = ctx.name2 || "character";
        const userName = ctx.name1 || "user";
        const charDesc = ctx.characterId ? (ctx.characters?.[ctx.characterId]?.description || "") : "";
        const userPersona = ctx.persona || "";

        // Extract franchise/series info from character card
        const charCard = ctx.characterId ? ctx.characters?.[ctx.characterId] : null;
        const creatorNotes = charCard?.creator_notes || charCard?.creatorcomment || "";
        const scenario = charCard?.scenario || "";
        const tags = charCard?.tags?.join(", ") || "";

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
        const isCustom = s.llmPromptStyle === "custom";
        const isMultiMessage = basePrompt.includes("\n\n[") && basePrompt.includes("]: ");

        let instruction;
        if (isCustom && s.llmCustomInstruction) {
            log(`Using custom instruction: ${s.llmCustomInstruction.substring(0, 100)}...`);
            instruction = s.llmCustomInstruction
                .replace(/\{\{scene\}\}/gi, basePrompt)
                .replace(/\{\{char\}\}/gi, charName)
                .replace(/\{\{user\}\}/gi, userName)
                .replace(/\{\{charDesc\}\}/gi, charDesc.substring(0, 1500))
                .replace(/\{\{userDesc\}\}/gi, userPersona.substring(0, 800));

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
        } else if (isCustom) {
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
            llmPrompt = await callOverrideLLM(instructionWithEntropy);
        } else {
            const quietOptions = {
                skipWIAN: true,
                quietName: `ImageGen_${timestamp}`,
                quietToLoud: false
            };
            try {
                llmPrompt = await generateQuietPrompt(instructionWithEntropy, quietOptions);
            } catch (e) {
                log(`generateQuietPrompt with options failed: ${e.message}, using simple call`);
                llmPrompt = await generateQuietPrompt(instructionWithEntropy);
            }
        }

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
        log(`LLM prompt failed: ${e.message}`);
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
async function genPollinations(prompt, negative, s) {
    const seed = s.seed === -1 ? Date.now() : s.seed;
    let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${s.width}&height=${s.height}&seed=${seed}&nologo=true`;
    if (negative) url += `&negative=${encodeURIComponent(negative)}`;
    if (s.pollinationsModel && s.pollinationsModel !== "flux") url += `&model=${s.pollinationsModel}`;
    log(`Pollinations URL: ${url.substring(0, 100)}...`);
    return url;
}

async function genNovelAI(prompt, negative, s) {
    const isV4 = s.naiModel.includes("-4");
    // Map SillyTavern sampler names to NovelAI API format
    const samplerMap = {
        "euler_a": "k_euler_ancestral",
        "euler": "k_euler",
        "dpm++_2m": "k_dpmpp_2m",
        "dpm++_sde": "k_dpmpp_sde",
        "ddim": "ddim",
        "lms": "k_lms",
        "heun": "k_heun"
    };
    const isV3OrNewer = s.naiModel.includes("diffusion-3") || s.naiModel.includes("diffusion-4");
    const sampler = (s.sampler === "ddim" && isV3OrNewer)
        ? "ddim_v3"
        : (samplerMap[s.sampler] || "k_euler_ancestral");
    const seed = s.seed === -1 ? Math.floor(Math.random() * 2147483647) : s.seed;

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

    const res = await fetch("https://image.novelai.net/ai/generate-image", {
        method: "POST",
        headers: { "Authorization": `Bearer ${s.naiKey}`, "Content-Type": "application/json", "Accept": "*/*" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`NovelAI error: ${res.status} ${errText}`);
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
            return URL.createObjectURL(new Blob([pngData], { type: "image/png" }));
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
    return URL.createObjectURL(new Blob([pngData], { type: "image/png" }));
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

async function genArliAI(prompt, negative, s) {
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
            seed: s.seed === -1 ? -1 : s.seed
        })
    });
    if (!res.ok) throw new Error(`ArliAI error: ${res.status}`);
    const data = await res.json();
    if (data.images?.[0]) return `data:image/png;base64,${data.images[0]}`;
    throw new Error("No image in response");
}

async function genNanoGPT(prompt, negative, s) {
    const res = await fetch("https://nano-gpt.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.nanogptKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: s.nanogptModel,
            prompt: prompt,
            negative_prompt: negative,
            size: `${s.width}x${s.height}`,
            n: 1
        })
    });
    if (!res.ok) throw new Error(`NanoGPT error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

async function genChutes(prompt, negative, s) {
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
            seed: s.seed === -1 ? undefined : s.seed
        })
    });
    if (!res.ok) throw new Error(`Chutes error: ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image/")) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
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

async function genCivitAI(prompt, negative, s) {
    const res = await fetch("https://civitai.com/api/v1/consumer/jobs", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.civitaiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            $type: "textToImage",
            input: {
                model: s.civitaiModel,
                params: {
                    prompt: prompt,
                    negativePrompt: negative,
                    scheduler: s.civitaiScheduler || "EulerA",
                    steps: s.steps,
                    cfgScale: s.cfgScale,
                    width: s.width,
                    height: s.height,
                    seed: s.seed === -1 ? -1 : s.seed,
                    clipSkip: parseInt(s.a1111ClipSkip) || 2
                },
                batchSize: 1
            }
        })
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
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://civitai.com/api/v1/consumer/jobs?token=${jobToken}`, {
            headers: { "Authorization": `Bearer ${s.civitaiKey}` }
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

async function genNanobanana(prompt, negative, s) {
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
        })
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

async function genLocal(prompt, negative, s) {
    const baseUrl = s.localUrl.replace(/\/$/, "");

    if (s.localType === "comfyui") {
        // Map sampler names to ComfyUI format
        const comfySamplerMap = {
            "euler_a": "euler_ancestral",
            "euler": "euler",
            "dpm++_2m": "dpmpp_2m",
            "dpm++_sde": "dpmpp_sde",
            "dpmpp_2m": "dpmpp_2m",
            "dpmpp_sde": "dpmpp_sde",
            "ddim": "ddim",
            "lms": "lms",
            "heun": "heun",
            "uni_pc": "uni_pc",
            "dpm_2": "dpm_2",
            "dpm_2_ancestral": "dpm_2_ancestral"
        };
        const comfySchedulerMap = {
            "euler_a": "normal",
            "dpm++_2m": "karras",
            "dpmpp_2m": "karras",
            "dpm++_sde": "karras",
            "dpmpp_sde": "karras"
        };

        const samplerName = comfySamplerMap[s.sampler] || s.sampler.replace(/\+\+/g, "pp");
        const schedulerName = comfySchedulerMap[s.sampler] || "normal";
        const seed = s.seed === -1 ? Math.floor(Math.random() * 2147483647) : s.seed;
        const denoise = parseFloat(s.comfyDenoise) || 1.0;
        const clipSkip = parseInt(s.comfyClipSkip) || 1;

        // Check for custom workflow JSON
        if (s.comfyWorkflow && s.comfyWorkflow.trim()) {
            try {
                let customWorkflow = JSON.parse(s.comfyWorkflow);

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
                    '%model%': s.localModel || 'model.safetensors'
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

                const res = await fetch(`${baseUrl}/prompt`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: customWorkflow })
                });
                if (!res.ok) throw new Error(`ComfyUI error: ${res.status}`);
                const data = await res.json();

                const promptId = data.prompt_id;
                for (let i = 0; i < 120; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    let hist;
                    try {
                        const histRes = await fetch(`${baseUrl}/history/${promptId}`);
                        if (!histRes.ok) continue;
                        hist = await histRes.json();
                    } catch { continue; }
                    const result = hist[promptId];
                    if (result?.outputs) {
                        for (const nodeId in result.outputs) {
                            const output = result.outputs[nodeId];
                            if (output.images?.[0]) {
                                const img = output.images[0];
                                return `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                            }
                        }
                    }
                }
                throw new Error("ComfyUI timeout");
            } catch (e) {
                if (e.message.includes('timeout') || e.message.includes('ComfyUI error')) throw e;
                log(`ComfyUI: Invalid workflow JSON: ${e.message}, using default`);
            }
        }

        // ComfyUI API - Default workflow
        const workflowNodes = {
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
                    negative: ["7", 0],
                    latent_image: ["5", 0]
                }
            },
            "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: s.localModel || "model.safetensors" } },
            "5": { class_type: "EmptyLatentImage", inputs: { width: s.width, height: s.height, batch_size: 1 } },
            "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: clipSkip > 1 ? ["10", 0] : ["4", 1] } },
            "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: clipSkip > 1 ? ["10", 0] : ["4", 1] } },
            "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
            "9": { class_type: "SaveImage", inputs: { filename_prefix: "qig", images: ["8", 0] } }
        };

        // Add CLIP SetLastLayer if clip_skip > 1
        if (clipSkip > 1) {
            workflowNodes["10"] = { class_type: "CLIPSetLastLayer", inputs: { stop_at_clip_layer: -clipSkip, clip: ["4", 1] } };
        }

        log(`ComfyUI: sampler=${samplerName}, scheduler=${schedulerName}, steps=${s.steps}, cfg=${s.cfgScale}, seed=${seed}, denoise=${denoise}, clip_skip=${clipSkip}, size=${s.width}x${s.height}`);

        const res = await fetch(`${baseUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: workflowNodes })
        });
        if (!res.ok) throw new Error(`ComfyUI error: ${res.status}`);
        const data = await res.json();
        // Poll for result - find any SaveImage output
        const promptId = data.prompt_id;
        for (let i = 0; i < 120; i++) {
            await new Promise(r => setTimeout(r, 1000));
            showStatus(`Generating... (waiting ${i + 1}s)`);
            let hist;
            try {
                const histRes = await fetch(`${baseUrl}/history/${promptId}`);
                if (!histRes.ok) continue;
                hist = await histRes.json();
            } catch { continue; }
            const result = hist[promptId];
            if (result?.outputs) {
                for (const nodeId in result.outputs) {
                    const output = result.outputs[nodeId];
                    if (output.images?.[0]) {
                        const img = output.images[0];
                        return `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                    }
                }
            }
        }
        throw new Error("ComfyUI timeout");
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
        sampler_name: s.sampler,
        seed: s.seed
    };

    // LoRA injection via A1111 prompt syntax
    if (s.a1111Loras && s.a1111Loras.trim()) {
        const loraTags = s.a1111Loras.split(",")
            .map(l => l.trim()).filter(l => l)
            .map(l => {
                const [name, w] = l.split(":");
                const trimmedName = name.trim();
                if (!trimmedName) return null;
                return `<lora:${trimmedName}:${parseFloat(w) || 0.8}>`;
            }).filter(Boolean).join(" ");
        if (loraTags) {
            payload.prompt = `${payload.prompt} ${loraTags}`;
            log(`A1111: Injected LoRAs: ${loraTags}`);
        }
    }

    // CLIP skip
    const clipSkip = parseInt(s.a1111ClipSkip) || 1;
    if (clipSkip > 1) {
        payload.override_settings = payload.override_settings || {};
        payload.override_settings.CLIP_stop_at_last_layers = clipSkip;
    }

    // Hires Fix (txt2img only)
    if (s.a1111HiresFix && !isImg2Img) {
        payload.enable_hr = true;
        payload.hr_upscaler = s.a1111HiresUpscaler || "Latent";
        payload.hr_scale = parseFloat(s.a1111HiresScale) || 2;
        payload.hr_second_pass_steps = parseInt(s.a1111HiresSteps) || 0;
        payload.denoising_strength = parseFloat(s.a1111HiresDenoise) || 0.55;
        log(`A1111: Hires Fix: upscaler=${payload.hr_upscaler}, scale=${payload.hr_scale}, denoise=${payload.denoising_strength}`);
    }

    // ADetailer
    if (s.a1111Adetailer) {
        payload.alwayson_scripts = payload.alwayson_scripts || {};
        payload.alwayson_scripts.ADetailer = {
            args: [true, {
                ad_model: s.a1111AdetailerModel || "face_yolov8n.pt",
                ad_prompt: s.a1111AdetailerPrompt || "",
                ad_negative_prompt: s.a1111AdetailerNegative || ""
            }]
        };
    }

    // Save to WebUI output folder
    if (s.a1111SaveToWebUI) {
        payload.save_images = true;
    }

    if (isImg2Img && !s.a1111IpAdapter) {
        // Standard img2img - use as init image
        payload.init_images = [s.localRefImage.replace(/^data:image\/.+;base64,/, '')];
        payload.denoising_strength = parseFloat(s.localDenoise) || 0.75;
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
            weight: parseFloat(s.a1111IpAdapterWeight) || 0.7,
            image: imageData,
            input_image: imageData,  // Forge Neo compatibility
            resize_mode: s.a1111IpAdapterResizeMode || "Crop and Resize",
            control_mode: s.a1111IpAdapterControlMode || "Balanced",
            pixel_perfect: s.a1111IpAdapterPixelPerfect ?? true,
            guidance_start: parseFloat(s.a1111IpAdapterStartStep) || 0,
            guidance_end: parseFloat(s.a1111IpAdapterEndStep) || 1
        };

        payload.alwayson_scripts = payload.alwayson_scripts || {};
        // Register under both script names for A1111 extension and Forge Neo built-in ControlNet
        payload.alwayson_scripts.ControlNet = { args: [controlNetUnit] };
        payload.alwayson_scripts["sd_forge_controlnet"] = { args: [controlNetUnit] };

        const logPayload = { ...controlNetUnit, image: "BASE64_TRUNCATED", input_image: "BASE64_TRUNCATED" };
        log(`A1111/Forge ControlNet Payload: ${JSON.stringify(logPayload)}`);
        log(`A1111/Forge: Using IP-Adapter Face with preprocessor=${ipAdapterPreprocessor}, model=${ipAdapterModel}, weight=${s.a1111IpAdapterWeight}`);
    }

    log(`A1111: steps=${s.steps}, cfg=${s.cfgScale}, clip_skip=${clipSkip}, loras=${s.a1111Loras || 'none'}, hires=${s.a1111HiresFix && !isImg2Img ? 'on' : 'off'}, adetailer=${s.a1111Adetailer ? 'on' : 'off'}, ip-adapter=${s.a1111IpAdapter && s.localRefImage ? 'on' : 'off'}`);

    // Start progress polling
    let progressInterval = null;
    progressInterval = setInterval(async () => {
        try {
            const pr = await fetch(`${baseUrl}/sdapi/v1/progress`);
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

    try {
        const res = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`A1111 error: ${res.status}`);
        const data = await res.json();
        if (data.images?.[0]) return `data:image/png;base64,${data.images[0]}`;
        throw new Error("No image in response");
    } finally {
        if (progressInterval) clearInterval(progressInterval);
    }
}

async function genProxy(prompt, negative, s) {
    const headers = { "Content-Type": "application/json" };
    if (s.proxyKey) headers["Authorization"] = `Bearer ${s.proxyKey}`;

    const isChatProxy = s.proxyUrl.includes("/v1") && !s.proxyUrl.includes("/images");

    if (isChatProxy) {
        const chatUrl = s.proxyUrl.replace(/\/$/, "") + "/chat/completions";
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

        const res = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: s.proxyModel,
                messages: [{ role: "user", content }],
                max_tokens: 4096,
                width: s.width,
                height: s.height,
                steps: s.proxySteps || 25,
                cfg_scale: s.proxyCfg || 6,
                sampler: s.proxySampler || "Euler a",
                negative_prompt: negative,
                loras: s.proxyLoras ? s.proxyLoras.split(",").map(l => { const [id, w] = l.trim().split(":"); return { id: id.trim(), weight: parseFloat(w) || 0.8 }; }).filter(l => l.id) : undefined,
                facefix: s.proxyFacefix || undefined
            })
        });
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

        // Log full response structure for debugging
        log(`Full message structure: ${JSON.stringify(data.choices?.[0]?.message || {}).substring(0, 500)}`);
        throw new Error("No image in response");
    }

    const res = await fetch(s.proxyUrl, {
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
            seed: (s.proxySeed ?? -1) >= 0 ? s.proxySeed : undefined,
            loras: s.proxyLoras ? s.proxyLoras.split(",").map(l => { const [id, w] = l.trim().split(":"); return { id: id.trim(), weight: parseFloat(w) || 0.8 }; }).filter(l => l.id) : undefined,
            facefix: s.proxyFacefix || undefined,
            reference_images: s.proxyRefImages?.length ? s.proxyRefImages : undefined
        })
    });
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

function createPopup(id, title, content, onShow) {
    let popup = document.getElementById(id);
    if (!popup) {
        popup = document.createElement("div");
        popup.id = id;
        popup.className = "qig-popup";
        popup.style.cssText = "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;justify-content:center;align-items:center;";
        document.body.appendChild(popup);
    }
    // ALWAYS update innerHTML to ensure fresh content each time
    popup.innerHTML = `
        <div class="qig-popup-content" onclick="event.stopPropagation()">
            <div class="qig-popup-header">
                <span>${title}</span>
                <button class="qig-close-btn">✕</button>
            </div>
            ${content}
            <div class="qig-resize-handle"></div>
        </div>`;
    popup.querySelector(".qig-close-btn").onclick = () => popup.style.display = "none";
    popup.onclick = () => popup.style.display = "none";
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
                    <button onclick="navigator.clipboard.writeText(this.closest('div').querySelector('pre').textContent)" style="background:#333;border:none;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Copy</button>
                </div>
                <pre style="white-space:pre-wrap;word-break:break-word;color:#ddd;margin:0;font-size:13px;">${escapeHtml(entry.prompt)}</pre>
                ${entry.negative ? `<pre style="white-space:pre-wrap;word-break:break-word;color:#888;margin:6px 0 0;font-size:12px;">Negative: ${escapeHtml(entry.negative)}</pre>` : ''}
            </div>
        `).join('');
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

async function insertImageIntoMessage(imageUrl) {
    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat || chat.length === 0) throw new Error("No messages in chat");

    const s = getSettings();
    const indices = parseMessageRange(s.messageRange, chat.length);
    const idx = indices.length > 0 ? indices[indices.length - 1] : chat.length - 1;
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

async function addToGallery(url) {
    const thumbnail = await createThumbnail(url);
    sessionGallery.unshift({ url, thumbnail, prompt: lastPrompt, negative: lastNegative, provider: getSettings().provider, date: Date.now() });
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
    localStorage.setItem("qig_prompt_history", JSON.stringify(promptHistory));
}

function displayImage(url, skipGallery) {
    if (!skipGallery) addToGallery(url);

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
            <button id="qig-regenerate-btn">🔄 Regenerate</button>
            <button id="qig-insert-btn">📌 Insert</button>
            <button id="qig-gallery-btn">🖼️ Gallery</button>
            <button id="qig-download-btn">💾 Download</button>
            <button id="qig-close-popup">Close</button>
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
        originalPrompt = lastPrompt;
        originalNegative = lastNegative;
        const promptTextarea = document.getElementById("qig-preview-prompt");
        const negativeTextarea = document.getElementById("qig-preview-negative");
        const toggleBtn = document.getElementById("qig-toggle-prompt-editor");
        const resetBtn = document.getElementById("qig-reset-prompt");
        const editorDiv = popup.querySelector(".qig-prompt-editor");
        if (promptTextarea) promptTextarea.value = lastPrompt;
        if (negativeTextarea) negativeTextarea.value = lastNegative;
        const sourceLabel = document.getElementById("qig-prompt-source-label");
        if (sourceLabel) sourceLabel.textContent = lastPromptWasLLM ? "🤖 AI-Enhanced Prompt" : "📝 Direct Prompt";
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
        img.src = url;
        const downloadBtn = document.getElementById("qig-download-btn");
        downloadBtn.onclick = async (e) => {
            e.stopPropagation();
            await downloadWithMetadata(url, `generated-${Date.now()}.png`, lastPrompt, lastNegative, getSettings());
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
            try {
                await insertImageIntoMessage(url);
                toastr.success("Image inserted into message");
            } catch (err) {
                console.error("[Quick Image Gen] Insert failed:", err);
                toastr.error("Failed to insert image: " + err.message);
            }
        };
        document.getElementById("qig-close-popup").onclick = () => popup.style.display = "none";
    });
}

function displayBatchResults(results) {
    results.forEach(url => addToGallery(url));

    let currentIndex = 0;

    const thumbsHtml = results.map((url, i) =>
        `<img class="qig-batch-thumb${i === 0 ? ' active' : ''}" data-index="${i}" src="${url}">`
    ).join('');

    const popup = createPopup("qig-batch-popup", `Image 1/${results.length}`, `
        <img id="qig-batch-img" src="" style="max-width:100%;max-height:60vh;object-fit:contain;padding:10px;min-height:100px;">
        <div class="qig-batch-nav">
            <button id="qig-batch-prev">◀</button>
            <span id="qig-batch-counter">1 / ${results.length}</span>
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
            <button id="qig-batch-regenerate">🔄 Regenerate</button>
            <button id="qig-batch-insert">📌 Insert</button>
            <button id="qig-batch-insert-all">📌 Insert All</button>
            <button id="qig-batch-gallery">🖼️ Gallery</button>
            <button id="qig-batch-download">💾 Download</button>
            <button id="qig-batch-save-all">💾 Save All</button>
            <button id="qig-batch-close">Close</button>
        </div>`, (popup) => {
        const content = popup.querySelector('.qig-popup-content');
        if (content) {
            content.style.maxWidth = '';
            content.style.width = '';
            content.style.maxHeight = '';
        }
        initResizeHandle(popup);

        // Initialize prompt editor
        originalPrompt = lastPrompt;
        originalNegative = lastNegative;
        const batchPromptTextarea = document.getElementById("qig-batch-preview-prompt");
        const batchNegativeTextarea = document.getElementById("qig-batch-preview-negative");
        const batchToggleBtn = document.getElementById("qig-batch-toggle-prompt-editor");
        const batchResetBtn = document.getElementById("qig-batch-reset-prompt");
        const batchEditorDiv = popup.querySelector(".qig-prompt-editor");
        if (batchPromptTextarea) batchPromptTextarea.value = lastPrompt;
        if (batchNegativeTextarea) batchNegativeTextarea.value = lastNegative;
        const batchSourceLabel = document.getElementById("qig-batch-prompt-source-label");
        if (batchSourceLabel) batchSourceLabel.textContent = lastPromptWasLLM ? "🤖 AI-Enhanced Prompt" : "📝 Direct Prompt";
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
        img.src = results[0];

        function showImage(index) {
            currentIndex = index;
            img.src = results[index];
            document.getElementById("qig-batch-counter").textContent = `${index + 1} / ${results.length}`;
            popup.querySelector('.qig-popup-header span').textContent = `Image ${index + 1}/${results.length}`;
            popup.querySelectorAll('.qig-batch-thumb').forEach((t, i) => {
                t.classList.toggle('active', i === index);
            });
        }

        document.getElementById("qig-batch-prev").onclick = (e) => {
            e.stopPropagation();
            showImage((currentIndex - 1 + results.length) % results.length);
        };
        document.getElementById("qig-batch-next").onclick = (e) => {
            e.stopPropagation();
            showImage((currentIndex + 1) % results.length);
        };

        popup.querySelectorAll('.qig-batch-thumb').forEach(thumb => {
            thumb.onclick = (e) => {
                e.stopPropagation();
                showImage(parseInt(thumb.dataset.index));
            };
        });

        const keyHandler = (e) => {
            if (popup.style.display === "none") {
                document.removeEventListener("keydown", keyHandler);
                return;
            }
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "ArrowLeft") showImage((currentIndex - 1 + results.length) % results.length);
            if (e.key === "ArrowRight") showImage((currentIndex + 1) % results.length);
            if (e.key === "Escape") { popup.style.display = "none"; document.removeEventListener("keydown", keyHandler); }
        };
        document.addEventListener("keydown", keyHandler);
        const origOnClick = popup.onclick;
        popup.onclick = (e) => {
            document.removeEventListener("keydown", keyHandler);
            if (origOnClick) origOnClick(e);
        };

        document.getElementById("qig-batch-download").onclick = async (e) => {
            e.stopPropagation();
            await downloadWithMetadata(results[currentIndex], `generated-${Date.now()}.png`, lastPrompt, lastNegative, getSettings());
        };
        document.getElementById("qig-batch-save-all").onclick = async (e) => {
            e.stopPropagation();
            const ts = Date.now();
            for (let i = 0; i < results.length; i++) {
                await downloadWithMetadata(results[i], `generated-${ts}-${i + 1}.png`, lastPrompt, lastNegative, getSettings());
                if (i < results.length - 1) await new Promise(r => setTimeout(r, 300));
            }
            toastr.success(`Downloaded ${results.length} images`);
        };
        document.getElementById("qig-batch-insert-all").onclick = async (e) => {
            e.stopPropagation();
            try {
                for (const r of results) await insertImageIntoMessage(r);
                toastr.success(`Inserted ${results.length} images into message`);
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
                await insertImageIntoMessage(results[currentIndex]);
                toastr.success("Image inserted into message");
            } catch (err) {
                console.error("[Quick Image Gen] Insert failed:", err);
                toastr.error("Failed to insert image: " + err.message);
            }
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
                sessionGallery = [];
                localStorage.removeItem("qig_gallery");
                document.getElementById("qig-gallery-grid").innerHTML = '<p style="color:#888;">No images yet</p>';
            }
        };
        const grid = document.getElementById("qig-gallery-grid");
        grid.innerHTML = sessionGallery.length ? sessionGallery.map((item, index) => {
            const imgSrc = item.thumbnail || item.url;
            const snippet = item.prompt ? item.prompt.substring(0, 40) + (item.prompt.length > 40 ? '...' : '') : '';
            return `<div style="position:relative;cursor:pointer;" data-gallery-index="${index}">` +
                `<img src="${imgSrc}" style="width:100%;border-radius:6px;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><text y=%2240%22 x=%2220%22 fill=%22gray%22>expired</text></svg>'">` +
                (snippet ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#ccc;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${snippet}</div>` : '') +
                `</div>`;
        }).join('') : '<p style="color:#888;">No images yet</p>';
        grid.querySelectorAll("[data-gallery-index]").forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                const item = sessionGallery[parseInt(el.dataset.galleryIndex)];
                if (!item) return;
                lastPrompt = item.prompt || "";
                lastNegative = item.negative || "";
                lastPromptWasLLM = false;
                gallery.style.display = "none";
                displayImage(item.url, true);
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
            popup.onclick = (e) => { if (e.target === popup) close(); };
        });
    });
}

async function genStability(prompt, negative, s) {
    if (!s.stabilityKey) throw new Error("Stability AI API key required");
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
            seed: s.seed === -1 ? 0 : s.seed,
            samples: 1
        })
    });
    if (!res.ok) throw new Error(`Stability error: ${res.status}`);
    const data = await res.json();
    if (data.artifacts?.[0]) return `data:image/png;base64,${data.artifacts[0].base64}`;
    throw new Error("No image in response");
}

async function genReplicate(prompt, negative, s) {
    if (!s.replicateKey) throw new Error("Replicate API key required");
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
                seed: s.seed === -1 ? undefined : s.seed,
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
        })
    });
    if (!res.ok) throw new Error(`Replicate error: ${res.status}`);
    const pred = await res.json();

    // Poll for result
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
            headers: { "Authorization": `Token ${s.replicateKey}` }
        });
        if (!statusRes.ok) throw new Error(`Replicate polling error: ${statusRes.status}`);
        const status = await statusRes.json();
        if (status.status === "succeeded" && status.output?.[0]) return status.output[0];
        if (status.status === "failed") throw new Error(status.error || "Generation failed");
    }
    throw new Error("Replicate timeout");
}

async function genFal(prompt, negative, s) {
    if (!s.falKey) throw new Error("Fal.ai API key required");
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
            seed: s.seed === -1 ? undefined : s.seed,
            num_images: 1,
            enable_safety_checker: false
        })
    });
    if (!res.ok) throw new Error(`Fal.ai error: ${res.status}`);
    const data = await res.json();
    if (data.images?.[0]?.url) return data.images[0].url;
    throw new Error("No image in response");
}

async function genTogether(prompt, negative, s) {
    if (!s.togetherKey) throw new Error("Together AI API key required");
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
            seed: s.seed === -1 ? undefined : s.seed,
            n: 1
        })
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

async function generateForProvider(prompt, negative, settings) {
    const generator = providerGenerators[settings.provider];
    if (!generator) throw new Error(`Unknown provider: ${settings.provider}`);
    return await generator(prompt, negative, settings);
}

async function regenerateImage() {
    if (isGenerating) return;
    if (!lastPrompt) {
        showStatus("❌ No previous prompt to regenerate");
        return;
    }
    isGenerating = true;
    const s = getSettings();
    const batchCount = s.batchCount || 1;
    const originalSeed = s.seed;
    s.seed = -1;

    const paletteBtn = getOrCacheElement("qig-input-btn");
    if (paletteBtn) {
        paletteBtn.classList.remove("fa-palette");
        paletteBtn.classList.add("fa-spinner", "fa-spin");
    }
    const btn = getOrCacheElement("qig-generate-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Generating...";
    }

    log(`Regenerating with prompt: ${lastPrompt.substring(0, 50)}... (batch: ${batchCount})`);
    try {
        if (batchCount <= 1) {
            showStatus("🔄 Regenerating...");
            const result = await generateForProvider(lastPrompt, lastNegative, s);
            hideStatus();
            if (result) displayImage(result);
        } else {
            const results = [];
            let baseSeed = Math.floor(Math.random() * 2147483647);
            for (let i = 0; i < batchCount; i++) {
                if (s.sequentialSeeds) s.seed = baseSeed + i;
                showStatus(`🔄 Regenerating ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(lastPrompt);
                const expandedNegative = expandWildcards(lastNegative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s);
                if (result) results.push(result);
            }
            hideStatus();
            if (results.length > 1) {
                displayBatchResults(results);
            } else if (results.length === 1) {
                displayImage(results[0]);
            }
        }
    } catch (e) {
        showStatus(`❌ ${e.message}`);
        log(`Regenerate error: ${e.message}`);
        setTimeout(hideStatus, 3000);
    } finally {
        s.seed = originalSeed;
        isGenerating = false;
        showStatus(null);
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🎨 Generate";
        }
        if (paletteBtn) {
            paletteBtn.classList.remove("fa-spinner", "fa-spin");
            paletteBtn.classList.add("fa-palette");
        }
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
    localStorage.setItem("qig_templates", JSON.stringify(promptTemplates.slice(0, 20)));
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
    localStorage.setItem("qig_templates", JSON.stringify(promptTemplates));
    renderTemplates();
}

function renderTemplates() {
    const container = getOrCacheElement("qig-templates");
    if (!container) return;
    const html = promptTemplates.map((t, i) =>
        `<span style="display:inline-flex;align-items:center;margin:2px;">` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;" onclick="loadTemplate(${i})">${t.name}</button>` +
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
        renderTemplates();
    }
}

// === Contextual Filters (lorebook-style prompt injection) ===
function saveContextualFilters() {
    localStorage.setItem("qig_contextual_filters", JSON.stringify(contextualFilters));
}

function showFilterDialog(filter) {
    const isNew = !filter;
    const f = filter || { name: "", keywords: "", matchMode: "OR", positive: "", negative: "", priority: 0, description: "" };
    const isLLM = f.matchMode === "LLM";
    return new Promise((resolve) => {
        const popup = createPopup("qig-filter-dialog", isNew ? "Add Contextual Filter" : "Edit Contextual Filter", `
            <div style="padding:12px;">
                <label style="font-size:11px;">Name</label>
                <input id="qig-fd-name" type="text" value="${f.name}" placeholder="e.g., Goku & Vegeta" style="width:100%;margin-bottom:8px;">
                <label style="font-size:11px;">Match Mode</label>
                <select id="qig-fd-mode" style="width:100%;margin-bottom:8px;">
                    <option value="OR" ${f.matchMode === "OR" ? "selected" : ""}>OR — any keyword triggers</option>
                    <option value="AND" ${f.matchMode === "AND" ? "selected" : ""}>AND — all keywords required</option>
                    <option value="LLM" ${f.matchMode === "LLM" ? "selected" : ""}>LLM — AI concept recognition</option>
                </select>
                <div id="qig-fd-keywords-wrap" style="display:${isLLM ? 'none' : ''};">
                    <label style="font-size:11px;">Keywords (comma-separated)</label>
                    <textarea id="qig-fd-keywords" style="width:100%;height:40px;resize:vertical;" placeholder="goku, vegeta">${f.keywords || ""}</textarea>
                </div>
                <div id="qig-fd-desc-wrap" style="display:${isLLM ? '' : 'none'};">
                    <label style="font-size:11px;">Concept Description (what the LLM should look for)</label>
                    <textarea id="qig-fd-description" style="width:100%;height:60px;resize:vertical;" placeholder="Scenes with a cyberpunk or futuristic urban aesthetic — neon lights, holograms, high-tech cityscapes">${f.description || ""}</textarea>
                </div>
                <label style="font-size:11px;">Positive Prompt</label>
                <textarea id="qig-fd-positive" style="width:100%;height:60px;resize:vertical;" placeholder="1boy, goku, <lora:goku:0.8>">${f.positive}</textarea>
                <label style="font-size:11px;">Negative Prompt</label>
                <textarea id="qig-fd-negative" style="width:100%;height:40px;resize:vertical;" placeholder="solo, 1boy">${f.negative}</textarea>
                <label style="font-size:11px;">Priority (higher overrides lower)</label>
                <input id="qig-fd-priority" type="number" value="${f.priority || 0}" style="width:80px;margin-bottom:12px;">
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="qig-fd-cancel" class="menu_button">Cancel</button>
                    <button id="qig-fd-save" class="menu_button">Save</button>
                </div>
            </div>`, (popup) => {
            document.getElementById("qig-fd-name").focus();
            document.getElementById("qig-fd-mode").onchange = (e) => {
                const llm = e.target.value === "LLM";
                document.getElementById("qig-fd-keywords-wrap").style.display = llm ? "none" : "";
                document.getElementById("qig-fd-desc-wrap").style.display = llm ? "" : "none";
            };
            const close = () => { popup.style.display = "none"; resolve(null); };
            document.getElementById("qig-fd-cancel").onclick = close;
            document.getElementById("qig-fd-save").onclick = () => {
                const name = document.getElementById("qig-fd-name").value.trim();
                const mode = document.getElementById("qig-fd-mode").value;
                const keywords = document.getElementById("qig-fd-keywords").value.trim();
                const description = document.getElementById("qig-fd-description").value.trim();
                if (!name) { alert("Name is required."); return; }
                if (mode === "LLM" && !description) { alert("Concept description is required for LLM mode."); return; }
                if (mode !== "LLM" && !keywords) { alert("Keywords are required."); return; }
                popup.style.display = "none";
                resolve({
                    name,
                    keywords: mode === "LLM" ? "" : keywords,
                    matchMode: mode,
                    description: mode === "LLM" ? description : "",
                    positive: document.getElementById("qig-fd-positive").value.trim(),
                    negative: document.getElementById("qig-fd-negative").value.trim(),
                    priority: parseInt(document.getElementById("qig-fd-priority").value) || 0
                });
            };
        });
    });
}

// CONTEXTUAL_FILTERS_CRUD_PLACEHOLDER

async function addContextualFilter() {
    const result = await showFilterDialog(null);
    if (!result) return;
    result.id = crypto.randomUUID();
    result.enabled = true;
    contextualFilters.push(result);
    saveContextualFilters();
    renderContextualFilters();
}

async function editContextualFilter(id) {
    const f = contextualFilters.find(x => x.id === id);
    if (!f) return;
    const result = await showFilterDialog(f);
    if (!result) return;
    Object.assign(f, result);
    saveContextualFilters();
    renderContextualFilters();
}

function deleteContextualFilter(id) {
    const idx = contextualFilters.findIndex(x => x.id === id);
    if (idx === -1) return;
    contextualFilters.splice(idx, 1);
    saveContextualFilters();
    renderContextualFilters();
}

function toggleContextualFilter(id) {
    const f = contextualFilters.find(x => x.id === id);
    if (!f) return;
    f.enabled = !f.enabled;
    saveContextualFilters();
    renderContextualFilters();
}

function clearContextualFilters() {
    if (!confirm("Clear all contextual filters?")) return;
    contextualFilters = [];
    localStorage.removeItem("qig_contextual_filters");
    renderContextualFilters();
}

function renderContextualFilters() {
    const container = document.getElementById("qig-contextual-filters");
    if (!container) return;
    if (!contextualFilters.length) { container.innerHTML = ""; return; }
    const html = contextualFilters.map(f =>
        `<div style="display:flex;align-items:center;gap:4px;margin:2px 0;font-size:10px;">` +
        `<input type="checkbox" ${f.enabled ? "checked" : ""} onchange="toggleContextualFilter('${f.id}')" title="Enable/disable">` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;flex:1;text-align:left;" onclick="editContextualFilter('${f.id}')" title="${f.matchMode}: ${f.matchMode === 'LLM' ? (f.description || '') : f.keywords}\nPriority: ${f.priority}">${f.name}</button>` +
        `<span style="opacity:0.6;font-size:9px;">${f.matchMode === "LLM" ? "\u{1F916} LLM" : f.matchMode} p${f.priority}</span>` +
        `<button class="menu_button" style="padding:2px 4px;font-size:10px;" onclick="deleteContextualFilter('${f.id}')">×</button>` +
        `</div>`
    ).join("");
    container.innerHTML = `<div style="max-height:150px;overflow-y:auto;margin-bottom:4px;">${html}</div>` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearContextualFilters()">Clear All</button>`;
}

window.addContextualFilter = addContextualFilter;
window.editContextualFilter = editContextualFilter;
window.deleteContextualFilter = deleteContextualFilter;
window.toggleContextualFilter = toggleContextualFilter;
window.clearContextualFilters = clearContextualFilters;

// Character-specific settings
function getCurrentRefImages(s) {
    if (s.provider === "proxy") return s.proxyRefImages || [];
    if (s.provider === "nanobanana") return s.nanobananaRefImages || [];
    return [];
}

function getCurrentCharId() {
    const ctx = getContext();
    return ctx?.characterId ?? ctx?.characters?.[ctx?.characterId]?.avatar ?? null;
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
    localStorage.setItem("qig_char_settings", JSON.stringify(charSettings));
    const refs = getCurrentRefImages(s);
    if (refs.length > 0) {
        charRefImages[charId] = refs;
    } else {
        delete charRefImages[charId];
    }
    localStorage.setItem("qig_char_ref_images", JSON.stringify(charRefImages));
    showStatus("💾 Saved settings for this character");
    setTimeout(hideStatus, 2000);
}

function loadCharSettings() {
    const charId = getCurrentCharId();
    if (charId == null) return false;
    if (!document.getElementById("qig-prompt")) return false;
    const hasSettings = !!charSettings[charId];
    const hasRefs = !!(charRefImages[charId] && charRefImages[charId].length > 0);
    if (!hasSettings && !hasRefs) return false;
    const cs = charSettings[charId] || {};
    const s = getSettings();
    if (cs.prompt) { s.prompt = cs.prompt; document.getElementById("qig-prompt").value = cs.prompt; }
    if (cs.negativePrompt) { s.negativePrompt = cs.negativePrompt; document.getElementById("qig-negative").value = cs.negativePrompt; }
    if (cs.style) { s.style = cs.style; document.getElementById("qig-style").value = cs.style; }
    if (cs.width) { s.width = cs.width; document.getElementById("qig-width").value = cs.width; }
    if (cs.height) { s.height = cs.height; document.getElementById("qig-height").value = cs.height; }
    const refs = charRefImages[charId];
    if (refs && refs.length > 0) {
        if (s.provider === "proxy") {
            s.proxyRefImages = [...refs];
            renderRefImages();
        } else if (s.provider === "nanobanana") {
            s.nanobananaRefImages = [...refs];
            renderNanobananaRefImages();
        }
        saveSettingsDebounced();
    }
    return true;
}

function saveConnectionProfile() {
    const s = getSettings();
    const provider = s.provider;
    const name = prompt("Profile name:");
    if (!name) return;
    const keys = PROVIDER_KEYS[provider] || [];
    const profile = {};
    keys.forEach(k => profile[k] = s[k]);
    if (!connectionProfiles[provider]) connectionProfiles[provider] = {};
    connectionProfiles[provider][name] = profile;
    localStorage.setItem("qig_profiles", JSON.stringify(connectionProfiles));
    renderProfileSelect();
    showStatus(`💾 Saved profile: ${name}`);
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
    showStatus(`📂 Loaded profile: ${name}`);
    setTimeout(hideStatus, 2000);
}

function deleteConnectionProfile(name) {
    const provider = getSettings().provider;
    if (!confirm(`Delete profile "${name}"?`)) return;
    delete connectionProfiles[provider]?.[name];
    localStorage.setItem("qig_profiles", JSON.stringify(connectionProfiles));
    renderProfileSelect();
}

function renderProfileSelect() {
    const container = document.getElementById("qig-profile-select");
    if (!container) return;
    const provider = getSettings().provider;
    const profiles = Object.keys(connectionProfiles[provider] || {});
    container.innerHTML = profiles.length
        ? `<select id="qig-profile-dropdown"><option value="">-- Select Profile --</option>${profiles.map(p => `<option value="${p}">${p}</option>`).join("")}</select><button id="qig-profile-del" class="menu_button" style="padding:2px 6px;">🗑️</button>`
        : "<span style='color:#888;font-size:11px;'>No saved profiles</span>";
    const dropdown = document.getElementById("qig-profile-dropdown");
    if (dropdown) dropdown.onchange = (e) => { if (e.target.value) loadConnectionProfile(e.target.value); e.target.value = ""; };
    const delBtn = document.getElementById("qig-profile-del");
    if (delBtn) delBtn.onclick = () => { const dd = document.getElementById("qig-profile-dropdown"); if (dd?.value) deleteConnectionProfile(dd.value); };
}

// === Generation Presets ===
const PRESET_KEYS = ["provider", "style", "width", "height", "steps", "cfgScale", "sampler", "seed", "prompt", "negativePrompt", "qualityTags", "appendQuality", "useLastMessage", "useLLMPrompt", "llmPromptStyle", "batchCount", "sequentialSeeds"];

function savePreset() {
    const name = prompt("Preset name:");
    if (!name) return;
    const s = getSettings();
    const preset = { name };
    PRESET_KEYS.forEach(k => preset[k] = s[k]);
    // Always include contextual filters snapshot in preset
    if (contextualFilters.length > 0) {
        preset.contextualFilters = JSON.parse(JSON.stringify(contextualFilters));
    }
    // Include ST Style toggle state
    if (s.useSTStyle !== undefined) preset.useSTStyle = s.useSTStyle;
    // Include inject mode settings
    const injectKeys = ["injectEnabled", "injectPrompt", "injectRegex", "injectPosition", "injectDepth", "injectInsertMode", "injectAutoClean"];
    injectKeys.forEach(k => { if (s[k] !== undefined) preset[k] = s[k]; });
    generationPresets.push(preset);
    localStorage.setItem("qig_gen_presets", JSON.stringify(generationPresets));
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
        saveContextualFilters();
        renderContextualFilters();
    }
    // Restore ST Style toggle
    if (p.useSTStyle !== undefined) { s.useSTStyle = p.useSTStyle; }
    // Restore inject mode settings
    const injectKeys = ["injectEnabled", "injectPrompt", "injectRegex", "injectPosition", "injectDepth", "injectInsertMode", "injectAutoClean"];
    injectKeys.forEach(k => { if (p[k] !== undefined) s[k] = p[k]; });
    saveSettingsDebounced();
    refreshAllUI(s);
    showStatus(`📂 Loaded preset: ${p.name}`);
    setTimeout(hideStatus, 2000);
}

function deletePreset(i) {
    generationPresets.splice(i, 1);
    localStorage.setItem("qig_gen_presets", JSON.stringify(generationPresets));
    renderPresets();
}

function clearPresets() {
    if (confirm("Clear all presets?")) {
        generationPresets = [];
        localStorage.removeItem("qig_gen_presets");
        renderPresets();
    }
}

function renderPresets() {
    const container = document.getElementById("qig-presets");
    if (!container) return;
    const html = generationPresets.map((p, i) =>
        `<span style="display:inline-flex;align-items:center;margin:2px;">` +
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;" onclick="loadPreset(${i})">${p.name}</button>` +
        `<button class="menu_button" style="padding:2px 4px;font-size:10px;margin-left:1px;" onclick="deletePreset(${i})">×</button></span>`
    ).join('');
    container.innerHTML = generationPresets.length > 0
        ? `<div style="max-height:80px;overflow-y:auto;margin-bottom:4px;">${html}</div>` +
          `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearPresets()">Clear All</button>`
        : '';
}

function refreshAllUI(s) {
    const fields = {
        "qig-prompt": "prompt", "qig-negative": "negativePrompt", "qig-quality": "qualityTags",
        "qig-width": "width", "qig-height": "height", "qig-steps": "steps",
        "qig-cfg": "cfgScale", "qig-sampler": "sampler", "qig-seed": "seed",
        "qig-batch": "batchCount", "qig-provider": "provider", "qig-style": "style",
        "qig-llm-style": "llmPromptStyle",
        "qig-inject-prompt": "injectPrompt", "qig-inject-regex": "injectRegex",
        "qig-inject-position": "injectPosition", "qig-inject-depth": "injectDepth",
        "qig-inject-insert-mode": "injectInsertMode"
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
    updateProviderUI();
    renderProfileSelect();
    // Update seq seeds visibility
    const seqWrap = document.getElementById("qig-seq-seeds-wrap");
    if (seqWrap) seqWrap.style.display = (s.batchCount || 1) > 1 ? "" : "none";
    // Update inject mode visibility
    const injectOpts = document.getElementById("qig-inject-options");
    if (injectOpts) injectOpts.style.display = s.injectEnabled ? "block" : "none";
    const injectDepthWrap = document.getElementById("qig-inject-depth-wrap");
    if (injectDepthWrap) injectDepthWrap.style.display = s.injectPosition === "atDepth" ? "block" : "none";
}

window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.clearPresets = clearPresets;

// === Export / Import Settings ===
function exportAllSettings() {
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        connectionProfiles,
        promptTemplates,
        generationPresets,
        charSettings,
        charRefImages,
        contextualFilters
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
            if (data.connectionProfiles) { connectionProfiles = data.connectionProfiles; localStorage.setItem("qig_profiles", JSON.stringify(connectionProfiles)); }
            if (data.promptTemplates) { promptTemplates = data.promptTemplates; localStorage.setItem("qig_templates", JSON.stringify(promptTemplates)); }
            if (data.generationPresets) { generationPresets = data.generationPresets; localStorage.setItem("qig_gen_presets", JSON.stringify(generationPresets)); }
            if (data.charSettings) { charSettings = data.charSettings; localStorage.setItem("qig_char_settings", JSON.stringify(charSettings)); }
            if (data.charRefImages) { charRefImages = data.charRefImages; localStorage.setItem("qig_char_ref_images", JSON.stringify(charRefImages)); }
            if (data.contextualFilters) { contextualFilters = data.contextualFilters; localStorage.setItem("qig_contextual_filters", JSON.stringify(contextualFilters)); }
            renderTemplates();
            renderPresets();
            renderProfileSelect();
            renderContextualFilters();
            toastr.success("Settings imported successfully");
        } catch (err) {
            console.error("[Quick Image Gen] Import failed:", err);
            toastr.error("Failed to import: " + err.message);
        }
    };
    input.click();
}

function refreshProviderInputs(provider) {
    const s = getSettings();
    const map = {
        pollinations: [["qig-pollinations-model", "pollinationsModel"]],
        novelai: [["qig-nai-key", "naiKey"], ["qig-nai-model", "naiModel"]],
        arliai: [["qig-arli-key", "arliKey"], ["qig-arli-model", "arliModel"]],
        nanogpt: [["qig-nanogpt-key", "nanogptKey"], ["qig-nanogpt-model", "nanogptModel"]],
        chutes: [["qig-chutes-key", "chutesKey"], ["qig-chutes-model", "chutesModel"]],
        civitai: [["qig-civitai-key", "civitaiKey"], ["qig-civitai-model", "civitaiModel"], ["qig-civitai-scheduler", "civitaiScheduler"]],
        nanobanana: [["qig-nanobanana-key", "nanobananaKey"], ["qig-nanobanana-model", "nanobananaModel"], ["qig-nanobanana-extra", "nanobananaExtraInstructions"]],
        local: [["qig-local-url", "localUrl"], ["qig-local-type", "localType"], ["qig-a1111-loras", "a1111Loras"], ["qig-a1111-hires", "a1111HiresFix"], ["qig-a1111-hires-upscaler", "a1111HiresUpscaler"], ["qig-a1111-ad-prompt", "a1111AdetailerPrompt"], ["qig-a1111-ad-negative", "a1111AdetailerNegative"]],
        proxy: [["qig-proxy-url", "proxyUrl"], ["qig-proxy-key", "proxyKey"], ["qig-proxy-model", "proxyModel"], ["qig-proxy-loras", "proxyLoras"], ["qig-proxy-steps", "proxySteps"], ["qig-proxy-cfg", "proxyCfg"], ["qig-proxy-sampler", "proxySampler"], ["qig-proxy-seed", "proxySeed"], ["qig-proxy-extra", "proxyExtraInstructions"], ["qig-proxy-facefix", "proxyFacefix"]]
    };
    (map[provider] || []).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.type === "checkbox" ? el.checked = s[key] : el.value = s[key] ?? "";
    });

    // Update reference images display
    if (provider === "proxy") renderRefImages();
    if (provider === "nanobanana") renderNanobananaRefImages();
}

function updateProviderUI() {
    const s = getSettings();
    document.querySelectorAll(".qig-provider-section").forEach(el => el.style.display = "none");
    const section = document.getElementById(`qig-${s.provider}-settings`);
    if (section) section.style.display = "block";

    const showAdvanced = ["novelai", "arliai", "nanogpt", "chutes", "civitai", "local"].includes(s.provider);
    document.getElementById("qig-advanced-settings").style.display = showAdvanced ? "block" : "none";

    const isNai = s.provider === "novelai";
    document.getElementById("qig-size-custom").style.display = isNai ? "none" : "flex";
    document.getElementById("qig-nai-resolution").style.display = isNai ? "block" : "none";
}

function renderRefImages() {
    const container = getOrCacheElement("qig-proxy-refs");
    if (!container) return;
    const imgs = getSettings().proxyRefImages || [];
    container.innerHTML = imgs.map((src, i) =>
        `<div style="position:relative;"><img src="${src}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeRefImage = function (idx) {
    const s = getSettings();
    s.proxyRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderRefImages();
};

function renderNanobananaRefImages() {
    const container = getOrCacheElement("qig-nanobanana-refs");
    if (!container) return;
    const imgs = getSettings().nanobananaRefImages || [];
    container.innerHTML = imgs.map((src, i) =>
        `<div style="position:relative;"><img src="${src}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeNanobananaRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeNanobananaRefImage = function (idx) {
    const s = getSettings();
    s.nanobananaRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderNanobananaRefImages();
};

function bind(id, key, isNum = false, isCheckbox = false) {
    const el = getOrCacheElement(id);
    if (!el) return;
    el.onchange = (e) => {
        const value = isCheckbox ? e.target.checked : (isNum ? parseFloat(e.target.value) : e.target.value);
        getSettings()[key] = value;
        saveSettingsDebounced();
    };
}

function bindCheckbox(id, key) {
    return bind(id, key, false, true);
}

function modelSelect(provider, settingKey, currentVal) {
    const models = PROVIDER_MODELS[provider];
    if (!models) return `<input id="qig-${settingKey}" type="text" value="${currentVal}" placeholder="Model ID">`;
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
    const samplerOpts = SAMPLERS.map(x => `<option value="${x}" ${s.sampler === x ? "selected" : ""}>${x}</option>`).join("");
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
                <button id="qig-generate-btn" class="menu_button">🎨 Generate</button>
                <button id="qig-logs-btn" class="menu_button">📋 Logs</button>
                <button id="qig-save-char-btn" class="menu_button">💾 Save for Char</button>
                <button id="qig-gallery-settings-btn" class="menu_button">🖼️ Gallery</button>
                <button id="qig-prompt-history-btn" class="menu_button">📝 Prompts</button>

                <label>Provider</label>
                <select id="qig-provider">${providerOpts}</select>
                
                <div style="display:flex;gap:4px;align-items:center;margin:4px 0;">
                    <div id="qig-profile-select" style="flex:1;"></div>
                    <button id="qig-profile-save" class="menu_button" style="padding:2px 6px;">💾 Save Profile</button>
                </div>
                
                <label>Style</label>
                <select id="qig-style">${styleOpts}</select>
                
                <div id="qig-pollinations-settings" class="qig-provider-section">
                    <label>Model</label>
                    ${modelSelect("pollinations", "pollinations-model", s.pollinationsModel)}
                </div>
                
                <div id="qig-novelai-settings" class="qig-provider-section">
                    <label>NovelAI API Key</label>
                    <input id="qig-nai-key" type="password" value="${s.naiKey}">
                    <label>Model</label>
                    <input id="qig-nai-model" type="text" value="${s.naiModel}" placeholder="nai-diffusion-4-5-curated">
                </div>
                
                <div id="qig-arliai-settings" class="qig-provider-section">
                    <label>ArliAI API Key</label>
                    <input id="qig-arli-key" type="password" value="${s.arliKey}">
                    <label>Model</label>
                    <input id="qig-arli-model" type="text" value="${s.arliModel}" placeholder="arliai-realistic-v1">
                </div>
                
                <div id="qig-nanogpt-settings" class="qig-provider-section">
                    <label>NanoGPT API Key</label>
                    <input id="qig-nanogpt-key" type="password" value="${s.nanogptKey}">
                    <label>Model</label>
                    <input id="qig-nanogpt-model" type="text" value="${s.nanogptModel}" placeholder="image-flux-schnell">
                </div>
                
                <div id="qig-chutes-settings" class="qig-provider-section">
                    <label>Chutes API Key</label>
                    <input id="qig-chutes-key" type="password" value="${s.chutesKey}">
                    <label>Model</label>
                    <input id="qig-chutes-model" type="text" value="${s.chutesModel}" placeholder="stabilityai/stable-diffusion-xl-base-1.0">
                </div>
                
                <div id="qig-civitai-settings" class="qig-provider-section">
                    <label>CivitAI API Key</label>
                    <input id="qig-civitai-key" type="password" value="${s.civitaiKey}">
                    <label>Model URN</label>
                    <input id="qig-civitai-model" type="text" value="${s.civitaiModel}" placeholder="urn:air:sd1:checkpoint:civitai:4201@130072">
                    <label>Scheduler</label>
                    <select id="qig-civitai-scheduler">
                        <option value="EulerA" ${s.civitaiScheduler === "EulerA" ? "selected" : ""}>Euler A</option>
                        <option value="Euler" ${s.civitaiScheduler === "Euler" ? "selected" : ""}>Euler</option>
                        <option value="DPM++ 2M Karras" ${s.civitaiScheduler === "DPM++ 2M Karras" ? "selected" : ""}>DPM++ 2M Karras</option>
                        <option value="DPM++ SDE Karras" ${s.civitaiScheduler === "DPM++ SDE Karras" ? "selected" : ""}>DPM++ SDE Karras</option>
                        <option value="DDIM" ${s.civitaiScheduler === "DDIM" ? "selected" : ""}>DDIM</option>
                    </select>
                </div>
                
                <div id="qig-nanobanana-settings" class="qig-provider-section">
                    <label>Gemini API Key</label>
                    <input id="qig-nanobanana-key" type="password" value="${s.nanobananaKey}">
                    <label>Model</label>
                    <select id="qig-nanobanana-model">
                        <option value="gemini-2.5-flash-image" ${s.nanobananaModel === "gemini-2.5-flash-image" ? "selected" : ""}>Gemini 2.5 Flash Image</option>
                        <option value="gemini-2.0-flash-exp" ${s.nanobananaModel === "gemini-2.0-flash-exp" ? "selected" : ""}>Gemini 2.0 Flash Exp</option>
                    </select>
                    <label>Extra Instructions</label>
                    <textarea id="qig-nanobanana-extra" rows="2" placeholder="Additional instructions for Nanobanana Pro...">${s.nanobananaExtraInstructions || ""}</textarea>
                    <label>Reference Images (up to 15)</label>
                    <div id="qig-nanobanana-refs" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;"></div>
                    <input type="file" id="qig-nanobanana-ref-input" accept="image/*" multiple style="display:none">
                    <button id="qig-nanobanana-ref-btn" class="menu_button" style="padding:4px 8px;">📎 Add Reference Images</button>
                </div>

                <div id="qig-stability-settings" class="qig-provider-section">
                    <label>Stability AI API Key</label>
                    <input id="qig-stability-key" type="password" value="${s.stabilityKey}">
                    <div class="form-hint">Uses SDXL 1.0</div>
                </div>

                <div id="qig-replicate-settings" class="qig-provider-section">
                    <label>Replicate API Key</label>
                    <input id="qig-replicate-key" type="password" value="${s.replicateKey}">
                    <label>Model Version</label>
                    <input id="qig-replicate-model" type="text" value="${s.replicateModel}" placeholder="stability-ai/sdxl:...">
                </div>

                <div id="qig-fal-settings" class="qig-provider-section">
                    <label>Fal.ai API Key</label>
                    <input id="qig-fal-key" type="password" value="${s.falKey}">
                    <label>Model Endpoint</label>
                    <input id="qig-fal-model" type="text" value="${s.falModel}" placeholder="fal-ai/flux/schnell">
                </div>

                <div id="qig-together-settings" class="qig-provider-section">
                    <label>Together AI API Key</label>
                    <input id="qig-together-key" type="password" value="${s.togetherKey}">
                    <label>Model</label>
                    <input id="qig-together-model" type="text" value="${s.togetherModel}" placeholder="stabilityai/stable-diffusion-xl-base-1.0">
                </div>
                
                <div id="qig-local-settings" class="qig-provider-section">
                    <label>Local URL</label>
                    <input id="qig-local-url" type="text" value="${s.localUrl}" placeholder="http://127.0.0.1:7860">
                    <label>Type</label>
                    <select id="qig-local-type">
                        <option value="a1111" ${s.localType === "a1111" ? "selected" : ""}>Automatic1111</option>
                        <option value="comfyui" ${s.localType === "comfyui" ? "selected" : ""}>ComfyUI</option>
                    </select>
                    <div id="qig-local-comfyui-opts" style="display:${s.localType === "comfyui" ? "block" : "none"}">
                         <label>Checkpoint Name</label>
                         <input id="qig-local-model" type="text" value="${s.localModel}" placeholder="model.safetensors">
                         <div class="form-hint">Must match exactly with your ComfyUI checkpoints folder</div>
                         <div class="qig-row">
                            <div><label>Denoise</label><input id="qig-comfy-denoise" type="number" value="${s.comfyDenoise || 1.0}" min="0" max="1" step="0.05"></div>
                            <div><label>CLIP Skip</label><input id="qig-comfy-clip" type="number" value="${s.comfyClipSkip || 1}" min="1" max="12" step="1"></div>
                         </div>
                         <label>Custom Workflow JSON (optional)</label>
                         <textarea id="qig-comfy-workflow" rows="3" placeholder='Paste workflow from ComfyUI "Save (API Format)". Use placeholders: %prompt%, %negative%, %seed%, %width%, %height%, %steps%, %cfg%, %denoise%, %clip_skip%, %sampler%, %scheduler%, %model%'>${s.comfyWorkflow || ""}</textarea>
                         <div class="form-hint">Leave empty to use default workflow. Export from ComfyUI: Save → API Format</div>
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
                         <input id="qig-a1111-loras" type="text" value="${s.a1111Loras || ""}" placeholder="my_lora:0.8, detail_lora:0.6">
                         <div class="qig-row" style="margin-top:8px;">
                            <div><label>CLIP Skip</label><input id="qig-a1111-clip" type="number" value="${s.a1111ClipSkip || 1}" min="1" max="12" step="1"></div>
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-hires" type="checkbox" ${s.a1111HiresFix ? "checked" : ""}>
                             <span>Hires Fix (Upscale)</span>
                         </label>
                         <div id="qig-a1111-hires-opts" style="display:${s.a1111HiresFix ? 'block' : 'none'}">
                             <label>Upscaler</label>
                             <select id="qig-a1111-hires-upscaler">
                                 <option value="Latent" selected>Latent</option>
                             </select>
                             <div class="qig-row" style="margin-top:4px;">
                                 <div><label>Scale</label><input id="qig-a1111-hires-scale" type="number" value="${s.a1111HiresScale || 2}" min="1" max="4" step="0.25"></div>
                                 <div><label>2nd Pass Steps (0=same)</label><input id="qig-a1111-hires-steps" type="number" value="${s.a1111HiresSteps || 0}" min="0" max="150"></div>
                             </div>
                             <label>Denoise: <span id="qig-a1111-hires-denoise-val">${s.a1111HiresDenoise || 0.55}</span></label>
                             <input id="qig-a1111-hires-denoise" type="range" min="0" max="1" step="0.05" value="${s.a1111HiresDenoise || 0.55}">
                         </div>
                         <label class="checkbox_label">
                             <input id="qig-a1111-adetailer" type="checkbox" ${s.a1111Adetailer ? "checked" : ""}>
                             <span>Enable ADetailer (Face Fix)</span>
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
                             <input id="qig-a1111-ad-prompt" type="text" value="${s.a1111AdetailerPrompt || ""}" placeholder="Leave empty to use main prompt">
                             <label>ADetailer Negative (optional)</label>
                             <input id="qig-a1111-ad-negative" type="text" value="${s.a1111AdetailerNegative || ""}" placeholder="Leave empty to use main negative">
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-save-webui" type="checkbox" ${s.a1111SaveToWebUI ? "checked" : ""}>
                             <span>Save images to WebUI output folder</span>
                         </label>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-ipadapter" type="checkbox" ${s.a1111IpAdapter ? "checked" : ""}>
                             <span>IP-Adapter Face (face-only reference)</span>
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
                             <input id="qig-a1111-ipadapter-weight" type="range" min="0" max="1.5" step="0.05" value="${s.a1111IpAdapterWeight || 0.7}">
                             
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
                                 <div><label>Start Step</label><input id="qig-a1111-ipadapter-start" type="number" min="0" max="1" step="0.05" value="${s.a1111IpAdapterStartStep ?? 0}"></div>
                                 <div><label>End Step</label><input id="qig-a1111-ipadapter-end" type="number" min="0" max="1" step="0.05" value="${s.a1111IpAdapterEndStep ?? 1}"></div>
                             </div>
                             <div class="form-hint">Requires ControlNet + IP-Adapter extension with FaceID models</div>
                         </div>
                         <hr style="margin:8px 0;opacity:0.2;">
                         <label>Reference Image</label>
                         <div style="display:flex;gap:4px;align-items:center;">
                             <img id="qig-local-ref-preview" src="${s.localRefImage || ''}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;display:${s.localRefImage ? 'block' : 'none'};background:#333;">
                             <button id="qig-local-ref-btn" class="menu_button" style="flex:1;">📎 Upload Source</button>
                             <button id="qig-local-ref-clear" class="menu_button" style="width:30px;color:#e94560;display:${s.localRefImage ? 'block' : 'none'};">×</button>
                         </div>
                         <input type="file" id="qig-local-ref-input" accept="image/*" style="display:none">
                         
                         <div style="display:${s.localRefImage ? 'block' : 'none'};margin-top:4px;">
                            <label>Denoising Strength: <span id="qig-local-denoise-val">${s.localDenoise}</span></label>
                            <input id="qig-local-denoise" type="range" min="0" max="1" step="0.05" value="${s.localDenoise}">
                         </div>
                    </div>
                </div>
                
                <div id="qig-proxy-settings" class="qig-provider-section">
                    <label>Proxy URL</label>
                    <input id="qig-proxy-url" type="text" value="${s.proxyUrl}" placeholder="https://proxy.com/v1">
                    <label>API Key (optional)</label>
                    <input id="qig-proxy-key" type="password" value="${s.proxyKey}">
                    <label>Model</label>
                    <input id="qig-proxy-model" type="text" value="${s.proxyModel}" placeholder="PixAI model ID">
                    <label>LoRAs (id:weight, comma-separated)</label>
                    <input id="qig-proxy-loras" type="text" value="${s.proxyLoras || ""}" placeholder="123456:0.8, 789012:0.6">
                    <div class="qig-row">
                        <div><label>Steps</label><input id="qig-proxy-steps" type="number" value="${s.proxySteps || 25}" min="8" max="50"></div>
                        <div><label>CFG</label><input id="qig-proxy-cfg" type="number" value="${s.proxyCfg || 6}" min="1" max="15" step="0.5"></div>
                        <div><label>Seed</label><input id="qig-proxy-seed" type="number" value="${s.proxySeed ?? -1}"></div>
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
                    <textarea id="qig-proxy-extra" rows="2" placeholder="Additional instructions for the image model...">${s.proxyExtraInstructions || ""}</textarea>
                    <label>Reference Images (up to 15)</label>
                    <div id="qig-proxy-refs" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;"></div>
                    <input type="file" id="qig-proxy-ref-input" accept="image/*" multiple style="display:none">
                    <button id="qig-proxy-ref-btn" class="menu_button" style="padding:4px 8px;">📎 Add Reference Images</button>
                </div>
                
                <hr>
                <label>Prompt <button id="qig-save-template" class="menu_button" style="float:right;padding:2px 8px;font-size:11px;">💾 Save Template</button></label>
                <textarea id="qig-prompt" rows="2">${s.prompt}</textarea>
                <div id="qig-templates" style="margin:4px 0;"></div>
                <div style="display:flex;gap:4px;margin:4px 0;">
                    <button id="qig-save-preset" class="menu_button" style="padding:2px 8px;font-size:11px;">💾 Save Preset</button>
                    <button id="qig-export-btn" class="menu_button" style="padding:2px 8px;font-size:11px;">Export</button>
                    <button id="qig-import-btn" class="menu_button" style="padding:2px 8px;font-size:11px;">Import</button>
                </div>
                <div id="qig-presets" style="margin:4px 0;"></div>
                <label>Negative Prompt</label>
                <textarea id="qig-negative" rows="2">${s.negativePrompt}</textarea>
                
                <label>Quality Tags</label>
                <textarea id="qig-quality" rows="1">${s.qualityTags}</textarea>
                <label class="checkbox_label">
                    <input id="qig-append-quality" type="checkbox" ${s.appendQuality ? "checked" : ""}>
                    <span>Prepend quality tags to prompt</span>
                </label>
                <label class="checkbox_label">
                    <input id="qig-use-last" type="checkbox" ${s.useLastMessage ? "checked" : ""}>
                    <span>Use chat message as prompt</span>
                </label>
                <div id="qig-msg-index-wrap" style="display:${s.useLastMessage ? "block" : "none"}">
                    <label>Message selection</label>
                    <input id="qig-msg-range" type="text" value="${s.messageRange}" placeholder="-1"
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
                <div id="qig-llm-options" style="display:${s.useLLMPrompt ? "block" : "none"};margin-left:16px;">
                    <label>Prompt Style</label>
                    <select id="qig-llm-style">
                        <option value="tags" ${s.llmPromptStyle === "tags" ? "selected" : ""}>Danbooru Tags (anime)</option>
                        <option value="natural" ${s.llmPromptStyle === "natural" ? "selected" : ""}>Natural Description (realistic)</option>
                        <option value="custom" ${s.llmPromptStyle === "custom" ? "selected" : ""}>Custom Instruction</option>
                    </select>
                    <label class="checkbox_label">
                        <input id="qig-llm-edit" type="checkbox" ${s.llmEditPrompt ? "checked" : ""}>
                        <span>Edit LLM prompt before generation</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="qig-llm-quality" type="checkbox" ${s.llmAddQuality ? "checked" : ""}>
                        <span>Add enhanced quality tags</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="qig-llm-lighting" type="checkbox" ${s.llmAddLighting ? "checked" : ""}>
                        <span>Add lighting tags</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="qig-llm-artist" type="checkbox" ${s.llmAddArtist ? "checked" : ""}>
                        <span>Add random artist tags</span>
                    </label>
                    <div style="margin-top:8px;">
                        <label>Prefill (start LLM response with):</label>
                        <input id="qig-llm-prefill" type="text" value="${s.llmPrefill || ''}" 
                               placeholder="e.g., Image prompt:" style="width:100%;">
                    </div>
                    <div id="qig-llm-custom-wrap" style="display:${s.llmPromptStyle === "custom" ? "block" : "none"};margin-top:8px;">
                        <label>Custom LLM Instruction</label>
                        <textarea id="qig-llm-custom" style="width:100%;height:120px;resize:vertical;" placeholder="Write your custom instruction for the LLM. Use {{scene}} for the current scene text.">${s.llmCustomInstruction || ""}</textarea>
                    </div>
                </div>

                <hr style="margin:8px 0;opacity:0.2;">
                <div class="inline-drawer" style="margin:4px 0;">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b style="font-size:12px;">Contextual Filters</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <small style="opacity:0.7;">Lorebook-style triggers — inject prompts when keywords appear in scene text</small>
                        <div id="qig-contextual-filters" style="margin:4px 0;"></div>
                        <button id="qig-add-filter-btn" class="menu_button" style="padding:4px 8px;">+ Add Filter</button>
                    </div>
                </div>

                <label class="checkbox_label">
                    <input id="qig-use-st-style" type="checkbox" ${s.useSTStyle !== false ? "checked" : ""}>
                    <span>Use ST's Style panel settings (prefix/negative/char-specific)</span>
                </label>

                <hr style="margin:8px 0;opacity:0.2;">
                <style>
                .qig-mode-tab.active { background: var(--SmartThemeQuoteColor, #4a6); color: #fff; opacity: 1; }
                .qig-mode-tab:not(.active) { opacity: 0.6; }
                </style>
                <div style="margin:4px 0;">
                    <div id="qig-mode-tabs" style="display:flex;gap:0;margin-bottom:8px;">
                        <button class="qig-mode-tab menu_button" data-tab="direct"
                            style="flex:1;border-radius:4px 0 0 4px;padding:4px 8px;font-size:12px;">
                            Direct Mode</button>
                        <button class="qig-mode-tab menu_button" data-tab="inject"
                            style="flex:1;border-radius:0 4px 4px 0;padding:4px 8px;font-size:12px;">
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
                        <label class="checkbox_label">
                            <input id="qig-disable-palette" type="checkbox" ${s.disablePaletteButton ? "checked" : ""}>
                            <span>Hide palette button</span>
                        </label>
                    </div>

                    <!-- Inject tab -->
                    <div id="qig-tab-inject" class="qig-tab-panel" style="display:none;">
                        <small style="opacity:0.7;">Let the RP AI describe scenes with &lt;pic&gt; tags, then auto-generate images from them</small>
                        <label class="checkbox_label" style="margin-top:6px;">
                            <input id="qig-inject-enabled" type="checkbox" ${s.injectEnabled ? "checked" : ""}>
                            <span>Enable inject mode</span>
                        </label>
                        <div id="qig-inject-options" style="display:${s.injectEnabled ? "block" : "none"};margin-left:16px;">
                            <label>Inject prompt template</label>
                            <textarea id="qig-inject-prompt" rows="3" style="width:100%;resize:vertical;">${s.injectPrompt || ""}</textarea>
                            <small style="opacity:0.6;font-size:10px;">Supports {{char}}, {{user}}. Injected into chat completion to instruct AI to use &lt;pic&gt; tags.</small>
                            <label>Extraction regex</label>
                            <input id="qig-inject-regex" type="text" value="${(s.injectRegex || '').replace(/"/g, '&quot;')}" style="width:100%;font-family:monospace;font-size:11px;">
                            <small style="opacity:0.6;font-size:10px;">Capture group 1 = image prompt. Default extracts from &lt;pic prompt="..."&gt;</small>
                            <label>Injection position</label>
                            <select id="qig-inject-position">
                                <option value="afterScenario" ${s.injectPosition === "afterScenario" ? "selected" : ""}>After Scenario</option>
                                <option value="inUser" ${s.injectPosition === "inUser" ? "selected" : ""}>Before User Message</option>
                                <option value="atDepth" ${s.injectPosition === "atDepth" ? "selected" : ""}>At Depth</option>
                            </select>
                            <div id="qig-inject-depth-wrap" style="display:${s.injectPosition === "atDepth" ? "block" : "none"};">
                                <label>Depth</label>
                                <input id="qig-inject-depth" type="number" value="${s.injectDepth || 0}" min="0" max="100">
                            </div>
                            <label>Tag handling</label>
                            <select id="qig-inject-insert-mode">
                                <option value="replace" ${s.injectInsertMode === "replace" ? "selected" : ""}>Replace tag with image</option>
                                <option value="inline" ${s.injectInsertMode === "inline" ? "selected" : ""}>Insert image after message</option>
                                <option value="new" ${s.injectInsertMode === "new" ? "selected" : ""}>New message with image</option>
                            </select>
                            <label class="checkbox_label">
                                <input id="qig-inject-autoclean" type="checkbox" ${s.injectAutoClean !== false ? "checked" : ""}>
                                <span>Remove &lt;pic&gt; tags from displayed message</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                    <label style="font-size:12px;white-space:nowrap;">Palette button mode</label>
                    <select id="qig-palette-mode" style="flex:1;">
                        <option value="direct" ${s.paletteMode === "inject" ? "" : "selected"}>Direct (manual prompt)</option>
                        <option value="inject" ${s.paletteMode === "inject" ? "selected" : ""}>Inject (extract/generate &lt;pic&gt; tags)</option>
                    </select>
                </div>

                <div style="margin:6px 0;padding:8px;border:1px solid #555;border-radius:4px;">
                    <label class="checkbox_label">
                        <input id="qig-llm-override" type="checkbox" ${s.llmOverrideEnabled ? "checked" : ""}>
                        <span>Use separate AI for image prompts</span>
                    </label>
                    <div id="qig-llm-override-options" style="display:${s.llmOverrideEnabled ? 'block' : 'none'};margin-top:6px;">
                        <label style="font-size:11px;">Connection Profile</label>
                        <select id="qig-llm-override-profile" style="width:100%;"></select>
                        <label style="font-size:11px;margin-top:4px;">Completion Preset (optional)</label>
                        <select id="qig-llm-override-preset-select" style="width:100%;"></select>
                        <label style="font-size:11px;margin-top:4px;">Max Tokens</label>
                        <input id="qig-llm-override-max" type="number" value="${s.llmOverrideMaxTokens || 500}" min="50" max="4096" style="width:100%;">
                    </div>
                </div>

                <label class="checkbox_label">
                    <input id="qig-auto-insert" type="checkbox" ${s.autoInsert ? "checked" : ""}>
                    <span>Auto-insert into chat (skip popup)</span>
                </label>

                <label>Size</label>
                <div id="qig-size-custom" class="qig-row">
                    <input id="qig-width" type="number" value="${s.width}" min="256" max="2048" step="64">
                    <span>×</span>
                    <input id="qig-height" type="number" value="${s.height}" min="256" max="2048" step="64">
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
                    ${NAI_RESOLUTIONS.map(r => `<option value="${r.w}x${r.h}" ${s.width === r.w && s.height === r.h ? "selected" : ""}>${r.label}</option>`).join("")}
                </select>
                
                <label>Batch Count</label>
                <input id="qig-batch" type="number" value="${s.batchCount}" min="1" max="10">
                <label class="checkbox_label" id="qig-seq-seeds-wrap" style="display:${(s.batchCount || 1) > 1 ? '' : 'none'}">
                    <input id="qig-seq-seeds" type="checkbox" ${s.sequentialSeeds ? "checked" : ""}>
                    <span>Sequential seeds (seed, seed+1, seed+2...)</span>
                </label>
                
                <div id="qig-advanced-settings">
                    <label>Steps</label>
                    <input id="qig-steps" type="number" value="${s.steps}" min="1" max="150">
                    <label>CFG Scale</label>
                    <input id="qig-cfg" type="number" value="${s.cfgScale}" min="1" max="30" step="0.5">
                    <label>Sampler</label>
                    <select id="qig-sampler">${samplerOpts}</select>
                    <label>Seed (-1 = random)</label>
                    <input id="qig-seed" type="number" value="${s.seed}">
                </div>
            </div>
        </div>
    </div>`;

    document.getElementById("extensions_settings").insertAdjacentHTML("beforeend", html);

    document.getElementById("qig-generate-btn").onclick = generateImage;
    document.getElementById("qig-logs-btn").onclick = showLogs;
    document.getElementById("qig-save-char-btn").onclick = saveCharSettings;
    document.getElementById("qig-gallery-settings-btn").onclick = showGallery;
    document.getElementById("qig-prompt-history-btn").onclick = showPromptHistory;
    document.getElementById("qig-save-template").onclick = saveTemplate;
    document.getElementById("qig-profile-save").onclick = saveConnectionProfile;
    document.getElementById("qig-save-preset").onclick = savePreset;
    document.getElementById("qig-export-btn").onclick = exportAllSettings;
    document.getElementById("qig-import-btn").onclick = importSettings;
    document.getElementById("qig-add-filter-btn").onclick = addContextualFilter;
    renderTemplates();
    renderPresets();
    renderProfileSelect();
    renderContextualFilters();

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
    bind("qig-arli-key", "arliKey");
    bind("qig-arli-model", "arliModel");
    bind("qig-nanogpt-key", "nanogptKey");
    bind("qig-nanogpt-model", "nanogptModel");
    bind("qig-chutes-key", "chutesKey");
    bind("qig-chutes-model", "chutesModel");
    bind("qig-civitai-key", "civitaiKey");
    bind("qig-civitai-model", "civitaiModel");
    bind("qig-civitai-scheduler", "civitaiScheduler");
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
    document.getElementById("qig-local-type").onchange = (e) => {
        getSettings().localType = e.target.value;
        document.getElementById("qig-local-a1111-opts").style.display = e.target.value === "a1111" ? "block" : "none";
        document.getElementById("qig-local-comfyui-opts").style.display = e.target.value === "comfyui" ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-local-denoise", "localDenoise", true);
    document.getElementById("qig-local-denoise").oninput = (e) => {
        document.getElementById("qig-local-denoise-val").textContent = e.target.value;
    };
    // ComfyUI specific bindings
    bind("qig-comfy-denoise", "comfyDenoise", true);
    bind("qig-comfy-clip", "comfyClipSkip", true);
    bind("qig-comfy-workflow", "comfyWorkflow");

    // A1111 specific bindings
    bind("qig-a1111-clip", "a1111ClipSkip", true);
    bind("qig-a1111-loras", "a1111Loras");

    // Hires Fix bindings
    bindCheckbox("qig-a1111-hires", "a1111HiresFix");
    bind("qig-a1111-hires-upscaler", "a1111HiresUpscaler");
    bind("qig-a1111-hires-steps", "a1111HiresSteps", true);
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
    document.getElementById("qig-a1111-adetailer").onchange = (e) => {
        getSettings().a1111Adetailer = e.target.checked;
        saveSettingsDebounced();
        document.getElementById("qig-a1111-adetailer-opts").style.display = e.target.checked ? "block" : "none";
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
            // We don't change innerHTML here so it keeps the hardcoded presets from HTML
            // but maybe we should append a warning?
            cnSelect.insertAdjacentHTML('beforeend', '<option value="" disabled>-- No IP-Adapter models detected --</option>');
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
        document.getElementById("qig-local-denoise").parentElement.style.display = "none";
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
            document.getElementById("qig-local-denoise").parentElement.style.display = "block";
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
    bindCheckbox("qig-auto-generate", "autoGenerate");
    bindCheckbox("qig-auto-insert", "autoInsert");
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
    bind("qig-inject-prompt", "injectPrompt");
    bind("qig-inject-regex", "injectRegex");
    document.getElementById("qig-inject-position").onchange = (e) => {
        getSettings().injectPosition = e.target.value;
        document.getElementById("qig-inject-depth-wrap").style.display = e.target.value === "atDepth" ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-inject-depth", "injectDepth", true);
    bind("qig-inject-insert-mode", "injectInsertMode");
    bindCheckbox("qig-inject-autoclean", "injectAutoClean");
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
    bind("qig-width", "width", true);
    bind("qig-height", "height", true);
    document.getElementById("qig-aspect").onchange = (e) => {
        const v = e.target.value;
        if (!v) return;
        const s = getSettings();
        const base = Math.min(s.width, s.height) || 512;
        const [w, h] = v.split(":").map(Number);
        if (w > h) { s.width = Math.round(base * w / h); s.height = base; }
        else { s.width = base; s.height = Math.round(base * h / w); }
        document.getElementById("qig-width").value = s.width;
        document.getElementById("qig-height").value = s.height;
        saveSettingsDebounced();
    };
    document.getElementById("qig-nai-resolution").onchange = (e) => {
        const [w, h] = e.target.value.split("x").map(Number);
        const s = getSettings();
        s.width = w;
        s.height = h;
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
    isGenerating = true;
    const s = getSettings();

    const paletteBtn = getOrCacheElement("qig-input-btn");
    if (paletteBtn) {
        paletteBtn.classList.remove("fa-palette");
        paletteBtn.classList.add("fa-spinner", "fa-spin");
    }

    try {
        // Build regex from settings (same as processInjectMessage)
        const regexPattern = s.injectRegex || '<pic\\s+prompt="([^"]+)"\\s*/?>';
        let regex;
        try {
            regex = new RegExp(regexPattern, "gi");
        } catch (e) {
            log(`Palette inject: Invalid regex: ${e.message}`);
            toastr.error("Invalid inject regex: " + e.message);
            return;
        }

        // Step 1: Scan last AI message for <pic> tags
        let matches = [];
        const ctx = getContext();
        const chat = ctx.chat;
        if (chat && chat.length > 0) {
            for (let i = chat.length - 1; i >= 0; i--) {
                if (!chat[i].is_user && chat[i].mes) {
                    let match;
                    while ((match = regex.exec(chat[i].mes)) !== null) {
                        if (match[1]) matches.push(match[1]);
                    }
                    break;
                }
            }
        }

        // Step 2: LLM fallback if no tags found
        if (matches.length === 0) {
            log("Palette inject: No <pic> tags found, calling LLM...");
            showStatus("🔍 No <pic> tags found — asking LLM to generate them...");

            const sceneContext = getMessages() || "the current scene";
            const injectInstruction = resolvePrompt(s.injectPrompt || 'When describing a scene visually, include an image tag: <pic prompt="detailed visual description">');
            const timestamp = Date.now();
            const fullInstruction = `${injectInstruction}\n\nBased on this scene context, generate <pic> tags for the key visual moments:\n\n${sceneContext}\n\n[${timestamp}]`;

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
                    llmResponse = await generateQuietPrompt(fullInstruction);
                }
            }

            log(`Palette inject: LLM response: ${(llmResponse || "").substring(0, 200)}...`);

            if (llmResponse) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(llmResponse)) !== null) {
                    if (match[1]) matches.push(match[1]);
                }
            }

            if (matches.length === 0) {
                toastr.warning("No <pic> tags found in AI message or LLM response");
                log("Palette inject: No <pic> tags extracted after LLM fallback");
                return;
            }
        }

        log(`Palette inject: Found ${matches.length} <pic> tag(s), generating images...`);

        // Step 3: Generate images for each extracted prompt (same pipeline as processInjectMessage)
        for (const extractedPrompt of matches) {
            showStatus(`🖼️ Generating palette-inject image...`);

            let prompt = extractedPrompt;
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

            // Apply contextual filters
            const filtered = applyContextualFilters(prompt, negative, extractedPrompt);
            prompt = filtered.prompt;
            negative = filtered.negative;

            // Apply LLM-matched concept filters
            const llmMatched = await matchLLMFilters(extractedPrompt);
            for (const f of llmMatched) {
                if (f.positive) prompt = `${prompt}, ${f.positive}`;
                if (f.negative) negative = `${negative}, ${f.negative}`;
            }

            lastPrompt = prompt;
            lastNegative = negative;
            lastPromptWasLLM = false;

            const batchCount = s.batchCount || 1;
            const results = [];
            const originalSeed = s.seed;
            let baseSeed = originalSeed;
            if (s.sequentialSeeds && batchCount > 1 && baseSeed === -1) {
                baseSeed = Math.floor(Math.random() * 2147483647);
            }
            for (let i = 0; i < batchCount; i++) {
                if (s.sequentialSeeds && batchCount > 1) s.seed = baseSeed + i;
                showStatus(`🖼️ Generating palette-inject image ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(prompt);
                const expandedNegative = expandWildcards(negative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s);
                if (result) results.push(result);
            }
            s.seed = originalSeed;

            if (results.length > 0) {
                if (s.autoInsert) {
                    for (const r of results) {
                        addToGallery(r);
                        try { await insertImageIntoMessage(r); } catch (err) {
                            log(`Palette inject: Auto-insert failed: ${err.message}`);
                            displayImage(r);
                        }
                    }
                } else if (results.length === 1) {
                    displayImage(results[0]);
                } else {
                    displayBatchResults(results);
                }
                toastr.success(`Palette inject: ${results.length} image(s) generated`);
            }
        }
    } catch (e) {
        log(`Palette inject: Error: ${e.message}`);
        toastr.error("Palette inject failed: " + e.message);
    } finally {
        isGenerating = false;
        showStatus(null);
        if (paletteBtn) {
            paletteBtn.classList.remove("fa-spinner", "fa-spin");
            paletteBtn.classList.add("fa-palette");
        }
        clearStyleCache();
        log("Palette inject: Cleared caches after generation");
    }
}

async function generateImage() {
    if (isGenerating) return;
    if (getSettings().confirmBeforeGenerate && !confirm("Generate image?")) return;
    isGenerating = true;
    const s = getSettings();
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
                    isGenerating = false;
                    hideStatus();
                    return;
                }
                scenePrompt = filtered;
                basePrompt = filtered;
            }
        }
    }

    log(`Base prompt: ${basePrompt.substring(0, 100)}...`);
    const batchCount = s.batchCount || 1;
    showStatus(`🎨 Generating ${batchCount} image(s)...`);

    const paletteBtn = getOrCacheElement("qig-input-btn");
    if (paletteBtn) {
        paletteBtn.classList.remove("fa-palette");
        paletteBtn.classList.add("fa-spinner", "fa-spin");
    }

    let prompt = await generateLLMPrompt(s, scenePrompt || basePrompt);
    lastPromptWasLLM = (s.useLLMPrompt && prompt !== (scenePrompt || basePrompt));

    // Show prompt editing dialog if enabled
    if (s.useLLMPrompt && s.llmEditPrompt && prompt !== basePrompt) {
        const editedPrompt = await showPromptEditDialog(prompt);
        if (editedPrompt !== null) {
            prompt = editedPrompt;
        } else {
            // User cancelled
            isGenerating = false;
            hideStatus();
            if (paletteBtn) {
                paletteBtn.classList.remove("fa-spinner", "fa-spin");
                paletteBtn.classList.add("fa-palette");
            }
            return;
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

    // Apply contextual filters based on scene text
    const sceneForFilters = scenePrompt || basePrompt;
    const filtered = applyContextualFilters(prompt, negative, sceneForFilters);
    prompt = filtered.prompt;
    negative = filtered.negative;

    // Apply LLM-matched concept filters
    const llmMatched = await matchLLMFilters(sceneForFilters);
    for (const f of llmMatched) {
        if (f.positive) prompt = `${prompt}, ${f.positive}`;
        if (f.negative) negative = `${negative}, ${f.negative}`;
    }

    lastPrompt = prompt;
    lastNegative = negative;
    promptHistory.unshift({ prompt, negative, time: new Date().toLocaleTimeString() });
    if (promptHistory.length > 50) promptHistory.pop();
    savePromptHistory();

    log(`Final prompt: ${prompt.substring(0, 100)}...`);
    log(`Negative: ${negative.substring(0, 50)}...`);

    const btn = getOrCacheElement("qig-generate-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Generating...";
    }

    try {
        const results = [];
        log(`Using provider: ${s.provider}, batch: ${batchCount}`);
        const originalSeed = s.seed;
        let baseSeed = originalSeed;
        if (s.sequentialSeeds && batchCount > 1 && baseSeed === -1) {
            baseSeed = Math.floor(Math.random() * 2147483647);
        }
        for (let i = 0; i < batchCount; i++) {
            if (s.sequentialSeeds && batchCount > 1) s.seed = baseSeed + i;
            showStatus(`🖼️ Generating image ${i + 1}/${batchCount}...`);
            const expandedPrompt = expandWildcards(prompt);
            const expandedNegative = expandWildcards(negative);
            const result = await generateForProvider(expandedPrompt, expandedNegative, s);
            if (result) results.push(result);
        }
        log(`Generated ${results.length} image(s) successfully`);
        if (s.autoInsert) {
            for (const r of results) {
                addToGallery(r);
                try { await insertImageIntoMessage(r); } catch (err) {
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
        log(`Error: ${e.message}`);
        toastr.error("Generation failed: " + e.message);
    } finally {
        s.seed = originalSeed;
        isGenerating = false;
        showStatus(null);
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🎨 Generate";
        }
        if (paletteBtn) {
            paletteBtn.classList.remove("fa-spinner", "fa-spin");
            paletteBtn.classList.add("fa-palette");
        }
        // Clear caches after each generation to prevent reusing stale prompts
        clearStyleCache();
        log("Cleared all caches after generation");
    }
}


// === Inject Mode (AI-driven image generation via <pic> tags) ===

function onChatCompletionPromptReady(eventData) {
    const s = getSettings();
    if (!s.injectEnabled || !s.injectPrompt) return;

    const promptText = resolvePrompt(s.injectPrompt);
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

async function processInjectMessage(messageText, messageIndex) {
    const s = getSettings();
    if (!s.injectEnabled || !s.injectRegex) return;

    let regex;
    try {
        regex = new RegExp(s.injectRegex, "gi");
    } catch (e) {
        log(`Inject: Invalid regex: ${e.message}`);
        return;
    }

    const matches = [];
    let match;
    while ((match = regex.exec(messageText)) !== null) {
        if (match[1]) matches.push(match[1]);
    }

    if (matches.length === 0) return;

    log(`Inject: Found ${matches.length} <pic> tag(s) in message`);

    // Clean tags from displayed message if enabled
    if (s.injectAutoClean !== false) {
        try {
            const ctx = getContext();
            const chat = ctx.chat;
            const idx = messageIndex !== undefined ? messageIndex : chat.length - 1;
            const msg = chat[idx];
            if (msg) {
                const cleanRegex = new RegExp(s.injectRegex, "gi");
                msg.mes = msg.mes.replace(cleanRegex, "").trim();
                await ctx.saveChat();
                if (typeof ctx.reloadCurrentChat === 'function') {
                    await ctx.reloadCurrentChat();
                }
                log("Inject: Cleaned <pic> tags from message");
            }
        } catch (e) {
            log(`Inject: Error cleaning tags: ${e.message}`);
        }
    }

    // Generate images for each extracted prompt
    for (const extractedPrompt of matches) {
        if (isGenerating) {
            log("Inject: Waiting for current generation to finish...");
            await new Promise((resolve, reject) => {
                let elapsed = 0;
                const check = setInterval(() => {
                    elapsed += 500;
                    if (!isGenerating) { clearInterval(check); resolve(); }
                    else if (elapsed >= 60000) { clearInterval(check); reject(new Error("Timed out waiting for generation")); }
                }, 500);
            });
        }

        try {
            isGenerating = true;
            log(`Inject: Generating image for: ${extractedPrompt.substring(0, 80)}...`);
            showStatus("🖼️ Generating inject-mode image...");

            let prompt = extractedPrompt;
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

            // Apply contextual filters
            const filtered = applyContextualFilters(prompt, negative, extractedPrompt);
            prompt = filtered.prompt;
            negative = filtered.negative;

            // Apply LLM-matched concept filters
            const llmMatched = await matchLLMFilters(extractedPrompt);
            for (const f of llmMatched) {
                if (f.positive) prompt = `${prompt}, ${f.positive}`;
                if (f.negative) negative = `${negative}, ${f.negative}`;
            }

            lastPrompt = prompt;
            lastNegative = negative;
            lastPromptWasLLM = false;

            const batchCount = s.batchCount || 1;
            const results = [];
            const originalSeed = s.seed;
            let baseSeed = originalSeed;
            if (s.sequentialSeeds && batchCount > 1 && baseSeed === -1) {
                baseSeed = Math.floor(Math.random() * 2147483647);
            }
            for (let i = 0; i < batchCount; i++) {
                if (s.sequentialSeeds && batchCount > 1) s.seed = baseSeed + i;
                showStatus(`🖼️ Generating inject image ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(prompt);
                const expandedNegative = expandWildcards(negative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s);
                if (result) results.push(result);
            }
            s.seed = originalSeed;

            if (results.length > 0) {
                if (results.length === 1) {
                    if (s.autoInsert) {
                        addToGallery(results[0]);
                        try { await insertImageIntoMessage(results[0]); } catch (err) {
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
            log(`Inject: Generation error: ${e.message}`);
            toastr.error("Inject generation failed: " + e.message);
        } finally {
            isGenerating = false;
            showStatus(null);
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

            await loadSettings();
            createUI();
            addInputButton();

            // Populate LLM override dropdowns if enabled
            const initSettings = getSettings();
            if (initSettings.llmOverrideEnabled) {
                populateConnectionProfiles("qig-llm-override-profile", initSettings.llmOverrideProfileId);
                populatePresetList("qig-llm-override-preset-select", initSettings.llmOverridePreset);
            }

            const { eventSource, event_types } = scriptModule;
            if (eventSource) {
                eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
                    const s = getSettings();
                    // Inject mode: extract <pic> tags from AI response
                    // Checked first — if active, skip autoGenerate to prevent double generation
                    if (s.injectEnabled) {
                        const ctx = getContext();
                        const chat = ctx?.chat;
                        const idx = typeof messageIndex === "number" ? messageIndex : (chat ? chat.length - 1 : -1);
                        const msg = chat?.[idx];
                        if (msg?.mes) {
                            setTimeout(() => processInjectMessage(msg.mes, idx), 300);
                        }
                        return;
                    }
                    // Auto-generate mode
                    if (s.autoGenerate && !isGenerating) {
                        setTimeout(() => generateImage(), 500);
                    }
                });
                // Inject mode: inject prompt into chat completion
                if (event_types.CHAT_COMPLETION_PROMPT_READY) {
                    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
                }
                eventSource.on(event_types.CHAT_CHANGED, () => {
                    loadCharSettings();
                });
            }
        } catch (err) {
            console.error("[Quick Image Gen] Initialization failed:", err);
        }
    })();
});


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
    if (settings.steps) params.push(`Steps: ${settings.steps}`);
    if (settings.sampler) params.push(`Sampler: ${settings.sampler}`);
    if (settings.cfgScale) params.push(`CFG scale: ${settings.cfgScale}`);
    if (settings.seed !== undefined) params.push(`Seed: ${settings.seed}`);
    if (settings.width && settings.height) params.push(`Size: ${settings.width}x${settings.height}`);
    if (settings.provider) params.push(`Model: ${settings.provider}`);
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
        const len = (src[offset] << 24 | src[offset+1] << 16 | src[offset+2] << 8 | src[offset+3]) >>> 0;
        const type = String.fromCharCode(src[offset+4], src[offset+5], src[offset+6], src[offset+7]);
        if (type === 'IEND') { iendPos = offset; break; }
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
        let arrayBuffer;
        if (url.startsWith('data:')) {
            const resp = await fetch(url);
            arrayBuffer = await resp.arrayBuffer();
        } else {
            const resp = await fetch(url);
            arrayBuffer = await resp.arrayBuffer();
        }
        const metaText = buildMetadataString(prompt, negative, settings);
        const isPNG = new Uint8Array(arrayBuffer).slice(0, 4).join(',') === '137,80,78,71';
        const finalBuffer = isPNG ? embedPNGMetadata(arrayBuffer, metaText) : arrayBuffer;
        const blob = new Blob([finalBuffer], { type: isPNG ? 'image/png' : 'image/jpeg' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
        console.error("Download with metadata failed:", err);
        window.open(url, '_blank');
    }
}

// Metadata Drag and Drop Handlers
async function readInfoFromPNG(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const buffer = e.target.result;
            const view = new DataView(buffer);
            let offset = 8; // Skip PNG signature

            while (offset < view.byteLength) {
                const length = view.getUint32(offset);
                const type = String.fromCharCode(
                    view.getUint8(offset + 4),
                    view.getUint8(offset + 5),
                    view.getUint8(offset + 6),
                    view.getUint8(offset + 7)
                );

                if (type === 'tEXt') {
                    const dataOffset = offset + 8;
                    const data = new Uint8Array(buffer, dataOffset, length);
                    let keywordEnd = 0;
                    for (let i = 0; i < length; i++) {
                        if (data[i] === 0) {
                            keywordEnd = i;
                            break;
                        }
                    }
                    const keyword = new TextDecoder().decode(data.slice(0, keywordEnd));
                    if (keyword === 'parameters') {
                        const text = new TextDecoder().decode(data.slice(keywordEnd + 1));
                        resolve(text);
                        return;
                    }
                }

                offset += length + 12; // Length + Type + Data + CRC
            }
            resolve(null);
        };
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
    const getParam = (key) => {
        const match = params.match(new RegExp(`${key}: ([^,]+)`));
        return match ? match[1].trim() : null;
    };

    const steps = getParam("Steps");
    const sampler = getParam("Sampler");
    const cfg = getParam("CFG scale");
    const seed = getParam("Seed");
    const size = getParam("Size");
    const model = getParam("Model");

    if (steps) result.steps = parseInt(steps);
    if (sampler) result.sampler = sampler;
    if (cfg) result.cfgScale = parseFloat(cfg);
    if (seed) result.seed = parseInt(seed);
    if (size) {
        const [w, h] = size.split("x").map(Number);
        result.width = w;
        result.height = h;
    }
    if (model) result.model = model;

    return result;
}

async function handleMetadataDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/png')) return;

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
            if (params.prompt) {
                s.prompt = params.prompt;
                const el = document.getElementById("qig-prompt");
                if (el) el.value = s.prompt;
            }
            if (params.negativePrompt) {
                s.negativePrompt = params.negativePrompt;
                const el = document.getElementById("qig-negative");
                if (el) el.value = s.negativePrompt;
            }
            if (params.steps) {
                s.steps = params.steps;
                const el = document.getElementById("qig-steps");
                if (el) el.value = s.steps;
            }
            if (params.cfgScale) {
                s.cfgScale = params.cfgScale;
                const el = document.getElementById("qig-cfg");
                if (el) el.value = s.cfgScale;
            }
            if (params.seed) {
                s.seed = params.seed;
                const el = document.getElementById("qig-seed");
                if (el) el.value = s.seed;
            }
            if (params.width && params.height) {
                s.width = params.width;
                s.height = params.height;
                const wEl = document.getElementById("qig-width");
                const hEl = document.getElementById("qig-height");
                if (wEl) wEl.value = s.width;
                if (hEl) hEl.value = s.height;
            }
            // Try to map sampler (approximate match)
            if (params.sampler) {
                // Not perfect but helps
                const samplerMap = {
                    "Euler a": "euler_a",
                    "Euler": "euler",
                    "DPM++ 2M Karras": "dpmpp_2m",
                    "DPM++ SDE Karras": "dpmpp_sde"
                };
                if (samplerMap[params.sampler]) {
                    s.sampler = samplerMap[params.sampler];
                    // Also update dropdown
                    const el = document.getElementById("qig-sampler");
                    if (el) el.value = s.sampler;
                }
            }

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
