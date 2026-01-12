# Quick Image Gen - SillyTavern Extension

One-click image generation for SillyTavern. Images appear in a popup and **never get added to chat** - zero tokens.

## Features

### Providers
- 🆓 **Pollinations** - Free, no API key
- 🎨 **NovelAI** - Premium anime (nai-diffusion-4-5-curated/full)
- 🤖 **ArliAI** - Affordable API
- ⚡ **NanoGPT** - Fast Flux models
- 🖥️ **Local** - A1111/ComfyUI
- 🔌 **Reverse Proxy** - PixAI, custom endpoints

### Generation
- 🖼️ **9 Style Presets** - Anime, Realistic, Cartoon, Oil Painting, etc.
- 🤖 **LLM Prompt Generation** - Auto-convert scenes to image prompts
- 🏷️ **Two Prompt Styles** - Danbooru tags or natural descriptions
- ✨ **Quality Tags** - Auto-prepend quality boosters
- 📍 **Message Selector** - Choose which chat message to use

### New Features
- 🖼️ **Session Gallery** - View all images generated this session
- 🔄 **Quick Regenerate** - Same prompt, new seed
- ⚡ **Auto-generate** - Generate after each AI response
- 💾 **Prompt Templates** - Save/load favorite prompts
- 👤 **Character Settings** - Save settings per character

### Reverse Proxy (PixAI)
- 🎭 **LoRA Support** - Multiple LoRAs with weights
- 👤 **Face Fix** - ADetailer
- ⚙️ **Full Control** - Steps, CFG, Sampler, Seed

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

## Buttons

| Button | Function |
|--------|----------|
| 🎨 Generate | Generate image |
| 📋 Logs | View generation logs |
| 💾 Save for Char | Save settings for current character |
| 💾 Save Template | Save current prompt as template |
| 🔄 Regenerate | Same prompt, new seed |
| 🖼️ Gallery | View session images |

---

## Related

- [PixAI Proxy](https://github.com/platberlitz/pixai-proxy) - Use PixAI with this extension

## License

MIT
