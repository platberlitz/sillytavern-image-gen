# Quick Image Gen - SillyTavern Extension

## TL;DR
One-click image generation for SillyTavern. 13 providers (Pollinations free, NovelAI, ArliAI, NanoGPT, Chutes, CivitAI, Nanobanana/Gemini, Stability AI, Replicate, Fal.ai, Together AI, Local, Proxy), 40+ styles, LLM prompt generation with editing, reference images, connection profiles, batch generation with browsing. Resizable popup with insert-to-chat support, auto-insert option, per-character reference images, persistent gallery & history, generation presets (with contextual filters), prompt wildcards, contextual filters (lorebook-style keyword triggers), ST Style panel integration, inject mode (AI-driven `<pic>` tag extraction à la wickedcode01), PNG metadata embedding, and settings export/import.

**Install:** Extensions → Install from URL → `https://github.com/platberlitz/sillytavern-image-gen`

---

One-click image generation for SillyTavern. Images appear in a resizable popup with the option to insert them into chat messages.

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
- 🎲 **Prompt Wildcards** - Use `{red|blue|green}` syntax for random selection per image
- 📍 **Message Selection** - Choose single, range, or multiple chat messages for context (`-1`, `3-7`, `3,5,7`, `last5`)
- 🔢 **Batch Count** - Generate multiple images per button press (1-10)
- 🔀 **Batch Browsing** - Navigate batch results with prev/next arrows, thumbnails, and keyboard shortcuts
- 🔢 **Sequential Seeds** - Seed variation batches (seed, seed+1, seed+2...) for controlled variation
- 📌 **Batch Insert All** - Insert all batch images into chat at once
- 💾 **Batch Save All** - Download all batch images with sequential filenames and embedded metadata
- 📐 **Aspect Ratios** - 1:1, 3:2, 2:3, 16:9, 9:16 presets
- 🎨 **Skin Tone Reinforcement** - Auto-detects and reinforces skin tones from character descriptions
- 🔖 **Contextual Filters** - Lorebook-style keyword triggers that auto-inject positive/negative prompts (AND/OR logic, priority-based suppression for multi-character LoRAs)
- 🎭 **ST Style Integration** - Reads SillyTavern's built-in Style panel (common prefix, negative, character-specific prompts) and applies them to generation
- 💉 **Inject Mode** - AI-driven generation: injects a prompt into chat completion so the RP AI uses `<pic>` tags, then extracts and generates images automatically (inspired by wickedcode01's st-image-auto-generation)
- 🖼️ **Reference Images** - Upload up to 15 reference images (Nanobanana, Proxy)
- 📝 **Extra Instructions** - Additional model instructions for enhanced control

### Profiles & Settings
- 💾 **Connection Profiles** - Save/load provider configurations (API keys, models, URLs)
- 💾 **Prompt Templates** - Save/load/delete templates (prompt + negative + quality tags) — all shown in scrollable list
- 💾 **Generation Presets** - Save/load complete generation settings (provider, style, dimensions, steps, prompt, contextual filters, inject mode config, etc.)
- 👤 **Character Settings** - Save settings per character
- 👤 **Per-Character Reference Images** - Reference images saved/loaded with character settings
- 📤 **Export Settings** - Export all profiles, templates, presets, and character settings to JSON
- 📥 **Import Settings** - Import settings from a previously exported file

### Gallery & Session
- 🖼️ **Persistent Gallery** - View all generated images with thumbnails and prompt snippets (persists across sessions via localStorage)
- 📝 **Persistent Prompt History** - Review full prompts from all generations (persists across sessions, up to 50)
- 🔄 **Quick Regenerate** - Same prompt, new seed
- 📌 **Insert to Chat** - Attach generated image to a chat message (persists on reload)
- 🔲 **Resizable Popup** - Drag the corner handle to resize the image popup
- ⚡ **Auto-generate** - Generate after each AI response
- 📥 **Auto-insert** - Skip popup and insert images directly into chat

### Advanced Features
- 🎯 **Sampler Support** - Full sampler selection for NovelAI (DDIM, Euler, DPM++, etc.)
- 🎭 **LoRA Support** - Multiple LoRAs with weights (Proxy, Local/A1111)
- 👤 **Face Fix** - ADetailer with custom prompt/negative (Proxy, Local/A1111)
- 🔍 **Hires Fix** - Upscale generation with configurable upscaler, scale, and denoise (A1111)
- 📊 **Generation Progress** - Live progress percentage, step count, and ETA (A1111/ComfyUI)
- 🖼️ **PNG Metadata Embedding** - Downloads embed A1111-compatible generation parameters (prompt, negative, steps, CFG, seed, size)
- 🔄 **Metadata Round-Trip** - Drag-and-drop any A1111/embedded PNG to auto-fill settings; download to preserve them
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
| **Use chat message** | Use chat message(s) as prompt |
| **Message selection** | Which messages to use: `-1` (last), `5` (single), `3-7` (range), `3,5,7` (specific), `last5` (last N) |
| **Use LLM** | Have LLM convert scene to image prompt (tags/natural/custom) |
| **Edit LLM prompt** | Review and edit AI-generated prompts before generation |
| **Prefill** | Text to start LLM response with (e.g., "Tags:", "Image prompt:") |
| **Add enhanced quality tags** | LLM includes additional quality descriptors |
| **Add lighting tags** | LLM includes professional lighting descriptions |
| **Add random artist tags** | LLM includes art style references from artists |
| **Batch Count** | Number of images to generate (1-10) |
| **Sequential Seeds** | Generate batch with incrementing seeds (seed, seed+1, seed+2...) |
| **Size** | Image dimensions (custom or NovelAI presets) |
| **Auto-generate** | Generate after each AI response |
| **Auto-insert** | Skip popup and insert images directly into chat |
| **Use ST Style** | Apply SillyTavern's Style panel settings (common prefix, negative, character-specific prompts) to generation |
| **Inject Mode** | AI-driven generation — injects prompt into chat completion, extracts `<pic>` tags from AI response |

---

## Buttons

| Button | Function |
|--------|----------|
| 🎨 Generate | Generate image(s) |
| 📋 Logs | View generation logs |
| 💾 Save for Char | Save settings for current character |
| 💾 Save Profile | Save current provider settings |
| 💾 Save Template | Save current prompt + negative + quality as template |
| 💾 Save Preset | Save all current generation settings as a named preset |
| 📤 Export | Export all settings (profiles, templates, presets, char settings) to JSON |
| 📥 Import | Import settings from a previously exported JSON file |
| 📌 Insert All | Insert all batch images into chat (batch mode) |
| 💾 Save All | Download all batch images with metadata (batch mode) |
| 🔄 Regenerate | Same prompt, new seed |
| 📌 Insert | Attach image to the target chat message |
| 🖼️ Gallery | View session images |
| 📝 Prompts | View full prompt history for this session |

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
- **Local**: URL, type (A1111/ComfyUI), CLIP skip, LoRAs, Hires Fix, ADetailer settings
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
- **Multi-Message Context**: Select multiple messages for richer scene context (ranges, specific indices, or last N)

## Drag and Drop Metadata
Drag and drop any A1111-generated PNG image onto the settings panel to automatically import its generation parameters (Prompt, Negative, Steps, CFG, Seed, Model). Images downloaded from this extension include embedded metadata, enabling full round-trip: generate → download → drag back → settings auto-fill.

## Prompt Wildcards
Use `{option1|option2|option3}` syntax in prompts for random selection. Each image in a batch gets a fresh random pick. Double-brace placeholders like `{{char}}` are not affected.

Example: `{red|blue|green} hair, {indoor|outdoor} scene` → each batch image gets different random combinations.

## Local Img2Img
When using the Local (A1111) provider, you can upload a reference image to perform Image-to-Image generation. The extension handles switching between `/txt2img` and `/img2img` endpoints automatically.

## ComfyUI Setup
When using ComfyUI, you must start it with CORS headers enabled to allow cross-origin requests from SillyTavern:

```bash
python main.py --enable-cors-header
```

Without this flag, you'll get "403 Forbidden" errors due to origin mismatch.

### ComfyUI Settings
| Setting | Description |
|---------|-------------|
| **Checkpoint Name** | Exact filename from your ComfyUI checkpoints folder |
| **Denoise** | Denoising strength (0-1, default 1.0) |
| **CLIP Skip** | Skip last N CLIP layers (1-12, default 1) |
| **Custom Workflow** | Paste workflow JSON from ComfyUI "Save (API Format)" |

### Workflow Placeholders
Use these placeholders in custom workflows:
- `%prompt%` - Positive prompt
- `%negative%` - Negative prompt
- `%seed%`, `%width%`, `%height%`, `%steps%`, `%cfg%`
- `%denoise%`, `%clip_skip%`, `%sampler%`, `%scheduler%`, `%model%`

### A1111 Settings
| Setting | Description |
|---------|-------------|
| **LoRAs** | Comma-separated LoRAs in `name:weight` format (e.g., `add_detail:0.7, my_lora:0.8`) |
| **CLIP Skip** | Skip last N CLIP layers (1-12, default 1) |
| **Hires Fix** | Enable upscaling via Hires Fix (txt2img only) |
| **Hires Upscaler** | Upscaling algorithm (Latent, R-ESRGAN, etc. — populated from A1111 API) |
| **Hires Scale** | Upscale factor (1-4, default 2) |
| **Hires 2nd Pass Steps** | Sampling steps for upscale pass (0 = same as first pass) |
| **Hires Denoise** | Denoising strength for upscale pass (0-1, default 0.55) |
| **ADetailer** | Enable face/hand fix using ADetailer extension |
| **ADetailer Model** | Detection model (face_yolov8n, hand_yolov8n, person_yolov8n, mediapipe) |
| **ADetailer Prompt** | Custom prompt for inpainting (empty = use main prompt) |
| **ADetailer Negative** | Custom negative for inpainting (empty = use main negative) |
| **IP-Adapter Face** | Use reference image for face features only (not pose/clothes) |
| **IP-Adapter Model** | FaceID model (Portrait, Standard, Plus v2 - SD1.5 or SDXL) |
| **IP-Adapter Weight** | How strongly to apply facial features (0-1.5, default 0.7) |
| **Pixel Perfect** | Automatically calculate optimal preprocessor resolution |
| **Control Mode** | Balance between prompt and control image (Balanced, Prompt Priority, ControlNet Priority) |
| **Steps** | Start/End percentage of steps to apply control (0-1 range) |

## IP-Adapter Face Setup

IP-Adapter Face allows you to use a reference image to copy **only the face** (not pose, clothes, or background). This is ideal for maintaining character consistency across different scenes.

### Installation (A1111)

1. **Install ControlNet extension** (if not already installed):
   - Go to Extensions → Install from URL
   - Enter: `https://github.com/Mikubill/sd-webui-controlnet`
   - Click Install and restart WebUI

2. **Download IP-Adapter FaceID models**:
   - Download from [Hugging Face](https://huggingface.co/h94/IP-Adapter-FaceID/tree/main)
   - For SD1.5: `ip-adapter-faceid-portrait_sd15.bin`, `ip-adapter-faceid_sd15.bin`
   - For SDXL: `ip-adapter-faceid_sdxl.bin`
   - Place in: `stable-diffusion-webui/extensions/sd-webui-controlnet/models/`

3. **Download required LoRA** (for FaceID):
   - Download `ip-adapter-faceid_sd15_lora.safetensors` from same repo
   - Place in: `stable-diffusion-webui/models/Lora/`

### Usage

1. Upload a **clear face reference image** (front-facing works best)
2. Enable **"IP-Adapter Face"** checkbox
3. Select appropriate model (Portrait for stylized, Standard for realistic)
4. Adjust weight (0.5-0.8 recommended, higher = more similar)

### Placeholders (Custom Mode)
- `{{scene}}` - Current scene/message text
- `{{char}}` - Character name
- `{{user}}` - User name
- `{{charDesc}}` - Character description
- `{{userDesc}}` - User persona

---

## Contextual Filters

Lorebook-style keyword triggers that automatically inject positive/negative prompt additions when trigger words appear in the scene text. Useful for character-specific LoRAs, multi-character scenarios, and franchise RPG cards.

### How It Works

Each filter has:
- **Keywords** (comma-separated) — scanned against the current scene/message text
- **Match Mode** — `OR` (any keyword triggers) or `AND` (all keywords required)
- **Positive/Negative Prompt** — appended to the generation prompts when triggered
- **Priority** — higher-priority AND filters suppress lower-priority OR filters whose keywords are a subset

### Example: Multi-Character LoRAs

1. Create an OR filter: keyword `goku`, positive `1boy, goku, <lora:goku:0.8>`, priority 5
2. Create an OR filter: keyword `vegeta`, positive `1boy, vegeta, <lora:vegeta:0.8>`, priority 5
3. Create an AND filter: keywords `goku, vegeta`, positive `2boys, goku, vegeta, <lora:goku_vegeta:0.8>`, priority 10

When a message mentions only "goku", only the goku filter fires. When both "goku" and "vegeta" appear, the AND filter fires and suppresses the individual OR filters — preventing conflicting LoRAs from stacking.

Filters are included in settings export/import and can be saved inside generation presets.

---

## ST Style Integration

When enabled (default: on), QIG reads SillyTavern's built-in Style panel settings from the SD extension:

- **Common prompt prefix** — prepended to the positive prompt
- **Common negative prompt** — appended to the negative prompt
- **Character-specific positive/negative** — applied when the current character has overrides set in ST's Style panel

This means you can set character-specific style prompts in ST's native UI and have them automatically apply to QIG generations. If the SD extension isn't installed or configured, this is silently skipped.

---

## Inject Mode (AI-Driven Generation)

Inspired by [wickedcode01's st-image-auto-generation](https://github.com/wickedcode01/st-image-auto-generation). Instead of using a separate LLM call to create image prompts, inject mode lets the RP AI itself describe scenes visually.

### How it works

1. **Injection**: A system prompt is injected into the chat completion telling the AI to use `<pic prompt="description">` tags for visual moments
2. **Extraction**: When the AI responds, QIG scans for `<pic>` tags using a configurable regex
3. **Generation**: Each extracted prompt is run through the full pipeline (style → quality → ST Style → contextual filters → provider)
4. **Cleanup**: Tags are optionally removed from the displayed message

### Settings

| Setting | Description |
|---------|-------------|
| **Enable inject mode** | Master toggle |
| **Inject prompt template** | The instruction injected into chat completion. Supports `{{char}}`, `{{user}}` |
| **Extraction regex** | Regex with capture group 1 for the image prompt. Default: `<pic\s+prompt="([^"]+)"\s*/?>` |
| **Injection position** | Where to inject: After Scenario, In User Message, or At Depth |
| **Depth** | Depth from end of prompt array (when using At Depth) |
| **Tag handling** | Replace tag with image, insert after message, or create new message |
| **Auto-clean** | Remove `<pic>` tags from the displayed message |

### Why use this?

The RP AI naturally describes what's happening in the scene, so its `<pic>` prompts tend to be more contextually accurate than a separate LLM call analyzing the scene after the fact. This is especially useful for immersive RP where you want images to appear organically as the story unfolds.

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
