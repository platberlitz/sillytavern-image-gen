# Quick Image Gen - SillyTavern Extension

## TL;DR
One-click image generation for SillyTavern with 13 providers, 40+ styles, LLM prompt generation, connection profiles, generation presets, contextual filters, auto-insert, gallery, prompt history, PNG metadata, and settings export/import.

Prompt Replacement Maps and Prompt Templates have been removed. Old prompt replacement data is migrated into Contextual Filters on load when possible.

**Install:** Extensions -> Install from URL -> `https://github.com/platberlitz/sillytavern-image-gen`

## What's New in v2.0.1
- Fixed inject auto-insert targeting so auto-generated images attach to the latest relevant AI message instead of getting stuck on the greeting/first message.
- Added `Xiaolong` to the Pollinations model suggestions.
- Added current Pollinations paid support with optional API key entry and safer authenticated generation for paid models.
- Pollinations model selection now accepts typed custom model IDs instead of being limited to a small hardcoded dropdown.

## Features

### Providers
- Pollinations
- NovelAI
- ArliAI
- NanoGPT
- Chutes
- CivitAI
- Nanobanana/Gemini
- Stability AI
- Replicate
- Fal.ai
- Together AI
- Local (A1111 / ComfyUI)
- Reverse Proxy

### Generation
- 40+ style presets
- Manual prompt generation
- Message-based scene selection
- LLM prompt generation with optional prompt editing
- Prompt wildcards
- Batch generation with sequential seeds
- ST Style panel integration
- Contextual Filters with keyword or LLM concept matching
- Optional per-filter seed overrides
- Automatic inject mode using AI-written image tags

### Workflow
- Connection Profiles
- Generation Presets
- Comfy Workflow Presets
- Character settings
- Per-character reference images
- Export / import settings

### Output
- Gallery
- Prompt History
- Auto-insert into chat
- Inline data URL or `image_url` insertion
- Save to ST server
- PNG metadata embedding and metadata round-trip

## Quick Start

1. Open the QIG panel in SillyTavern.
2. Pick a provider.
3. Enter a prompt or enable `Use chat message`.
4. Click `Generate`.
5. Optionally save the setup as a preset or profile.

## Settings Overview

### Prompt & Presets
- `Prompt`: Base prompt with `{{char}}` and `{{user}}` placeholders.
- `Negative Prompt`: What to avoid.
- `Quality Tags`: Optional tags prepended to prompts.
- `Use chat message`: Use selected chat messages as scene context.
- `Use LLM to create image prompt`: Have the chat model rewrite the scene into an image prompt.
- `Save Preset`: Save the full generation setup.
- `Export` / `Import`: Move settings between installs.

### Contextual Filters
Contextual Filters are now the only native prompt-transformation system.

They support:
- Keyword matching with `OR` / `AND`
- LLM concept matching
- Positive and negative prompt additions
- Removal of conflicting tokens before append
- Global, card-only, and character scope
- Filter pools for bulk enable/disable
- Seed overrides

Legacy Prompt Replacement Maps are migrated into Contextual Filters as best-effort removal-plus-append rules.

### Auto Generation
- `Auto-generate after AI response`: Generate after assistant replies.
- `Confirm before generating`: Ask before manual generation.
- `Auto-insert`: Insert generated images directly into chat.

### Inject
Inject is now auto-only.

When both `Use AI-written image tags for auto-generation` and `Auto-generate after AI response` are enabled, QIG:

1. Injects instructions into chat completion.
2. Reads paired image tags from AI replies.
3. Generates images from those extracted prompts.
4. Optionally removes the tags from stored/displayed messages.

Supported tag formats:
- Custom paired tag, default `<image>...</image>`
- Legacy `<pic prompt="...">`

Available inject settings:
- Tag name
- Inject prompt template
- Extraction regex
- Injection position
- Tag handling
- Auto-clean
- Test Inject Detection

The palette button always runs a normal generation now. There is no manual inject palette mode.

## Presets And Profiles

### Connection Profiles
Profiles store provider-specific connection settings such as API keys, model IDs, URLs, and related provider options.

### Generation Presets
Presets store the broader generation setup, including prompt fields, size, provider settings, contextual filters, and inject configuration.

## Migration Notes

- Old Prompt Replacement Maps are migrated into Contextual Filters on load, preset import, and settings import when possible.
- Old Prompt Templates are not converted. Their storage is ignored and cleaned up.
- Exported settings no longer include templates or prompt replacement maps.

## Gallery And History

- `Gallery` keeps generated images available across sessions.
- `Prompts` keeps recent prompt history for reuse and inspection.
- `Logs` shows generation and provider diagnostics.

## ComfyUI Notes

For ComfyUI:
- Start ComfyUI with CORS enabled.
- Use API-format workflow JSON for custom workflows.
- Use `%reference_image%` in custom workflows when needed.

## Credits

- Veda - ComfyUI Proxy method

## License

MIT
