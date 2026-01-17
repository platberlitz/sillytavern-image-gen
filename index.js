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
    messageIndex: -1,
    width: 512,
    height: 512,
    steps: 25,
    cfgScale: 7,
    sampler: "euler_a",
    seed: -1,
    autoGenerate: false,
    batchCount: 1,
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
    a1111IpAdapter: false,
    a1111IpAdapterMode: "ip-adapter-faceid-portrait_sd15",
    a1111IpAdapterWeight: 0.7,
    // ComfyUI specific
    comfyWorkflow: "",
    comfyClipSkip: 1,
    comfyDenoise: 1.0,
};

let sessionGallery = [];
let lastPrompt = "";
let lastNegative = "";
let promptTemplates = JSON.parse(localStorage.getItem("qig_templates") || "[]");
let charSettings = JSON.parse(localStorage.getItem("qig_char_settings") || "{}");
let connectionProfiles = JSON.parse(localStorage.getItem("qig_profiles") || "{}");

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
    local: ["localUrl", "localType", "localModel", "localRefImage", "localDenoise", "a1111Model", "a1111ClipSkip", "a1111Adetailer", "a1111AdetailerModel", "a1111IpAdapter", "a1111IpAdapterMode", "a1111IpAdapterWeight", "comfyWorkflow", "comfyClipSkip", "comfyDenoise"],
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
    extension_settings[extensionName] = { ...defaultSettings, ...extension_settings[extensionName] };
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

function getLastMessage() {
    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat || chat.length === 0) return "";
    const s = getSettings();
    const idx = s.messageIndex === -1 ? chat.length - 1 : Math.min(s.messageIndex, chat.length - 1);
    const msg = chat[idx];
    return msg?.mes || "";
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


const skinPattern = /\b(dark[- ]?skin(?:ned)?|brown[- ]?skin(?:ned)?|black[- ]?skin(?:ned)?|tan(?:ned)?[- ]?skin|ebony|melanin|mocha|chocolate[- ]?skin|caramel[- ]?skin)\b/gi;

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
CURRENT SCENE: ${basePrompt}

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

### IMAGE GENERATION TASK ###

Create Danbooru/Booru-style tags for this scene: ${basePrompt}

Character info: ${appearanceContext}

