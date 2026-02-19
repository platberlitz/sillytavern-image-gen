# User Feedback Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 issues from user feedback: inject formatting breaks, inject auto-insert before batch pick, batch regen only makes 1 image, and replace LLM Override with ST Connection Profile + Preset dropdowns.

**Architecture:** All changes are in `index.js` (single-file extension). Tasks 1-3 are surgical bug fixes in specific functions. Task 4 is a settings migration + UI replacement + API rewrite for the LLM Override system.

**Tech Stack:** JavaScript (SillyTavern extension), SillyTavern API (`ConnectionManagerRequestService`, `generateQuietPrompt`, `getContext`)

---

### Task 1: Fix inject mode `inUser` position breaking formatting

**Files:**
- Modify: `index.js:4538-4545` — `onChatCompletionPromptReady()` inUser branch
- Modify: `index.js:3633` — UI option label for inUser

**Step 1: Fix `inUser` to insert separate system message instead of appending to user content**

In `onChatCompletionPromptReady()`, replace the `inUser` branch:

```javascript
// OLD (line 4538-4545):
} else if (position === "inUser") {
    // Append to the last user message
    for (let i = prompts.length - 1; i >= 0; i--) {
        if (prompts[i].role === "user") {
            prompts[i].content += "\n\n" + promptText;
            break;
        }
    }
}

// NEW:
} else if (position === "inUser") {
    // Insert as system message before the last user message
    for (let i = prompts.length - 1; i >= 0; i--) {
        if (prompts[i].role === "user") {
            prompts.splice(i, 0, injectMsg);
            break;
        }
    }
}
```

**Step 2: Add warning text to the UI option**

At line 3633, update the option label:

```javascript
// OLD:
<option value="inUser" ${s.injectPosition === "inUser" ? "selected" : ""}>In User Message</option>

// NEW:
<option value="inUser" ${s.injectPosition === "inUser" ? "selected" : ""}>Before User Message</option>
```

**Step 3: Commit**

```bash
git add index.js
git commit -m "fix: inject inUser position no longer appends to user message content

Inserts a separate system message before the last user message instead
of concatenating into its content. Prevents breaking thinking blocks,
Start Reply With, and other formatting features."
```

---

### Task 2: Fix inject auto-insert skipping batch picker

**Files:**
- Modify: `index.js:4670-4690` — result display logic in `processInjectMessage()`

**Step 1: Replace the result display logic**

In `processInjectMessage()`, replace lines 4670-4690:

```javascript
// OLD:
if (results.length > 0) {
    if (s.autoInsert) {
        const insertMode = s.injectInsertMode || "replace";
        if (insertMode === "inline" || insertMode === "replace") {
            for (const r of results) {
                addToGallery(r);
                try { await insertImageIntoMessage(r); } catch (err) {
                    log(`Inject: Auto-insert failed: ${err.message}`);
                    displayImage(r);
                }
            }
        } else if (results.length === 1) {
            displayImage(results[0]);
        } else {
            displayBatchResults(results);
        }
    } else if (results.length === 1) {
        displayImage(results[0]);
    } else {
        displayBatchResults(results);
    }
    toastr.success(`Inject mode: ${results.length} image(s) generated`);
}

// NEW:
if (results.length > 0) {
    if (results.length === 1) {
        if (s.autoInsert) {
            addToGallery(results[0]);
            try { await insertImageIntoMessage(results[0]); } catch (err) {
                log(`Inject: Auto-insert failed: ${err.message}`);
                displayImage(results[0]);
            }
        } else {
            displayImage(results[0]);
        }
    } else {
        // Always show batch picker for multiple images
        displayBatchResults(results);
    }
    toastr.success(`Inject mode: ${results.length} image(s) generated`);
}
```

**Step 2: Commit**

```bash
git add index.js
git commit -m "fix: inject mode shows batch picker before auto-inserting

When batch count > 1, always show the batch popup so the user can
browse and pick images. Auto-insert only applies for single images."
```

---

### Task 3: Make regenerateImage() batch-aware

**Files:**
- Modify: `index.js:2605-2627` — `regenerateImage()` function

**Step 1: Rewrite `regenerateImage()` to support batch**

Replace the entire function:

