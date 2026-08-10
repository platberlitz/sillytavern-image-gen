> **Status:** Historical snapshot; several findings have since been disproven or fixed. Re-verify against current HEAD before actioning.

# Static-Only Bug Sweep Report — Quick Image Gen

Date: 2026-03-06
Repo: `/run/media/platinum/HDD/sillytavern-image-gen`
Reviewer: Codex
Mode: Static audit only (no smoke tests, no browser automation)
Version observed: `manifest.json` reports `1.5`

## Executive Summary
- Total current findings: 6
- Severity breakdown:
  - P1: 0
  - P2: 3
  - P3: 2
  - P4: 1
- Sweep coverage completed:
  - Provider adapters in `index.js`, including local/A1111/ComfyUI, proxy, and hosted providers.
  - Save/download/metadata flows, gallery persistence, and save-to-server paths.
  - Revalidation of prior dated bug-sweep reports in `docs/bug-sweep-report-2026-02-24.md`, `docs/bug-sweep-report-2026-03-04.md`, and `docs/bug-sweep-report-2026-03-06.md`.

## Validation Notes
- Static-only checks run:
  - `node --check index.js`
  - Targeted code scans for provider dispatch, proxy/local flows, metadata export/import, gallery persistence, and save/download format handling.
- Explicitly not run:
  - Playwright
  - local SillyTavern smoke tests
  - browser/UI runtime validation
  - provider credential checks
- Important limitation:
  - Findings below are limited to bugs or near-findings that are directly supported by current code. Anything that depends on live provider behavior without corroborating local evidence is left in residual risk rather than promoted to a confirmed bug.

## Prior Findings Revalidation

### Fixed
- `2026-02-24 / P1-001` — Inject dedupe cleanup is now released on all exits via delayed `_processedInjectIndices.delete(messageIndex)` in `index.js:8719`.
- `2026-02-24 / P1-002` — Selected LLM override preset is now applied and restored around `CMRS.sendRequest()` in `index.js:2086`.
- `2026-02-24 / P2-002` — Prompt-history copy now targets the stored raw prompt entry and not escaped DOM text in `index.js:3967`.
- `2026-02-24 / P2-003` — Pollinations batch runs now resolve seeds per request through `resolveRandomSeed()` in `index.js:2474` and the active batch loops.
- `2026-02-24 / P2-004` — Palette inject now shows the batch picker for multi-image results in `index.js:8315`.
- `2026-02-24 / P2-005` — Character settings now load during initialization in `index.js:8765`.
- `2026-02-24 / P3-001` — Metadata drop now accepts PNGs with empty MIME only when the filename is `.png` in `index.js:9268`.
- `2026-02-24 / P3-002` — Proxy chat URL building now guards against double-appending `/chat/completions` in `index.js:3693` and `index.js:2574`.
- `2026-02-24 / P3-003` — The major quota-sensitive writes are now guarded via `safeSetStorage()` or bounded retry paths, including presets (`index.js:6010`) and gallery/history (`index.js:4210`).
- `2026-02-24 / P4-001` — Prompt-history copy now uses `entry.prompt` directly in `index.js:3973`.
- `2026-03-04 / P2-001` — Preset loads now refresh the full UI through `refreshAllUI()` in `index.js:6054`.
- `2026-03-04 / P2-002` — Proxy metadata now snapshots proxy-specific fields in `index.js:8860`.
- `2026-03-04 / P3-001` — NovelAI proxy URL normalization now preserves absolute URLs in `index.js:475`.
- `2026-03-04 / P3-002` — Metadata drop guard no longer accepts arbitrary MIME-less files; only `.png` survives in `index.js:9270`.
- `2026-03-04 / P3-003` — Download/save fetches now route through `fetchImageBuffer()` and `corsFetch()` in `index.js:8910` instead of relying on raw cross-origin fetch only.
- `2026-03-04 / P3-004` — Backup restore now repairs malformed or type-mismatched localStorage values in `index.js:956`.
- `2026-03-06 / P2-001` — Message-to-prompt sourcing now normalizes message HTML to plain text in `index.js:1693`.
- `2026-03-06 / P2-002` — Stability random seed handling now resolves a real seed instead of hard-coding `0` in `index.js:4689`.
- `2026-03-06 / P2-003` — Downloads now use per-image `metadataSettings` snapshots instead of live UI settings in `index.js:4481`.
- `2026-03-06 / P3-001` — Locally resolved random seeds are now captured via `__qigResolvedSeed` and folded into metadata in `index.js:4190`.
- `2026-03-06 / P3-003` — Format detection now supports non-PNG outputs for download naming/MIME in `index.js:8919`.
- `2026-03-06 / P3-004` — PNG metadata import now parses `tEXt`, `zTXt`, and `iTXt` in `index.js:9117`.

