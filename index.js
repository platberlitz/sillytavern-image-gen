import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

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
    llmModel: "",
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
    // NovelAI
    naiKey: "",
    naiModel: "nai-diffusion-3",
    // ArliAI
    arliKey: "",
    arliModel: "arliai-realistic-v1",
    // Local (A1111/ComfyUI)
    localUrl: "http://127.0.0.1:7860",
    localType: "a1111"
};

const PROVIDERS = {
    pollinations: { name: "Pollinations (Free)", needsKey: false },
    novelai: { name: "NovelAI", needsKey: true },
    arliai: { name: "ArliAI", needsKey: true },
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
    if (!s.useLLMPrompt || !s.proxyUrl || !s.llmModel) return basePrompt;
    
    log("Generating prompt via LLM...");
    showStatus("🤖 Creating image prompt...");
    
    const headers = { "Content-Type": "application/json" };
    if (s.proxyKey) headers["Authorization"] = `Bearer ${s.proxyKey}`;
    
    const chatUrl = s.proxyUrl.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: s.llmModel,
            messages: [{
                role: "user",
                content: `Convert this scene description into a concise image generation prompt (tags/keywords style, no sentences). Focus on visual elements, character appearance, pose, setting, lighting. Output ONLY the prompt, nothing else.\n\nScene:\n${basePrompt}`
            }],
            max_tokens: 200
        })
    });
    
    if (!res.ok) {
        log(`LLM prompt failed: ${res.status}`);
        return basePrompt;
    }
    
    const data = await res.json();
    const llmPrompt = data.choices?.[0]?.message?.content?.trim() || basePrompt;
    log(`LLM prompt: ${llmPrompt}`);
    return llmPrompt;
}

async function genPollinations(prompt, negative, s) {
    const seed = s.seed === -1 ? Date.now() : s.seed;
    const neg = negative ? `&negative=${encodeURIComponent(negative)}` : "";
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${s.width}&height=${s.height}&seed=${seed}&nologo=true${neg}`;
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
            size: `${s.width}x${s.height}`
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
    let popup = document.getElementById("qig-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "qig-popup";
        popup.className = "qig-popup";
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
    
    const showAdvanced = ["novelai", "arliai", "local"].includes(s.provider);
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
                
                <div id="qig-novelai-settings" class="qig-provider-section">
                    <label>NovelAI API Key</label>
                    <input id="qig-nai-key" type="password" value="${s.naiKey}">
                    <label>Model</label>
                    <input id="qig-nai-model" type="text" value="${s.naiModel}">
                </div>
                
                <div id="qig-arliai-settings" class="qig-provider-section">
                    <label>ArliAI API Key</label>
                    <input id="qig-arli-key" type="password" value="${s.arliKey}">
                    <label>Model</label>
                    <input id="qig-arli-model" type="text" value="${s.arliModel}">
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
                    <input id="qig-proxy-model" type="text" value="${s.proxyModel}" placeholder="gemini-3-pro-image-preview">
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
                <div id="qig-llm-settings" style="display:${s.useLLMPrompt ? "block" : "none"}">
                    <label>LLM Model (for prompt generation)</label>
                    <input id="qig-llm-model" type="text" value="${s.llmModel}" placeholder="e.g. gpt-4o-mini">
                </div>
                
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
    
    bind("qig-nai-key", "naiKey");
    bind("qig-nai-model", "naiModel");
    bind("qig-arli-key", "arliKey");
    bind("qig-arli-model", "arliModel");
    bind("qig-local-url", "localUrl");
    bind("qig-local-type", "localType");
    bind("qig-proxy-url", "proxyUrl");
    bind("qig-proxy-key", "proxyKey");
    bind("qig-proxy-model", "proxyModel");
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
        document.getElementById("qig-llm-settings").style.display = e.target.checked ? "block" : "none";
        saveSettingsDebounced(); 
    };
    bind("qig-llm-model", "llmModel");
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
