# User Feedback Fixes — Design Doc

Date: 2026-02-20
Source: Discord feedback from Geh

## Issues

1. Inject mode breaks thinking block / message formatting
2. Inject mode auto-inserts images before user can pick from batch
3. Batch regeneration only produces 1 image instead of batch amount
4. LLM Override UI is too complex — should use ST Connection Profiles

## 1. Inject Mode Formatting Fix

**Root cause:** `onChatCompletionPromptReady()` with `inUser` position appends the inject prompt directly into the last user message content (`prompts[i].content += "\n\n" + promptText`). This disrupts "Start Reply With", thinking blocks, and general message formatting.

**Fix:** Change `inUser` to insert a separate system message before the last user message instead of concatenating into its content.

```
Before: user_msg.content += "\n\n" + injectPrompt
After:  prompts.splice(lastUserIndex, 0, {role: "system", content: injectPrompt})
```

`afterScenario` and `atDepth` already insert separate messages — no changes needed.

Add UI warning: "In User Message may interfere with thinking/reasoning models."

**Files:** `index.js` — `onChatCompletionPromptReady()` (~line 4538-4545)

## 2. Inject Auto-Insert Respects Batch Selection

**Root cause:** In `processInjectMessage()` lines 4670-4690, when `autoInsert` is on and `injectInsertMode` is "inline"/"replace", ALL batch images are immediately inserted into the message. The batch picker popup is never shown.

**Fix:** When `results.length > 1`, always show `displayBatchResults()` regardless of `autoInsert` setting. The batch popup's Insert/Insert All buttons handle insertion. `autoInsert` only applies to single-image results.

```javascript
// In processInjectMessage(), replace the result display logic:
if (results.length === 1) {
    if (s.autoInsert) {
        addToGallery(results[0]);
        await insertImageIntoMessage(results[0]);
    } else {
        displayImage(results[0]);
    }
} else {
    // Always show batch picker for multiple images
    displayBatchResults(results);
}
```

**Files:** `index.js` — `processInjectMessage()` (~line 4670-4690)

## 3. Batch-Aware Regeneration

**Root cause:** `regenerateImage()` generates exactly 1 image via `generateForProvider()` and calls `displayImage()`. It ignores `batchCount`.

**Fix:** Read `batchCount` from settings. If > 1, generate that many images with sequential seed support, then show `displayBatchResults()`.

```javascript
async function regenerateImage() {
    const s = getSettings();
    const batchCount = s.batchCount || 1;
    s.seed = -1;

    if (batchCount === 1) {
        // Current single-image behavior
        const result = await generateForProvider(lastPrompt, lastNegative, s);
        if (result) displayImage(result);
    } else {
        // Batch regeneration
        const results = [];
        let baseSeed = Math.floor(Math.random() * 2147483647);
        for (let i = 0; i < batchCount; i++) {
            if (s.sequentialSeeds) s.seed = baseSeed + i;
            const result = await generateForProvider(
                expandWildcards(lastPrompt), expandWildcards(lastNegative), s
            );
            if (result) results.push(result);
        }
        if (results.length > 0) displayBatchResults(results);
    }
}
```

**Files:** `index.js` — `regenerateImage()` (~line 2605-2627)

## 4. Replace LLM Override with Connection Profile + Preset

**Root cause:** The LLM Override panel has 6 fields (URL, key, model, temp, max tokens, system prompt) that duplicate SillyTavern's Connection Manager configuration. Users want a simple dropdown like QVink.

### Settings Changes

**Remove:** `llmOverrideUrl`, `llmOverrideKey`, `llmOverrideModel`, `llmOverrideTemp`, `llmOverrideSystemPrompt`

**Add:** `llmOverrideProfileId` (string), `llmOverridePreset` (string)

**Keep:** `llmOverrideEnabled` (toggle), `llmOverrideMaxTokens` (per-request override)

### UI Changes

Replace the 6-field form with:
```
[x] Use separate AI for image prompts
    Connection Profile: [dropdown]
    Completion Preset:  [dropdown] (optional)
    Max Tokens:         [500]
```

Populate dropdowns:
- Profiles: `ConnectionManagerRequestService.getSupportedProfiles()`
- Presets: via `/preset-list` slash command or preset API

### Implementation

Replace `callOverrideLLM()` to use `ConnectionManagerRequestService.sendRequest()`:

```javascript
async function callOverrideLLM(instruction, systemPrompt = "") {
    const s = getSettings();
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;

    if (!CMRS) {
        // Fallback for pre-1.15.0
        return await generateQuietPrompt(instruction);
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: instruction });

    return await CMRS.sendRequest(
        s.llmOverrideProfileId,
        messages,
        s.llmOverrideMaxTokens || 500,
        { extractData: true, includePreset: true }
    );
}
```

### Migration

On settings load: if old fields (`llmOverrideUrl`, `llmOverrideKey`) exist but `llmOverrideProfileId` is empty, keep `llmOverrideEnabled` off and log a migration note.

**Files:** `index.js` — defaults (~line 132-138), `callOverrideLLM()` (~line 654), UI (~line 3662-3686), bindings (~line 4108-4117)