### Still Open
- `2026-03-06 / P3-002` — Metadata schema remains provider-lossy and import restores only a generic subset; details in finding `P3-001` below.

### Superseded / Removed
- `2026-02-24 / P2-001` — The old inject “Tag handling” UI issue appears superseded by feature removal/refactoring; no current matching control or dead setting path was found in `index.js`.
- `2026-03-04 / P3-003` — The original raw CORS fragility is largely mitigated by `fetchImageBuffer()` + `corsFetch()`, but two different gallery-persistence bugs now remain open in findings `P2-002` and `P2-003` below.

## Findings

### P2-001 — Proxy seeding is inconsistently wired, so seed controls and sequential-seed batches are dead in proxy flows
- Area: Proxy provider adapter / batch correctness / metadata fidelity
- Evidence:
  - Chat-style proxy payloads send model, prompt, size, steps, CFG, sampler, LoRAs, and facefix, but no seed at all: `index.js:3712`.
  - Standard proxy requests use `s.proxySeed`, not the generic `s.seed`: `index.js:3836`.
  - Direct generation batch logic increments `s.seed`, not `s.proxySeed`: `index.js:8432`.
  - Palette inject batch logic also increments `s.seed`, not `s.proxySeed`: `index.js:8280`.
  - Inject-mode batch logic does the same: `index.js:8665`.
  - Regenerate tries to randomize by forcing `s.seed = -1`, but proxy requests still read `s.proxySeed`: `index.js:4862`, `index.js:3836`.
  - Metadata snapshotting prefers `proxySeed`, so the recorded seed can stay stale or empty even when batch helpers are mutating `s.seed`: `index.js:8861`.
- Impact:
  - The Proxy Seed field is ignored for chat-completions-style proxies.
  - Sequential Seeds does not actually vary proxy batches in direct, palette-inject, or inject-mode flows.
  - Regenerate can fail to randomize proxy outputs the way other providers do.
  - Metadata can record the wrong seed provenance for proxy images.
- Fix direction:
  - Centralize per-provider seed resolution before dispatch.
  - Add `seed` to chat-proxy payloads.
  - When provider is `proxy`, batch/regenerate helpers should mutate `proxySeed` (or a normalized resolved seed field) instead of `seed`.
  - Feed the resolved proxy seed into `metadataSettings` for each generated entry.

### P2-002 — “Persistent gallery” silently stores expiring remote URLs when image persistence fails
- Area: Gallery persistence / provider result durability
- Evidence:
  - Several providers return remote HTTP URLs rather than local data URLs or blobs, for example CivitAI (`index.js:2991`), Replicate (`index.js:4765`), Fal (`index.js:4797`), Together (`index.js:4825`), and proxy/chat extraction (`index.js:3771`, `index.js:3798`).
  - `persistImageUrl()` only becomes durable if the browser can load and canvas-copy the image; otherwise it falls back to the original URL: `index.js:4104`.
  - `addToGallery()` stores that fallback value as the canonical gallery URL: `index.js:4200`.
  - Gallery reopen uses the stored item directly via `displayImage(item, true)`: `index.js:4575`.
- Impact:
  - Remote provider URLs that are temporary, signed, or later blocked by CORS can expire out from under saved gallery items.
  - The “persistent gallery” promise becomes unreliable specifically for the providers most likely to return remote URLs.
  - Broken entries can reopen as expired images instead of durable local copies.
- Fix direction:
  - Persist gallery images from fetched bytes instead of relying on canvas/CORS success.
  - If durability cannot be guaranteed, mark the entry as ephemeral rather than storing the remote URL as if it were persistent.

### P2-003 — Gallery persistence re-encodes successful snapshots to JPEG, stripping format fidelity and later PNG metadata support
- Area: Gallery / download fidelity / metadata round-trip
- Evidence:
  - For any non-`data:` image, `persistImageUrl()` stores a canvas re-encode as `image/jpeg`: `index.js:4104`.
  - `addToGallery()` replaces the original generation URL with this JPEG data URL: `index.js:4203`.
  - Gallery reopen sends that re-encoded URL back through the popup and download flow: `index.js:4575`.
  - `downloadWithMetadata()` only embeds PNG metadata when the current entry still detects as PNG: `index.js:9085`.
