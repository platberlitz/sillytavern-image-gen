import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateQuietPrompt } from "../../../../script.js";

const extensionName = "quick-image-gen";
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
    // Pollinations
    pollinationsModel: "",
    // Local (A1111/ComfyUI)
    localUrl: "http://127.0.0.1:7860",
    localType: "a1111"
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
    local: ["localUrl", "localType"],
    proxy: ["proxyUrl", "proxyKey", "proxyModel", "proxyLoras", "proxyFacefix", "proxySteps", "proxyCfg", "proxySampler", "proxySeed", "proxyExtraInstructions"]
};

const PROVIDERS = {
    pollinations: { name: "Pollinations (Free)", needsKey: false },
    novelai: { name: "NovelAI", needsKey: true },
    arliai: { name: "ArliAI", needsKey: true },
    nanogpt: { name: "NanoGPT", needsKey: true },
    local: { name: "Local (A1111/ComfyUI)", needsKey: false },
    proxy: { name: "Reverse Proxy (OpenAI-compatible)", needsKey: false }
};

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
    const cacheKey = `${s.style}|${prompt}`;
    if (styleCache.has(cacheKey)) return styleCache.get(cacheKey);
    const style = STYLES[s.style] || STYLES.none;
    const result = style.prefix + prompt + style.suffix;
    styleCache.set(cacheKey, result);
    if (styleCache.size > 100) styleCache.delete(styleCache.keys().next().value);
    return result;
}

const skinPattern = /\b(dark[- ]?skin(?:ned)?|brown[- ]?skin(?:ned)?|black[- ]?skin(?:ned)?|tan(?:ned)?[- ]?skin|ebony|melanin|mocha|chocolate[- ]?skin|caramel[- ]?skin)\b/gi;