```javascript
// OLD (line 2605-2627):
async function regenerateImage() {
    if (isGenerating) return;
    if (!lastPrompt) {
        showStatus("❌ No previous prompt to regenerate");
        return;
    }
    isGenerating = true;
    const s = getSettings();
    s.seed = -1;
    showStatus("🔄 Regenerating...");
    log(`Regenerating with prompt: ${lastPrompt.substring(0, 50)}...`);
    try {
        const result = await generateForProvider(lastPrompt, lastNegative, s);
        hideStatus();
        if (result) displayImage(result);
    } catch (e) {
        showStatus(`❌ ${e.message}`);
        log(`Regenerate error: ${e.message}`);
        setTimeout(hideStatus, 3000);
    } finally {
        isGenerating = false;
    }
}

// NEW:
async function regenerateImage() {
    if (isGenerating) return;
    if (!lastPrompt) {
        showStatus("❌ No previous prompt to regenerate");
        return;
    }
    isGenerating = true;
    const s = getSettings();
    const batchCount = s.batchCount || 1;
    const originalSeed = s.seed;
    s.seed = -1;
    log(`Regenerating with prompt: ${lastPrompt.substring(0, 50)}... (batch: ${batchCount})`);
    try {
        if (batchCount <= 1) {
            showStatus("🔄 Regenerating...");
            const result = await generateForProvider(lastPrompt, lastNegative, s);
            hideStatus();
            if (result) displayImage(result);
        } else {
            const results = [];
            let baseSeed = Math.floor(Math.random() * 2147483647);
            for (let i = 0; i < batchCount; i++) {
                if (s.sequentialSeeds) s.seed = baseSeed + i;
                showStatus(`🔄 Regenerating ${i + 1}/${batchCount}...`);
                const expandedPrompt = expandWildcards(lastPrompt);
                const expandedNegative = expandWildcards(lastNegative);
                const result = await generateForProvider(expandedPrompt, expandedNegative, s);
                if (result) results.push(result);
            }
            hideStatus();
            if (results.length > 1) {
                displayBatchResults(results);
            } else if (results.length === 1) {
                displayImage(results[0]);
            }
        }
    } catch (e) {
        showStatus(`❌ ${e.message}`);
        log(`Regenerate error: ${e.message}`);
        setTimeout(hideStatus, 3000);
    } finally {
        s.seed = originalSeed;
        isGenerating = false;
    }
}
```

**Step 2: Commit**

```bash
git add index.js
git commit -m "fix: regenerate respects batch count setting

Regeneration now generates batchCount images with sequential seeds
and shows the batch picker popup instead of single displayImage()."
```

---

### Task 4: Replace LLM Override with Connection Profile + Preset dropdowns

**Files:**
- Modify: `index.js:132-138` — default settings
- Modify: `index.js:654-685` — `callOverrideLLM()` function
- Modify: `index.js:631`, `index.js:878`, `index.js:4233` — callsites that check `llmOverrideEnabled && llmOverrideUrl && llmOverrideModel`
- Modify: `index.js:3662-3686` — UI HTML for LLM Override panel
- Modify: `index.js:4108-4117` — event bindings for LLM Override fields

**Step 1: Update default settings**

Replace old LLM Override defaults (lines 131-138):

```javascript
// OLD:
// LLM Override (separate AI for image prompts)
llmOverrideEnabled: false,
llmOverrideUrl: "",
llmOverrideKey: "",
llmOverrideModel: "",
llmOverrideTemp: 0.7,
llmOverrideMaxTokens: 500,
llmOverrideSystemPrompt: "",

// NEW:
// LLM Override (separate AI for image prompts via Connection Manager)
llmOverrideEnabled: false,
llmOverrideProfileId: "",
llmOverridePreset: "",
llmOverrideMaxTokens: 500,
```

**Step 2: Add helper to populate connection profile dropdown**

Add a new helper function near the top of the file (after the settings helpers):

