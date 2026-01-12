# Quick Image Gen - SillyTavern Extension

One-click image generation for SillyTavern. Generate images of your characters and scenes with a single click. Images appear in a popup overlay and **never get added to chat** - they use zero tokens.

## Features

- 🎨 **6 Providers** - Pollinations (free), NovelAI, ArliAI, NanoGPT, Local (A1111/ComfyUI), Reverse Proxy
- 🖼️ **9 Style Presets** - None, Anime, Cartoon, Realistic, Semi-Realistic, Oil Painting, Watercolor, Pixel Art, Sketch
- 🤖 **LLM Prompt Generation** - Auto-convert scenes to image prompts using your ST connection
- 🏷️ **Two Prompt Styles** - Danbooru tags (anime) or natural descriptions (realistic)
- ✨ **Quality Tags** - Auto-prepend quality boosters to prompts
- 🚫 **Default Negative Prompt** - Pre-filled with common quality fixes
- 📍 **Message Selector** - Choose which chat message to use (-1 for last)
- ⚡ **Zero Token Usage** - Images display in popup, never added to chat
- 📱 **Mobile Friendly** - Works on phones and tablets

### Reverse Proxy Features (for PixAI, etc.)
- 🎭 **LoRA Support** - Add LoRAs with weights (id:weight format)
- 👤 **Face Fix** - Enable ADetailer for better faces
- ⚙️ **Full Control** - Dedicated Steps, CFG, Sampler, Seed settings

---

## Installation

### Method 1: Install from SillyTavern (Easiest)

1. Open SillyTavern in your browser
2. Click the **puzzle piece icon** (Extensions) in the top menu
3. Scroll down and click **Install Extension**
4. Paste this URL: `https://github.com/platberlitz/sillytavern-image-gen`
5. Click **Save**
6. Refresh the page

### Method 2: Git Clone

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/platberlitz/sillytavern-image-gen.git
```
Then restart SillyTavern.

---

## Quick Start

1. After installing, look for the **🎨 palette icon** in SillyTavern's top bar
2. Click it to open the settings
3. Provider is set to **Pollinations** by default (free, no setup!)
4. Type something in the **Prompt** field, like: `{{char}} smiling in a garden`
5. Click **Generate**
6. Your image appears in a popup - click anywhere outside to close

---

## Providers

### Pollinations (Free)
No setup needed - just select and generate!

### NovelAI
1. Get API key from [NovelAI](https://novelai.net)
2. Enter key and model (e.g., `nai-diffusion-4-5-curated`)

### ArliAI
1. Get API key from [ArliAI](https://www.arliai.com)
2. Enter key and model

### NanoGPT
1. Get API key from [NanoGPT](https://nano-gpt.com)
2. Enter key and model (e.g., `flux-schnell`)

### Local (A1111/ComfyUI)
- A1111: Launch with `--api` flag, URL: `http://127.0.0.1:7860`
- ComfyUI: URL: `http://127.0.0.1:8188`

### Reverse Proxy (PixAI, etc.)

For providers without OpenAI-compatible APIs. Use with [PixAI Proxy](https://github.com/platberlitz/pixai-proxy).

**Settings:**
- **Proxy URL** - Your proxy endpoint (e.g., `https://your-proxy.com/v1`)
- **API Key** - Provider API key
- **Model** - Model ID
- **LoRAs** - Format: `id:weight, id:weight` (e.g., `123456:0.8, 789012:0.6`)
- **Steps** - Generation steps (8-50)
- **CFG** - Prompt adherence (1-15)
- **Sampler** - Euler a, DPM++ 2M Karras, etc.
- **Seed** - -1 for random
- **Face Fix** - Enable ADetailer

---

## LLM Prompt Generation

Enable "Use LLM to create image prompt" to automatically convert scene descriptions into optimized prompts.

**Prompt Styles:**
- **Danbooru Tags** - `1girl, long_hair, red_eyes, school_uniform, sitting, classroom`
- **Natural Description** - `A young woman with long dark hair sitting at a desk in a sunlit classroom`

Uses your current SillyTavern LLM connection.

---

## Settings

| Setting | Description |
|---------|-------------|
| Provider | Image generation service |
| Style | Art style preset (adds style tags) |
| Prompt | What to generate. Use `{{char}}` and `{{user}}` |
| Negative Prompt | What to avoid |
| Quality Tags | Auto-prepended quality boosters |
| Message Index | Which message to use (-1 = last) |
| Width/Height | Image dimensions |
| Steps | Generation steps (more = slower, better) |
| CFG Scale | Prompt adherence (higher = stricter) |
| Sampler | Generation algorithm |
| Seed | -1 for random, or specific number |

---

## Troubleshooting

**"Load failed" / Network error**
- Check internet connection
- Verify provider URL is correct
- For local: ensure A1111/ComfyUI is running with API enabled

**Image doesn't appear**
- Check Logs button for errors
- Try simpler prompt or smaller size

**LLM prompt slow**
- Depends on your ST LLM connection speed
- Try a faster model

---

## Related

- [PixAI Proxy](https://github.com/platberlitz/pixai-proxy) - Use PixAI with this extension

## License

MIT