async function generateLLMPrompt(s, basePrompt) {
    if (!s.useLLMPrompt) return basePrompt;
    
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
        const instruction = isNatural
            ? `[Output ONLY an image generation prompt. No commentary or explanation.]${skinEnforce}

CHARACTER REFERENCE:
${appearanceContext}
CURRENT SCENE: ${basePrompt}

Write a detailed image prompt (up to 500 characters) describing:
- The characters involved with their defining visual traits (hair color, eye color, outfit, distinguishing features)
- If from known media/franchise, include the series name and character's canonical appearance
- Their poses, expressions, and body language
- The setting/background
- Lighting and atmosphere

Prompt:`
            : `[Output ONLY comma-separated tags for image generation. No commentary.]${skinEnforce}

CHARACTER REFERENCE:
${appearanceContext}
CURRENT SCENE: ${basePrompt}

Generate detailed Danbooru/Booru-style tags (up to 500 characters) including:
- Character name + series name if from known media (e.g., "hatsune_miku, vocaloid")
- Physical traits: hair color/style, eye color, body type, skin tone
- Clothing and accessories in detail
- Pose, expression, action
- Setting/background tags
- Quality tags

Tags:`;
        
        let llmPrompt = await generateQuietPrompt(instruction, false, true, false, "");
        log(`LLM prompt: ${llmPrompt}`);
        let cleaned = (llmPrompt || "").split('\n')[0].trim();
        
        if (cleaned.length > 500) {
            cleaned = cleaned.substring(0, 500).trim();
            const lastComma = cleaned.lastIndexOf(',');
            const lastSpace = cleaned.lastIndexOf(' ');
            const cutPoint = Math.max(lastComma, lastSpace);
            if (cutPoint > 400) cleaned = cleaned.substring(0, cutPoint);
            log(`LLM prompt truncated to ${cleaned.length} chars`);
        }
        
        if (skinTones.length && cleaned) {
            const outputLower = cleaned.toLowerCase();
            const skinTags = [];
            if (charSkin && !outputLower.includes("dark skin") && !outputLower.includes("dark-skin") && !outputLower.includes("brown skin")) {
                skinTags.push("dark skin");
            }
            if (skinTags.length) cleaned = skinTags.join(", ") + ", " + cleaned;
        }
        
        return cleaned || basePrompt;
    } catch (e) {
        log(`LLM prompt failed: ${e.message}`);
        return basePrompt;
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
    const payload = {
        input: prompt,
        model: s.naiModel,
        action: "generate",
        parameters: {
            width: s.width,
            height: s.height,
            steps: s.steps,
            scale: s.cfgScale,
            sampler: s.sampler === "euler_a" ? "k_euler_ancestral" : s.sampler === "euler" ? "k_euler" : s.sampler === "dpm++_2m" ? "k_dpmpp_2m" : s.sampler === "dpm++_sde" ? "k_dpmpp_sde" : s.sampler === "ddim" ? "ddim" : "k_euler_ancestral",
            seed: s.seed === -1 ? Math.floor(Math.random() * 2147483647) : s.seed,
            negative_prompt: negative,
            n_samples: 1,
            ucPreset: 0,
            qualityToggle: true,
            params_version: 3,
            noise_schedule: "native",
            legacy: false
        }
    };
    if (isV4) {
        payload.parameters.v4_prompt = { caption: { base_caption: prompt, char_captions: [] }, use_coords: false, use_order: true };
        payload.parameters.v4_negative_prompt = { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false };
    }
    const res = await fetch("https://image.novelai.net/ai/generate-image", {
        method: "POST",
        headers: { "Authorization": `Bearer ${s.naiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`NovelAI error: ${res.status} ${errText}`);
    }
    const zip = await res.blob();
    const arrayBuffer = await zip.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const dataStart = findPngStart(bytes);
    const pngData = bytes.slice(dataStart);
    return URL.createObjectURL(new Blob([pngData], { type: "image/png" }));
}

function findPngStart(bytes) {
    for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i] === 0x89 && bytes[i+1] === 0x50 && bytes[i+2] === 0x4E && bytes[i+3] === 0x47) return i;
    }
    return 0;
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

async function genLocal(prompt, negative, s) {
    const baseUrl = s.localUrl.replace(/\/$/, "");
    
    if (s.localType === "comfyui") {
        // ComfyUI API
        const workflow = {
            prompt: {
                "3": { class_type: "KSampler", inputs: { seed: s.seed === -1 ? Math.floor(Math.random() * 2147483647) : s.seed, steps: s.steps, cfg: s.cfgScale, sampler_name: s.sampler.replace("_", ""), scheduler: "normal", denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] }},
                "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" }},
                "5": { class_type: "EmptyLatentImage", inputs: { width: s.width, height: s.height, batch_size: 1 }},
                "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] }},
                "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["4", 1] }},
                "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] }},
                "9": { class_type: "SaveImage", inputs: { filename_prefix: "qig", images: ["8", 0] }}
            }
        };
        const res = await fetch(`${baseUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(workflow)
        });
        if (!res.ok) throw new Error(`ComfyUI error: ${res.status}`);
        const data = await res.json();
        // Poll for result
        const promptId = data.prompt_id;
        for (let i = 0; i < 120; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const hist = await fetch(`${baseUrl}/history/${promptId}`).then(r => r.json());
            if (hist[promptId]?.outputs?.["9"]?.images?.[0]) {
                const img = hist[promptId].outputs["9"].images[0];
                return `${baseUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ""}&type=${img.type}`;
            }
        }
        throw new Error("ComfyUI timeout");
    }
    
    // A1111 API
    const res = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
            steps: s.steps,
            cfg_scale: s.cfgScale,
            sampler_name: s.sampler,
            seed: s.seed
        })
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
        }
        
        const msgContent = data.choices?.[0]?.message?.content || "";
        const b64Match = msgContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
        if (b64Match) return b64Match[0];
        
        const parts = data.choices?.[0]?.message?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inline_data?.data) {
                    return `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
                }
            }
        }
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
        popup.innerHTML = `
            <div class="qig-popup-content" onclick="event.stopPropagation()">
                <div class="qig-popup-header">
                    <span>${title}</span>
                    <button class="qig-close-btn">✕</button>
                </div>
                ${content}
            </div>`;
        document.body.appendChild(popup);
        popup.querySelector(".qig-close-btn").onclick = () => popup.style.display = "none";
        popup.onclick = () => popup.style.display = "none";
    }
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
        document.getElementById("qig-result-img").src = url;
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

const providerGenerators = {
    pollinations: genPollinations,
    novelai: genNovelAI,
    arliai: genArliAI,
    nanogpt: genNanoGPT,
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
    if (!prompt.trim()) return;
    const name = window.prompt("Template name:");
    if (!name) return;
    promptTemplates.unshift({ name, prompt });
    localStorage.setItem("qig_templates", JSON.stringify(promptTemplates.slice(0, 20)));
    renderTemplates();
}

function renderTemplates() {
    const container = getOrCacheElement("qig-templates");
    if (!container) return;
    container.innerHTML = promptTemplates.slice(0, 5).map((t, i) => 
        `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="document.getElementById('qig-prompt').value='${t.prompt.replace(/'/g, "\\'")}'">${t.name}</button>`
    ).join('') + (promptTemplates.length > 0 ? `<button class="menu_button" style="padding:2px 6px;font-size:10px;margin:2px;" onclick="clearTemplates()">✕</button>` : '');
}

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
        local: [["qig-local-url", "localUrl"], ["qig-local-type", "localType"]],
        proxy: [["qig-proxy-url", "proxyUrl"], ["qig-proxy-key", "proxyKey"], ["qig-proxy-model", "proxyModel"], ["qig-proxy-loras", "proxyLoras"], ["qig-proxy-steps", "proxySteps"], ["qig-proxy-cfg", "proxyCfg"], ["qig-proxy-sampler", "proxySampler"], ["qig-proxy-seed", "proxySeed"], ["qig-proxy-extra", "proxyExtraInstructions"], ["qig-proxy-facefix", "proxyFacefix"]]
    };
    (map[provider] || []).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.type === "checkbox" ? el.checked = s[key] : el.value = s[key] ?? "";
    });
}

