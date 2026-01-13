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
- 🖼️ **40+ Style Presets** - Anime, Realistic, Cyberpunk, Ghibli, etc.
- 🤖 **LLM Prompt Generation** - Auto-convert scenes to image prompts
- 🏷️ **Two Prompt Styles** - Danbooru tags or natural descriptions
- ✨ **Quality Tags** - Auto-prepend quality boosters
- 📍 **Message Selector** - Choose which chat message to use
- 🔢 **Batch Count** - Generate multiple images per button press (1-10)
- 🎨 **Skin Tone Reinforcement** - Auto-detects and reinforces skin tones from character descriptions

### Gallery & Session
- 🖼️ **Session Gallery** - View all images generated this session
- 🔄 **Quick Regenerate** - Same prompt, new seed
- ⚡ **Auto-generate** - Generate after each AI response
- 💾 **Prompt Templates** - Save/load favorite prompts
- 👤 **Character Settings** - Save settings per character

### Reverse Proxy Features
- 🖼️ **Reference Images** - Upload up to 15 reference images
- 📝 **Extra Instructions** - Additional text instructions for the model
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

## Settings

| Setting | Description |
|---------|-------------|
| **Provider** | Image generation backend |
| **Style** | Visual style preset (40+ options) |
| **Prompt** | Base prompt with `{{char}}` and `{{user}}` placeholders |
| **Negative Prompt** | What to avoid in generation |
| **Quality Tags** | Tags prepended to prompt |
| **Use chat message** | Use last chat message as prompt |
| **Use LLM** | Have LLM convert scene to image prompt |
| **Batch Count** | Number of images to generate (1-10) |
| **Size** | Image dimensions |
| **Auto-generate** | Generate after each AI response |

---

## Buttons

| Button | Function |
|--------|----------|
| 🎨 Generate | Generate image(s) |
| 📋 Logs | View generation logs |
| 💾 Save for Char | Save settings for current character |
| 💾 Save Template | Save current prompt as template |
| 🔄 Regenerate | Same prompt, new seed |
| 🖼️ Gallery | View session images |

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
