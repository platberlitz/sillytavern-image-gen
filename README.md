# Quick Image Gen - SillyTavern Extension

## TL;DR
One-click image generation for SillyTavern. 13 providers (Pollinations free, NovelAI, ArliAI, NanoGPT, Chutes, CivitAI, Nanobanana/Gemini, Stability AI, Replicate, Fal.ai, Together AI, Local, Proxy), 40+ styles, LLM prompt generation with editing, LLM Override (use a separate cheap/fast AI for image prompts), reference images, connection profiles, Comfy workflow presets, batch generation with browsing. Resizable popup with insert-to-chat support, auto-insert option, per-character reference images, persistent gallery & history, generation presets (with contextual filters), prompt wildcards, contextual filters (lorebook-style keyword triggers + LLM concept matching, with character-specific scoping), ST Style panel integration, inject mode (AI-driven `<pic>`/`<image>` tag extraction à la wickedcode01), PNG metadata embedding, and settings export/import.

**Install:** Extensions → Install from URL → `https://github.com/platberlitz/sillytavern-image-gen`

## What's New in v1.5
- Fixed welcome-page / HTML prompt leakage when `Use chat message` is enabled, so QIG now falls back to clean text instead of ingesting UI markup.
- Fixed random-seed provenance across providers, including Stability, and preserved resolved seeds in gallery/download metadata.
- Fixed image metadata round-tripping by saving per-image settings snapshots, expanding provider/model/backend metadata, and improving PNG `tEXt`/`zTXt`/`iTXt` import support.
- Hardened format detection and metadata export edge cases for non-PNG downloads and numeric zero-valued fields.

## What's New in v1.4.9
- Group-chat context improvements: `{{char}}` now resolves to all active group member names (comma-separated) instead of a single fallback name.
- Character-scoped contextual filters, pools, and prompt replacement maps now apply correctly in group chats by matching active group member IDs.
- LLM filter matching now enriches scene context with character and user profile details, improving first-person/implicit trigger detection.
- LLM prompt generation now reads combined group member profile data (descriptions/scenario/tags) instead of single-card-only context.
- Palette button stability hardening: rapid duplicate generate/cancel clicks are debounced to avoid intermittent popover/cancel-state issues.

## What's New in v1.4.8
- Comprehensive bug-sweep release focused on preset/UI consistency and metadata reliability.
- Fixed preset load UI sync regressions (custom LLM instruction field mapping + provider input refresh after preset load).
- Fixed PNG metadata parser edge cases for Proxy mode (uses proxy sampler/CFG/seed/steps when provider is Proxy).
- Improved Proxy URL handling to support both absolute and relative endpoint paths safely.
- Download fallback now reuses normalized image fetch path for better provider compatibility.
- Hardened settings restore from backup when localStorage is missing, malformed, or mismatched.

## What's New in v1.4.7
- Added **Prompt Replacement Maps** for native token-level substitutions (e.g., `miranda` -> `<lora:...>, 1girl, ...`) with Global/Character scope, target field selection, and priority ordering.
- Prompt Replacement Maps now run in **Direct Mode** and **Inject Mode** flows after contextual filters.
- Prompt Replacement Maps are now included in **generation presets** and **settings export/import**.

---

One-click image generation for SillyTavern. Images appear in a resizable popup with the option to insert them into chat messages.

## Features