function updateProviderUI() {
    const s = getSettings();
    document.querySelectorAll(".qig-provider-section").forEach(el => el.style.display = "none");
    const section = document.getElementById(`qig-${s.provider}-settings`);
    if (section) section.style.display = "block";
    
    const showAdvanced = ["novelai", "arliai", "nanogpt", "local"].includes(s.provider);
    document.getElementById("qig-advanced-settings").style.display = showAdvanced ? "block" : "none";
}

function renderRefImages() {
    const container = getOrCacheElement("qig-proxy-refs");
    if (!container) return;
    const imgs = getSettings().proxyRefImages || [];
    container.innerHTML = imgs.map((src, i) => 
        `<div style="position:relative;"><img src="${src}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"><button onclick="removeRefImage(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:none;background:#e94560;color:#fff;font-size:10px;cursor:pointer;line-height:1;">×</button></div>`
    ).join('');
}

window.removeRefImage = function(idx) {
    const s = getSettings();
    s.proxyRefImages.splice(idx, 1);
    saveSettingsDebounced();
    renderRefImages();
};

function bind(id, key, isNum = false, isCheckbox = false) {
    const el = document.getElementById(id);
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
                
                <div id="qig-local-settings" class="qig-provider-section">
                    <label>Local URL</label>
                    <input id="qig-local-url" type="text" value="${s.localUrl}" placeholder="http://127.0.0.1:7860">
                    <label>Type</label>
                    <select id="qig-local-type">
                        <option value="a1111" ${s.localType === "a1111" ? "selected" : ""}>Automatic1111</option>
                        <option value="comfyui" ${s.localType === "comfyui" ? "selected" : ""}>ComfyUI</option>
                    </select>
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
                    </select>
                </div>
                
                <label class="checkbox_label">
                    <input id="qig-auto-generate" type="checkbox" ${s.autoGenerate ? "checked" : ""}>
                    <span>Auto-generate after AI response</span>
                </label>
                
                <label>Size</label>
                <div class="qig-row">
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
    bind("qig-local-url", "localUrl");
    bind("qig-local-type", "localType");
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
    bind("qig-batch", "batchCount", true);
    bind("qig-steps", "steps", true);
    bind("qig-cfg", "cfgScale", true);
    bind("qig-sampler", "sampler");
    bind("qig-seed", "seed", true);
    
    updateProviderUI();
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
    }
}

jQuery(async () => {
    await loadSettings();
    createUI();
    addInputButton();
    
    // Auto-generate on AI message and load char settings on character change
    const { eventSource, event_types } = await import("../../../../script.js");
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
});