```javascript
function populateConnectionProfiles(selectId, selectedId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Use main chat AI --</option>';
    try {
        const ctx = SillyTavern.getContext();
        const CMRS = ctx.ConnectionManagerRequestService;
        if (!CMRS) {
            select.innerHTML += '<option value="" disabled>Connection Manager not available (requires ST 1.15.0+)</option>';
            return;
        }
        const profiles = CMRS.getSupportedProfiles();
        for (const p of profiles) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            if (p.id === selectedId) opt.selected = true;
            select.appendChild(opt);
        }
    } catch (e) {
        log(`Failed to load connection profiles: ${e.message}`);
        select.innerHTML += '<option value="" disabled>Error loading profiles</option>';
    }
}

async function populatePresetList(selectId, selectedPreset) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Default (from profile) --</option>';
    try {
        const ctx = SillyTavern.getContext();
        const result = await ctx.executeSlashCommandsWithOptions('/preset-list');
        const presets = result?.pipe ? JSON.parse(result.pipe) : [];
        for (const name of presets) {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            if (name === selectedPreset) opt.selected = true;
            select.appendChild(opt);
        }
    } catch (e) {
        log(`Failed to load presets: ${e.message}`);
    }
}
```

**Step 3: Rewrite `callOverrideLLM()`**

Replace the function (line 654-685):

```javascript
// OLD:
async function callOverrideLLM(instruction, systemPrompt = "") {
    const s = getSettings();
    const baseUrl = s.llmOverrideUrl.replace(/\/+$/, '');
    const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    const messages = [];
    const sys = systemPrompt || s.llmOverrideSystemPrompt;
    if (sys) messages.push({ role: "system", content: sys });
    messages.push({ role: "user", content: instruction });
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.llmOverrideKey}`
        },
        body: JSON.stringify({
            model: s.llmOverrideModel,
            messages,
            temperature: s.llmOverrideTemp || 0.7,
            max_tokens: s.llmOverrideMaxTokens || 500
        })
    });
    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`LLM Override ${response.status}: ${errText.substring(0, 200)}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// NEW:
async function callOverrideLLM(instruction, systemPrompt = "") {
    const s = getSettings();
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;

    if (!CMRS || !s.llmOverrideProfileId) {
        // Fallback: use main chat AI via generateQuietPrompt
        log("LLM Override: No Connection Manager or profile, falling back to main AI");
        const quietOptions = { skipWIAN: true, quietName: `ImageGen_${Date.now()}`, quietToLoud: false };
        try {
            return await generateQuietPrompt(instruction, quietOptions);
        } catch {
            return await generateQuietPrompt(instruction);
        }
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: instruction });

    log(`LLM Override: Using connection profile '${s.llmOverrideProfileId}'`);
    const response = await CMRS.sendRequest(
        s.llmOverrideProfileId,
        messages,
        s.llmOverrideMaxTokens || 500,
        { extractData: true, includePreset: !!s.llmOverridePreset, stream: false }
    );
    return typeof response === "string" ? response : (response?.content || response?.message?.content || String(response));
}
```

**Step 4: Update callsite guards**

At lines 631, 878, and 4233, change the condition:

```javascript
// OLD:
if (s.llmOverrideEnabled && s.llmOverrideUrl && s.llmOverrideModel) {

// NEW:
if (s.llmOverrideEnabled && s.llmOverrideProfileId) {
```

(At all 3 locations.)

**Step 5: Replace UI HTML**

Replace lines 3662-3686 (the LLM Override panel):

