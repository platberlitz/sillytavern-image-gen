# Comprehensive Bug Sweep Report — Quick Image Gen

Date: 2026-02-24
Repo: `/run/media/platinum/HDD/sillytavern-image-gen`
Reviewer: Codex

## Executive Summary
- Total findings: 11
- Severity breakdown:
  - P1: 2
  - P2: 5
  - P3: 3
  - P4: 1
- Sweep coverage completed:
  - Static code audit across generation, inject mode, provider adapters, metadata, persistence, and UI bindings.
  - Scripted checks: `node --check index.js`, ID/binding scans, key-usage scans, and targeted grep passes.
- Live QA status:
  - Updated on 2026-02-24: targeted live QA completed against a running SillyTavern instance at `http://127.0.0.1:8000` (basic-auth enabled), including prompt-history copy behavior, metadata drop path, and storage-failure resilience checks.

## Coverage Notes
- Files reviewed in depth:
  - `index.js`
  - `manifest.json`
  - `style.css`
  - `README.md`
- Method:
  - Line-by-line review of high-risk paths.
  - Static pattern checks for missing wiring, dead settings, and state cleanup issues.

## Findings
- Note: line references below are refreshed to current code anchors. Behavior descriptions reflect the pre-fix state observed during the sweep.

### P1-001 — Inject dedupe set can permanently retain message indexes on early returns
- Area: Inject mode state management
- Evidence (pre-fix):
  - Index is added before processing: `index.js:5943`
  - Multiple early returns before cleanup:
    - `index.js:5698` (`!injectEnabled || !injectRegex`)
    - `index.js:5702` (invalid regex path)
    - `index.js:5715` (no matches path)
  - Cleanup scheduling path: `index.js:5878`
- Impact (pre-fix):
  - `_processedInjectIndices` can retain entries indefinitely for many normal paths.
  - Regenerated/re-edited messages reusing an index may be skipped unexpectedly.
  - Long-session memory growth risk.
- Repro steps:
  1. Enable inject mode.
  2. Receive AI messages that do not match regex (or temporarily set invalid regex).
  3. Observe those indexes never hit cleanup path.
- Expected:
  - Every processed index should be released regardless of match result or validation failure.
- Actual (pre-fix):
  - Cleanup timer is skipped when returning before the tail section.
- Suspected root cause:
  - Cleanup is not in a `finally` that covers all code paths.
- Fix direction:
  - Move index release into a guaranteed `finally` and schedule cleanup from there.

### P1-002 — Selected LLM override preset is never actually applied to requests
- Area: LLM override
- Evidence (pre-fix):
  - UI captures selected preset: `index.js:5231`
  - Request path for preset application/extraction: `index.js:885`, `index.js:911`
- Impact (pre-fix):
  - “Completion Preset” dropdown appears functional but has no concrete effect on outbound LLM override behavior.
  - Users cannot reliably reproduce/pin prompt-generation behavior via preset choice.
- Repro steps:
  1. Enable LLM override.
  2. Change `Completion Preset` selection.
  3. Trigger prompt generation multiple times.
  4. Observe no request-level use of selected preset value.
- Expected:
  - Selected preset should be explicitly sent/used for the request.
- Actual (pre-fix):
  - Only a boolean include flag is set.
- Suspected root cause:
  - Integration stores preset value but does not pass it into CMRS request options.
- Fix direction:
  - Wire `llmOverridePreset` into the request API contract (or remove dropdown if unsupported).

### P2-001 — Inject “Tag handling” mode is dead UI (no behavior change)
- Area: Inject mode UX/logic parity
- Evidence (pre-fix):
  - Setting exposed in UI: `index.js:4699` through `index.js:4703`
  - Setting persisted: `index.js:5205`
  - Generation result handling never branches on `injectInsertMode` in live inject paths:
    - `index.js:5843` through `index.js:5845`
    - `index.js:5474` through `index.js:5475`
- Impact (pre-fix):
  - Users can select `replace`, `inline`, `new`, but runtime behavior stays the same.
- Repro steps:
  1. Toggle each Tag handling option.
  2. Generate from inject tags.
  3. Observe same insertion/display behavior.
- Expected:
  - Distinct handling modes should produce distinct outcomes.
