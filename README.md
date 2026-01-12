# Quick Image Gen - SillyTavern Extension

One-click image generation for SillyTavern with multiple provider support. Images are displayed in a popup and **never added to chat context** - zero token usage.

## Supported Providers

- **Pollinations** - Free, no API key required
- **NovelAI** - Requires subscription/API key
- **ArliAI** - Requires API key
- **Local (A1111/ComfyUI)** - For locally hosted Stable Diffusion
- **Reverse Proxy** - OpenAI-compatible endpoints (Google Imagen via nanobanana, etc.)

## Art Styles

Built-in style presets that automatically add appropriate tags:
- None, Anime, Cartoon, Realistic, Semi-Realistic, Oil Painting, Watercolor, Pixel Art, Sketch

## Installation

### Via SillyTavern (Recommended)
1. Open SillyTavern
2. Go to **Extensions** panel (puzzle piece icon)
3. Click **Install Extension**
4. Paste: `https://github.com/platberlitz/sillytavern-image-gen`
5. Click **Save**

### Via Git
```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/platberlitz/sillytavern-image-gen.git
```

### Manual
1. Download/clone this repository
2. Copy to `SillyTavern/public/scripts/extensions/third-party/sillytavern-image-gen`
3. Restart SillyTavern

## Configuration

Open the **Quick Image Gen** panel in Extensions settings.

### Common Settings
- **Prompt** - Use `{{char}}` and `{{user}}` placeholders
- **Negative Prompt** - What to avoid in generation
- **Width/Height** - Image dimensions (256-2048)

### Advanced Settings (NovelAI/ArliAI)
- **Steps** - Generation steps (more = slower but potentially better)
- **CFG Scale** - How closely to follow the prompt
- **Sampler** - Sampling algorithm
- **Seed** - Use -1 for random, or set specific seed for reproducibility

### Provider-Specific

**NovelAI:**
- Get your API key from NovelAI account settings
- Models: `nai-diffusion-3`, `nai-diffusion-2`, etc.

**ArliAI:**
- Get API key from ArliAI dashboard
- Models: `arliai-realistic-v1`, etc.

**Reverse Proxy:**
- URL: Your proxy endpoint (e.g., `https://proxy.com/v1`)
- Model: Depends on proxy (e.g., `antigravity/gemini-3-pro-image-preview` for Google Imagen)

**Local (Automatic1111):**
- URL: `http://127.0.0.1:7860` (default)
- Make sure API is enabled: launch with `--api` flag

**Local (ComfyUI):**
- URL: `http://127.0.0.1:8188` (default ComfyUI port)
- Uses a basic txt2img workflow

## Usage

1. Configure your preferred provider and settings
2. Click **🎨 Generate**
3. Image appears in popup overlay
4. Click **💾 Download** to save

## License

MIT
