# Comprehensive Bug Sweep Report — Quick Image Gen

Date: 2026-03-04
Repo: `/run/media/platinum/HDD/sillytavern-image-gen`
Reviewer: Codex
Version: `1.4.7`

## Executive Summary
- Total findings: 6
- Severity breakdown:
  - P1: 0
  - P2: 2
  - P3: 4
  - P4: 0
- Sweep coverage completed:
  - Full static audit of prompt pipeline, inject flows, provider adapters, metadata paths, persistence/import/export, and UI bindings in `index.js`.
  - Runtime validation using Playwright against local SillyTavern (`http://127.0.0.1:8000`, basic auth).

## Validation Notes
- Non-mutating checks run:
  - `node --check index.js`
  - targeted code scans for storage, fetch, regex, event, and DOM binding paths.
- Runtime checks run:
  - Playwright session opened and QIG controls were validated in-page.
  - Two preset-load regressions were reproduced with executable browser scripts and observed state/DOM divergence.

## Findings

### P2-001 — Preset load desynchronizes UI from internal state
- Area: Generation presets / settings UI
- Evidence:
  - Preset load restores settings, then calls `refreshAllUI`: `index.js:5438-5475`
  - `llmCustomInstruction` is mapped to non-existent field ID `qig-llm-instruction`: `index.js:5518`
  - Actual textarea ID is `qig-llm-custom`: `index.js:6532`
  - Provider-specific inputs are not re-bound from settings on preset load (`refreshAllUI` calls `updateProviderUI`, not `refreshProviderInputs`): `index.js:5538`, `index.js:5821-5833`
- Live repro (executed):
  1. Set custom LLM instruction to `AAA_PRESET_VALUE`, save preset.
  2. Change textarea to `BBB_MODIFIED_UI`, load saved preset.
  3. Result: saved preset value remains `AAA_PRESET_VALUE`, but UI field stays `BBB_MODIFIED_UI`.
  4. Additional verification: same drift reproduced with `qig-a1111-scheduler`; UI stayed `Automatic` while subsequent preset save persisted `Uniform`.
- Impact:
  - Users see stale controls after loading presets.
  - Visible values can differ from active generation settings, causing misleading behavior and accidental wrong saves.
- Fix direction:
  - Replace `qig-llm-instruction` with `qig-llm-custom` in `refreshAllUI`.
  - After preset load, call `refreshProviderInputs(s.provider)` (or equivalent full value sync) in addition to `updateProviderUI`.

### P2-002 — Proxy metadata records wrong generation parameters
- Area: Metadata embedding / round-trip correctness
- Evidence:
  - Metadata payload uses generic fields only (`steps`, `cfgScale`, `sampler`, `seed`): `index.js:8130-8137`
  - Proxy generation uses proxy-specific fields (`proxySteps`, `proxyCfg`, `proxySampler`, `proxySeed`): `index.js:3222-3225`, `index.js:3348-3351`
- Impact:
  - Embedded/downloaded metadata for Proxy provider can reflect stale or unrelated values.
  - Round-trip via metadata import can restore incorrect settings.
- Fix direction:
  - Branch `getMetadataSettings()` by provider and map proxy metadata from `proxy*` fields.
  - Include proxy scheduler/sampler naming consistency for import parsing.

### P3-001 — NovelAI proxy URL normalization can corrupt absolute URLs
- Area: NovelAI proxy adapter
- Evidence:
  - In non-`/v1` proxy path, returned `json.url` is treated as relative unless it is a data URI; absolute `http(s)` is not handled: `index.js:2126-2134`
  - Current behavior always prepends `baseUrl` (`return baseUrl + json.url`).
- Impact:
  - If proxy returns absolute URL, final image URL becomes malformed (double host/prefix).
- Fix direction:
  - Add `if (json.url.startsWith('http')) return json.url;` before base concatenation.

### P3-002 — Metadata drop guard accepts non-PNG files when MIME type is empty
- Area: Metadata drag-drop validation
- Evidence:
  - Guard condition: `if (fileType && !fileType.startsWith('image/png') && !fileName.endsWith('.png')) return;` at `index.js:8454`
  - For empty `file.type`, condition is bypassed regardless of extension.
- Impact:
  - Non-PNG files with empty MIME can enter PNG parser path, causing confusing "No generation parameters found" or parse failures.
- Fix direction:
  - Tighten to explicit allowlist:
    - allow when MIME is PNG, or
    - when MIME missing and filename ends with `.png`.

### P3-003 — Download-with-metadata path is CORS-fragile and silently drops metadata
- Area: Metadata download flow
- Evidence:
  - `downloadWithMetadata()` always fetches URL with plain `fetch`: `index.js:8316-8321`
  - On failure, catch falls back to `window.open(url, '_blank')`: `index.js:8335-8337`
  - In contrast, save-to-server path uses `corsFetch` for remote URLs: `index.js:8162-8165`
- Impact:
  - For CORS-blocked remote image URLs, metadata embedding fails and user receives original image without metadata.
- Fix direction:
  - Reuse `fetchImageBuffer()` / `corsFetch` logic in `downloadWithMetadata()` for non-data/blob URLs.
  - Surface explicit toast when fallback occurs so metadata loss is visible.

### P3-004 — Backup restore only handles missing localStorage keys, not corrupted keys
- Area: Storage resilience / recovery
- Evidence:
  - Invalid JSON in localStorage is parsed to fallback via `safeParse`: `index.js:219-223`
  - Backup restore path only runs when `localStorage.getItem(localKey) == null`: `index.js:805-807`
- Impact:
  - If localStorage key exists but is corrupted/invalid, backup recovery is skipped and data remains lost.
- Fix direction:
  - During restore, detect parse failure or type mismatch and restore from backup, not only null keys.

## Remediation Plan (Commit-Sized)
1. Preset/UI sync fix
- Update `refreshAllUI` ID map (`qig-llm-custom`) and invoke provider input refresh after preset load.
- Add regression guard logs/tests for preset load to prevent silent state/UI drift.

2. Proxy metadata correctness
- Introduce provider-aware metadata extraction in `getMetadataSettings()`.
- Add parser/round-trip mapping for proxy-specific fields.

3. URL and file validation hardening
- Fix NovelAI proxy absolute URL handling.
- Tighten metadata drop PNG allowlist logic.

4. Metadata download transport parity
- Refactor `downloadWithMetadata()` to use shared fetch helper with CORS-safe path.
- Add user-facing warning when metadata embedding cannot be applied.

5. Corrupted storage recovery
- Extend restore logic to recover on invalid JSON/type mismatch, not only missing keys.
- Add defensive type normalization for imported structures before rendering.

## Residual Risk / Gaps
- Full provider live-generation matrix was not executed (credential-dependent external APIs).
- Runtime UI validation depended on a local ST instance that had unrelated console noise from other extensions; QIG-specific repros were isolated with direct in-page scripts.