- Actual (pre-fix):
  - Mode selection is inert.
- Fix direction:
  - Implement mode-specific insertion logic or remove unsupported options.

### P2-002 — Prompt history “Copy” button targets wrong DOM scope and can throw
- Area: Prompt history popup
- Evidence (pre-fix):
  - Prompt history copy handler location: `index.js:2452` through `index.js:2458`
- Impact (pre-fix):
  - Clicking Copy may fail with `null` dereference because `closest('div')` resolves to header row, not card container containing `<pre>`.
- Repro steps:
  1. Generate at least one prompt so history has content.
  2. Open Prompt History popup.
  3. Click Copy.
- Expected:
  - Prompt text copied to clipboard.
- Actual (pre-fix):
  - Button may error and copy fails.
- Fix direction:
  - Replace inline query with explicit card-scoped lookup (or bind handler programmatically).

### P2-003 — Pollinations random seed path can duplicate seeds in batch mode
- Area: Provider correctness (Pollinations)
- Evidence (pre-fix):
  - Random seed path location: `index.js:1268`
  - Batch loops execute rapid per-item provider calls:
    - `index.js:5599` (generate)
    - `index.js:5824` (inject)
    - `index.js:3294` (regenerate)
- Impact (pre-fix):
  - In non-sequential seed batches, adjacent images can share identical seed values and produce duplicates.
- Repro steps:
  1. Provider = Pollinations.
  2. `batchCount > 1`, `sequentialSeeds = false`, `seed = -1`.
  3. Generate repeatedly and inspect returned URLs/seeds.
- Expected:
  - Distinct random seeds per image in the batch.
- Actual (pre-fix):
  - Millisecond collisions are possible due `Date.now()` granularity.
- Fix direction:
  - Use per-batch RNG source with explicit per-item entropy (or always derive per-item seed index).

### P2-004 — Palette inject flow still auto-inserts all batch images without picker
- Area: Inject palette flow
- Evidence (pre-fix):
  - Palette path result handling: `index.js:5470` through `index.js:5486`
  - Main inject flow multi-image picker path: `index.js:5855` through `index.js:5856`
- Impact (pre-fix):
  - Behavior diverges between inject entrypoints; multi-image review/selection is skipped in palette flow.
- Repro steps:
  1. Enable inject mode + palette inject path.
  2. Set `batchCount > 1` and `autoInsert = true`.
  3. Trigger palette inject generation.
- Expected:
  - Multi-image picker appears before insertion (consistent with main inject flow).
- Actual (pre-fix):
  - All images auto-insert directly.
- Fix direction:
  - Align palette inject multi-result handling with `processInjectMessage` path.

### P2-005 — Character-specific settings are not loaded on initial extension startup
- Area: Character settings lifecycle
- Evidence (pre-fix):
  - Initialization path: `index.js:5918` through `index.js:5921`
  - `CHAT_CHANGED` path: `index.js:5961` through `index.js:5963`
- Impact (pre-fix):
  - Users with saved per-character settings may not see them applied until they switch chats.
- Repro steps:
  1. Save character settings.
  2. Reload ST with same chat already open.
  3. Observe defaults/global values until chat changes.
- Expected:
  - Saved character settings apply immediately at startup.
- Actual (pre-fix):
  - Application deferred to chat-change event.
- Fix direction:
  - Invoke `loadCharSettings()` once after UI creation/initial context load.

### P3-001 — Metadata drag-drop ignores valid PNG files when MIME type is empty
- Area: Metadata UX compatibility
- Evidence (pre-fix):
  - Metadata file-type guard location: `index.js:6306`
- Impact (pre-fix):
  - PNG files with blank MIME metadata from some file managers/browsers are silently ignored.
- Repro steps:
  1. Drop a PNG whose `File.type` is empty string.
  2. Observe no parse attempt.
- Expected:
  - PNG should still be attempted via signature/content check.
- Actual (pre-fix):
  - Handler exits immediately.
- Fix direction:
  - Fallback to filename/signature validation when MIME type is missing.

### P3-002 — Proxy chat URL builder can double-append `/chat/completions`
- Area: Proxy provider configuration robustness
- Evidence (pre-fix):
  - Chat endpoint normalization path: `index.js:2189` through `index.js:2192`