Required tags:
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
        const quietOptions = {
            skipWIAN: true,
            quietName: `ImageGen_${timestamp}`,
            quietToLoud: false
        };

        let llmPrompt;
        try {
            // Try calling with options first (newer SillyTavern versions)
            llmPrompt = await generateQuietPrompt(instructionWithEntropy, quietOptions);
        } catch (e) {
            // Fallback to simple call for older versions
            log(`generateQuietPrompt with options failed: ${e.message}, using simple call`);
            llmPrompt = await generateQuietPrompt(instructionWithEntropy);
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
            cleaned = await generateLiteralFallback(instruction);
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
    const sampler = samplerMap[s.sampler] || "k_euler_ancestral";
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

        console.log("No decompression method available, returning compressed data");
        return compressedData;

    } catch (e) {
        console.error("Decompression failed:", e);
        return compressedData;
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
            guidance_scale: s.cfgScale
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
    const res = await fetch("https://civitai.com/api/v1/jobs", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.civitaiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
                clipSkip: 2
            },
            batchSize: 1
        })
    });
    if (!res.ok) throw new Error(`CivitAI error: ${res.status}`);
    const data = await res.json();

    // Poll for job completion
    const jobId = data.id;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://civitai.com/api/v1/jobs/${jobId}`, {
            headers: { "Authorization": `Bearer ${s.civitaiKey}` }
        });
        if (!statusRes.ok) throw new Error(`CivitAI status error: ${statusRes.status}`);
        const status = await statusRes.json();

        if (status.status === 'completed' && status.result?.images?.[0]) {
            return status.result.images[0].url;
        }
        if (status.status === 'failed') {
            throw new Error(`CivitAI job failed: ${status.error || 'Unknown error'}`);
        }
    }
    throw new Error("CivitAI job timeout");
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
                return `data:image/png;base64,${part.inlineData.data}`;
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

        const samplerName = comfySamplerMap[s.sampler] || s.sampler.replace(/_/g, "_");
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
                    const hist = await fetch(`${baseUrl}/history/${promptId}`).then(r => r.json());
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
            const hist = await fetch(`${baseUrl}/history/${promptId}`).then(r => r.json());
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
    const isImg2Img = s.localType === "a1111" && s.localRefImage;
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

    // CLIP skip
    const clipSkip = parseInt(s.a1111ClipSkip) || 1;
    if (clipSkip > 1) {
        payload.override_settings = payload.override_settings || {};
        payload.override_settings.CLIP_stop_at_last_layers = clipSkip;
    }

    // ADetailer
    if (s.a1111Adetailer) {
        payload.alwayson_scripts = payload.alwayson_scripts || {};
        payload.alwayson_scripts.ADetailer = {
            args: [{
                ad_model: s.a1111AdetailerModel || "face_yolov8n.pt",
                ad_prompt: "",
                ad_negative_prompt: ""
            }]
        };
    }

    if (isImg2Img && !s.a1111IpAdapter) {
        // Standard img2img - use as init image
        payload.init_images = [s.localRefImage.replace(/^data:image\/.+;base64,/, '')];
        payload.denoising_strength = parseFloat(s.localDenoise) || 0.75;
    }

    // IP-Adapter Face - use reference image for face only
    if (s.a1111IpAdapter && s.localRefImage) {
        payload.alwayson_scripts = payload.alwayson_scripts || {};
        payload.alwayson_scripts.controlnet = {
            args: [{
                enabled: true,
                module: "ip-adapter_face_id",
                model: s.a1111IpAdapterMode || "ip-adapter-faceid-portrait_sd15",
                weight: parseFloat(s.a1111IpAdapterWeight) || 0.7,
                image: s.localRefImage.replace(/^data:image\/.+;base64,/, ''),
                resize_mode: "Crop and Resize",
                control_mode: "Balanced",
                pixel_perfect: true
            }]
        };
        log(`A1111: Using IP-Adapter Face with model=${s.a1111IpAdapterMode}, weight=${s.a1111IpAdapterWeight}`);
    }

    log(`A1111: steps=${s.steps}, cfg=${s.cfgScale}, clip_skip=${clipSkip}, adetailer=${s.a1111Adetailer ? 'on' : 'off'}, ip-adapter=${s.a1111IpAdapter && s.localRefImage ? 'on' : 'off'}`);

    const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`A1111 error: ${res.status}`);
    const data = await res.json();
    if (data.images?.[0]) return `data:image/png;base64,${data.images[0]}`;
    throw new Error("No image in response");
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

function displayImage(url) {
    sessionGallery.unshift({ url, date: Date.now() });
    if (sessionGallery.length > 20) sessionGallery.pop();

    const popup = createPopup("qig-popup", "Generated Image", `
        <img id="qig-result-img" src="">
        <div class="qig-popup-actions">
            <button id="qig-regenerate-btn">🔄 Regenerate</button>
            <button id="qig-gallery-btn">🖼️ Gallery</button>
            <button id="qig-download-btn">💾 Download</button>
            <button id="qig-close-popup">Close</button>
        </div>`, (popup) => {
        const img = document.getElementById("qig-result-img");
        img.src = "";
        img.src = url;
        const downloadBtn = document.getElementById("qig-download-btn");
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            const a = document.createElement("a");
            a.href = url;
            a.download = `generated-${Date.now()}.png`;
            a.click();
        };
        document.getElementById("qig-regenerate-btn").onclick = (e) => {
            e.stopPropagation();
            popup.style.display = "none";
            regenerateImage();
        };
        document.getElementById("qig-gallery-btn").onclick = (e) => {
            e.stopPropagation();
            showGallery();
        };
        document.getElementById("qig-close-popup").onclick = () => popup.style.display = "none";
    });
}

