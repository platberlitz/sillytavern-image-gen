> **Status:** Historical snapshot; several findings have since been disproven or fixed. Re-verify against current HEAD before actioning.

# Comprehensive Static Bug Sweep Report — Quick Image Gen

Date: 2026-03-06
Repo: `/run/media/platinum/HDD/sillytavern-image-gen`
Reviewer: Codex
Version: `1.5`
Commit: `165f407`
Mode: Static-only audit (no smoke tests, no Playwright, no live provider calls)

## Executive Summary
- Total findings: 9
- Severity breakdown:
  - P1: 0
  - P2: 4
  - P3: 5
  - P4: 0
- Sweep coverage completed:
  - Full static audit of generation lifecycle, cancellation, auto/inject flows, character-scoped settings, metadata export/import, save/download flows, and provider adapters in `index.js`.
  - Revalidation of older sweep reports in `docs/bug-sweep-report-2026-02-24.md`, `docs/bug-sweep-report-2026-03-04.md`, and `docs/bug-sweep-report-2026-03-06.md` against current `HEAD`.
- Prior-report revalidation summary:
  - `2026-02-24`: prior findings appear fixed or superseded in current code.
  - `2026-03-04`: preset/UI sync, proxy metadata mapping, PNG-drop validation, NovelAI absolute URL handling, and backup restore logic are fixed; the older download-metadata fragility survives only as a narrower re-fetch dependency.
  - `2026-03-06`: prompt HTML sanitization, Stability random-seed handling, per-image metadata snapshots, format-aware downloads, and `tEXt`/`zTXt`/`iTXt` import support are fixed; seed-fidelity gaps remain partially open across several providers.

## Validation Notes
- Non-mutating checks run:
  - `node --check index.js`
  - targeted code scans for event lifecycle, cancellation, per-character state, provider response parsing, metadata snapshotting, and persistence flows.
- This sweep intentionally excluded:
  - Playwright or browser automation
  - sync/copy into an installed SillyTavern extension slot
  - live provider requests, credentialed validation, or save-dialog verification
- Evidence bar:
  - Findings below are limited to behaviors that are directly supported by current code paths in `index.js`; speculative runtime-only concerns are left in Residual Risk.

## Carried-Forward Findings

### P3-001 (Carried Forward) — Metadata seed fidelity is still incomplete for providers that pass random-seed behavior through to the backend
- Area: Metadata reproducibility / provenance
- Evidence:
  - `resolveRandomSeed()` only records a concrete seed when a generator explicitly calls it: `index.js:340-345`
  - `finalizeGeneratedEntry()` only snapshots a resolved seed from `settings.__qigResolvedSeed`: `index.js:4189-4195`
  - Several providers still pass random-seed behavior through without resolving locally first:
    - ArliAI: `index.js:2830-2838`
    - Chutes: `index.js:2887-2895`
    - CivitAI: `index.js:2940-2950`
    - Replicate: `index.js:4728-4737`
    - Fal.ai: `index.js:4783-4789`
    - Together AI: `index.js:4811-4818`
- Impact:
  - Images generated with random seeds can still be saved/downloaded without the actual seed that produced them.
  - Metadata import therefore cannot reliably reproduce those images.
- Fix direction:
  - Resolve and store a concrete seed uniformly before request serialization for every provider, then feed that concrete value into `getMetadataSettings()`.

### P3-002 (Carried Forward, Narrowed) — Save-to-server and download-with-metadata still rely on a second fetch of the final image URL
- Area: Persistence / metadata download reliability
- Evidence:
  - `fetchImageBuffer()` re-fetches every non-`data:`/`blob:` URL via `corsFetch()`: `index.js:8910-8916`
  - `saveImageToServer()` calls that helper before metadata embedding and file save: `index.js:8963-8983`
  - `downloadWithMetadata()` calls the same helper and falls back to opening the original URL when it fails: `index.js:9083-9101`
- Impact:
  - A provider URL can display successfully in the UI but still fail later during save/download if it is short-lived, auth-bound, or otherwise not re-fetchable from the client context.
  - When that happens, metadata embedding is skipped entirely and the user only gets the raw remote asset.
