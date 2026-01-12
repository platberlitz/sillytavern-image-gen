# Quick Image Gen - SillyTavern Extension

One-click image generation for SillyTavern. Generate images of your characters and scenes with a single click. Images appear in a popup overlay and **never get added to chat** - they use zero tokens.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [The Interface](#the-interface)
- [Providers Setup](#providers-setup)
- [Settings Explained](#settings-explained)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)

## Features

- 🎨 **Multiple Providers** - Pollinations (free), NovelAI, ArliAI, NanoGPT, Local (A1111/ComfyUI), Reverse Proxy
- 🖼️ **Style Presets** - Anime, Realistic, Cartoon, Oil Painting, Watercolor, Pixel Art, Sketch
- 🤖 **LLM Prompt Generation** - Automatically convert scene descriptions to optimized image tags
- ⚡ **Zero Token Usage** - Images display in popup, never added to chat context
- 📱 **Mobile Friendly** - Works on phones and tablets

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

### Method 3: Manual Download

1. Download this repository as ZIP
2. Extract to `SillyTavern/public/scripts/extensions/third-party/sillytavern-image-gen`
3. Restart SillyTavern

---

## Quick Start

**Want to generate images immediately? Here's the fastest way:**

1. After installing, look for the **🎨 palette icon** in SillyTavern's top bar
2. Click it to open the settings popup
3. Provider is set to **Pollinations** by default (free, no setup needed!)
4. Type something in the **Prompt** field, like: `{{char}} smiling in a garden`
5. Click **Generate**
6. Wait a few seconds - your image will appear in a popup!

That's it! For better results, keep reading.

---

## The Interface

### The Palette Button (🎨)

Located in SillyTavern's top menu bar. Click it to:
- Open settings (first click)
- Generate an image (when settings are configured)

When generating, the button shows a spinner to indicate progress.

### Settings Popup

The settings popup has these sections:

```
┌─────────────────────────────────────┐
│ Provider: [Dropdown]                │  ← Choose your image service
├─────────────────────────────────────┤
│ Provider Settings                   │  ← API keys, URLs (varies by provider)
├─────────────────────────────────────┤
│ Prompt: [Text field]                │  ← What to generate
│ Negative Prompt: [Text field]       │  ← What to avoid
├─────────────────────────────────────┤
│ Quality Tags: [Text field]          │  ← Auto-added quality boosters
│ ☑ Prepend quality tags              │  ← Toggle quality tags on/off
├─────────────────────────────────────┤
│ Style: [Dropdown]                   │  ← Art style preset
│ Message Index: [Number]             │  ← Which message to use (-1 = last)
│ ☑ Use LLM to create image prompt    │  ← AI-powered prompt enhancement
├─────────────────────────────────────┤
│ Size: [Width] x [Height]            │  ← Image dimensions
│ Steps / CFG / Sampler / Seed        │  ← Advanced generation settings
├─────────────────────────────────────┤
│ [Generate] [Logs]                   │  ← Action buttons
└─────────────────────────────────────┘
```

### Image Popup

When an image is generated:
- It appears in a centered popup overlay
- Click **Download** to save the image
- Click anywhere outside the image to close

---

## Providers Setup

### Pollinations (Free - No Setup!)

The easiest option. Just select it and generate!

- **Cost:** Free
- **Quality:** Good
- **Speed:** Fast
- **Setup:** None required

### NovelAI

Premium anime-focused image generation.

1. Get your API key from [NovelAI](https://novelai.net) (requires subscription)
2. Select **NovelAI** as provider
3. Paste your API key in the **NovelAI API Key** field
4. Model suggestions:
   - `nai-diffusion-3` - Latest, best quality
   - `nai-diffusion-4-curated-preview` - Newest preview

### ArliAI

Affordable API-based generation.

1. Sign up at [ArliAI](https://www.arliai.com)
2. Get your API key from the dashboard
3. Select **ArliAI** as provider
4. Paste your API key
5. Model: `ari-real-xl-v1` (realistic) or check their docs for others

### NanoGPT

1. Sign up at [NanoGPT](https://nano-gpt.com)
2. Get your API key
3. Select **NanoGPT** as provider
4. Paste your API key
5. Model: `flux-schnell` or `flux-dev`

### Local (Automatic1111 / ComfyUI)

Use your own locally-running Stable Diffusion.

**For Automatic1111:**
1. Launch A1111 with the `--api` flag: `./webui.sh --api`
2. Select **Local** as provider
3. Set URL to `http://127.0.0.1:7860`
4. Select Type: **A1111**

**For ComfyUI:**
1. Launch ComfyUI normally
2. Select **Local** as provider
3. Set URL to `http://127.0.0.1:8188`
4. Select Type: **ComfyUI**

### Reverse Proxy (Advanced)

For OpenAI-compatible image endpoints, including custom proxies.

1. Select **Reverse Proxy** as provider
2. Enter your **Proxy URL** (e.g., `https://your-proxy.com/v1`)
3. Enter **API Key** if required
4. Enter **Model** name (depends on your proxy)
5. **LoRAs** (optional): Enter as `id:weight, id:weight` (e.g., `123456:0.8, 789012:0.6`)

**Example: Using with PixAI Proxy**
- URL: `https://your-pixai-proxy.com/v1`
- API Key: Your PixAI API key
- Model: PixAI model ID (from model page URL)
- LoRAs: PixAI LoRA IDs with weights

---

## Settings Explained

### Prompt

What you want to see in the image. Supports placeholders:
- `{{char}}` - Replaced with character name
- `{{user}}` - Replaced with your persona name

**Examples:**
- `{{char}} sitting in a cafe, drinking coffee`
- `{{char}} and {{user}} walking in the rain`
- `portrait of {{char}}, detailed face, looking at viewer`

### Negative Prompt

What you DON'T want in the image. The default covers common issues:
```
lowres, bad anatomy, bad hands, text, error, missing fingers, 
extra digit, cropped, worst quality, low quality, blurry, deformed
```

Add more if needed, like: `glasses, hat, wings`

### Quality Tags

Automatically added to the start of your prompt to improve quality:
```
masterpiece, best quality, highly detailed, sharp focus, 8k
```

Toggle **Prepend quality tags** to enable/disable.

### Style Presets

Adds style-specific tags automatically:

| Style | Added Tags |
|-------|------------|
| None | (nothing) |
| Anime | anime style, anime artwork |
| Cartoon | cartoon style, cel shaded |
| Realistic | realistic, photorealistic, photograph |
| Semi-Realistic | semi-realistic, detailed |
| Oil Painting | oil painting, painterly, canvas texture |
| Watercolor | watercolor painting, soft edges |
| Pixel Art | pixel art, 16-bit, retro |
| Sketch | pencil sketch, line art, monochrome |

### Message Index

Which chat message to use for context:
- `-1` = Use the last message (default, recommended)
- `0` = First message
- `5` = Sixth message
- etc.

### Use LLM to Create Image Prompt

When enabled, your scene description is sent to your current SillyTavern LLM connection, which converts it into optimized danbooru-style tags.

**Example transformation:**
- Input: `Sarah is sitting at her desk, looking tired after a long day of work`
- Output: `1girl, brown_hair, sitting, office_chair, desk, tired_expression, dim_lighting, computer_monitor, indoor, from_side`

This works best with capable models (GPT-4, Claude, etc.)

### Image Size (Width/Height)

Common sizes:
- **512x512** - Square, fast
- **512x768** - Portrait (good for characters)
- **768x512** - Landscape (good for scenes)
- **1024x1024** - High quality square (slower)

⚠️ Larger sizes take longer and may fail on some providers.

### Steps

How many refinement steps. More = better quality but slower.
- **20-25** - Fast, decent quality
- **30-40** - Good balance
- **50+** - High quality, slow

### CFG Scale

How strictly to follow your prompt:
- **5-7** - More creative freedom
- **7-10** - Balanced (recommended)
- **10-15** - Very strict to prompt

### Sampler

The algorithm used for generation. Common options:
- `euler_a` - Fast, good quality (recommended)
- `euler` - Slightly different style
- `dpm++_2m` - High quality
- `ddim` - Classic, consistent

### Seed

Controls randomness:
- `-1` = Random seed each time (default)
- Any number = Same seed = same image (useful for variations)

---

## Tips & Tricks

### Get Better Results

1. **Be specific** - "girl with long blue hair" beats "anime girl"
2. **Describe the scene** - Include setting, lighting, mood
3. **Use the LLM option** - Let AI optimize your prompts
4. **Match style to provider** - Anime styles work best on NovelAI/PixAI

### Prompt Formula

A good prompt structure:
```
[subject], [appearance details], [pose/action], [setting], [lighting/mood]
```

Example:
```
{{char}}, long silver hair, red eyes, sitting on throne, dark castle interior, dramatic lighting, looking at viewer
```

### Using with PixAI Proxy

If you set up the [PixAI Proxy](https://github.com/platberlitz/pixai-proxy):
1. Set provider to **Reverse Proxy**
2. URL: Your proxy URL + `/v1`
3. Find model IDs from PixAI model pages (last number in URL)
4. Find LoRA IDs the same way

---

## Troubleshooting

### "Load failed" or "Network error"
- Check your internet connection
- Verify the provider URL is correct
- For local: make sure A1111/ComfyUI is running

### Image doesn't appear
- Check the **Logs** button for error details
- Try a simpler prompt
- Try smaller image size

### "API key required" or "Unauthorized"
- Double-check your API key is correct
- Make sure there are no extra spaces
- Verify your subscription is active

### Popup doesn't show / appears behind other elements
- The extension uses maximum z-index, but some other extensions might conflict
- Try refreshing SillyTavern

### LLM prompt generation not working
- Make sure you have an active LLM connection in SillyTavern
- Check that your LLM API is responding
- Try disabling and re-enabling the option

### Local A1111 not connecting
- Launch with `--api` flag
- Check the URL (default: `http://127.0.0.1:7860`)
- Try `http://localhost:7860` instead

---

## License

MIT - Use freely, modify freely, just keep the license.
