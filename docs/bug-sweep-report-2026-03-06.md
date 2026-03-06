# Comprehensive Bug Sweep Report — Quick Image Gen

Date: 2026-03-06
Repo: `/run/media/platinum/HDD/sillytavern-image-gen`
Reviewer: Codex
Version: `1.4.13`

## Executive Summary
- Total findings: 7
- Severity breakdown:
  - P1: 0
  - P2: 3
  - P3: 4
  - P4: 0
- Sweep coverage completed:
  - Full static audit of prompt sourcing, provider adapters, generation orchestration, metadata export/import, gallery/download persistence, and runtime state transitions in `index.js`.
  - Runtime validation using Playwright against local SillyTavern at `http://127.0.0.1:8000` after syncing the worktree into the installed extension slot.

## Validation Notes
- Non-mutating checks run:
  - `node --check index.js`
  - targeted code scans for seed handling, metadata/export paths, gallery persistence, and message-to-prompt sourcing.
- Runtime checks run:
  - Synced `index.js`, `manifest.json`, and `style.css` into the installed extension slot and confirmed the installed manifest version moved to `1.4.13`.
  - Opened local SillyTavern with Playwright, verified QIG loaded into the page, switched the active provider to Pollinations, and reproduced a successful result-popup path.
  - For automation only, local SillyTavern `basicAuthMode` in ignored `config.yaml` was temporarily disabled and restored after the sweep.
- Runtime caveats:
  - The previously saved Local provider endpoint was `http://10.255.255.1:8188`, so the first palette quick-generate path hung on that unreachable environment target; this was treated as environment-specific, not a QIG bug.
  - Page console noise from unrelated third-party extensions was present during runtime validation; findings below were isolated to QIG-specific code paths or reproducible QIG behavior.

## Findings

### P2-001 — Default “use chat message” flow can inject raw HTML from welcome-page messages into prompts
- Area: Prompt sourcing / runtime generation correctness
- Evidence:
  - `useLastMessage` defaults to `true`: `index.js:21`
  - `getMessages()` returns raw `msg.mes` for both single-message and multi-message paths without stripping markup: `index.js:1648-1675`
  - Main generation replaces the base prompt with `getMessages()` when `useLastMessage` is enabled: `index.js:8236-8249`
  - Live repro (executed): on the SillyTavern welcome screen, a Pollinations generation stored a prompt containing raw UI markup for the welcome-page buttons (`API Connections`, `Character Management`, `Extensions`) in the generated gallery entry.
- Repro steps:
  1. Open SillyTavern on the welcome page with no normal RP chat content selected.
  2. Leave `Use chat message as prompt` enabled.
  3. Generate an image through QIG.
- Expected:
  - Prompt context should use plain visible message text only, or gracefully fall back when the current message is HTML/UI scaffolding.
- Actual:
  - Raw HTML from `msg.mes` can be injected directly into the image prompt.
- Impact:
  - Prompts become contaminated with page/UI markup, producing nonsensical generations and polluting gallery/history entries.
  - The bug is easy to hit because the default setting enables `useLastMessage`.
- Fix direction:
  - Normalize `msg.mes` to plain text before prompt use.
  - Guard welcome-page / HTML-rich messages and fall back to the user prompt when extracted text is mostly markup or empty after stripping tags.

### P2-002 — Stability “random seed” path sends deterministic seed `0`
- Area: Stability provider adapter
- Evidence:
  - Stability request body forces `seed: s.seed === -1 ? 0 : s.seed`: `index.js:4574-4592`
- Impact:
  - When users expect “random seed” behavior (`-1` elsewhere in the extension), Stability requests instead reuse seed `0`.
  - Repeated runs can produce far less variation than the UI implies.
- Fix direction:
  - Omit the `seed` field when the user selected random, or map it to the provider’s true random-seed behavior rather than hard-coding `0`.

### P2-003 — Downloaded metadata reflects current UI state, not the image’s original generation settings
- Area: Gallery/download metadata correctness
- Evidence:
  - Gallery items persist only `url`, `thumbnail`, `prompt`, `negative`, `provider`, and `date`: `index.js:4107-4112`
  - The live runtime gallery entry confirmed that no steps / sampler / cfg / seed snapshot is stored; the first entry contained only those six keys.
  - Download buttons rebuild metadata at click time from `getSettings()`: `index.js:4201-4204`, `index.js:4367-4375`
- Repro steps:
  1. Generate an image.
  2. Change provider or generation parameters.
  3. Download the older image from the popup or batch browser.
- Expected:
  - Downloaded metadata should describe the image that was actually generated.
- Actual:
  - Metadata is rebuilt from the current live UI settings, which may no longer match the older image.
- Impact:
  - Downloaded images can embed incorrect provenance and restore the wrong settings on metadata import.
- Fix direction:
  - Persist a settings snapshot per generated image (gallery entries, batch results, and any popup state) and feed that snapshot into `downloadWithMetadata()` instead of calling `getSettings()` at download time.

