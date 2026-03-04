# Prompt Replacement Maps Test Matrix

Date: 2026-03-04  
Feature: Prompt Replacement Maps (global + character scope, exact token matching, preset/import/export support)

## Test Setup

1. Open QIG settings in SillyTavern.
2. Open **Logs** (`📋 Logs`) so final prompt traces are visible.
3. Keep one known character card active (example: `Miranda`) and one other character for cross-checks.
4. Create this baseline global map:
   - Name: `Miranda Global`
   - Scope: `Global`
   - Target: `Positive`
   - Trigger: `miranda`
   - Replacement: `<lora:miranda_v2:0.8>, 1girl, miranda, detailed face`
   - Priority: `10`

## Functional Matrix

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| PRM-001 | Basic global replacement | Generate with prompt containing token `miranda` in positive prompt context. | `miranda` token is removed and replacement tags are appended once. Logs show `Replacement maps: ... applied`. |
| PRM-002 | No substring false-positive | Use token `admiranda` only. | No replacement fires (exact token match only). |
| PRM-003 | LoRA token identity | Trigger uses `<lora:foo>` and prompt contains `<lora:foo:0.6>`. | Match succeeds by LoRA name; weighted token is treated as same trigger identity. |
| PRM-004 | Target=Positive only | Set map target to `Positive`, include trigger token in negative only. | No replacement in negative prompt. |
| PRM-005 | Target=Negative only | Set map target to `Negative`, include trigger token in negative. | Negative prompt token replaced; positive unchanged. |
| PRM-006 | Target=Both | Set map target to `Both`, include trigger in both positive/negative. | Replacement applied in both fields. |
| PRM-007 | Priority ordering | Two global maps share trigger `miranda`; priorities 20 and 5. | Priority 20 map claims token first; lower one does not re-claim same token. |
| PRM-008 | Char-over-global tie-break | Global and character map share trigger and equal priority. | Character-scoped map wins when that character is active. |
| PRM-009 | Scope isolation | Create character-scoped map for character A, then switch to character B. | Character A map does not apply in character B chat. |
| PRM-010 | Toggle disable | Disable a map using checkbox, generate same scene. | Disabled map never applies; re-enable restores behavior. |
| PRM-011 | Duplicate scope | Duplicate global map to character scope using `⧉`. | Duplicate appears under character maps and applies only on active character. |
| PRM-012 | Clear by scope | Use `Clear All` prompt options in a character chat. | Option 2 clears only global maps; Option 3 clears only active character maps. |

## Pipeline / Mode Matrix

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| PRM-013 | Direct mode pipeline | Generate in Direct mode with contextual filters and replacement map both matching. | Contextual filters apply first, replacement map applies after, then provider call. |
| PRM-014 | Inject palette mode | Use Inject palette flow with extracted tags containing trigger token. | Replacement map still applies to final prompt before generation. |
| PRM-015 | Inject auto mode | Let message with `<image>` or `<pic>` trigger auto inject generation. | Replacement map applies in inject flow; logs show replacement application. |

## Persistence Matrix

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| PRM-016 | Preset save/load | Save preset with maps configured, then alter maps, then load preset. | Maps and active states restore from preset snapshot. |
| PRM-017 | Settings export/import | Export settings JSON, clear maps, import JSON. | Maps + active states restore exactly after import. |
| PRM-018 | Chat switch render | Switch between chats/characters after maps exist. | Replacement map panel refreshes correctly for active character context. |

## Endpoint Coexistence Matrix

Goal: verify extension-first behavior when server endpoint also performs replacements.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| PRM-019 | Extension-first transform | Keep endpoint replacement on. Generate with known trigger. Compare QIG final prompt log with endpoint-side received prompt log. | QIG logs already show replaced prompt before request leaves client; endpoint receives transformed prompt. |
| PRM-020 | Non-conflicting stacked rules | Use extension map for `miranda`, endpoint rule for unrelated token. | Both systems can apply without conflict. |
| PRM-021 | Conflicting same-token behavior | Enable same-token replacement on both extension and endpoint. | Endpoint may further transform already-replaced prompt; confirm final output is acceptable or disable one side. |

## Miranda Regression Checklist

1. `miranda` in prompt replaces to `<lora:miranda_v2:0.8>, 1girl, ...` in Direct mode.
2. Same replacement works in Inject mode.
3. Character-scoped Miranda map only applies on Miranda card/chat.
4. Global fallback map still applies on other cards if enabled.
5. Preset/export/import retain Miranda map definitions.

## Pass Criteria

1. All PRM-001 through PRM-021 behave as expected.
2. No syntax/runtime errors in browser console during add/edit/delete/toggle actions.
3. No regression in existing contextual filter behavior.