- Fix direction:
  - Prefer persisting original bytes or a blob/data URL at generation time.
  - If that is not feasible, surface “metadata unavailable for remote URL” as explicit state rather than a best-effort fallback.

## Net-New Findings

### P2-001 — Pending auto-generate timeouts survive chat switches and can generate against the wrong chat context
- Area: Auto-generate lifecycle / context correctness
- Evidence:
  - `_autoGenTimeout` is armed from `MESSAGE_RECEIVED`: `index.js:8800-8806`
  - `CHAT_CHANGED` clears inject bookkeeping but never clears `_autoGenTimeout`: `index.js:8813-8820`
  - When the timeout fires, `generateImage()` reads the current live settings and chat context via `getSettings()` and `getMessages()`: `index.js:8337-8355`
- Impact:
  - If the user switches chats within the 500ms debounce window, QIG can generate for the newly selected chat instead of the message that originally scheduled auto-generation.
- Fix direction:
  - Clear pending auto-generation on `CHAT_CHANGED`.
  - Tag pending work with the originating chat/message identity and verify it before execution.

### P2-002 — Cancel can clear the busy state before LLM subflows finish, permitting overlapping runs
- Area: Generation lifecycle / cancellation correctness
- Evidence:
  - `requestGenerationCancel()` force-calls `endGeneration()` after 5 seconds if the cancel serial has not changed: `index.js:904-911`
  - Main, palette-inject, and inject flows all pass `currentAbortController?.signal` into `generateLLMPrompt()`: `index.js:8223`, `index.js:8370`, `index.js:8608`
  - `generateLLMPrompt(s, basePrompt, signal)` accepts `signal` but never uses it when calling `callOverrideLLM()` or `generateQuietPrompt()`: `index.js:2193`, `index.js:2383-2398`
  - `matchLLMFilters()` likewise waits on `callOverrideLLM()` / `generateQuietPrompt()` and only checks for cancellation after the await returns: `index.js:1978-2008`
- Impact:
  - Cancel can make the UI look idle while long-running LLM prompt generation or LLM filter matching is still executing.
  - Users can then start another generation that races the first run’s late-arriving UI writes and state cleanup.
- Fix direction:
  - Thread abort signals through all LLM helper calls.
  - Only reset `isGenerating` after the active promise chain actually settles.
  - Remove the unconditional 5-second forced `endGeneration()`.

### P2-003 — Character-scoped settings and reference images bleed into later characters when the next character has blank or missing overrides
- Area: Character settings lifecycle
- Evidence:
  - `loadCharSettings()` only applies saved fields when they are truthy: `index.js:5762-5766`
  - It returns early if the new character has neither saved fields nor saved refs, without clearing prior character state: `index.js:5757-5759`
  - Reference images are only copied when refs exist, and only into the currently active provider-specific ref array: `index.js:5772-5785`
- Impact:
  - Switching from a character with prompt/negative/ref overrides to one with blank or no overrides can leave the previous character’s values active.
  - That contaminates later generations with the wrong prompt text or reference images.
- Fix direction:
  - Apply a full per-character reset on load/switch, including explicit clearing of prompt/negative/style/size/ref-image state when the next character has no override.

### P2-004 — Replicate success parsing assumes `status.output` is always an array
- Area: Replicate provider adapter
- Evidence:
  - The poller only returns `status.output?.[0]` on success: `index.js:4755-4766`
- Impact:
  - Models that return a string URL or a non-array object can yield a broken result (`"h"` from `"https://..."`) or a false failure even though Replicate produced an image.
- Fix direction:
  - Normalize success payloads by handling string, array, and object-shaped `output` values before returning.

### P3-003 — Proxy Gemini image parsing is still tied to OpenAI-style response envelopes
- Area: Proxy provider / Gemini compatibility
- Evidence:
  - Gemini-ish proxy models are detected and sent `response_modalities` and `generationConfig.responseModalities`: `index.js:3710-3728`
  - The proxy response parser primarily looks for `choices[0].message.*` and, secondarily, snake_case `message.parts[].inline_data`: `index.js:3754-3818`
  - The direct Nanobanana/Gemini path expects top-level `candidates[].content.parts[].inlineData`: `index.js:3020-3040`
