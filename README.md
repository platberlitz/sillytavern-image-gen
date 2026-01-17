# Quick Image Gen - SillyTavern Extension

## TL;DR
One-click image generation for SillyTavern. 13 providers (Pollinations free, NovelAI, ArliAI, NanoGPT, Chutes, CivitAI, Nanobanana/Gemini, Stability AI, Replicate, Fal.ai, Together AI, Local, Proxy), 40+ styles, LLM prompt generation with editing, reference images, connection profiles, batch generation. Images in popup, never added to chat.

**Install:** Extensions → Install from URL → `https://github.com/platberlitz/sillytavern-image-gen`

---

One-click image generation for SillyTavern. Images appear in a popup and **never get added to chat** - zero tokens.

## Features

### Providers
- 🆓 **Pollinations** - Free, no API key
- 🎨 **NovelAI** - Premium anime (nai-diffusion-4-5-curated/full) with proper sampler support
- 🤖 **ArliAI** - Affordable API
- ⚡ **NanoGPT** - Fast Flux models
- 🪂 **Chutes** - Decentralized AI (FLUX models)
- 🏛️ **CivitAI** - Community models with URN format, schedulers
- 🧠 **Nanobanana (Gemini)** - Google's Gemini image generation with reference images
- 🎨 **Stability AI** - Official SDXL API
- 🚀 **Replicate** - Run AI models in the cloud (SDXL, etc.)
- ⚡ **Fal.ai** - Fast Flux models
- 🤝 **Together AI** - Open source models (SDXL, etc.)
- 🖥️ **Local** - A1111/ComfyUI
- 🔌 **Reverse Proxy** - PixAI, custom endpoints with multimodal support

### Generation
- 🖼️ **40+ Style Presets** - Anime, Realistic, Cyberpunk, Ghibli, etc.
- 🤖 **LLM Prompt Generation** - Auto-convert scenes to image prompts
- ✏️ **Prompt Editing** - Edit LLM-generated prompts before generation
- 🏷️ **Three Prompt Modes** - Danbooru tags, natural descriptions, or custom instruction
- ⭐ **LLM Enhancements** - Add quality tags, lighting tags, and artist tags to LLM prompts
- ✨ **Quality Tags** - Auto-prepend quality boosters
- 📍 **Message Selector** - Choose which chat message to use
- 🔢 **Batch Count** - Generate multiple images per button press (1-10)
- 📐 **Aspect Ratios** - 1:1, 3:2, 2:3, 16:9, 9:16 presets
- 🎨 **Skin Tone Reinforcement** - Auto-detects and reinforces skin tones from character descriptions
- 🖼️ **Reference Images** - Upload up to 15 reference images (Nanobanana, Proxy)
- 📝 **Extra Instructions** - Additional model instructions for enhanced control

### Profiles & Settings
- 💾 **Connection Profiles** - Save/load provider configurations (API keys, models, URLs)
- 💾 **Prompt Templates** - Save/load/delete templates (prompt + negative + quality tags)
- 👤 **Character Settings** - Save settings per character

### Gallery & Session
- 🖼️ **Session Gallery** - View all images generated this session
- 🔄 **Quick Regenerate** - Same prompt, new seed
- ⚡ **Auto-generate** - Generate after each AI response

### Advanced Features
- 🎯 **Sampler Support** - Full sampler selection for NovelAI (DDIM, Euler, DPM++, etc.)
- 🎭 **LoRA Support** - Multiple LoRAs with weights (Proxy)
- 👤 **Face Fix** - ADetailer support (Proxy)
- ⚙️ **Full Control** - Steps, CFG, Sampler, Seed for compatible providers

---

## Installation

```bash
# Via SillyTavern Extensions panel:
https://github.com/platberlitz/sillytavern-image-gen

# Or git clone:
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/platberlitz/sillytavern-image-gen.git
```

---

## Quick Start

1. Click the **🎨 palette icon** in SillyTavern's top bar
2. Provider defaults to **Pollinations** (free!)
3. Enter a prompt: `{{char}} smiling in a garden`
4. Click **Generate**

---

## Settings

| Setting | Description |
|---------|-------------|
| **Provider** | Image generation backend (9 options) |
| **Connection Profile** | Save/load provider settings |
| **Style** | Visual style preset (40+ options) |
| **Prompt** | Base prompt with `{{char}}` and `{{user}}` placeholders |
| **Negative Prompt** | What to avoid in generation |
| **Quality Tags** | Tags prepended to prompt |
| **Use chat message** | Use last chat message as prompt |
| **Use LLM** | Have LLM convert scene to image prompt (tags/natural/custom) |
| **Edit LLM prompt** | Review and edit AI-generated prompts before generation |
| **Prefill** | Text to start LLM response with (e.g., "Tags:", "Image prompt:") |
| **Add enhanced quality tags** | LLM includes additional quality descriptors |
| **Add lighting tags** | LLM includes professional lighting descriptions |
| **Add random artist tags** | LLM includes art style references from artists |
| **Batch Count** | Number of images to generate (1-10) |
| **Size** | Image dimensions (custom or NovelAI presets) |
| **Auto-generate** | Generate after each AI response |

