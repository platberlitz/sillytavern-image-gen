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
    anime: { name: "Anime", prefix: "anime, cel shading, ", suffix: ", vibrant colors" },
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
    manga: { name: "Manga", prefix: "manga style, japanese comic, ", suffix: ", screentone" },
    chibi: { name: "Chibi", prefix: "chibi, cute, kawaii, ", suffix: ", super deformed" },
    ghibli: { name: "Ghibli", prefix: "studio ghibli style, miyazaki, ", suffix: ", whimsical" },
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
    moeanime: { name: "Moe Anime", prefix: "cute anime, moe, ", suffix: ", adorable" },
    retroanime: { name: "90s Anime", prefix: "90s anime, retro anime, ", suffix: ", vintage anime style" }
};

const PROVIDER_MODELS = {
    pollinations: [
        { id: "", name: "Default" },
        { id: "flux", name: "Flux" },
        { id: "turbo", name: "Turbo" }
    ]
};

const SAMPLERS = ["euler_a", "euler", "dpm++_2m", "dpm++_sde", "ddim", "lms", "heun"];

let logs = [];
function log(msg) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.push(entry);
    if (logs.length > 100) logs.shift();
    console.log("[QIG]", msg);
}

function showStatus(msg) {
    let status = document.getElementById("qig-status");
    if (!status) {
        status = document.createElement("div");
        status.id = "qig-status";
        document.body.appendChild(status);
    }
    if (msg) {
        status.textContent = msg;
        status.style.display = "block";
    } else {
        status.style.display = "none";
    }
}

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