function showGallery() {
    const gallery = createPopup("qig-gallery-popup", "Session Gallery", `
        <div style="background:#16213e;padding:20px;border-radius:12px;max-width:800px;width:90%;max-height:80vh;overflow:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;color:#e94560;">Session Gallery</h3>
                <button id="qig-gallery-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div id="qig-gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;"></div>
        </div>`, (gallery) => {
        document.getElementById("qig-gallery-close").onclick = () => gallery.style.display = "none";
        const grid = document.getElementById("qig-gallery-grid");
        grid.innerHTML = sessionGallery.length ? sessionGallery.map(item =>
            `<img src="${item.url}" style="width:100%;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation();document.getElementById('qig-result-img').src='${item.url}';document.getElementById('qig-gallery-popup').style.display='none';">`
        ).join('') : '<p style="color:#888;">No images yet this session</p>';
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
                <textarea id="qig-prompt-edit-text" style="width:100%;height:200px;resize:vertical;background:#0f1419;color:#fff;border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;" placeholder="Edit the generated prompt...">${prompt}</textarea>
                <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                    <button id="qig-prompt-edit-cancel" class="menu_button">Cancel</button>
                    <button id="qig-prompt-edit-use" class="menu_button">Use Prompt</button>
                </div>
            </div>`, (popup) => {
            const textarea = document.getElementById("qig-prompt-edit-text");
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
                num_outputs: 1,
                scheduler: "K_EULER" // Reasonable default
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
            image_size: { width: s.width, height: s.height },
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
    if (!lastPrompt) {
        showStatus("❌ No previous prompt to regenerate");
        return;
    }
    const s = getSettings();
    s.seed = -1;
    showStatus("🔄 Regenerating...");
    log(`Regenerating with prompt: ${lastPrompt.substring(0, 50)}...`);
    try {
        const result = await generateForProvider(lastPrompt, lastNegative, s);
        hideStatus();
        if (result) displayImage(result);
    } catch (e) {
        showStatus(`❌ ${e.message}`);
        log(`Regenerate error: ${e.message}`);
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
    container.innerHTML = promptTemplates.slice(0, 5).map((t, i) =>
        `<span style="display:inline-flex;align-items:center;margin:2px;"><button class="menu_button" style="padding:2px 6px;font-size:10px;" onclick="loadTemplate(${i})">${t.name}</button><button class="menu_button" style="padding:2px 4px;font-size:10px;margin-left:1px;" onclick="deleteTemplate(${i})">×</button></span>`
    ).join('') + (promptTemplates.length > 0 ? `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearTemplates()">Clear All</button>` : '');
}

window.loadTemplate = loadTemplate;
window.deleteTemplate = deleteTemplate;

function clearTemplates() {
    if (confirm("Clear all templates?")) {
        promptTemplates = [];
        localStorage.removeItem("qig_templates");
        renderTemplates();
    }
}

// Character-specific settings
function getCurrentCharId() {
    const ctx = getContext();
    return ctx?.characterId || ctx?.characters?.[ctx?.characterId]?.avatar || null;
}

function saveCharSettings() {
    const charId = getCurrentCharId();
    if (!charId) return;
    const s = getSettings();
    charSettings[charId] = {
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        style: s.style,
        width: s.width,
        height: s.height
    };
    localStorage.setItem("qig_char_settings", JSON.stringify(charSettings));
    showStatus("💾 Saved settings for this character");
    setTimeout(hideStatus, 2000);
}

function loadCharSettings() {
    const charId = getCurrentCharId();
    if (!charId || !charSettings[charId]) return false;
    const cs = charSettings[charId];
    const s = getSettings();
    if (cs.prompt) { s.prompt = cs.prompt; document.getElementById("qig-prompt").value = cs.prompt; }
    if (cs.negativePrompt) { s.negativePrompt = cs.negativePrompt; document.getElementById("qig-negative").value = cs.negativePrompt; }
    if (cs.style) { s.style = cs.style; document.getElementById("qig-style").value = cs.style; }
    if (cs.width) { s.width = cs.width; document.getElementById("qig-width").value = cs.width; }
    if (cs.height) { s.height = cs.height; document.getElementById("qig-height").value = cs.height; }
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
        local: [["qig-local-url", "localUrl"], ["qig-local-type", "localType"]],
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
        const value = isCheckbox ? e.target.checked : (isNum ? parseInt(e.target.value) : e.target.value);
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
                         <div class="qig-row" style="margin-top:8px;">
                            <div><label>CLIP Skip</label><input id="qig-a1111-clip" type="number" value="${s.a1111ClipSkip || 1}" min="1" max="12" step="1"></div>
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
                         </div>
                         <label class="checkbox_label" style="margin-top:8px;">
                             <input id="qig-a1111-ipadapter" type="checkbox" ${s.a1111IpAdapter ? "checked" : ""}>
                             <span>IP-Adapter Face (face-only reference)</span>
                         </label>
                         <div id="qig-a1111-ipadapter-opts" style="display:${s.a1111IpAdapter ? 'block' : 'none'}">
                             <label>IP-Adapter Model</label>
                             <select id="qig-a1111-ipadapter-mode">
                                 <option value="ip-adapter-faceid-portrait_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait_sd15" ? "selected" : ""}>FaceID Portrait (SD1.5)</option>
                                 <option value="ip-adapter-faceid_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid_sd15" ? "selected" : ""}>FaceID (SD1.5)</option>
                                 <option value="ip-adapter-faceid-plusv2_sd15" ${s.a1111IpAdapterMode === "ip-adapter-faceid-plusv2_sd15" ? "selected" : ""}>FaceID Plus v2 (SD1.5)</option>
                                 <option value="ip-adapter-faceid-portrait_sdxl" ${s.a1111IpAdapterMode === "ip-adapter-faceid-portrait_sdxl" ? "selected" : ""}>FaceID Portrait (SDXL)</option>
                                 <option value="ip-adapter-faceid_sdxl" ${s.a1111IpAdapterMode === "ip-adapter-faceid_sdxl" ? "selected" : ""}>FaceID (SDXL)</option>
                             </select>
                             <label>Weight: <span id="qig-a1111-ipadapter-weight-val">${s.a1111IpAdapterWeight || 0.7}</span></label>
                             <input id="qig-a1111-ipadapter-weight" type="range" min="0" max="1.5" step="0.05" value="${s.a1111IpAdapterWeight || 0.7}">
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
                    <label>Message index (-1 = last message)</label>
                    <input id="qig-msg-index" type="number" value="${s.messageIndex}" min="-1">
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
                
                <label class="checkbox_label">
                    <input id="qig-auto-generate" type="checkbox" ${s.autoGenerate ? "checked" : ""}>
                    <span>Auto-generate after AI response</span>
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
    document.getElementById("qig-save-template").onclick = saveTemplate;
    document.getElementById("qig-profile-save").onclick = saveConnectionProfile;
    renderTemplates();
    renderProfileSelect();

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
    bind("qig-local-type", "localType");
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
    bind("qig-a1111-adetailer", "a1111Adetailer");
    bind("qig-a1111-adetailer-model", "a1111AdetailerModel");
    document.getElementById("qig-a1111-adetailer").onchange = (e) => {
        document.getElementById("qig-a1111-adetailer-opts").style.display = e.target.checked ? "block" : "none";
    };

    // IP-Adapter bindings
    bind("qig-a1111-ipadapter", "a1111IpAdapter");
    bind("qig-a1111-ipadapter-mode", "a1111IpAdapterMode");
    bind("qig-a1111-ipadapter-weight", "a1111IpAdapterWeight", true);
    document.getElementById("qig-a1111-ipadapter").onchange = (e) => {
        document.getElementById("qig-a1111-ipadapter-opts").style.display = e.target.checked ? "block" : "none";
    };
    document.getElementById("qig-a1111-ipadapter-weight").oninput = (e) => {
        document.getElementById("qig-a1111-ipadapter-weight-val").textContent = e.target.value;
    };

    // A1111 Model dropdown
    const a1111ModelSelect = document.getElementById("qig-a1111-model");
    const a1111ModelRefresh = document.getElementById("qig-a1111-model-refresh");

    async function populateA1111Models() {
        const s = getSettings();
        a1111ModelSelect.innerHTML = '<option value="">Loading...</option>';
        const models = await fetchA1111Models(s.localUrl);
        const currentModel = s.a1111Model || await getCurrentA1111Model(s.localUrl);

        if (models.length === 0) {
            a1111ModelSelect.innerHTML = '<option value="">-- Failed to load (check if A1111 running) --</option>';
            return;
        }

        a1111ModelSelect.innerHTML = models.map(m =>
            `<option value="${m.title}" ${m.title === currentModel ? 'selected' : ''}>${m.name}</option>`
        ).join('');

        if (currentModel && !s.a1111Model) {
            s.a1111Model = currentModel;
            saveSettingsDebounced();
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
    bind("qig-msg-index", "messageIndex", true);
    document.getElementById("qig-use-llm").onchange = (e) => {
        getSettings().useLLMPrompt = e.target.checked;
        document.getElementById("qig-llm-options").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced();
    };
    bind("qig-llm-style", "llmPromptStyle");
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

    const btn = document.createElement("div");
    btn.id = "qig-input-btn";
    btn.className = "fa-solid fa-palette interactable";
    btn.title = "Generate Image";
    btn.style.cssText = "cursor:pointer;padding:5px;font-size:1.2em;opacity:0.7;";
    btn.onclick = generateImage;

    // Add to right side area
    const rightArea = document.getElementById("rightSendForm") || document.querySelector("#send_form .right_menu_buttons");
    if (rightArea) {
        rightArea.insertBefore(btn, rightArea.firstChild);
    }
}

async function generateImage() {
    const s = getSettings();
    let basePrompt = resolvePrompt(s.prompt);
    let scenePrompt = "";

    if (s.useLastMessage) {
        const lastMsg = getLastMessage();
        if (lastMsg) {
            scenePrompt = lastMsg;
            basePrompt = lastMsg;
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

    // Show prompt editing dialog if enabled
    if (s.useLLMPrompt && s.llmEditPrompt && prompt !== basePrompt) {
        const editedPrompt = await showPromptEditDialog(prompt);
        if (editedPrompt !== null) {
            prompt = editedPrompt;
        } else {
            // User cancelled
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
    const negative = resolvePrompt(s.negativePrompt);

    lastPrompt = prompt;
    lastNegative = negative;

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
        for (let i = 0; i < batchCount; i++) {
            showStatus(`🖼️ Generating image ${i + 1}/${batchCount}...`);
            const result = await generateForProvider(prompt, negative, s);
            results.push(result);
        }
        log(`Generated ${results.length} image(s) successfully`);
        results.forEach(r => displayImage(r));
    } catch (e) {
        log(`Error: ${e.message}`);
        toastr.error("Generation failed: " + e.message);
    } finally {
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

            const { eventSource, event_types } = scriptModule;
            if (eventSource) {
                eventSource.on(event_types.MESSAGE_RECEIVED, () => {
                    if (getSettings().autoGenerate) {
                        setTimeout(() => generateImage(), 500);
                    }
                });
                eventSource.on(event_types.CHAT_CHANGED, () => {
                    loadCharSettings();
                });
            }
        } catch (err) {
            console.error("[Quick Image Gen] Initialization failed:", err);
        }
    })();
});


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