---

## Buttons

| Button | Function |
|--------|----------|
| 🎨 Generate | Generate image(s) |
| 📋 Logs | View generation logs |
| 💾 Save for Char | Save settings for current character |
| 💾 Save Profile | Save current provider settings |
| 💾 Save Template | Save current prompt + negative + quality as template |
| 🔄 Regenerate | Same prompt, new seed |
| 🖼️ Gallery | View session images |

---

## Provider Details

### NovelAI
- **Samplers**: k_euler_ancestral, k_euler, k_dpmpp_2m, k_dpmpp_sde, ddim, k_lms, k_heun
- **Models**: nai-diffusion-4-5-curated, nai-diffusion-4-5-full, nai-diffusion-3
- **Features**: SMEA support, resolution presets, ZIP response handling

### CivitAI
- **Model Format**: URN format (`urn:air:sd1:checkpoint:civitai:4201@130072`)
- **Schedulers**: EulerA, Euler, DPM++ 2M Karras, DPM++ SDE Karras, DDIM
- **Features**: Job polling, community models, CLIP skip

### Nanobanana (Gemini)
- **Models**: Gemini 2.5 Flash Image, Gemini 2.0 Flash Exp
- **Features**: Reference images (up to 15), extra instructions for Pro features
- **Format**: Multimodal input with inlineData support

### Reverse Proxy
- **Reference Images**: Upload up to 15 reference images

### Stability AI
- **Models**: SDXL 1.0
- **Features**: Official API access

### Replicate, Fal.ai, Together AI
- **Models**: Configurable model endpoints (SDXL, Flux, etc.)
- **Features**: Fast inference, wide model selection

### Reverse Proxy
- **Reference Images**: Upload up to 15 reference images
- **Extra Instructions**: Additional text instructions for the model
- **LoRA Support**: Multiple LoRAs with weights (`id:weight` format)
- **Face Fix**: ADetailer support
- **Compatibility**: OpenAI-compatible endpoints, PixAI, custom backends

---

## Connection Profiles

Save and load provider configurations per-provider:
- **Pollinations**: model
- **NovelAI**: API key, model
- **ArliAI**: API key, model
- **NanoGPT**: API key, model
- **Chutes**: API key, model
- **CivitAI**: API key, model URN, scheduler
- **CivitAI**: API key, model URN, scheduler
- **Nanobanana**: API key, model, extra instructions, reference images
- **Stability AI**: API key
- **Replicate**: API key, model
- **Fal.ai**: API key, model
- **Together AI**: API key, model
- **Local**: URL, type (A1111/ComfyUI)
- **Proxy**: URL, key, model, LoRAs, steps, CFG, sampler, seed, facefix, extra instructions, reference images

Profiles are stored in localStorage and persist across sessions.

---

## LLM Prompt Generation

The extension can use SillyTavern's LLM to convert chat messages into optimized image prompts:

### Modes
- **Danbooru Tags**: Anime-style comma-separated tags
- **Natural Description**: Realistic scene descriptions
- **Custom Instruction**: Your own prompt template with placeholders

### Features
- **Prompt Editing**: Review and modify AI-generated prompts before generation
- **Prefill**: Guide LLM output format by specifying text to start the response with
- **Character Awareness**: Includes character descriptions and appearance details
- **Skin Tone Detection**: Automatically reinforces detected skin tones
- **Character Awareness**: Includes character descriptions and appearance details
- **Skin Tone Detection**: Automatically reinforces detected skin tones
- **Context Integration**: Uses chat history and character cards for better prompts

## Drag and Drop Metadata
Drag and drop any A1111-generated PNG image onto the settings panel to automatically import its generation parameters (Prompt, Negative, Steps, CFG, Seed, Model).

## Local Img2Img
When using the Local (A1111) provider, you can upload a reference image to perform Image-to-Image generation. The extension handles switching between `/txt2img` and `/img2img` endpoints automatically.

## ComfyUI Setup
When using ComfyUI, you must start it with CORS headers enabled to allow cross-origin requests from SillyTavern:

```bash
python main.py --enable-cors-header
```

Without this flag, you'll get "403 Forbidden" errors due to origin mismatch.

### Placeholders (Custom Mode)
- `{{scene}}` - Current scene/message text
- `{{char}}` - Character name
- `{{user}}` - User name
- `{{charDesc}}` - Character description
- `{{userDesc}}` - User persona

---

## Skin Tone Support

The extension automatically detects skin tone keywords in character descriptions:
- dark skin, brown skin, black skin, tan skin
- ebony, melanin, mocha, chocolate skin, caramel skin

When detected, these are:
1. Added as a CRITICAL instruction to the LLM prompt generator
2. Force-prepended to the final prompt if missing from LLM output

---

## Related

- [SD Proxy](https://github.com/platberlitz/sd-proxy) - Full-featured image generation proxy
- [PixAI Proxy](https://github.com/platberlitz/pixai-proxy) - Use PixAI with this extension

## License

MIT