function applyStyle(prompt, s) {
    const style = STYLES[s.style] || STYLES.none;
    return style.prefix + prompt + style.suffix;
}

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
        
        let appearanceContext = "";
        if (charDesc) appearanceContext += `${charName}'s appearance: ${charDesc.substring(0, 500)}\\n`;
        if (userPersona) appearanceContext += `${userName}'s appearance: ${userPersona.substring(0, 500)}\\n`;
        
        let instruction;
        if (s.llmPromptStyle === "natural") {
            instruction = `[Task: Convert to image generation prompt. Output ONLY a short descriptive paragraph, no commentary.]

${appearanceContext}
Scene: ${basePrompt}

Image prompt:`;
        } else {
            instruction = `[Task: Convert to image tags. Output ONLY comma-separated tags, nothing else. Include character appearance details from the descriptions provided.]

${appearanceContext}
Scene: ${basePrompt}

Danbooru tags:`;
        }
        const llmPrompt = await generateQuietPrompt(instruction, false, true, false, "");
        log(`LLM prompt: ${llmPrompt}`);
        const cleaned = (llmPrompt || "").split('\n')[0].trim();
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
    const res = await fetch("https://api.novelai.net/ai/generate-image", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.naiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            input: prompt,
            model: s.naiModel,
            parameters: {
                width: s.width,
                height: s.height,
                steps: s.steps,
                scale: s.cfgScale,
                sampler: s.sampler,
                seed: s.seed === -1 ? Math.floor(Math.random() * 2147483647) : s.seed,
                negative_prompt: negative,
                n_samples: 1
            }
        })
    });
    if (!res.ok) throw new Error(`NovelAI error: ${res.status}`);
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
    const res = await fetch("https://api.arliai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.arliKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: s.arliModel,
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
            steps: s.steps,
            cfg_scale: s.cfgScale,
            sampler: s.sampler,
            seed: s.seed === -1 ? -1 : s.seed,
            n: 1
        })
    });
    if (!res.ok) throw new Error(`ArliAI error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

async function genNanoGPT(prompt, negative, s) {
    const res = await fetch("https://nano-gpt.com/api/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.nanogptKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: s.nanogptModel,
            prompt: prompt,
            negative_prompt: negative,
            width: s.width,
            height: s.height,
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
        const res = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: s.proxyModel,
                messages: [{ role: "user", content: `Generate an image: ${prompt}${negPrompt}` }],
                max_tokens: 4096
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
        
        const content = data.choices?.[0]?.message?.content || "";
        const b64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
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
            facefix: s.proxyFacefix || undefined
        })
    });
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    const data = await res.json();
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    throw new Error("No image in response");
}

function showLogs() {
    let popup = document.getElementById("qig-logs-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "qig-logs-popup";
        popup.className = "qig-popup";
        popup.style.cssText = "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;justify-content:center;align-items:center;";
        popup.innerHTML = `
            <div class="qig-popup-content" onclick="event.stopPropagation()">
                <div class="qig-popup-header">
                    <span>Generation Logs</span>
                    <button class="qig-close-btn">✕</button>
                </div>
                <pre id="qig-logs-content"></pre>
            </div>`;
        document.body.appendChild(popup);
        popup.querySelector(".qig-close-btn").onclick = () => popup.style.display = "none";
        popup.onclick = () => popup.style.display = "none";
    }
    document.getElementById("qig-logs-content").textContent = logs.join("\n") || "No logs yet";
    popup.style.display = "flex";
}

function displayImage(url) {
    // Add to session gallery
    sessionGallery.unshift({ url, date: Date.now() });
    if (sessionGallery.length > 20) sessionGallery.pop();
    
    let popup = document.getElementById("qig-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "qig-popup";
        popup.className = "qig-popup";
        popup.style.cssText = "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;justify-content:center;align-items:center;";
        popup.innerHTML = `
            <div class="qig-popup-content" onclick="event.stopPropagation()">
                <div class="qig-popup-header">
                    <span>Generated Image</span>
                    <button class="qig-close-btn">✕</button>
                </div>
                <img id="qig-result-img" src="">
                <div class="qig-popup-actions">
                    <button id="qig-regenerate-btn">🔄 Regenerate</button>
                    <button id="qig-gallery-btn">🖼️ Gallery</button>
                    <button id="qig-download-btn">💾 Download</button>
                    <button id="qig-close-popup">Close</button>
                </div>
            </div>`;
        document.body.appendChild(popup);
        popup.querySelector(".qig-close-btn").onclick = () => popup.style.display = "none";
        document.getElementById("qig-close-popup").onclick = () => popup.style.display = "none";
        popup.onclick = () => popup.style.display = "none";
        document.getElementById("qig-download-btn").onclick = (e) => {
            e.stopPropagation();
            const a = document.createElement("a");
            a.href = document.getElementById("qig-result-img").src;
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
    }
    document.getElementById("qig-result-img").src = url;
    popup.style.display = "flex";
}

function showGallery() {
    let gallery = document.getElementById("qig-gallery-popup");
    if (!gallery) {
        gallery = document.createElement("div");
        gallery.id = "qig-gallery-popup";
        gallery.style.cssText = "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;justify-content:center;align-items:center;";
        gallery.innerHTML = `
            <div style="background:#16213e;padding:20px;border-radius:12px;max-width:800px;width:90%;max-height:80vh;overflow:auto;" onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;color:#e94560;">Session Gallery</h3>
                    <button id="qig-gallery-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
                </div>
                <div id="qig-gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;"></div>
            </div>`;
        document.body.appendChild(gallery);
        document.getElementById("qig-gallery-close").onclick = () => gallery.style.display = "none";
        gallery.onclick = () => gallery.style.display = "none";
    }
    
    const grid = document.getElementById("qig-gallery-grid");
    grid.innerHTML = sessionGallery.length ? sessionGallery.map(item => 
        `<img src="${item.url}" style="width:100%;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation();document.getElementById('qig-result-img').src='${item.url}';document.getElementById('qig-gallery-popup').style.display='none';">`
    ).join('') : '<p style="color:#888;">No images yet this session</p>';
    gallery.style.display = "flex";
}

async function regenerateImage() {
    if (!lastPrompt) return;
    const s = getSettings();
    s.seed = -1; // New random seed
    showStatus("🔄 Regenerating...");
    try {
        let result;
        switch (s.provider) {
            case "pollinations": result = await genPollinations(lastPrompt, lastNegative, s); break;
            case "novelai": result = await genNovelAI(lastPrompt, lastNegative, s); break;
            case "arliai": result = await genArliAI(lastPrompt, lastNegative, s); break;
            case "nanogpt": result = await genNanoGPT(lastPrompt, lastNegative, s); break;
            case "local": result = await genLocal(lastPrompt, lastNegative, s); break;
            case "proxy": result = await genProxy(lastPrompt, lastNegative, s); break;
        }
        hideStatus();
        if (result) displayImage(result);
    } catch (e) {
        showStatus(`❌ ${e.message}`);
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
    const container = document.getElementById("qig-templates");
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

function updateProviderUI() {
    const s = getSettings();
    document.querySelectorAll(".qig-provider-section").forEach(el => el.style.display = "none");
    const section = document.getElementById(`qig-${s.provider}-settings`);
    if (section) section.style.display = "block";
    
    const showAdvanced = ["novelai", "arliai", "nanogpt", "local"].includes(s.provider);
    document.getElementById("qig-advanced-settings").style.display = showAdvanced ? "block" : "none";
}

function bind(id, key, isNum = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = (e) => {
        getSettings()[key] = isNum ? parseInt(e.target.value) : e.target.value;
        saveSettingsDebounced();
    };
}

function modelSelect(provider, settingKey, currentVal) {
    const models = PROVIDER_MODELS[provider];
    if (!models) return `<input id="qig-${settingKey}" type="text" value="${currentVal}" placeholder="Model ID">`;
    const opts = models.map(m => `<option value="${m.id}" ${currentVal === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    return `<select id="qig-${settingKey}">${opts}</select>`;
}

function createUI() {
    const s = getSettings();
    const samplerOpts = SAMPLERS.map(x => `<option value="${x}" ${s.sampler === x ? "selected" : ""}>${x}</option>`).join("");
    const providerOpts = Object.entries(PROVIDERS).map(([k, v]) => 
        `<option value="${k}" ${s.provider === k ? "selected" : ""}>${v.name}</option>`
    ).join("");
    const styleOpts = Object.entries(STYLES).map(([k, v]) =>
        `<option value="${k}" ${s.style === k ? "selected" : ""}>${v.name}</option>`
    ).join("");
    
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
                </div>
                
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
    renderTemplates();
    
    document.getElementById("qig-provider").onchange = (e) => {
        getSettings().provider = e.target.value;
        saveSettingsDebounced();
        updateProviderUI();
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
    document.getElementById("qig-proxy-facefix").onchange = (e) => { getSettings().proxyFacefix = e.target.checked; saveSettingsDebounced(); };
    bind("qig-prompt", "prompt");
    bind("qig-negative", "negativePrompt");
    bind("qig-quality", "qualityTags");
    document.getElementById("qig-append-quality").onchange = (e) => { getSettings().appendQuality = e.target.checked; saveSettingsDebounced(); };
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
    document.getElementById("qig-auto-generate").onchange = (e) => {
        getSettings().autoGenerate = e.target.checked;
        saveSettingsDebounced();
    };
    bind("qig-width", "width", true);
    bind("qig-height", "height", true);
    bind("qig-steps", "steps", true);
    bind("qig-cfg", "cfgScale", true);
    bind("qig-sampler", "sampler");
    bind("qig-seed", "seed", true);
    
    updateProviderUI();
}

function addInputButton() {
    const btn = document.createElement("div");
    btn.id = "qig-input-btn";
    btn.className = "fa-solid fa-palette interactable";
    btn.title = "Generate Image";
    btn.onclick = generateImage;
    document.getElementById("options_button")?.parentElement?.insertBefore(btn, document.getElementById("options_button"));
}

async function generateImage() {
    const s = getSettings();
    let basePrompt = resolvePrompt(s.prompt);
    
    if (s.useLastMessage) {
        const lastMsg = getLastMessage();
        if (lastMsg) basePrompt = lastMsg;
    }
    
    log(`Base prompt: ${basePrompt.substring(0, 100)}...`);
    showStatus("🎨 Generating image...");
    
    // Update palette button
    const paletteBtn = document.getElementById("qig-input-btn");
    if (paletteBtn) {
        paletteBtn.classList.remove("fa-palette");
        paletteBtn.classList.add("fa-spinner", "fa-spin");
    }
    
    let prompt = await generateLLMPrompt(s, basePrompt);
    
    prompt = applyStyle(prompt, s);
    
    if (s.appendQuality && s.qualityTags) {
        prompt = `${s.qualityTags}, ${prompt}`;
    }
    const negative = resolvePrompt(s.negativePrompt);
    
    // Save for regenerate
    lastPrompt = prompt;
    lastNegative = negative;
    
    log(`Final prompt: ${prompt.substring(0, 100)}...`);
    log(`Negative: ${negative.substring(0, 50)}...`);
    showStatus("🖼️ Generating image...");
    
    const btn = document.getElementById("qig-generate-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Generating...";
    }
    
    try {
        let result;
        log(`Using provider: ${s.provider}`);
        switch (s.provider) {
            case "pollinations": result = await genPollinations(prompt, negative, s); break;
            case "novelai": result = await genNovelAI(prompt, negative, s); break;
            case "arliai": result = await genArliAI(prompt, negative, s); break;
            case "nanogpt": result = await genNanoGPT(prompt, negative, s); break;
            case "local": result = await genLocal(prompt, negative, s); break;
            case "proxy": result = await genProxy(prompt, negative, s); break;
        }
        log("Image generated successfully");
        displayImage(result);
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