- Impact:
  - A proxy that forwards Gemini responses with little or no OpenAI normalization can return a valid image payload that QIG never recognizes.
- Fix direction:
  - Extend the proxy parser to also read Gemini-native `candidates[].content.parts[].inlineData` / `inline_data` shapes before failing.

### P3-004 — NovelAI proxy handling still has response-shape and size-fidelity regressions
- Area: NovelAI proxy adapter
- Evidence:
  - The exact-size `/generate` branch requests `return_base64: true`: `index.js:2542-2547`
  - Its extractor only accepts `{ status: "success", url }`: `index.js:491-495`
  - When that branch is skipped or fails, the `/chat/completions` fallback collapses any custom size into one of three hard-coded presets: `index.js:2577-2585`
- Impact:
  - Valid proxy responses can be rejected if they return base64 or a differently keyed image field.
  - Custom NovelAI sizes can silently degrade to `1216:832`, `832:1216`, or `1024:1024`.
- Fix direction:
  - Broaden image extraction to accept base64/data URI/object variants.
  - Preserve the user’s actual `width`/`height` or explicitly disable the fallback when exact-size proxy support is unavailable.

### P3-005 — Comfy custom-workflow runtime JSON parse failures can masquerade as “Invalid workflow JSON”
- Area: Local / ComfyUI custom workflow path
- Evidence:
  - The custom-workflow `try` block wraps both `JSON.parse(s.comfyWorkflow)` and later response parsing: `index.js:3070-3141`
  - A `SyntaxError` during `res.json()` or `histRes.json()` is caught and relabeled as invalid user workflow JSON, then the code silently falls back to the default workflow: `index.js:3115`, `index.js:3126`, `index.js:3141-3144`
- Impact:
  - Server/proxy regressions that return malformed JSON can be misdiagnosed as bad workflow input.
  - QIG then silently changes execution mode by falling back to the default workflow.
- Fix direction:
  - Narrow the `SyntaxError` catch to the initial `JSON.parse(s.comfyWorkflow)` and let runtime response-parse failures surface as provider/transport errors.

## Ranked Fix Queue
1. Cancellation and run-state hardening
- Clear `_autoGenTimeout` on `CHAT_CHANGED`.
- Propagate abort through `generateLLMPrompt()`, `matchLLMFilters()`, and `callOverrideLLM()`.
- Remove the unconditional 5-second forced `endGeneration()` and tie cleanup to settled async work.

2. Character-state isolation
- Make `loadCharSettings()` apply a full reset for missing or blank overrides.
- Separate or clear provider-specific reference-image buckets on character switch.

3. Provider response normalization
- Normalize Replicate success payloads.
- Extend proxy Gemini parsing to Gemini-native response envelopes.
- Broaden NovelAI proxy image extraction beyond `{status,url}`.

4. Provider fidelity fixes
- Preserve exact NovelAI sizes across proxy fallbacks or block unsupported fallback paths.
- Capture resolved seeds uniformly across all providers before metadata snapshotting.

5. Persistence / metadata resilience
- Reduce or explicitly annotate the second-fetch dependency in `saveImageToServer()` and `downloadWithMetadata()`.
- Keep the current warning path, but expose metadata-unavailable state as first-class behavior.

6. Local-provider diagnostics
- Narrow Comfy custom-workflow error handling so runtime JSON failures are not relabeled as user workflow mistakes.

## Residual Risk / Gaps
- No live provider requests, UI smoke tests, Playwright sessions, or installed-extension sync were run in this sweep.
- Initialization/hot-reload listener duplication remains a plausible lifecycle risk around `createUI()` and `eventSource.on(...)`, but without runtime reload validation it is not promoted here as a confirmed bug.
- Provider-specific contracts may have additional response-shape drift that only appears with live credentials or proxy variants not represented in static code.
