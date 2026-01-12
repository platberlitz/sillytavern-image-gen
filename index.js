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
    reviewLLMPrompt: false,
    messageIndex: -1,
    width: 512,
    height: 512,
    steps: 25,
    cfgScale: 7,
    sampler: "euler_a",
    seed: -1,
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
    naiModel: "nai-diffusion-3",
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
    anime: { name: "Anime", prefix: "anime style, ", suffix: ", anime art, cel shading" },
    cartoon: { name: "Cartoon", prefix: "cartoon style, ", suffix: ", cartoon art, vibrant colors" },
    realistic: { name: "Realistic", prefix: "photorealistic, ", suffix: ", photograph, realistic lighting, 8k uhd" },
    semirealistic: { name: "Semi-Realistic", prefix: "semi-realistic, ", suffix: ", digital painting, detailed" },
    oil: { name: "Oil Painting", prefix: "oil painting style, ", suffix: ", classical art, brush strokes" },
    watercolor: { name: "Watercolor", prefix: "watercolor painting, ", suffix: ", soft colors, artistic" },
    pixel: { name: "Pixel Art", prefix: "pixel art, ", suffix: ", 16-bit, retro game style" },
    sketch: { name: "Sketch", prefix: "pencil sketch, ", suffix: ", line art, hand drawn" }
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
        const instruction = `Convert this scene into danbooru/booru-style tags for anime image generation (like NovelAI/PixAI).

Rules:
- Output ONLY comma-separated tags, no sentences or explanations
- Use underscores for multi-word tags (e.g. long_hair, red_eyes)
- Include: character features (hair color/style, eye color, body type), clothing, pose, expression, setting/background, lighting/atmosphere
- Order: subject tags first, then scene/setting, then style/quality tags
- Be specific (e.g. "pleated_skirt" not just "skirt")

Scene:
${basePrompt}

Tags:`;
        const llmPrompt = await generateQuietPrompt(instruction, false, false);
        log(`LLM prompt: ${llmPrompt}`);
        return llmPrompt?.trim() || basePrompt;
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

function showPromptReview(prompt) {
    return new Promise((resolve) => {
        // Remove existing popup to avoid stale event handlers
        const existing = document.getElementById("qig-review-popup");
        if (existing) existing.remove();
        
        const popup = document.createElement("div");
        popup.id = "qig-review-popup";
        popup.setAttribute("style", "position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,0.95)!important;z-index:2147483647!important;display:flex!important;justify-content:center!important;align-items:center!important;opacity:1!important;visibility:visible!important;");
        popup.innerHTML = `
            <div style="background:#1a1a2e!important;padding:20px!important;border-radius:12px!important;max-width:600px!important;width:90%!important;max-height:80vh!important;overflow:auto!important;opacity:1!important;visibility:visible!important;">
                <h3 style="margin:0 0 12px!important;color:#e94560!important;font-size:18px!important;">Review LLM Prompt</h3>
                <textarea id="qig-review-textarea" style="width:100%!important;height:150px!important;background:#0f0f23!important;color:#fff!important;border:1px solid #333!important;border-radius:6px!important;padding:10px!important;font-size:14px!important;resize:vertical!important;box-sizing:border-box!important;opacity:1!important;visibility:visible!important;"></textarea>
                <div style="display:flex!important;gap:10px!important;margin-top:12px!important;">
                    <button id="qig-review-ok" style="flex:1!important;padding:10px!important;background:#e94560!important;border:none!important;border-radius:6px!important;color:#fff!important;cursor:pointer!important;font-size:14px!important;">Generate</button>
                    <button id="qig-review-cancel" style="flex:1!important;padding:10px!important;background:#333!important;border:none!important;border-radius:6px!important;color:#fff!important;cursor:pointer!important;font-size:14px!important;">Cancel</button>
                </div>
            </div>`;
        
        document.body.appendChild(popup);
        document.getElementById("qig-review-textarea").value = prompt;
        
        const cleanup = () => popup.remove();
        document.getElementById("qig-review-ok").onclick = () => { const val = document.getElementById("qig-review-textarea").value; cleanup(); resolve(val); };
        document.getElementById("qig-review-cancel").onclick = () => { cleanup(); resolve(null); };
        popup.onclick = (e) => { if (e.target === popup) { cleanup(); resolve(null); } };
    });
}

function resetButton() {
    const btn = document.getElementById("qig-generate-btn");
    if (btn) { btn.disabled = false; btn.textContent = "Generate"; }
    const paletteBtn = document.getElementById("qig-palette-btn");
    if (paletteBtn) { paletteBtn.classList.remove("fa-spinner", "fa-spin"); paletteBtn.classList.add("fa-palette"); }
}

function displayImage(url) {
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
    }
    document.getElementById("qig-result-img").src = url;
    popup.style.display = "flex";
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
                    <input id="qig-nai-model" type="text" value="${s.naiModel}" placeholder="nai-diffusion-3">
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
                <label>Prompt</label>
                <textarea id="qig-prompt" rows="2">${s.prompt}</textarea>
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
                <label class="checkbox_label" id="qig-review-container" style="display:${s.useLLMPrompt ? "block" : "none"}">
                    <input id="qig-review-prompt" type="checkbox" ${s.reviewLLMPrompt ? "checked" : ""}>
                    <span>Review prompt before generating</span>
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
        document.getElementById("qig-review-container").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced(); 
    };
    document.getElementById("qig-review-prompt").onchange = (e) => { 
        getSettings().reviewLLMPrompt = e.target.checked; 
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
    
    // Review prompt before continuing
    if (s.useLLMPrompt && s.reviewLLMPrompt && prompt !== basePrompt) {
        log("Showing prompt review popup...");
        hideStatus();
        try {
            prompt = await showPromptReview(prompt);
            log(`Review result: ${prompt === null ? "cancelled" : "confirmed"}`);
        } catch (e) {
            log(`Review error: ${e.message}`);
        }
        if (prompt === null) {
            resetButton();
            return;
        }
        showStatus("🖼️ Generating image...");
    }
    
    prompt = applyStyle(prompt, s);
    
    if (s.appendQuality && s.qualityTags) {
        prompt = `${s.qualityTags}, ${prompt}`;
    }
    const negative = resolvePrompt(s.negativePrompt);
    
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
});
