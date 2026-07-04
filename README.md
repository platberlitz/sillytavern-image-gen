# Quick Image Gen

Image generation in SillyTavern. 17 backends, 44 style presets, three LLM prompt modes, a two-step chat-scene prompt pipeline, contextual filters, batch generation, and auto-insert.

```
Extensions -> Install from URL -> https://github.com/platberlitz/sillytavern-image-gen
```

Requires SillyTavern 1.12+ (extension manifest v2). Browser-only for most providers; CivitAI and Replicate users running `basicAuthMode: true` need the optional [server plugin](#server-plugin).

## Providers

| ID | Name | API Key |
| --- | --- | --- |
| `pollinations` | Pollinations (Free + Paid) | No |
| `novelai` | NovelAI | Yes |
| `gptimage` | GPT Image (OpenAI) | Yes |
| `arliai` | ArliAI | Yes |
| `routeway` | Routeway | Yes |
| `navy` | Navy.ai | Yes |
| `nanogpt` | NanoGPT | Yes |
| `chutes` | Chutes | Yes |
| `civitai` | CivitAI | Yes |
| `nanobanana` | Nanobanana (Gemini) | Yes |
| `stability` | Stability AI | Yes |
| `replicate` | Replicate | Yes |
| `fal` | Fal.ai | Yes |
| `together` | Together AI | Yes |
| `zai` | Z.AI | Yes |
| `local` | Local (A1111 / ComfyUI) | No |
| `proxy` | Reverse Proxy (OpenAI-compatible) | No |

Store keys in SillyTavern's Secrets when available. Provider settings live under Connection Profiles.

### Provider notes

- **Pollinations**: Free by default (`flux`). Paid models include NanoBanana variants, Grok, Pruna, Nova Canvas, Seedream, Wan, and GPT Image 1/1.5. Some paid models require Pollinations auth.
- **NovelAI**: Default model `nai-diffusion-4-5-curated`. Resolution presets available. Supports proxy URL/key overrides.
- **GPT Image**: Default `gpt-image-2`. Quality, output format, background, and moderation controls are configurable.
- **Nanobanana (Gemini)**: Four models ranging from Gemini 2.0 Flash Exp through Nano Banana Pro (Gemini 3 Pro Image). NBP mode adds optional director presets and negative guidance.
- **Navy.ai / Routeway**: Model ID suggestions with custom model support. Base64 image responses.
- **Z.AI**: Default `cogview-4`. HD quality default.
- **Reverse Proxy**: See [Reverse Proxy](#reverse-proxy) below.

## Quick Start

1. Open the QIG panel in SillyTavern.
2. Pick a provider and enter credentials if needed.
3. Type a prompt or enable `Use chat message` to pull context from the current chat.
4. Click `Generate` (or press `Ctrl+Enter`; the shortcut is configurable in settings).
5. Save the setup as a [preset or profile](#presets-and-profiles) once it works.

## Generation Workflows

### Direct generation

Type a prompt in the prompt field and click Generate. The prompt field supports `{{char}}` and `{{user}}` placeholders.

### Plain description

Type a natural-language image idea in the Plain Description field. QIG asks your connected Text AI to convert it into an image prompt, then generates from that result. The main prompt field stays untouched.

### Chat-scene generation

Enable `Use chat message` to pull text from the current chat as scene context. Then optionally enable `Use LLM to create image prompt` to have your Text AI rewrite that context into a style-appropriate prompt before sending it to the image provider.

When `Use chat message` and the LLM prompt toggle are both on, and `Use two-step prompt pipeline for chat scenes` is enabled in the Auto Generation section, QIG runs two passes:

1. Ask the Text AI for a plain visual scene description drawn from the selected chat range.
2. Ask the Text AI to convert that description into the selected prompt style.

An optional `Two-step custom instruction` field lets you direct the second pass.

### Batch generation

Set batch count (1 through 10) to generate multiple variants from the same prompt. Enable `Sequential seeds` to increment the seed between each image. The batch viewer shows thumbnails, per-image prompt editing, prev/next navigation, and bulk or single insert.

### Auto-generation

Enable `Auto-generate after AI response` to trigger generation automatically after each assistant reply.

- **Every AI replies** (1 to 100, default 1): only fire after every N eligible assistant replies. Set to `1` to fire on every reply.
- **Delay (ms)** (0 to 60000, default 500): wait this long after the triggering reply before generating.

`Auto-set generated image as chat background` applies the first result as the current chat background. Temporary mode changes the live background only. Locked-to-chat mode stores it in chat metadata.

## Prompt System

### LLM prompt styles

When `Use LLM to create image prompt` is enabled, your Text AI rewrites the chat context into an image prompt using one of three styles:

- **Tags (Danbooru)**: tag-list format (`1girl, long hair, blue eyes, ...`).
- **Natural (Description)**: prose description.
- **Custom instruction**: your own system prompt directs the conversion.

### Style presets

44 built-in styles. Each wraps your prompt in a prefix and suffix.

| Style | ID | Style | ID |
| --- | --- | --- | --- |
| None | `none` | Ghibli | `ghibli` |
| Anime | `anime` | Ukiyo-e | `ukiyoe` |
| Photorealistic | `photorealistic` | Art Nouveau | `artnouveau` |
| Digital Art | `digitalart` | Art Deco | `artdeco` |
| Oil Painting | `oilpainting` | Impressionist | `impressionist` |
| Watercolor | `watercolor` | Surrealist | `surrealist` |
| Pencil Sketch | `pencilsketch` | Pop Art | `popart` |
| Ink Drawing | `inkdrawing` | Minimalist | `minimalist` |
| Pixel Art | `pixelart` | Gothic | `gothic` |
| 3D Render | `render3d` | Steampunk | `steampunk` |
| Cyberpunk | `cyberpunk` | Vaporwave | `vaporwave` |
| Fantasy | `fantasy` | Low Poly | `lowpoly` |
| Comic Book | `comicbook` | Isometric | `isometric` |
| Manga | `manga` | Stained Glass | `stainedglass` |
| Chibi | `chibi` | Graffiti | `graffiti` |
| Dark Fantasy | `darkfantasy` | Charcoal | `charcoal` |
| Moe Anime | `moeanime` | Pastel | `pastel` |
| 90s Anime | `retroanime` | Film Noir | `filmnoir` |
| Vintage Photo | `vintagephoto` | Polaroid | `polaroid` |
| Cinematic | `cinematic` | Portrait | `portrait` |
| Landscape | `landscape` | Macro | `macro` |
| Abstract | `abstract` | Psychedelic | `psychedelic` |

### Quality tags

Prepended to every prompt when `Append quality tags to prompt` is on. Default: `masterpiece, best quality, highly detailed, sharp focus, 8k`.

### Wildcards

Use `__wildcard_name__` in the prompt field or contextual filter fields. QIG reads matching files from `data/default-user/User Files/wildcards/`. Each file contains one option per line; one line is selected at random on each generation.

### NBP Director (Nanobanana/Gemini only)

When NBP mode is enabled on the Nanobanana provider, QIG prepends director instructions to the prompt. Four presets are available:

- **house** (TLD House Anime): anime-style director prompt covering face, skin, hair, clothing, legwear, feet, toenails, and anatomical accuracy.
- **preservation** (Reference Preservation): localized edit preset that anchors on the source image and repairs only the requested region.
- **structural** (Anatomy Repair): corrects visible limb and digit count errors.
- **custom**: your own director text.

An optional `Scene-specific house direction` field adds per-scene instructions on top of the preset. `Negative guidance` (default on) appends a fixed negative list covering oily skin, extra digits, and other common defects.

## Inject Mode

Inject is auto-only. When `Use AI-written image tags for auto-generation` and `Auto-generate after AI response` are both on:

1. QIG injects instructions asking your Text AI to emit image tags inside chat replies.
2. QIG extracts those tags from the AI reply.
3. QIG generates images from the extracted prompts.
4. Optionally removes the tags from the stored message (`Auto-clean`).

Supported tag formats:

- `<image>prompt text</image>` (tag name configurable, default `image`)
- `<pic prompt="prompt text">` (legacy)

Inject settings: tag name, inject prompt template, extraction regex, injection position (`afterScenario`), tag handling, auto-clean. `Test Inject Detection` checks current chat messages for extractable tags without generating.

## Local Generation (A1111 / ComfyUI)

### A1111

Select `Local (A1111/ComfyUI)` as provider and set Local Type to `A1111`. Enter your WebUI URL (must be running with `--api` flag and CORS headers).

Extra controls:

- **ADetailer**: two slots (face and hand models, prompt, denoise, weight, pixel perfect, resize mode)
- **Hires Fix**: upscaler, scale, steps, denoise, sampler, scheduler, prompt, negative prompt, resize mode
- **IP-Adapter**: FaceID portrait mode, weight, pixel perfect, resize mode, control mode, start/end step
- **ControlNet**: model, module, weight, resize mode, control mode, pixel perfect, guidance start/end, control image
- **Other**: VAE, CLIP skip, scheduler, Restore Faces, Tiling, subseed, subseed strength, save to WebUI

### ComfyUI

Set Local Type to `ComfyUI`. Start ComfyUI with CORS enabled and note the API port.

QIG drives ComfyUI through the `/prompt` API with the workflow you paste into `Custom Workflow JSON`. Use ComfyUI's `Save (API Format)` export to produce the JSON.

Workflow variables: see [`docs/comfyui-workflow-variables.md`](docs/comfyui-workflow-variables.md) for the full placeholder table and typed-value behavior.

Extra controls:

- **CLIP skip**, **denoise**, **scheduler**, **timeout**
- **Upscale model**
- **LoRAs** (comma-separated `name:weight` pairs)
- **Flux support**: skip negative prompt, two CLIP models, VAE model, CLIP type
- **Workflow presets**: save and load custom workflow JSON configs

## Reverse Proxy

Select `Reverse Proxy (OpenAI-compatible)` as provider. Enter your proxy base URL (for example `https://proxy.example/v1`) and optional API key.

### Endpoint mode

Controls which API path QIG calls:

- **auto** (default): infer from the URL. Use this unless you know your proxy requires a specific endpoint.
- **chat_completions**: always POST to `chat/completions`.
- **images_generations**: always POST to `images/generations`.

### Payload mode

- **extended** (default): sends `width`, `height`, `steps`, `cfg_scale`, `sampler`, `seed`, `negative_prompt`, `loras`, and `facefix` alongside the standard OpenAI fields.
- **openai_strict**: sends only the standard OpenAI image request body.

### Reference images

- **auto** (default): inline non-public URLs to base64 when reachable, otherwise pass URLs directly.
- **url_only**: only pass public `https://` URLs. Reject local or uploaded images.
- **inline_or_url**: always inline non-public URLs, accept everything else.

### SSE

- **auto** (default): enabled when payload mode is `extended`, off for `openai_strict`.
- **on** / **off**: force a specific behavior.

### New-API Chat Image mode

Enable this for proxies that expose image generation through `chat/completions` instead of the normal `/images/generations` route.

`Apply Chat Image Defaults` configures:

- route to `chat/completions`
- OpenAI Strict payload
- inline-or-URL reference images
- SSE off
- latest chat message as instruction
- auto-insert as a new assistant message (source message stays unchanged)

Chat Image settings:

- **Personality / System Prompt**: sent before the user instruction. Default tells the model to behave as a visual image generation assistant.
- **Append active chat character and persona context**: off by default for cleaner calls. Turn on when the image model should preserve character card, persona, or outfit details.
- **Max Tokens**: defaults to 16384. Range: 1 to 65536.
- **Permit /images/generations routing**: off by default. When off, QIG forces `chat/completions`. Turn on only for proxy stacks where `auto` should still choose `/images/generations`.

## Slash Commands

| Command | Arguments | Description |
| --- | --- | --- |
| `/qig` | `mode=direct\|palette\|inject`, trailing text as one-off prompt | Generate from current settings. Trailing text overrides the prompt for this run only. |
| `/qig-auto` | `state=on\|off\|toggle`, `every=N`, `delay=ms` | Show current auto-gen state or change it. `/qig-auto` alone prints current state. |
| `/qig-cancel` | (none) | Cancel the active generation request. |

These work from Quick Replies. Example QR: `/qig mode=direct a close-up portrait`.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Enter` (default, configurable in settings) | Generate (runs configured palette generation) |
| `Ctrl+Shift+G` | Open gallery |
| `Ctrl+Shift+H` | Open prompt history |

Shortcuts are disabled when focus is on an `input`, `textarea`, `select`, or `contenteditable` element.

## Contextual Filters

The only native prompt-transformation system. Filters match conditions against the current chat scene and modify the prompt before generation.

### Match modes

- **Keyword OR**: any keyword in the list matches.
- **Keyword AND**: all keywords must match.
- **LLM concept**: ask the Text AI whether a concept is present in the scene.

### Filter fields

- **Name**: display label.
- **Keywords**: comma-separated keyword list.
- **Description**: shown in the filter manager.
- **Positive**: tokens appended to the prompt on match.
- **Negative**: tokens appended to the negative prompt on match.
- **Remove positive / Remove negative**: tokens stripped before append. `remove` mode deletes exact tokens.
- **Priority**: higher-priority filters run first.
- **Seed override**: lock the seed when this filter fires.

### Scope

- **global**: applies to all generations.
- **card**: applies only to the current card (tied to card key).
- **character**: applies only to a specific character (tied to character ID).

### Filter pools

Group filters into pools, then enable or disable pools separately for global, card, and character scope. Pools support bulk toggle without touching individual filter state.

Import and export are supported from the Contextual Filters manager popup.

**Note**: Legacy Prompt Replacement Maps are migrated into Contextual Filters on load. Old Prompt Templates are ignored and cleaned up.

## Gallery and History

- **Gallery**: stored in `qig_gallery` (localStorage). Grid view, URL import, insert-to-chat.
- **Prompt History**: stored in `qig_prompt_history` (localStorage). Reuse past prompts. Clear all option.
- **Logs**: generation and provider diagnostics shown in the QIG panel.

## Backgrounds

Set a generated image as the current chat's SillyTavern background. Two modes:

- **Temporary**: changes the live background for the current view only. Disappears on page reload.
- **Locked to chat**: stores the background in chat metadata. Persists across sessions for that specific chat.

Trigger backgrounds manually from the batch viewer, or automatically with `Auto-set generated image as chat background` in Auto Generation settings.

## Output Modes

- **inline**: embed the image as a base64 data URL in the chat message.
- **image_url**: insert the remote URL directly.

Auto-insert target (when `Auto-insert` is on):

- **assistant**: insert into the latest AI/non-user message (default).
- **user**: insert into the latest user message.
- **latest**: insert into the most recent chat message regardless of sender.

Manual insert target: same options, applied when using Insert from the result popup.

## Presets and Profiles

### Connection Profiles

Store provider connection settings (API keys, model IDs, URLs, provider-specific options). Swap between providers without re-entering credentials.

### Generation Presets

Store the full generation setup: prompt fields, size, steps, CFG, sampler, provider settings, contextual filters, and inject configuration. Save, load, delete, import, and export.

Active preset is highlighted in the preset chip UI.

## Server Plugin

SillyTavern's built-in CORS proxy is blocked by `basicAuthMode` when a provider request also needs its own `Authorization` header. This affects CivitAI and Replicate in browser-only mode.

The optional `server-plugin/` directory relays only the CivitAI consumer-jobs endpoint and Replicate predictions endpoints used by this extension.

Setup:

1. Copy `server-plugin/` to your SillyTavern install as `plugins/quick-image-gen-relay/`.
2. Set `enableServerPlugins: true` in SillyTavern `config.yaml`.
3. Restart SillyTavern.
4. Open `/api/plugins/quick-image-gen-relay/healthz` while logged in. A blank response with HTTP 204 means the plugin is loaded.

SillyTavern server plugins are not sandboxed. Only install server plugins from developers you trust. This plugin does not accept arbitrary target URLs and does not store or log provider API keys.

## Migration Notes

- Legacy Prompt Replacement Maps are migrated into Contextual Filters on settings load, preset import, and settings import.
- Legacy Prompt Templates are ignored and cleaned up.
- Exported settings no longer include templates or prompt replacement maps.

## Credits

- Veda: ComfyUI Proxy method

## License

MIT