### Providers
- 🆓 **Pollinations** - Free, no API key
- 🎨 **NovelAI** - Premium anime (nai-diffusion-4-5-curated/full) with proper sampler support
- 🤖 **ArliAI** - Affordable API
- ⚡ **NanoGPT** - Fast Flux models with reference images and strength control
- 🪂 **Chutes** - Decentralized AI (FLUX models)
- 🏛️ **CivitAI** - Community models with URN format, schedulers, multiple LoRAs
- 🧠 **Nanobanana (Gemini)** - Google's Gemini image generation with reference images
- 🎨 **Stability AI** - Official SDXL API
- 🚀 **Replicate** - Run AI models in the cloud (SDXL, etc.)
- ⚡ **Fal.ai** - Fast Flux models
- 🤝 **Together AI** - Open source models (SDXL, etc.)
- 🖥️ **Local** - A1111/ComfyUI with comprehensive parameter coverage (22 samplers, schedulers, ADetailer, ControlNet, VAE, Hires Fix, img2img, upscale)
- 🔌 **Reverse Proxy** - PixAI, custom endpoints with multimodal support, ComfyUI Proxy mode

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
- 🔖 **Contextual Filters** - Lorebook-style keyword triggers that can **remove conflicting tokens first** and then inject positive/negative prompts (AND/OR logic, priority-based suppression for multi-character LoRAs) + LLM concept matching for abstract triggers. Supports **character-specific scoping** and **pool-based bulk enable/disable** (global + per-character pools)
- 🔁 **Prompt Replacement Maps** - Native exact-token replacements for prompt tags/text with priority, target field control (positive/negative/both), and global or character scope
- 🧠 **LLM Override** - Use a separate, cheaper AI model (Gemini Flash, Haiku, Ollama, etc.) for image prompt generation instead of the chat AI — any OpenAI-compatible endpoint
- 🎭 **ST Style Integration** - Reads SillyTavern's built-in Style panel (common prefix, negative, character-specific prompts) and applies them to generation
- 💉 **Inject Mode** - AI-driven generation: injects a prompt into chat completion so the RP AI uses `<image>` or `<pic>` tags, then extracts and generates images automatically (inspired by wickedcode01's st-image-auto-generation)
- 🖼️ **Reference Images** - Upload up to 15 reference images (NanoGPT, Nanobanana, Proxy) with strength control for img2img
- 📝 **Extra Instructions** - Additional model instructions for enhanced control

### Profiles & Settings
- 💾 **Connection Profiles** - Save/load provider configurations (API keys, models, URLs)
- 💾 **Prompt Templates** - Save/load/delete templates (prompt + negative + quality tags) — all shown in scrollable list
- 💾 **Generation Presets** - Save/load complete generation settings (provider, style, dimensions, steps, prompt, contextual filters, inject mode config, etc.)
- 👤 **Character Settings** - Save settings per character
- 👤 **Per-Character Reference Images** - Reference images saved/loaded with character settings
- 📤 **Export Settings** - Export all profiles, Comfy workflow presets, templates, generation presets, and character settings to JSON
- 📥 **Import Settings** - Import settings from a previously exported file

### Gallery & Session
- 🖼️ **Persistent Gallery** - View all generated images with thumbnails and prompt snippets (persists across sessions via localStorage, including ComfyUI images)
- 📝 **Persistent Prompt History** - Review full prompts from all generations (persists across sessions, up to 50)
- 🔄 **Quick Regenerate** - Same prompt, new seed
- 📌 **Insert to Chat** - Attach generated image to a chat message (persists on reload)
- 🔲 **Resizable Popup** - Drag the corner handle to resize the image popup
- ⚡ **Auto-generate** - Generate after each AI response
- 📥 **Auto-insert** - Skip popup and insert images directly into chat
- 💾 **Save to ST Server** - Optional auto-save for every generated image (persists across sessions)

### Advanced Features
- 🎯 **22 Samplers** - Euler, DPM++, DPM, Heun, UniPC, LCM, DEIS, Restart, and more — grouped by family in the UI
- 📅 **Scheduler Control** - A1111 (Automatic, Karras, Exponential, SGM Uniform, etc.) and ComfyUI (normal, karras, exponential, sgm_uniform, etc.) schedulers
- 🎭 **LoRA Support** - Multiple LoRAs with weights (Proxy, Local/A1111, CivitAI)
- 👤 **ADetailer** - Face/hand fix with 2 independent units, denoise, confidence, mask blur, dilate/erode, inpaint padding, inpaint-only-masked (A1111)
- 🎮 **ControlNet** - Full generic ControlNet support with preprocessor selection, weight, guidance range, pixel perfect, control/resize modes, and image upload — coexists with IP-Adapter (A1111)
- 🔍 **Hires Fix** - Upscale with configurable upscaler, scale, denoise, separate sampler/scheduler, resize dimensions, and hires-specific prompt/negative (A1111)
- 🧪 **VAE Selection** - Choose from available VAEs or use Automatic (A1111)
- 🔄 **Restore Faces & Tiling** - Quick toggles for built-in A1111 postprocessing
- 🎲 **Variation Seed** - Subseed and subseed strength for controlled prompt variations (A1111)
- 🖼️ **ComfyUI img2img** - Upload reference image + set denoise < 1.0 for automatic img2img workflow (no custom JSON needed)
- ⬆️ **ComfyUI Upscale** - Built-in upscale workflow using model-based upscalers (RealESRGAN, etc.)
- 📋 **ComfyUI Model Fetching** - Browse and select checkpoints from your ComfyUI server instead of typing names
- 📊 **Generation Progress** - Live progress percentage, step count, and ETA (A1111/ComfyUI)
- 🖼️ **PNG Metadata Embedding** - Downloads embed A1111-compatible generation parameters (prompt, negative, steps, sampler, scheduler, CFG, seed, size)
- 🔄 **Metadata Round-Trip** - Drag-and-drop any A1111/embedded PNG to auto-fill settings including scheduler; download to preserve them
- ⚙️ **Full Control** - Steps, CFG, Sampler, Scheduler, Seed for compatible providers

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
| **Provider** | Image generation backend (13 options) |
| **Connection Profile** | Save/load provider settings (with overwrite confirmation on duplicate names) |
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
| **Save to ST server** | Auto-save generated images to the SillyTavern server (persistent) |
| **Embed metadata in saved PNGs** | Include prompt/negative/settings metadata when saving to server |
| **Add random artist tags** | LLM includes art style references from artists |
| **Batch Count** | Number of images to generate (1-10) |
| **Sequential Seeds** | Generate batch with incrementing seeds (seed, seed+1, seed+2...) |
| **Size** | Image dimensions (custom + NovelAI presets) |
| **Auto-generate** | Generate after each AI response |
| **Auto-insert** | Skip popup and insert images directly into chat |
| **Use ST Style** | Apply SillyTavern's Style panel settings (common prefix, negative, character-specific prompts) to generation |
| **LLM Override** | Use a separate OpenAI-compatible API for image prompt generation (URL, key, model, temperature, max tokens, system prompt) |
| **Inject Mode** | AI-driven generation — injects prompt into chat completion, extracts `<image>` or `<pic>` tags from AI response |

---

## Buttons

| Button | Function |
|--------|----------|
| 🎨 Generate | Generate image(s) |
| 📋 Logs | View generation logs |
| 💾 Save for Char | Save settings for current character |
| 💾 Save Profile | Save current provider settings |
| 📂/💾/♻️/🗑️ Workflow Preset | Load, save, update, and delete Comfy workflow presets |
| 💾 Save Template | Save current prompt + negative + quality as template |
| 💾 Save Preset | Save all current generation settings as a named preset |
| 📤 Export | Export all settings (profiles, Comfy workflow presets, templates, presets, char settings) to JSON |
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
- **Features**: SMEA support, resolution presets + custom size, ZIP response handling
- **Proxy note**: For OpenAI-compatible proxies on `/chat/completions`, QIG tries exact-size `/generate` first and falls back to mapped preset sizes if unavailable

### CivitAI
- **Model Format**: URN format (`urn:air:sd1:checkpoint:civitai:4201@130072`)
- **LoRAs**: Multiple LoRAs in URN format with weights (`urn:air:sd1:lora:civitai:82098@87153:0.8`)
- **Schedulers**: EulerA, Euler, DPM++ 2M Karras, DPM++ SDE Karras, DDIM
- **Features**: Job polling, community models, CLIP skip

### Nanobanana (Gemini)
- **Models**: Gemini 2.5 Flash Image, Gemini 2.0 Flash Exp
- **Features**: Reference images (up to 15), extra instructions for Pro features
- **Format**: Multimodal input with inlineData support

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
- **CivitAI**: API key, model URN, scheduler, LoRAs
- **Nanobanana**: API key, model, extra instructions, reference images
- **Stability AI**: API key
- **Replicate**: API key, model
- **Fal.ai**: API key, model
- **Together AI**: API key, model
- **Local**: URL, type (A1111/ComfyUI), checkpoint/model, Comfy workflow JSON, Comfy denoise/clip/scheduler/LoRAs/upscale, A1111 scheduler/VAE/restore faces/tiling/subseed, Hires Fix (full), ADetailer (2 units), ControlNet, and IP-Adapter settings
- **Proxy**: URL, key, model, LoRAs, steps, CFG, sampler, seed, facefix, extra instructions, reference images

Profiles are stored in localStorage and persist across sessions.

If you save with an existing profile name, QIG prompts before overwriting.

---

## Comfy Workflow Presets

Comfy Workflow Presets are separate from Connection Profiles and are designed for fast graph switching (for example `With LoRA` / `Without LoRA`).

Each preset stores:
- Checkpoint Name
- Comfy Denoise
- Comfy CLIP Skip
- Comfy Scheduler
- Comfy LoRAs
- Comfy Upscale settings
- Custom Workflow JSON

Buttons:
- **📂 Load**: Apply selected preset to current Comfy settings
- **💾 Save As**: Save current Comfy settings as a new preset
- **♻️ Update**: Overwrite selected preset with current settings
- **🗑️ Delete**: Remove selected preset

Use **Connection Profiles** for broader provider setup, and **Workflow Presets** for Comfy graph variants.

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
- **Context Integration**: Uses chat history and character cards for better prompts
- **Multi-Message Context**: Select multiple messages for richer scene context (ranges, specific indices, or last N)

## LLM Override (Separate AI for Image Prompts)

By default, image prompt generation uses SillyTavern's chat AI — the same model powering your RP. The LLM Override lets you route image-related LLM calls to a separate, cheaper/faster model via any OpenAI-compatible API endpoint.

### Supported Providers

Works with any service that exposes an OpenAI-compatible `/chat/completions` endpoint:
- **OpenRouter** — URL: `https://openrouter.ai/api/v1`, model: `google/gemini-2.0-flash-001`
- **Ollama (local)** — URL: `http://localhost:11434/v1`, model: `llama3`
- **LMStudio** — URL: `http://localhost:1234/v1`
- **Together AI, Groq, vLLM, text-generation-webui**, etc.

### What It Affects

When enabled, the override endpoint is used for:
- **Prompt generation** (direct mode) — converting scenes to image prompts
- **Inject palette fallback** — generating image tags when none found in AI messages
- **LLM concept filter matching** — evaluating concept filters against scenes

### Setup

1. Check **"Use separate AI for image prompts"** in the extension settings
2. Enter your **API Base URL** (auto-appends `/chat/completions` if not present)
3. Enter your **API Key**
4. Enter the **Model** name
5. Optionally adjust temperature, max tokens, and system prompt

## Drag and Drop Metadata
Drag and drop any A1111-generated PNG image onto the settings panel to automatically import its generation parameters (Prompt, Negative, Steps, Sampler, Scheduler, CFG, Seed, Model). Images downloaded from this extension include embedded metadata, enabling full round-trip: generate → download → drag back → settings auto-fill.

## Prompt Wildcards
Use `{option1|option2|option3}` syntax in prompts for random selection. Each image in a batch gets a fresh random pick. Double-brace placeholders like `{{char}}` are not affected.

Example: `{red|blue|green} hair, {indoor|outdoor} scene` → each batch image gets different random combinations.

## Local Img2Img
When using the Local provider, you can upload a reference image to perform Image-to-Image generation:
- **A1111**: The extension handles switching between `/txt2img` and `/img2img` endpoints automatically.
- **ComfyUI**: Upload a reference image and set Denoise < 1.0. The extension automatically builds an img2img workflow (no custom JSON needed).

## ComfyUI Setup (Friendly Step-by-Step)

If this is your first time connecting QIG to ComfyUI, follow this quick path:

### 1) Start ComfyUI with CORS enabled
QIG runs inside SillyTavern's browser context, so ComfyUI must allow cross-origin requests.

```bash
python main.py --enable-cors-header
```

If you start ComfyUI with a launcher/shortcut, add `--enable-cors-header` to its launch arguments.

### 2) Set QIG to Local + ComfyUI
In the extension:
- **Provider**: `Local`
- **Local Type**: `ComfyUI`
- **URL**: `http://127.0.0.1:8188` (or your custom host/port)

### 3) Paste an API-format workflow
In ComfyUI, open your workflow and use **Save (API Format)**. Paste that JSON into QIG's **Custom Workflow** box.

Tip: UI-exported workflow JSON is not always the same as API-format JSON. Use the API format specifically.

### 4) Set checkpoint/model fields
If your workflow uses `%model%`, set **Checkpoint Name** to the exact checkpoint filename from ComfyUI (including extension, e.g. `myModel.safetensors`).

### 5) Run a first test
Use a short prompt with a small size (for example `512x512`) and click **Generate**. Once this works, tune steps, CFG, and the workflow.

### Common connection issues
- **403 Forbidden**: ComfyUI was started without `--enable-cors-header`, or ComfyUI-Manager's security check is blocking cross-origin requests. If you have ComfyUI-Manager installed, go to its settings and set **Security Level** to `normal`, then restart ComfyUI.
- **Connection error/timeouts**: wrong URL/port or ComfyUI not running
- **No image output**: workflow is not API format or is missing expected output wiring

### ComfyUI Settings
| Setting | Description |
|---------|-------------|
| **Checkpoint Name** | Select from available checkpoints (fetched from server) or type manually |
| **Denoise** | Denoising strength (0-1, default 1.0). Set < 1.0 with a reference image for img2img |
| **CLIP Skip** | Skip last N CLIP layers (1-12, default 1) |
| **Scheduler** | Sampling scheduler (normal, karras, exponential, sgm_uniform, simple, ddim_uniform, beta) |
| **Upscale** | Enable model-based upscaling after generation (RealESRGAN, etc.) |
| **Custom Workflow** | Paste workflow JSON from ComfyUI "Save (API Format)" |

### Workflow Placeholders
Use these placeholders in custom workflows:
- `%prompt%` - Positive prompt
- `%negative%` - Negative prompt
- `%seed%`, `%width%`, `%height%`, `%steps%`, `%cfg%`
- `%denoise%`, `%clip_skip%`, `%sampler%`, `%scheduler%`, `%model%`

Custom Workflow JSON is optional for standard SD1.5/SDXL checkpoints, but required for non-standard pipelines (for example Flux/UNET-only, dual-CLIP, or custom node graphs).

### A1111 Settings
| Setting | Description |
|---------|-------------|
| **LoRAs** | Comma-separated LoRAs in `name:weight` format (e.g., `add_detail:0.7, my_lora:0.8`) |
| **CLIP Skip** | Skip last N CLIP layers (1-12, default 1) |
| **Scheduler** | Sampling scheduler (Automatic, Karras, Exponential, SGM Uniform, etc.) — requires A1111 1.6+ |
| **VAE** | Select VAE model (Automatic = use model's built-in VAE) |
| **Restore Faces** | Enable built-in face restoration postprocessing |
| **Tiling** | Enable seamless tiling mode for texture generation |
| **Variation Seed** | Subseed for controlled variation (-1 = random) |
| **Variation Strength** | How much the variation seed influences the output (0 = none, 1 = full) |
| **Hires Fix** | Enable upscaling via Hires Fix (txt2img only) |
| **Hires Upscaler** | Upscaling algorithm (Latent, R-ESRGAN, etc. — populated from A1111 API) |
| **Hires Scale** | Upscale factor (1-4, default 2) |
| **Hires 2nd Pass Steps** | Sampling steps for upscale pass (0 = same as first pass) |
| **Hires Denoise** | Denoising strength for upscale pass (0-1, default 0.55) |
| **Hires Sampler** | Separate sampler for upscale pass (empty = same as first pass) |
| **Hires Scheduler** | Separate scheduler for upscale pass (empty = same as first pass) |
| **Hires Resize W/H** | Target resolution for upscale (0 = use scale factor instead) |
| **Hires Prompt/Negative** | Override prompt/negative for upscale pass (empty = use main) |
| **ADetailer** | Enable face/hand fix using ADetailer extension |
| **ADetailer Model** | Detection model (face_yolov8n, hand_yolov8n, person_yolov8n, mediapipe) |
| **ADetailer Prompt/Negative** | Custom prompt for inpainting (empty = use main prompt) |
| **ADetailer Denoise** | Denoising strength for inpainting (default 0.4) |
| **ADetailer Confidence** | Minimum detection confidence (default 0.3) |
| **ADetailer Mask Blur** | Blur radius for inpainting mask (default 4) |
| **ADetailer Dilate/Erode** | Expand or shrink detection mask (default 4) |
| **ADetailer Inpaint Padding** | Padding around detected region (default 32) |
| **ADetailer Unit 2** | Second independent ADetailer unit (e.g., hands while unit 1 handles faces) |
| **ControlNet** | Generic ControlNet with preprocessor selection, weight, guidance range, pixel perfect, and image upload |
| **Save to WebUI** | Save generated images to WebUI's output folder using its configured paths, naming, and per-model subfolders |
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

Lorebook-style keyword triggers that automatically inject positive/negative prompt additions when trigger words appear in the scene text. Useful for character-specific LoRAs, multi-character scenarios, and franchise RPG cards. For exact token replacement/substitution, use **Prompt Replacement Maps** below.

### How It Works

Each filter has:
- **Keywords** (comma-separated) — scanned against the current scene/message text
- **Match Mode** — `OR` (any keyword triggers), `AND` (all keywords required), or `LLM` (AI concept recognition)
- **Positive/Negative Prompt** — appended to the generation prompts when triggered
- **Remove From Positive/Negative** — optional comma-separated tokens to remove before appending (for conflict cleanup)
- **Priority** — higher-priority AND filters suppress lower-priority OR filters whose keywords are a subset
- **Scope** — `Global` (applies in all chats) or `Character` (applies only when chatting with a specific character)
- **Pools** — one filter can belong to multiple pools for bulk on/off control

Filter execution order is:
1. Apply removals (`Remove From Positive/Negative`)
2. Append `Positive/Negative Prompt`

For LoRA tags, removal is **name-based** (weight-insensitive). Example: removing `<lora:foo>` removes `<lora:foo:0.6>` and `<lora:foo:1.0>`.

### Character-Specific Filters

Filters can be scoped to a specific character. When creating or editing a filter, the **Scope** dropdown lets you choose:
- **Global (all characters)** — the filter applies everywhere (default, backward-compatible)
- **This Character** — the filter only activates when chatting with the current character

The filter list groups filters by scope with colored badges: blue **G** for global, green **C** for character-specific. A **⧉** duplicate button lets you quickly copy a filter between scopes (e.g., promote a character filter to global or create a character-specific copy of a global filter). Filters for other characters are hidden but counted.

When clearing filters with a character active, you can choose to clear all filters, only global filters, or only the current character's filters.

### Filter Pools (Bulk Toggle)

Pools let you organize large filter libraries (for example: goblin pack, sci-fi pack, superhero pack) and enable/disable them in one click.

- **Global pools** apply across all chats
- **Character pools** apply only to the active character
- Filters can belong to multiple pools
- A filter is active only when both conditions are true:
  - the filter checkbox is enabled
  - at least one of its pools is enabled in the current context

Migration note: existing filters are automatically assigned to a global **Default** pool so behavior stays unchanged after updating.

### LLM Concept Matching

The `LLM` match mode replaces keyword matching with AI-based concept recognition. Instead of keywords, you write a **concept description** in plain language, and an LLM decides whether the current scene matches.

This solves the problem where concept LoRAs have trigger words (like `<lora:cyberpunk_v2:0.8>`) that never appear naturally in AI messages. With LLM matching, the filter activates based on *meaning* rather than literal keywords.

**Example:** Create an LLM filter with:
- **Name**: Cyberpunk Aesthetic
- **Description**: "Scenes with a cyberpunk or futuristic urban aesthetic — neon lights, holograms, high-tech cityscapes"
- **Positive**: `<lora:cyberpunk_v2:0.8>, neon, cyberpunk`

When the AI writes about a "neon-drenched megacity with holographic billboards," the LLM recognizes this as cyberpunk even though the word "cyberpunk" never appeared.

All LLM-type filters are evaluated in a single API call (not one per filter) for efficiency. If an LLM Override endpoint is configured, concept matching uses that; otherwise it falls back to the chat AI.

### Example: Multi-Character LoRAs

1. Create an OR filter: keyword `goku`, positive `1boy, goku, <lora:goku:0.8>`, priority 5
2. Create an OR filter: keyword `vegeta`, positive `1boy, vegeta, <lora:vegeta:0.8>`, priority 5
3. Create an AND filter: keywords `goku, vegeta`, positive `2boys, goku, vegeta, <lora:goku_vegeta:0.8>`, priority 10

When a message mentions only "goku", only the goku filter fires. When both "goku" and "vegeta" appear, the AND filter fires and suppresses the individual OR filters — preventing conflicting LoRAs from stacking.

Contextual filters apply in both **Direct Mode** and **Inject Mode** generation flows.

Filters are included in settings export/import and can be saved inside generation presets.

---

## Prompt Replacement Maps

Prompt Replacement Maps provide native token-level substitutions for prompt tags/text. This is useful for character aliases like:

- Trigger: `miranda`
- Replacement: `<lora:miranda_v2:0.8>, 1girl, miranda, detailed face`

### How It Works

Each map has:

- **Trigger Tokens** (comma-separated) — exact match against comma-separated prompt tokens
- **Replacement Text** — appended after matching trigger tokens are removed
- **Target Field** — `Positive`, `Negative`, or `Both`
- **Priority** — higher priority runs first
- **Scope** — `Global` or `This Character`

Execution behavior:

1. Maps run after contextual filters (including LLM concept filters)
2. Matching tokens are removed from the targeted prompt field
3. Replacement text is appended
4. A trigger token can only be claimed once per pass (by the highest-priority eligible map)

Additional notes:

- LoRA trigger matching is **name-based** and weight-insensitive (`<lora:foo>` matches `<lora:foo:0.6>`)
- Character-scoped maps are keyed to SillyTavern `characterId`
- Maps are included in settings export/import and generation presets

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

1. **Injection**: A system prompt is injected into the chat completion telling the AI to use `<image>description</image>` or `<pic prompt="description">` tags for visual moments
2. **Extraction**: When the AI responds, QIG scans for image tags using a configurable regex
3. **Generation**: Each extracted prompt is run through the full pipeline (style → quality → ST Style → contextual filters [remove + append] → prompt replacement maps → provider)
4. **Cleanup**: Tags are optionally removed from the displayed message

### Settings

| Setting | Description |
|---------|-------------|
| **Enable inject mode** | Master toggle |
| **Inject prompt template** | The instruction injected into chat completion. Supports `{{char}}`, `{{user}}` |
| **Extraction regex** | Regex with capture groups for the image prompt. Default matches both `<pic prompt="...">` and `<image>...</image>` |
| **Injection position** | Where to inject: After Scenario, In User Message, or At Depth |
| **Depth** | Depth from end of prompt array (when using At Depth) |
| **Tag handling** | Replace tag with image, insert after message, or create new message |
| **Auto-clean** | Remove image tags from the displayed message |

### Why use this?

The RP AI naturally describes what's happening in the scene, so its image tag prompts tend to be more contextually accurate than a separate LLM call analyzing the scene after the fact. This is especially useful for immersive RP where you want images to appear organically as the story unfolds.

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

## Credits

- **Veda** — ComfyUI Proxy method

## License

MIT