- Impact (pre-fix):
  - If user enters full chat endpoint URL, request becomes invalid (`.../chat/completions/chat/completions`).
- Repro steps:
  1. Set proxy URL to full chat endpoint.
  2. Trigger generation in chat-proxy mode.
- Expected:
  - Endpoint used as-is when already complete.
- Actual (pre-fix):
  - Duplicate path suffix can be produced.
- Fix direction:
  - Detect and normalize already-suffixed URLs.

### P3-003 — Several localStorage writes are unguarded and can hard-fail on quota
- Area: Persistence resilience
- Evidence (pre-fix):
  - Representative persistence write paths touched by this issue:
    - `index.js:3339`, `index.js:3358`, `index.js:3390`, `index.js:3632`, `index.js:3691`, `index.js:3755`, `index.js:3876`, `index.js:3906`
- Impact (pre-fix):
  - Quota or storage exceptions can interrupt user actions (save profile/template/preset/filter).
- Repro steps:
  1. Fill localStorage near quota.
  2. Save template/profile/preset.
  3. Observe thrown exception path.
- Expected:
  - Graceful error handling and user feedback.
- Actual (pre-fix):
  - Some flows can throw without fallback.
- Fix direction:
  - Wrap all persistent writes with the same defensive pattern used in gallery/history paths.

### P4-001 — Prompt history copy would copy escaped markup text even when fixed
- Area: Prompt history UX polish
- Evidence (pre-fix):
  - History prompt rendering via `escapeHtml(...)`: `index.js:2454`
- Impact (pre-fix):
  - Copied prompt contains HTML entities (`&lt;`, `&amp;`) instead of original raw prompt text.
- Repro steps:
  1. Use prompt containing `<`, `>`, `&`.
  2. Copy from history.
- Expected:
  - Raw original prompt copied.
- Actual (pre-fix):
  - Escaped representation copied.
- Fix direction:
  - Copy from underlying source object (`promptHistory`) or a non-escaped data attribute.

## Remediation Status (Updated 2026-02-24)
- P1-001 — **Fixed, code-verified**. Cleanup release moved under a guaranteed path in `processInjectMessage` (`index.js:5878`).
- P1-002 — **Fixed, code-verified**. Selected LLM preset is applied/restored around request and request always includes preset extraction (`index.js:885`, `index.js:911`).
- P2-001 — **Fixed, code-verified**. `injectInsertMode` now drives mode-specific insertion via `autoInsertInjectImage` (`index.js:2584`, `index.js:5845`).
- P2-002 — **Fixed, live-verified**. Prompt-history copy uses bound per-entry handler and no DOM-scope null dereference (`index.js:2452`, `index.js:2458`).
- P2-003 — **Fixed, code-verified**. Pollinations random seed path uses RNG-based integer seed instead of `Date.now()` (`index.js:1268`).
- P2-004 — **Fixed, code-verified**. Palette inject multi-image output now routes to batch picker (`index.js:5486`).
- P2-005 — **Fixed, code-verified**. Character settings are loaded during startup init, not only on `CHAT_CHANGED` (`index.js:5921`).
- P3-001 — **Fixed, live-verified**. Metadata drop accepts `.png` filename fallback when MIME type is empty (`index.js:6306`).
- P3-002 — **Fixed, code-verified**. Proxy chat URL normalization avoids duplicate `/chat/completions` suffix (`index.js:2189`).
- P3-003 — **Fixed, live-verified**. Added guarded persistent writes via `safeSetStorage` across template/profile/preset/filter/char/workflow/import paths (`index.js:157`, `index.js:3339`, `index.js:3691`, `index.js:3876`, `index.js:4014`).
- P4-001 — **Fixed, live-verified**. Prompt-history copy now uses underlying raw prompt object (`entry.prompt`) rather than escaped `<pre>` text (`index.js:2464`).

## Residual Risk / Gaps (Post-Fix)
- No open findings remain from this 11-item sweep as of 2026-02-24.
- Full provider matrix validation is still incomplete (all providers/credential combinations were not exercised end-to-end in live generation).
- Character-startup load (`P2-005`) was code-verified, but not fully scenario-verified with a persisted per-character chat context in this run.