- Impact:
  - PNG and WebP outputs reopened from the gallery are often already downgraded to JPEG.
  - Transparency and animation are lost.
  - PNG metadata embedding can no longer work for gallery-opened entries because the gallery copy is no longer PNG.
  - The gallery becomes both a durability layer and an unintended lossy transcoder.
- Fix direction:
  - Store original bytes/MIME separately from the browsing thumbnail.
  - Keep thumbnails lossy if desired, but preserve the original image bytes for reopen/download/export.

### P3-001 — Metadata export/import still only round-trips a generic subset of provider state
- Area: Metadata schema fidelity
- Evidence:
  - Metadata snapshots only include generic fields plus a small backend/scheduler exception path: `index.js:8860`.
  - Metadata text export serializes only prompt, negative prompt, steps, sampler, scheduler, CFG, seed, size, provider, model, and backend: `index.js:9012`.
  - PNG metadata import can only parse that generic text schema: `index.js:9198`.
  - Restore-on-drop only reapplies the same generic subset to settings/UI: `index.js:9308`.
- Impact:
  - Provider-specific settings such as LoRAs, img2img/denoise, clip skip, VAE, ADetailer, ControlNet/IP-Adapter, proxy comfy mode/workflow, and other adapter-specific knobs are still lost on export/import.
  - Imported metadata may pick the right provider/model but still fail to reproduce the original generation setup.
- Fix direction:
  - Add a structured provider-specific metadata payload (for example JSON in PNG text) alongside the human-readable summary.
  - Restore provider-specific settings on import when the structured payload is present.

### P3-002 — Proxy parsing accepts GIF URLs, but save/download format detection silently remaps them to JPG
- Area: Format handling / save/download correctness
- Evidence:
  - Proxy chat parsing explicitly recognizes `.gif` URLs: `index.js:3791`, `index.js:3798`.
  - `detectImageFormat()` only recognizes PNG, JPEG, and WebP before defaulting to JPG: `index.js:8919`.
  - `saveImageToServer()` and `downloadWithMetadata()` both depend on that detector for extension/MIME decisions: `index.js:8963`, `index.js:9083`.
- Impact:
  - GIF outputs can be downloaded or server-saved under the wrong extension and MIME.
  - Animated outputs would lose expected behavior in downstream tooling.
- Fix direction:
  - Add GIF detection via magic bytes, content type, and URL suffix.
  - Preserve original GIF bytes and skip PNG-only metadata embedding for that format.

### P4-001 — Save-to-server group folder selection uses a narrower context lookup than the rest of the extension
- Area: Save-to-server organization
- Evidence:
  - The extension already has a robust group resolver that handles `ctx.group`, array-style `ctx.groups`, and object-style `ctx.groups`: `index.js:1343`.
  - `getServerSubfolder()` ignores that helper and only scans object keys from `ctx.groups`: `index.js:8893`.
- Impact:
  - Group chats using the other supported context shapes can fall back to `QuickImageGen` instead of a stable group-specific folder.
  - Save-to-server organization becomes inconsistent across chat types even though the extension already knows how to resolve the active group elsewhere.
- Fix direction:
  - Reuse `getGroupObjectFromContext()` inside `getServerSubfolder()`.
  - Derive the folder from the resolved group object before falling back to the generic default.

## Ranked Fix Queue
1. **Proxy seed normalization**
- Unify provider seed handling so direct, palette-inject, inject-mode, regenerate, request payloads, and metadata all use the same resolved proxy seed.

2. **Gallery durability rewrite**
- Stop storing raw remote URLs as “persistent” gallery items.
- Persist fetched bytes (or explicitly mark entries ephemeral) and separate original-image storage from thumbnail generation.

3. **Preserve original gallery format**
- Keep original MIME/bytes for reopen/download flows.
- Restrict JPEG conversion to thumbnails only.

4. **Structured metadata schema**
- Add provider-specific JSON metadata export/import while keeping the current human-readable text for interoperability.

5. **Format detector hardening**
- Add GIF detection and preserve original bytes/extensions in save/download flows.

6. **Save-to-server folder consistency**
- Reuse the existing group resolution helper for subfolder naming.

## Residual Risk / Gaps
- No live provider traffic was executed, so output-shape issues that depend on real third-party responses were only reported when the current code already proves the mismatch.
- A1111/ComfyUI runtime-only edge cases (for example response `info` parsing or server-side seed echo behavior) remain unverified here.
- The new gallery findings were derived from current persistence code and known adapter return shapes, not from opening a live UI and waiting for provider URLs to expire.
