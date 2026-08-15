# Quick Image Gen

Image generation in SillyTavern. 18 backends plus configurable custom APIs, 44 style presets, three LLM prompt modes, a two-step chat-scene prompt pipeline, contextual filters, batch generation, and auto-insert.

```
Extensions -> Install from URL -> https://github.com/platberlitz/sillytavern-image-gen
```

Requires SillyTavern 1.14.0 or newer (extension manifest v3 and media-array support). Browser-only for most providers; CivitAI and Replicate users running `basicAuthMode: true` need the optional [server plugin](#server-plugin).

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
| `custom` | Custom API (JSON, multipart, async polling) | Optional |

Image-provider keys are stored in QIG extension settings and Connection Profiles. Treat browser/server profile storage as sensitive. This account data is not end-to-end encrypted by QIG. Settings exports omit credentials and private reference images by default. SillyTavern Secrets are used for supported Text AI override profiles.

QIG synchronizes active settings, Connection Profiles, generation presets, Comfy workflows, character overrides and references, Contextual Filters, filter pools, and Context Media through the current SillyTavern server user. Browser storage is only a local cache for those stores. Gallery images and prompt history remain local to each browser, are isolated by the current SillyTavern account, and do not follow you to another device. Runtime logs are session-local.

### Provider notes

- **Pollinations**: Free by default (`flux`). Paid models include NanoBanana variants, Grok, Pruna, Nova Canvas, Seedream, Wan, and GPT Image 1/1.5. Some paid models require Pollinations auth.
- **NovelAI**: Default model `nai-diffusion-4-5-curated`. Resolution presets available. Supports proxy URL/key overrides.
- **GPT Image**: Default `gpt-image-2`. Quality, output format, background, and moderation controls are configurable. A proxy URL ending in `/v1` expands to `/images/generations`; any other path is tried as the exact POST endpoint first. Comfy-style `/proxy/openai` namespaces that report a missing proxy route are retried once at `/proxy/openai/images/generations`.
- **Nanobanana (Gemini)**: Four models ranging from Gemini 2.0 Flash Exp through Nano Banana Pro (Gemini 3 Pro Image). NBP mode adds optional director presets and negative guidance. Native Gemini proxy bases use `generateContent`; full `/chat/completions` URLs use an OpenAI-compatible request body.
- **Navy.ai / Routeway**: Model ID suggestions with custom model support. Base64 image responses.
- **Z.AI**: Default `cogview-4-250304`. HD quality default.
- **Reverse Proxy**: See [Reverse Proxy](#reverse-proxy) below.
- **Custom API**: Browser-direct declarative requests for OpenAI-compatible endpoints, simple JSON REST, multipart uploads, and bounded async jobs. See [Custom API](#custom-api).

## Quick Start

1. Open the QIG panel in SillyTavern. On a fresh install a Quick Setup wizard opens: pick a provider, paste a key if needed, choose a style. Re-open it any time with the `Quick Setup` button.
2. Fresh installs also get three starter presets for free Pollinations models in the Preset dropdown.
3. Fresh installs default **Prompt source** to `Chat scene`, which pulls context from the current chat. Switch it to `Manual` to type your own prompt.
4. Click `Generate` (or press `Ctrl+Enter`; the shortcut is configurable in settings).
5. Save the generation setup as a [preset](#generation-presets). Save provider credentials and model configuration separately as a [connection profile](#connection-profiles).

The panel shows the essentials (preset, prompt, prompt source, style) up front. **More settings** follows the generation workflow: Image Provider & Output, Presets & Prompting, Context Rules & Media, then Automation & Delivery. Connection profiles still keep credentials and models separate from portable generation presets. A status line summarizes the active provider, model, size, and prompt source, and warns about incomplete configuration (missing API key, inactive pipelines).

### Prompt source

One selector controls where prompts come from:

- **Manual**: the prompt box is sent as-is (optional LLM rewrite still applies).
- **Chat scene**: the selected chat message(s) become the scene; message selection and LLM rewrite options apply.
- **AI-tagged (auto)**: inject mode. Your Text AI is instructed to emit image tags in replies and QIG generates from them. Selecting this keeps Auto-generate on and switches the palette button to inject mode.

## Generation Workflows

### Direct generation

Type a prompt in the prompt field and click Generate. The prompt field supports `{{char}}` and `{{user}}` placeholders.

### Plain description

Type a natural-language image idea in the Plain Description field. QIG asks your connected Text AI to convert it into an image prompt, then generates from that result. The main prompt field stays untouched.

### Chat-scene generation

Set **Prompt source** to `Chat scene` to pull text from the current chat as scene context. Then optionally enable `Use LLM to create image prompt` to have your Text AI rewrite that context into a style-appropriate prompt before sending it to the image provider.

When the Chat scene source and the LLM prompt toggle are both on, and `Use two-step prompt pipeline for chat scenes` is enabled (under the LLM rewrite options), QIG runs two passes:

1. Ask the Text AI for a plain visual scene description drawn from the selected chat range.
2. Ask the Text AI to convert that description into the selected prompt style.

An optional `Scene description instruction` field lets you direct the first pass. `Insert default` fills the editor with the built-in instruction so you can tweak it instead of writing one from scratch; `Reset` returns to the built-in adaptive default.

### Batch generation

Set batch count (1 through 10) to generate multiple variants from the same prompt. Enable `Sequential seeds` to increment the seed between each image. The batch viewer shows thumbnails, per-image prompt editing, prev/next navigation, and bulk or single insert.

### Auto-generation

Enable `Auto-generate after AI response` to trigger generation automatically after each assistant reply.

- **Generate every N AI replies** (1 to 100, default 1): only fire after every N eligible assistant replies. Set to `1` to fire on every reply.
- **Delay (seconds)** (0 to 60, default 0.5): wait this long after the triggering reply before generating.

`Auto-set generated image as chat background` applies the first result as the current chat background. Temporary mode changes the live background only. Locked-to-chat mode stores it in chat metadata.

## Prompt System

### LLM prompt styles

When `Use LLM to create image prompt` is enabled, your Text AI rewrites the chat context into an image prompt using one of three styles:

- **Tags (Danbooru)**: tag-list format (`1girl, long hair, blue eyes, ...`).
- **Natural (Description)**: prose description.
- **Custom instruction**: your own system prompt directs the conversion. `Insert Tags default` and `Insert Natural default` fill the editor with the exact built-in instruction text as a starting point; `Reset` clears the override so the built-in adaptive instruction is used again.

### Use-case guide

What each prompt option is for, with typical situations:

- **Prefill**: pre-writes the first words of the Text AI's reply so the model continues from them instead of starting fresh. Use it when your model wraps prompts in commentary ("Sure! Here's your image prompt: ..."), adds markdown fences, or drifts out of format. A prefill like `Image prompt:` or `1girl,` locks the output shape from the first token.
- **Tags style**: for booru-trained image models (NovelAI, Illustrious, Pony, most anime SD checkpoints). These respond to comma-separated tags and get worse results from full sentences.
- **Natural style**: for instruction-following image models (GPT Image, Nanobanana/Gemini, Flux, photorealistic SDXL merges). These do better with a written scene description than a tag list.
- **Custom instruction**: full control over the conversion — force a fixed camera angle, an art medium, a house tagging scheme, or a different output language. Start from an inserted default rather than a blank box.
- **Two-step prompt pipeline**: for long or dialogue-heavy chat scenes. Single-pass conversion sometimes echoes dialogue or fixates on a minor detail; the first pass distills the selected messages into one plain visual moment, and the second pass formats that moment into the selected style. Costs one extra Text AI call per generation. Direct the first pass with the `Scene description instruction`, for example "describe only the environment, not the characters".
- **Review before generating**: shows every request in an editable dialog before it is sent. The fastest way to learn what each toggle actually changes, and the recommended mode while tuning custom instructions or filters.
- **Preserve character identity**: keeps species, age, body traits, and canonical appearance requirements in the request. Turn it off when generating scenery or objects, or when identity enforcement fights a heavily stylized look.
- **Include matched World Info**: adds lore whose keywords appear in the selected scene (canonical outfits, locations, races) so the Text AI can use those details. Constant entries always insert; keyword entries insert when they match the scene text or recent messages.
- **Message range**: which chat messages form the scene. `-1` is the last message, `last3` the three newest, `5-9` a specific past moment you want illustrated, and `-1,3` a mix of both.
- **Quality / lighting / artist toggles**: append extra requirements that mostly help booru-style checkpoints. Leave them off for GPT Image or Gemini-class models, which follow the plain description on their own.

### Prompt review, identity, and World Info

- **Review before generating** opens a staged editor for prompt-building Text AI requests, intermediate scene summaries, LLM Contextual Filter classification, and the final positive/negative image prompt. The final stage is after QIG styles, quality tags, SillyTavern Style, and Contextual Filters, but before wildcard expansion and provider-specific wrappers. Final edits are authoritative; QIG does not reapply those transformations afterward.
- **Preserve character identity** controls QIG's added name, skin tone, species, age, body-trait, and canonical-appearance requirements. It defaults on for compatibility. Turning it off removes those enforcement rules; it does not remove the selected scene, character profile, or persona context used to create the prompt.
- **Include matched World Info in Text AI context** uses SillyTavern's active World Info match for the selected scene or explicit source text. Matched lore appears in the editable Text AI request and is not appended directly to the image-provider prompt. This option is off by default because private lore may be sent to the selected Text AI or override profile.

Cancel releases the QIG interface immediately and discards late results. QIG still requests provider-side cancellation where supported, but remote work may continue when a provider cannot cancel an accepted job. Cancelled and failed drafts are not added to prompt history.

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

Use inline choices such as `{day|night|sunset}` in prompt and negative-prompt fields. One option is selected at random for each generated image. File-based `__wildcard_name__` expansion is not currently supported by QIG.

### NBP Director (Nanobanana/Gemini only)

When NBP mode is enabled on the Nanobanana provider, QIG prepends director instructions to the prompt. Four presets are available:

- **house** (TLD House Anime): anime-style director prompt covering face, skin, hair, clothing, legwear, feet, toenails, and anatomical accuracy.
- **preservation** (Reference Preservation): localized edit preset that anchors on the source image and repairs only the requested region.
- **structural** (Anatomy Repair): corrects visible limb and digit count errors.
- **custom**: your own director text.

An optional `Scene-specific house direction` field adds per-scene instructions on top of the preset. `Negative guidance` (default on) appends a fixed negative list covering oily skin, extra digits, and other common defects.

## Inject Mode

Inject is auto-only. It activates when **Prompt source** is set to `AI-tagged (auto)` (which keeps `Auto-generate after AI response` on):

1. QIG injects instructions asking your Text AI to emit image tags inside chat replies.
2. QIG extracts those tags from the AI reply.
3. QIG generates images from the extracted prompts.
4. Delivers each image according to **Tag handling**. **Replace tag and attach to tagged message** removes the used tag and attaches the image to that source message. **Separate generated-image message** creates a distinct chat message; `Auto-clean` controls whether the source tag is removed.

Supported tag formats:

- `<image>prompt text</image>` (tag name configurable, default `image`)
- `<pic prompt="prompt text">` (legacy)

Inject settings: tag name, inject prompt template, extraction regex, injection position (`afterScenario`), tag handling, auto-clean. The prompt template and extraction regex each have a `Reset to default` button that restores the generated default for the current tag name. Legacy `inline` settings migrate to source-message replacement because that was their prior runtime behavior. `Test Inject Detection` checks current chat messages for extractable tags without generating.

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

Without custom JSON, QIG builds a workflow based on **Model Loader**: choose **Checkpoint** for files with embedded CLIP and VAE models, or **Diffusion/UNET** for diffusion-only files that require external CLIP and VAE filenames. Model refresh lists only files supported by the selected loader. For an existing graph, paste ComfyUI's `Save (API Format)` export into `Custom Workflow JSON`; regular visual workflow exports are rejected.

Workflow variables: see [`docs/comfyui-workflow-variables.md`](docs/comfyui-workflow-variables.md) for the full placeholder table and typed-value behavior.

QIG returns every image produced by matching output nodes. Use **Output Node IDs** to select specific nodes and **Image Index** to select one image from each node. Empty node IDs and image index `-1` return all output images.

Extra controls:

- **CLIP skip**, **denoise**, **scheduler**, **timeout**, **output selection**
- **Upscale model** (built-in workflow)
- **LoRAs** (comma-separated `name:weight` pairs; built-in workflow)
- **Diffusion/UNET support**: explicit model loader, optional negative-prompt skipping, one or two CLIP models, VAE model, CLIP type
- **Workflow presets**: save and load custom workflow JSON configs

Custom graphs receive only values represented by placeholders; QIG does not inject its built-in LoRA or upscale nodes into them. Comfy graphs are executable programs and may invoke custom nodes with filesystem or network side effects. Full settings exports omit executable Comfy graph bodies, and settings imports ignore workflow preset records; local trusted presets remain unchanged. Review workflow JSON before saving or running it.

Cancellation first uses ComfyUI's targeted Jobs API when available, then safely removes pending work through the queue API on older servers. QIG never sends a bodyless global interrupt. **Allow targeted legacy interrupt** is an explicit shared-server risk opt-in because older `/interrupt` implementations may still stop another user's work.

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

## Custom API

Select `Custom API` when an image service is not covered by a built-in provider or Reverse Proxy. It supports four starter mappings:

- **OpenAI-compatible images**: JSON request with `model`, `prompt`, `negative_prompt`, `size`, and `n`; reads the first item under `/data/0`.
- **Simple JSON REST**: maps prompt, negative prompt, dimensions, steps, guidance, sampler, and seed to ordinary JSON fields.
- **Async job API**: submits a JSON job, reads its ID, then polls a URL containing `{{jobId}}` until a configured success or failure status.
- **Multipart upload**: sends scalar fields and an optional reference image as multipart form data.

Connection Profiles store the trusted request/poll URLs, authentication mode and credential, model, and reference images. Generation Presets store the request template, response pointers, timeout, and polling behavior. This lets multiple named backends share one provider without adding code for each API.

### Request templates

Templates are JSON objects, not scripts. Values may use these tokens: `{{prompt}}`, `{{negative}}`, `{{model}}`, `{{width}}`, `{{height}}`, `{{size}}`, `{{steps}}`, `{{cfgScale}}`, `{{sampler}}`, `{{seed}}`, `{{referenceImages}}`, and `{{firstReferenceImage}}`. When a value is exactly one token, numbers and arrays retain their JSON type. Inline tokens become strings.

Use RFC 6901 JSON Pointers such as `/data/0/url` for the image, job ID, and job status fields. Image results may be an HTTPS or same-origin URL, base64 value, common image object, or a direct `image/*` response. Async polling intervals are limited to 250 ms through 60 seconds and total requests to 1 second through 30 minutes.

### Authentication and safety

Authentication is limited to no auth, Bearer, a named header, a named query parameter, or Basic auth (`username:password`). Credentials cannot be embedded in request templates. Custom requests run directly in the browser, reject redirects, enforce bounded JSON/image responses, and never use a generic SillyTavern server relay. The endpoint must allow your SillyTavern origin through CORS.

Custom API fields are synchronized to the current SillyTavern account, including endpoints, credentials, authentication behavior, request mappings, polling rules, and reference images. They are excluded from portable settings exports, reproducible image metadata, and imported presets so an imported file cannot attach an untrusted request to a local credential. Recreate or review Custom API definitions in each account instead of relying on an export.

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

## Character Context

QIG combines two independent character systems and shows their status in **Context**:

- **SillyTavern Style prefixes** are inherited prompt fragments from SillyTavern's native Image Generation Style panel. QIG reads the common prefix plus the current character's avatar-keyed prefix. Character-specific prefixes are excluded in group chats; common prefixes still apply. Shareable `sd_character_prompt` card data is used when the local character entry is empty.
- **QIG character overrides** save the complete current QIG prompt, negative prompt, style, image size, and supported reference images for one character. Use **Save for [character]** to create or update one and **Reset override** to return to global QIG settings.

SillyTavern Style composition follows SillyTavern's order: common prefix, character prefix, then the generated QIG prompt. A literal `{prompt}` in the prefix controls insertion position. The negative prompt is the QIG negative followed by common and character-specific negative prefixes.

## Gallery and History

- **Gallery**: image blobs are stored in account-scoped IndexedDB; localStorage contains only an account-scoped compact manifest. The newest 50 images are retained. QIG logs retention evictions and shows a warning when older images are removed. Failed persistence is shown as session-only instead of silently deleting entries.
- **Prompt History**: stored in account-scoped localStorage with bounded entry and total sizes. Reuse past prompts. Clear all option.
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

Store provider connection settings (API keys, model IDs, URLs, provider-specific options). Profiles belong to one provider and do not change the active provider. Select the provider first, then load one of its profiles without re-entering credentials.

### Generation Presets

Store the core generation setup: selected provider and style, prompt behavior, size, image count, steps, guidance, sampler, seed, and selected inject options. Reverse Proxy presets store the Proxy values that are actually sent. Custom API presets store the declarative request/response and polling mapping, while the connection profile keeps URLs, auth, model, and reference images local. Credentials, model IDs, most provider-specific options, automation/delivery settings, character overrides, and contextual filters are not part of a preset.

An active preset is highlighted only while the covered settings still match it. Editing a covered value returns the selector to **Current settings**.

## Server Plugin

SillyTavern's built-in CORS proxy is blocked by `basicAuthMode` when a provider request also needs its own `Authorization` header. This affects CivitAI and Replicate in browser-only mode.

Quick Image Gen `3.1.1` ships optional server relay protocol `0.2.0` in `server-plugin/`. It relays only the fixed provider operations used by this extension: CivitAI v2 workflow creation, status, cancellation, and output retrieval, plus Replicate prediction creation, status, cancellation, and output retrieval. Provider output relaying is restricted to trusted CivitAI/Replicate HTTPS hosts (including `civitai.red`) and bounded to 25 MiB; JSON requests and responses are bounded separately. Output requests do not receive provider authorization unless explicitly requested and the URL has the exact provider API origin. Authenticated CivitAI blob redirects are validated and followed without forwarding authorization to the destination host.

Setup:

1. Copy `server-plugin/` to your SillyTavern install as `plugins/quick-image-gen-relay/`.
2. Set `enableServerPlugins: true` in SillyTavern `config.yaml`.
3. Apply the mandatory pre-parser integration documented in `server-plugin/README.md`. The current host plugin API mounts too late to precede SillyTavern/SillyBunny's global 500 MiB JSON parser, so the relay deliberately returns HTTP 503 without this host integration rather than claiming that its local 1 MiB limit protects the route. That 503 occurs after the host parser and is not itself resource protection; do not expose the host until the pre-parser is mounted.
4. Restart SillyTavern.
5. Open `/api/plugins/quick-image-gen-relay/healthz` while logged in. A blank response with HTTP 204 means the plugin and required pre-parser installer are registered; HTTP 503 means the relay is disabled. Relay POSTs additionally detect and reject a pre-parser mounted after the host parser.

SillyTavern server plugins are not sandboxed. Only install server plugins from developers you trust. This plugin does not accept arbitrary target URLs and does not store or log provider API keys. CivitAI cancellation follows the current live v2 OpenAPI and official JavaScript client contract: authenticated `DELETE /v2/consumer/workflows/{workflowId}` (`DeleteWorkflow` / `deleteWorkflow()`).

## Updating and Rollback

Update from `Extensions -> Manage extensions -> Quick Image Gen -> Update`.

If an update breaks your setup, switch back to the previous version line without leaving SillyTavern:

1. Open `Extensions -> Manage extensions -> Quick Image Gen`.
2. Open the branch selector and pick the previous-version branch (for example `v2.8`).
3. Reload when prompted.

`main` is always the current release. When a new version line starts, a `v<major.minor>` branch is kept at the last release of the previous line. Rolling back does not delete your settings; options added by newer versions are ignored until you return to `main`.

## Changelog

### 3.1.1

No breaking changes.

**Fixed**

- Going back from the final prompt review no longer makes you sit through the Text AI request window again. It re-runs the Text AI with the request as you already edited it (with a fresh cache-busting stamp, so it is a real re-run), and the button now says `Re-run Text AI`.
- The per-message palette button now inserts into the message it was clicked on. The finished-image and batch dialogs were ignoring the source message and always using the "latest message" fallback. Images generated from the panel still follow the manual insert target setting.

### 3.1.0

No breaking changes. Existing settings, presets, connection profiles, character overrides, and contextual filters carry over untouched.

**Fixed**

- The Logs window opened empty every time. The log store had moved to a redacting buffer and the window still read it as a plain list.
- Escape now closes the dialog you are looking at, and only that dialog. SillyTavern returned focus to the launcher button after every click, so key presses never reached QIG's own dialogs and Escape fell through to the app behind. Focus now stays inside the dialog.
- `Ctrl+Enter` now generates from inside QIG's own prompt and settings fields, and no longer double-fires SillyTavern's regenerate confirmation. SillyTavern keeps its own shortcut everywhere outside the extension.
- The floating status no longer claims "Generating" while it is waiting for you in the prompt review dialog, and the panel heading says "Generating" only while something is being generated.
- Arrow keys keep working in the batch viewer after clicking inside it.
- The mobile toolbar is opaque again; settings no longer show through it while scrolling.
- Five hardcoded colours in indent guides and clear buttons now follow the theme.
- Repeated tags are stripped from the final positive and negative prompts, keeping the first occurrence of each. Weighted variants like `(masterpiece:1.2)` are left alone.
- Two hidden preview images no longer carry an empty `src`.
- Settings search only counts settings it can show. Provider sections other than the active one are now moved out of the page instead of hidden, so they no longer inflate the match count or the tab order.

**Changed**

- The finished-image and batch dialogs lead with a single **Insert into Chat** action; the other actions use the same icon set as the rest of the extension instead of emoji.
- Inserting an image into the chat now confirms itself and offers an eight-second undo. Undo reverses exactly what it added and refuses if the chat has changed since. Inserting a whole batch does not offer undo.
- Quick Setup takes you straight to the provider settings it names for local, proxy, and custom providers, opening the drawer and sections and focusing the first field.
- The local A1111 panel keeps Model and LoRAs in front; VAE, CLIP skip, scheduler, face restore, tiling, and variation seed sit in a `Model tuning` group that starts closed.
- The Prompt field dims and says it is not used while the source is `Chat scene` or `AI-tagged`.
- "Recipe" is now "Preset" everywhere; the section is `Presets & Prompting`.
- The Contextual Filters summary is one sentence instead of three number tiles.
- The panel no longer repeats its own name under the drawer header, and the palette right-click menu is a real menu to assistive software with arrow-key navigation.
- Empty gallery, prompt history, and log views say what fills them.
- Small text was raised to a 12px floor throughout, and helper text is no longer faded. Delete and remove buttons inside dialogs are thumb-sized on phones.
- Counts read as sentences ("Generating 1 image", "2 links skipped"), the wizard is titled "Set up Quick Image Gen", and two developer-facing warnings were rewritten in plain language.

### 3.0.1

No breaking changes. Existing settings, presets, connection profiles, character overrides, and contextual filters carry over untouched.

**Fixed**

- Palette icons beside messages and the input bar now use SillyTavern's own controls. The empty square is gone, themes can style both controls properly, and hover feedback works again after generation.
- NovelAI-compatible proxies now map requested sizes to the nearest official resolution instead of reducing every choice to portrait, landscape, or square. Saved metadata reports the dimensions actually sent.
- Reverse Proxy image results are now materialised before generation finishes. Temporary URLs are copied into QIG when the proxy permits it; expired or unreadable URLs fail instead of becoming broken gallery entries, while CORS-only failures keep the existing browser fallback.
- Light-theme gallery surfaces, logs, filter cards, scope badges, warnings, scrims, and settings microcopy now use QIG's theme tokens. The tiny 60%-opacity helper text is back to a readable size.
- Settings search now reveals matching active-provider fields instead of leaving them hidden behind another collapsed section.
- Drawer actions now respond to the drawer's own width instead of duplicate viewport rules.

**Changed**

- `More settings` starts collapsed on fresh profiles. Existing saved collapse state still wins.
- Removed the extra `Active Provider Settings` disclosure. Provider controls now sit directly under `Image Provider & Output`, where search can reach them.

### 3.0.0

No breaking changes. Settings, presets, connection profiles, character overrides, and contextual filters carry over untouched.

**Fixed**

- Character-specific image prompts no longer end up in the negative prompt. A character set up with only a positive prompt had that same text applied as its negative prompt, so the description was being requested and suppressed at the same time. Characters that have a real negative prompt configured were never affected.
- World Info entries that trigger on keywords now match the scene you are illustrating. Only always-on (`constant`) entries inserted reliably before, because the scan read the newest chat messages instead of the messages you actually selected. Scenes longer than SillyTavern's World Info scan depth were the common case.

**Added**

- The built-in instructions QIG sends to your Text AI are now readable and editable instead of hidden. `Insert Tags default` and `Insert Natural default` fill the custom instruction box with the real built-in text, and `Insert default` does the same for the two-step scene description. Both boxes have a `Reset` button.
- `Reset to default` for the inject prompt template, the inject extraction regex, and the Reverse Proxy chat-image system prompt.
- A use-case guide explaining what each prompt option is for and when to reach for it.
- Rollback instructions, plus a `v2.8` branch for returning to the previous version line.

Leaving an instruction box empty still means "use the built-in default", so existing setups behave exactly as before. The identity, quality, lighting, and artist toggles still add their requirements on top of whichever instruction is in use.

### 2.9.0

- Prompt review before generating, and optional matched World Info in Text AI context.

### 2.8.0

- Image delivery and runtime safety hardening.

Earlier versions predate this changelog; see the commit history.

## Migration Notes

- The legacy `Edit LLM prompt before generation` setting migrates to `Review before generating`.
- Legacy Prompt Replacement Maps are migrated into Contextual Filters on settings load, preset import, and settings import.
- Legacy Prompt Templates are ignored and cleaned up.
- Exported settings no longer include templates or prompt replacement maps.
- Settings exports use schema v7 and omit credentials, private/reference images, and all Custom API trust or request-definition fields. Schema v5 imports remain supported and retain local credentials.
- Unscoped legacy `qig_gallery` and `qig_prompt_history` data is left untouched and is not assigned to the current account because its owner cannot be verified.

## Development

Supported Node.js ranges are `^20.19.0 || ^22.13.0 || >=24.0.0`, matching the locked development tooling.

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

CI runs syntax checks and the Node test suite on Node.js 20.19 and 22.13. The newer matrix job also runs a high-severity dependency audit for pull requests and pushes to `main` or `staging`.

## Credits

- Veda: ComfyUI Proxy method

## License

MIT