### P3-001 — Random-seed metadata can export `Seed: -1` instead of the actual seed used
- Area: Metadata reproducibility
- Evidence:
  - Metadata export reads `s.seed` (or `s.proxySeed`) directly: `index.js:8727-8745`, `index.js:8852-8863`
  - Several providers compute a concrete random seed locally without writing it back to `s.seed`, e.g. Pollinations: `index.js:2437-2444`, NovelAI: `index.js:2447-2476`, and Comfy/local workflows: `index.js:3025-3040`
  - `maybeFinalizeUrl()` receives the metadata snapshot built from those unchanged settings: `index.js:4761`, `index.js:4775`, `index.js:8179`, `index.js:8330`, `index.js:8563`
- Impact:
  - Images generated with a random seed can embed non-reproducible metadata (`Seed: -1`) even when QIG itself already chose a concrete seed.
- Fix direction:
  - Capture the resolved seed used for each request and thread that resolved value into the metadata snapshot passed to `maybeFinalizeUrl()` / `downloadWithMetadata()`.

### P3-002 — Metadata schema is provider-lossy and import restores only generic fields
- Area: Metadata round-trip fidelity
- Evidence:
  - Metadata export writes `Model: ${settings.provider}` rather than the real model identifier: `index.js:8855-8863`
  - Import parsing only extracts a single `Model` string and generic fields: `index.js:9020-9036`
  - Import applies only generic `steps`, `cfgScale`, `seed`, `width`, `height`, `sampler`, and `a1111Scheduler`, plus provider if `PROVIDERS[params.model]` matches: `index.js:9078-9142`
  - Provider-specific state such as `falModel`, `togetherModel`, `replicateModel`, `civitaiModel`, proxy-local fields, and other provider-specific knobs is never exported or restored.
- Impact:
  - Metadata round-trips lose real model identity and provider-specific settings.
  - Import can silently reopen an image under a coarse provider slug while missing the actual model/subtype that produced it.
- Fix direction:
  - Expand metadata to include the concrete model ID plus provider-specific fields where they matter.
  - Make import branch by provider and restore the correct provider-specific settings object, not only the generic shared fields.

### P3-003 — Download-with-metadata saves non-PNG outputs with the wrong extension/MIME
- Area: Download metadata flow / file handling
- Evidence:
  - Download buttons always pass `.png` filenames: `index.js:4204`, `index.js:4369-4375`
  - `downloadWithMetadata()` treats every non-PNG file as JPEG: `index.js:8916-8923`
  - The codebase already has a format detector used by save-to-server (`detectImageFormat()`), but the download path does not reuse it: `index.js:8774-8790`, `index.js:8803-8810`
- Impact:
  - WebP/JPEG results can be downloaded as `*.png` while the blob MIME is forced to `image/jpeg`.
  - Users may get misleading filenames, mismatched content types, or broken expectations in downstream tools.
- Fix direction:
  - Reuse `detectImageFormat()` in `downloadWithMetadata()` and derive both the filename extension and blob MIME from the detected format.
  - Only attempt PNG metadata embedding for actual PNGs.

### P3-004 — PNG metadata import ignores `iTXt` and `zTXt` chunks
- Area: Metadata interoperability
- Evidence:
  - `readInfoFromPNG()` looks only for `tEXt` chunks named `parameters`: `index.js:8939-8978`
- Impact:
  - PNGs that store equivalent metadata in `iTXt` or compressed `zTXt` chunks are treated as if they have no generation parameters.
  - Cross-tool interoperability is weaker than necessary.
- Fix direction:
  - Extend the PNG reader to parse `iTXt` and `zTXt` variants (including decompression for `zTXt`) before declaring the image unsupported.

## Remediation Plan (Commit-Sized)
1. Prompt-source sanitization
- Strip HTML from `msg.mes` before using it as scene text.
- Add a guard for welcome-page / HTML-heavy messages so QIG falls back to the configured prompt instead of consuming UI markup.

2. Seed correctness
- Fix Stability random-seed handling.
- Capture resolved per-request seeds and persist them into metadata snapshots.

3. Metadata provenance snapshot
- Store a per-image generation snapshot alongside gallery/batch items.
- Route popup and batch downloads through that snapshot instead of `getSettings()`.

4. Metadata schema fidelity
- Export/import real model IDs and provider-specific fields where applicable.
- Keep generic fields as a compatibility layer, not the only schema.

5. File-format and PNG parser hardening
- Reuse `detectImageFormat()` for download naming/MIME.
- Add `iTXt` / `zTXt` support in the PNG metadata reader.

## Residual Risk / Gaps
- Full credentialed provider matrix was not executed live; external paid providers were audited statically only.
- Metadata download was not verified through OS-level file save dialogs, but the code-path mismatch is directly evident in the implementation.
- Runtime validation occurred in a local SillyTavern environment with unrelated third-party extension noise; only QIG-specific observations were turned into findings.
