import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "quick-image-gen";
const defaultSettings = {
    provider: "pollinations",
    // Common
    prompt: "{{char}} in the current scene",
    negativePrompt: "",
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
    arliModel: "arliai-realistic-v1"
};

const PROVIDERS = {
    pollinations: { name: "Pollinations (Free)", needsKey: false },
    novelai: { name: "NovelAI", needsKey: true },
    arliai: { name: "ArliAI", needsKey: true },
    proxy: { name: "Reverse Proxy (OpenAI-compatible)", needsKey: false }
};

const SAMPLERS = ["euler_a", "euler", "dpm++_2m", "dpm++_sde", "ddim", "lms", "heun"];

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

async function generateImage() {
    const s = getSettings();
    const prompt = resolvePrompt(s.prompt);
    const negative = resolvePrompt(s.negativePrompt);
    
    const btn = document.getElementById("qig-generate-btn");
    btn.disabled = true;
    btn.textContent = "Generating...";
    
    try {
        let result;
        switch (s.provider) {
            case "pollinations": result = await genPollinations(prompt, s); break;
            case "novelai": result = await genNovelAI(prompt, negative, s); break;
            case "arliai": result = await genArliAI(prompt, negative, s); break;
            case "proxy": result = await genProxy(prompt, s); break;
        }
        displayImage(result);
    } catch (e) {
        toastr.error("Generation failed: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "🎨 Generate";
    }
}

async function genPollinations(prompt, s) {
    const seed = s.seed === -1 ? Date.now() : s.seed;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${s.width}&height=${s.height}&seed=${seed}&nologo=true`;
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
    // NAI returns a zip, extract first file (simple zip parse)
    const dataStart = bytes.indexOf(0x89) > 30 ? bytes.indexOf(0x89) : findPngStart(bytes);
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

async function genProxy(prompt, s) {
    const headers = { "Content-Type": "application/json" };
    if (s.proxyKey) headers["Authorization"] = `Bearer ${s.proxyKey}`;
    
    const res = await fetch(s.proxyUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: s.proxyModel,
            prompt: prompt,
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

function displayImage(url) {
    let popup = document.getElementById("qig-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "qig-popup";
        popup.innerHTML = `
            <div class="qig-popup-content">
                <span class="qig-close">&times;</span>
                <img id="qig-result-img" src="">
                <button id="qig-download-btn">💾 Download</button>
            </div>`;
        document.body.appendChild(popup);
        popup.querySelector(".qig-close").onclick = () => popup.style.display = "none";
        popup.onclick = (e) => { if (e.target === popup) popup.style.display = "none"; };
        document.getElementById("qig-download-btn").onclick = () => {
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
    
    const showAdvanced = ["novelai", "arliai"].includes(s.provider);
    document.getElementById("qig-advanced-settings").style.display = showAdvanced ? "block" : "none";
}

function bind(id, key, isNum = false) {
    const el = document.getElementById(id);
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
    
    const html = `
    <div id="qig-settings" class="qig-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Quick Image Gen</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <button id="qig-generate-btn" class="menu_button">🎨 Generate</button>
                
                <label>Provider</label>
                <select id="qig-provider">${providerOpts}</select>
                
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
                
                <div id="qig-proxy-settings" class="qig-provider-section">
                    <label>Proxy URL</label>
                    <input id="qig-proxy-url" type="text" value="${s.proxyUrl}" placeholder="https://proxy.com/v1/images/generations">
                    <label>API Key (optional)</label>
                    <input id="qig-proxy-key" type="password" value="${s.proxyKey}">
                    <label>Model</label>
                    <input id="qig-proxy-model" type="text" value="${s.proxyModel}" placeholder="imagen-3.0-generate-002">
                </div>
                
                <hr>
                <label>Prompt</label>
                <textarea id="qig-prompt" rows="2">${s.prompt}</textarea>
                <label>Negative Prompt</label>
                <textarea id="qig-negative" rows="2">${s.negativePrompt}</textarea>
                
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
    document.getElementById("qig-provider").onchange = (e) => {
        getSettings().provider = e.target.value;
        saveSettingsDebounced();
        updateProviderUI();
    };
    
    bind("qig-nai-key", "naiKey");
    bind("qig-nai-model", "naiModel");
    bind("qig-arli-key", "arliKey");
    bind("qig-arli-model", "arliModel");
    bind("qig-proxy-url", "proxyUrl");
    bind("qig-proxy-key", "proxyKey");
    bind("qig-proxy-model", "proxyModel");
    bind("qig-prompt", "prompt");
    bind("qig-negative", "negativePrompt");
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
    btn.className = "mes_button interactable";
    btn.title = "Generate Image";
    btn.innerHTML = "🎨";
    btn.onclick = generateImage;
    document.getElementById("leftSendForm")?.appendChild(btn);
}

jQuery(async () => {
    await loadSettings();
    createUI();
    addInputButton();
});
