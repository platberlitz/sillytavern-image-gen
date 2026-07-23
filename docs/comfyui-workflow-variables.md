# ComfyUI Workflow Variables

Custom ComfyUI workflows use API-format JSON from ComfyUI's `Save (API Format)` export. Paste that JSON into `Custom Workflow JSON`. QIG accepts either the API node map or a full request envelope containing a `prompt` node map.

QIG replaces placeholders anywhere inside string values before sending the workflow to `/prompt`. Replacement is a single pass over the original value, so placeholder-like text inside a prompt is not processed again.

| Placeholder | Value |
| --- | --- |
| `%prompt%` | Final positive prompt after LLM prompt generation, style, quality tags, ST Style, contextual filters, and wildcard expansion. |
| `%negative%` | Final negative prompt after ST Style, contextual filters, and wildcard expansion. |
| `%seed%` | Resolved seed for this image. If the seed is `-1`, QIG resolves a random seed before sending the workflow. |
| `%width%` | Current width setting. |
| `%height%` | Current height setting. |
| `%steps%` | Current steps setting. |
| `%cfg%` | Current CFG scale setting. |
| `%denoise%` | Current ComfyUI denoise setting. |
| `%clip_skip%` | Current ComfyUI clip skip setting. |
| `%clip_stop_at_layer%` | Negative typed CLIP layer value (`-abs(clip skip)`) for `CLIPSetLastLayer.stop_at_clip_layer`. |
| `%sampler%` | ComfyUI sampler name derived from the selected sampler. |
| `%scheduler%` | Current ComfyUI scheduler setting. |
| `%model%` | Current Local Model field. |
| `%reference_image%` | Uploaded ComfyUI image filename for the Local reference image, or an empty string when no reference image is set. |
| `%reference_image_1%`, `%reference_image_2%`, ... | Numbered uploaded reference filenames. The current Local UI supplies one reference, so later values are empty. |
| `%batch_index%` | Zero-based QIG batch item index. |
| `%batch_count%` | Total number of requested QIG batch items. |
| `%client_id%` | Run-specific ComfyUI client ID also sent with the prompt request. |
| `%filename_prefix%` | QIG filename prefix for output nodes that accept one. |

## Typed Values

When a node input is exactly a placeholder, QIG preserves numeric types where possible:

```json
"seed": "%seed%",
"width": "%width%",
"cfg": "%cfg%"
```

Those become numbers in the submitted workflow. If a placeholder is embedded inside other text, it is replaced as text:

```json
"filename_prefix": "qig_%seed%"
```

For `CLIPSetLastLayer`, use the exact typed token rather than a string such as `"-%clip_skip%"`:

```json
"stop_at_clip_layer": "%clip_stop_at_layer%"
```

## Reference Images

To use the Local reference image in a custom workflow:

1. Add a `LoadImage` node in ComfyUI.
2. Export the workflow in API format.
3. Set that node's `image` input to `%reference_image%`.

If no Local reference image is selected, `%reference_image%` becomes an empty string.

QIG uploads the reference only when the workflow contains a reference placeholder. It preserves the filename returned by ComfyUI, including any server-side collision rename and subfolder.

## Outputs

QIG reads every image in completed history, in deterministic node and image order. In Local ComfyUI settings:

- Leave **Output Node IDs** empty to accept every image output, or enter comma-separated node IDs.
- Set **Image Index** to `-1` for every image, or a zero-based index to select that image from each matching node.
- A completed workflow with no matching image fails immediately instead of waiting for the generation timeout.

## Safety and Cancellation

ComfyUI workflows are executable programs. Custom nodes can perform filesystem, network, or process side effects. Review imported JSON before running it. Executable Comfy workflow bodies are omitted from full QIG settings exports, and settings imports ignore workflow preset records rather than pairing them with an existing trusted local endpoint. Locally saved workflow presets remain unchanged.

QIG tracks each submitted prompt ID. Cancellation uses the targeted Jobs API when available and falls back to removing pending work through the queue API. It never sends a bodyless global interrupt. The optional targeted legacy interrupt can still be interpreted globally by older ComfyUI versions, so enable it only when that shared-server risk is acceptable.

If history polling times out, QIG makes the same safe targeted-or-queue cleanup attempt before reporting the timeout. It does not invoke risky legacy interruption automatically, so older servers without the Jobs API may continue work that is already running.

## Notes

- Placeholders are replaced only in JSON string values.
- Use API-format JSON, not the regular visual workflow export.
- Invalid, oversized, deeply nested, or visual-format workflow JSON is rejected before submission. Clear the custom workflow field to use QIG's built-in workflow.
- Settings such as LoRAs and built-in upscaling are not injected into custom graphs. Add the corresponding nodes and placeholders to the graph itself.
- Runtime ComfyUI or proxy JSON errors are reported as runtime errors instead of being relabeled as invalid workflow JSON.