```javascript
// OLD:
<div style="margin:6px 0;padding:8px;border:1px solid #555;border-radius:4px;">
    <label class="checkbox_label">
        <input id="qig-llm-override" type="checkbox" ${s.llmOverrideEnabled ? "checked" : ""}>
        <span>Use separate AI for image prompts</span>
    </label>
    <div id="qig-llm-override-options" style="display:${s.llmOverrideEnabled ? 'block' : 'none'};margin-top:6px;">
        <label style="font-size:11px;">API Base URL (OpenAI-compatible)</label>
        <input id="qig-llm-override-url" type="text" value="${s.llmOverrideUrl}" placeholder="https://openrouter.ai/api/v1" style="width:100%;">
        <label style="font-size:11px;">API Key</label>
        <input id="qig-llm-override-key" type="password" value="${s.llmOverrideKey}" placeholder="sk-..." style="width:100%;">
        <label style="font-size:11px;">Model</label>
        <input id="qig-llm-override-model" type="text" value="${s.llmOverrideModel}" placeholder="google/gemini-2.0-flash-001" style="width:100%;">
        <div style="display:flex;gap:8px;">
            <div style="flex:1;">
                <label style="font-size:11px;">Temperature</label>
                <input id="qig-llm-override-temp" type="number" value="${s.llmOverrideTemp || 0.7}" min="0" max="2" step="0.1" style="width:100%;">
            </div>
            <div style="flex:1;">
                <label style="font-size:11px;">Max Tokens</label>
                <input id="qig-llm-override-max" type="number" value="${s.llmOverrideMaxTokens || 500}" min="50" max="4096" style="width:100%;">
            </div>
        </div>
        <label style="font-size:11px;">System Prompt (optional)</label>
        <textarea id="qig-llm-override-sys" style="width:100%;height:40px;resize:vertical;" placeholder="You are an image prompt generator...">${s.llmOverrideSystemPrompt || ""}</textarea>
    </div>
</div>

// NEW:
<div style="margin:6px 0;padding:8px;border:1px solid #555;border-radius:4px;">
    <label class="checkbox_label">
        <input id="qig-llm-override" type="checkbox" ${s.llmOverrideEnabled ? "checked" : ""}>
        <span>Use separate AI for image prompts</span>
    </label>
    <div id="qig-llm-override-options" style="display:${s.llmOverrideEnabled ? 'block' : 'none'};margin-top:6px;">
        <label style="font-size:11px;">Connection Profile</label>
        <select id="qig-llm-override-profile" style="width:100%;"></select>
        <label style="font-size:11px;margin-top:4px;">Completion Preset (optional)</label>
        <select id="qig-llm-override-preset-select" style="width:100%;"></select>
        <label style="font-size:11px;margin-top:4px;">Max Tokens</label>
        <input id="qig-llm-override-max" type="number" value="${s.llmOverrideMaxTokens || 500}" min="50" max="4096" style="width:100%;">
    </div>
</div>
```

**Step 6: Update event bindings**

Replace lines 4108-4117 (old bindings):

```javascript
// OLD:
getSettings().llmOverrideEnabled = e.target.checked;
document.getElementById("qig-llm-override-options").style.display = e.target.checked ? "block" : "none";
// ... bind() calls for url, key, model, temp, max, sys

// NEW:
document.getElementById("qig-llm-override").addEventListener("change", (e) => {
    getSettings().llmOverrideEnabled = e.target.checked;
    document.getElementById("qig-llm-override-options").style.display = e.target.checked ? "block" : "none";
    if (e.target.checked) {
        populateConnectionProfiles("qig-llm-override-profile", getSettings().llmOverrideProfileId);
        populatePresetList("qig-llm-override-preset-select", getSettings().llmOverridePreset);
    }
    saveSettingsDebounced();
});
document.getElementById("qig-llm-override-profile").addEventListener("change", (e) => {
    getSettings().llmOverrideProfileId = e.target.value;
    saveSettingsDebounced();
});
document.getElementById("qig-llm-override-preset-select").addEventListener("change", (e) => {
    getSettings().llmOverridePreset = e.target.value;
    saveSettingsDebounced();
});
bind("qig-llm-override-max", "llmOverrideMaxTokens", true);
```

**Step 7: Populate dropdowns on init**

After `createUI()` and `loadSettings()`, add:

```javascript
// Populate LLM override dropdowns if enabled
const s = getSettings();
if (s.llmOverrideEnabled) {
    populateConnectionProfiles("qig-llm-override-profile", s.llmOverrideProfileId);
    populatePresetList("qig-llm-override-preset-select", s.llmOverridePreset);
}
```

**Step 8: Commit**

```bash
git add index.js
git commit -m "feat: replace LLM Override with ST Connection Profile + Preset dropdowns

Removes manual API URL/Key/Model/Temp/SystemPrompt fields.
Uses SillyTavern's ConnectionManagerRequestService to route LLM calls
through connection profiles. Falls back to generateQuietPrompt for
pre-1.15.0 compatibility."
```

---

### Task 5: Final cleanup and version bump

**Files:**
- Modify: `manifest.json` — version bump
- Modify: `index.js` — remove any leftover references to old settings keys

**Step 1: Bump version in manifest.json**

```json
"version": "1.2.0"
```

**Step 2: Clean up old settings references**

Search for any remaining `llmOverrideUrl`, `llmOverrideKey`, `llmOverrideModel`, `llmOverrideTemp`, `llmOverrideSystemPrompt` references and remove them. The settings loader should gracefully ignore unknown keys in localStorage.

**Step 3: Commit**

```bash
git add index.js manifest.json
git commit -m "chore: bump version to 1.2.0, clean up removed settings"
```
