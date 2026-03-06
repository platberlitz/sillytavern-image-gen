#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$REPO_ROOT/output/playwright/qig-smoke}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8000/}"
PLAYWRIGHT_SESSION="${PLAYWRIGHT_SESSION:-qig-smoke}"
SILLYTAVERN_DIR="${SILLYTAVERN_DIR:-}"
START_SERVER=0
KEEP_SERVER=0
DISABLE_BASIC_AUTH=0
SYNC_EXTENSION=0
PORT=""
SERVER_PID=""
STARTED_SERVER=0
CONFIG_BACKUP=""
RESTORE_EXPR=""
BROWSER_READY=0

usage() {
    cat <<'EOF'
Usage: ./scripts/qig-smoke.sh [options]

Options:
  --base-url URL          Target SillyTavern URL (default: http://127.0.0.1:8000/)
  --session NAME          Playwright session name (default: qig-smoke)
  --artifacts DIR         Artifact output dir (default: output/playwright/qig-smoke)
  --st-dir DIR            SillyTavern install dir for sync/start/config operations
  --sync-extension        Copy index.js/manifest.json/style.css into the installed extension slot first
  --start-server          Start SillyTavern locally before the smoke test
  --disable-basic-auth    Temporarily set basicAuthMode: false while the smoke test runs (restored on exit)
  --keep-server           Leave a server started by this script running after success
  -h, --help              Show this help

Examples:
  ./scripts/qig-smoke.sh --base-url http://127.0.0.1:8000/
  ./scripts/qig-smoke.sh --st-dir /path/to/SillyTavern --sync-extension --start-server --disable-basic-auth
EOF
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing required command: $1" >&2
        exit 1
    }
}

die() {
    echo "Error: $*" >&2
    exit 1
}

pw() {
    npx --yes --package @playwright/cli playwright-cli -s="$PLAYWRIGHT_SESSION" "$@"
}

extract_result() {
    awk 'f && /^### /{exit} f{print} /^### Result$/{f=1;next}'
}

eval_raw() {
    local expr="$1"
    pw eval "$expr" | extract_result
}

eval_json() {
    local expr="$1"
    local raw
    raw="$(eval_raw "$expr")"
    RAW_JSON="$raw" python3 - <<'PY'
import json
import os
raw = os.environ['RAW_JSON'].strip()
if not raw:
    raise SystemExit("No Playwright result found")
obj = json.loads(raw)
print(json.dumps(obj, separators=(",", ":")))
PY
}

wait_for_js_true() {
    local expr="$1"
    local label="$2"
    local timeout="${3:-60}"
    local raw=""
    for ((i=0; i<timeout; i++)); do
        if raw="$(eval_raw "$expr" 2>/dev/null | tr -d '[:space:]')" && [[ "$raw" == "true" ]]; then
            return 0
        fi
        sleep 1
    done
    echo "Timed out waiting for ${label}" >&2
    return 1
}

port_from_url() {
    BASE_URL="$1" python3 - <<'PY'
import os
from urllib.parse import urlparse
url = urlparse(os.environ['BASE_URL'])
if url.port:
    print(url.port)
elif url.scheme == 'https':
    print(443)
else:
    print(80)
PY
}

wait_for_port() {
    local port="$1"
    local timeout="${2:-30}"
    for ((i=0; i<timeout; i++)); do
        if ss -ltnp | grep -q ":${port}[[:space:]]"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

build_restore_expr() {
    ORIGINAL_STATE_JSON="$1" python3 - <<'PY'
import json
import os
state = json.loads(os.environ['ORIGINAL_STATE_JSON'])

def js_string(value):
    return json.dumps("" if value is None else value)

def js_bool(value):
    return 'true' if bool(value) else 'false'

def set_value(id_, value, dispatch_input=False):
    event_bits = []
    if dispatch_input:
        event_bits.append(f"document.getElementById('{id_}').dispatchEvent(new Event('input',{{bubbles:true}}))")
    event_bits.append(f"document.getElementById('{id_}').dispatchEvent(new Event('change',{{bubbles:true}}))")
    return (
        f"document.getElementById('{id_}') && ("
        f"document.getElementById('{id_}').value={js_string(value)},"
        + ",".join(event_bits)
        + ")"
    )

def set_checkbox(id_, value):
    return (
        f"document.getElementById('{id_}') && ("
        f"document.getElementById('{id_}').checked={js_bool(value)},"
        f"document.getElementById('{id_}').dispatchEvent(new Event('change',{{bubbles:true}}))"
        f")"
    )

parts = [
    set_value('qig-provider', state.get('provider', 'pollinations')),
    set_value('qig-prompt', state.get('prompt', ''), True),
    set_checkbox('qig-use-last', state.get('useLastMessage', False)),
    set_checkbox('qig-use-llm', state.get('useLLMPrompt', False)),
    set_checkbox('qig-append-quality', state.get('appendQuality', False)),
    set_value('qig-quality', state.get('qualityTags', ''), True),
    set_value('qig-style', state.get('style', 'none')),
    set_checkbox('qig-use-st-style', state.get('useSTStyle', True)),
    set_checkbox('qig-confirm-generate', state.get('confirmBeforeGenerate', False)),
    set_value('qig-batch', state.get('batchCount', '1')),
    set_checkbox('qig-auto-insert', state.get('autoInsert', False)),
]

gallery = state.get('gallery')
prompt_history = state.get('promptHistory')
parts.append(
    f"{ 'localStorage.removeItem(\'qig_gallery\')' if gallery is None else 'localStorage.setItem(\'qig_gallery\',' + js_string(gallery) + ')' }"
)
parts.append(
    f"{ 'localStorage.removeItem(\'qig_prompt_history\')' if prompt_history is None else 'localStorage.setItem(\'qig_prompt_history\',' + js_string(prompt_history) + ')' }"
)
parts.append("'restored'")
print('(' + ','.join(parts) + ')')
PY
}

cleanup() {
    local exit_code=$?
    trap - EXIT INT TERM
    set +e

    if [[ -n "$RESTORE_EXPR" && "$BROWSER_READY" == "1" ]]; then
        pw eval "$RESTORE_EXPR" >/dev/null 2>&1 || true
    fi
    if [[ "$BROWSER_READY" == "1" ]]; then
        pw close >/dev/null 2>&1 || true
    fi

    if [[ -n "$SERVER_PID" && "$STARTED_SERVER" == "1" && "$KEEP_SERVER" == "0" ]]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi

    if [[ -n "$CONFIG_BACKUP" && -n "$SILLYTAVERN_DIR" ]]; then
        cp "$CONFIG_BACKUP" "$SILLYTAVERN_DIR/config.yaml" >/dev/null 2>&1 || true
        rm -f "$CONFIG_BACKUP"
    fi

    exit "$exit_code"
}
trap cleanup EXIT INT TERM

while [[ $# -gt 0 ]]; do
    case "$1" in
        --base-url)
            [[ $# -ge 2 ]] || die "--base-url requires a value"
            BASE_URL="$2"
            shift 2
            ;;
        --session)
            [[ $# -ge 2 ]] || die "--session requires a value"
            PLAYWRIGHT_SESSION="$2"
            shift 2
            ;;
        --artifacts)
            [[ $# -ge 2 ]] || die "--artifacts requires a value"
            ARTIFACT_DIR="$2"
            shift 2
            ;;
        --st-dir)
            [[ $# -ge 2 ]] || die "--st-dir requires a value"
            SILLYTAVERN_DIR="$2"
            shift 2
            ;;
        --sync-extension)
            SYNC_EXTENSION=1
            shift
            ;;
        --start-server)
            START_SERVER=1
            shift
            ;;
        --keep-server)
            KEEP_SERVER=1
            shift
            ;;
        --disable-basic-auth)
            DISABLE_BASIC_AUTH=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

require_cmd npx
require_cmd python3
require_cmd ss
require_cmd perl
require_cmd cp
require_cmd npm

mkdir -p "$ARTIFACT_DIR"
PORT="$(port_from_url "$BASE_URL")"

if [[ "$DISABLE_BASIC_AUTH" == "1" && "$START_SERVER" != "1" ]]; then
    die "--disable-basic-auth requires --start-server so the config change can be restored safely"
fi
if [[ "$DISABLE_BASIC_AUTH" == "1" && "$KEEP_SERVER" == "1" ]]; then
    die "--disable-basic-auth cannot be combined with --keep-server"
fi
if [[ "$SYNC_EXTENSION" == "1" || "$START_SERVER" == "1" || "$DISABLE_BASIC_AUTH" == "1" ]]; then
    [[ -n "$SILLYTAVERN_DIR" ]] || die "--st-dir is required for sync/start/auth operations"
    [[ -d "$SILLYTAVERN_DIR" ]] || die "SillyTavern dir not found: $SILLYTAVERN_DIR"
fi

if [[ "$SYNC_EXTENSION" == "1" ]]; then
    target_dir="$SILLYTAVERN_DIR/public/scripts/extensions/third-party/sillytavern-image-gen"
    [[ -d "$target_dir" ]] || die "Installed extension dir not found: $target_dir"
    cp "$REPO_ROOT/index.js" "$target_dir/index.js"
    cp "$REPO_ROOT/manifest.json" "$target_dir/manifest.json"
    cp "$REPO_ROOT/style.css" "$target_dir/style.css"
fi

if [[ "$START_SERVER" == "1" ]]; then
    if [[ "$DISABLE_BASIC_AUTH" == "1" ]]; then
        CONFIG_BACKUP="$(mktemp)"
        cp "$SILLYTAVERN_DIR/config.yaml" "$CONFIG_BACKUP"
        perl -0pi -e 's/basicAuthMode: true/basicAuthMode: false/' "$SILLYTAVERN_DIR/config.yaml"
    fi

    if wait_for_port "$PORT" 1; then
        echo "Port ${PORT} already has a listener; refusing to start another SillyTavern instance" >&2
        exit 1
    fi

    (
        cd "$SILLYTAVERN_DIR"
        npm start
    ) >"$ARTIFACT_DIR/server.log" 2>&1 &
    SERVER_PID="$!"
    STARTED_SERVER=1

    wait_for_port "$PORT" 45 || die "SillyTavern did not start on port ${PORT}"
fi

pw close >/dev/null 2>&1 || true
pw open "$BASE_URL" >/dev/null
BROWSER_READY=1

wait_for_js_true "!!document.getElementById('qig-input-btn') && !!document.getElementById('qig-provider') && !!document.getElementById('qig-prompt') && !!document.getElementById('qig-use-last') && !!document.getElementById('qig-use-llm')" "QIG UI" 30

original_state_json="$(eval_json "({ provider: document.getElementById('qig-provider')?.value, prompt: document.getElementById('qig-prompt')?.value, useLastMessage: !!document.getElementById('qig-use-last')?.checked, useLLMPrompt: !!document.getElementById('qig-use-llm')?.checked, appendQuality: !!document.getElementById('qig-append-quality')?.checked, qualityTags: document.getElementById('qig-quality')?.value, style: document.getElementById('qig-style')?.value, useSTStyle: !!document.getElementById('qig-use-st-style')?.checked, confirmBeforeGenerate: !!document.getElementById('qig-confirm-generate')?.checked, batchCount: document.getElementById('qig-batch')?.value, autoInsert: !!document.getElementById('qig-auto-insert')?.checked, gallery: localStorage.getItem('qig_gallery'), promptHistory: localStorage.getItem('qig_prompt_history') })")"
RESTORE_EXPR="$(build_restore_expr "$original_state_json")"

smoke_prompt='QIG smoke fallback {{char}}'
pw eval "(document.getElementById('qig-provider') && (document.getElementById('qig-provider').value='pollinations',document.getElementById('qig-provider').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-prompt') && (document.getElementById('qig-prompt').value='${smoke_prompt}',document.getElementById('qig-prompt').dispatchEvent(new Event('input',{bubbles:true})),document.getElementById('qig-prompt').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-use-last') && ((document.getElementById('qig-use-last').checked=true),document.getElementById('qig-use-last').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-use-llm') && ((document.getElementById('qig-use-llm').checked=false),document.getElementById('qig-use-llm').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-append-quality') && ((document.getElementById('qig-append-quality').checked=false),document.getElementById('qig-append-quality').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-quality') && (document.getElementById('qig-quality').value='',document.getElementById('qig-quality').dispatchEvent(new Event('input',{bubbles:true})),document.getElementById('qig-quality').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-style') && (document.getElementById('qig-style').value='none',document.getElementById('qig-style').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-use-st-style') && ((document.getElementById('qig-use-st-style').checked=false),document.getElementById('qig-use-st-style').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-confirm-generate') && ((document.getElementById('qig-confirm-generate').checked=false),document.getElementById('qig-confirm-generate').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-batch') && (document.getElementById('qig-batch').value='1',document.getElementById('qig-batch').dispatchEvent(new Event('input',{bubbles:true})),document.getElementById('qig-batch').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-auto-insert') && ((document.getElementById('qig-auto-insert').checked=false),document.getElementById('qig-auto-insert').dispatchEvent(new Event('change',{bubbles:true}))),window.__qigSmokeStart=Date.now(),'configured')" >/dev/null

pw eval "(document.getElementById('qig-input-btn').click(),true)" >/dev/null
wait_for_js_true "((JSON.parse(localStorage.getItem('qig_gallery') || '[]')[0]?.date || 0) >= (window.__qigSmokeStart || 0))" "new gallery entry" 45

entry_json="$(eval_json "(JSON.parse(localStorage.getItem('qig_gallery') || '[]')[0] || null)")"
ENTRY_JSON="$entry_json" python3 - <<'PY'
import json
import os
import re
from urllib.parse import urlparse, parse_qs

entry = json.loads(os.environ['ENTRY_JSON'])
if not entry:
    raise SystemExit('Smoke test failed: no gallery entry captured')
metadata = entry.get('metadataSettings') or {}
prompt = entry.get('prompt') or ''
seed = metadata.get('seed')
provider = metadata.get('provider')
model = metadata.get('model')
url = entry.get('url') or ''
query_seed = None
if url:
    try:
        query_seed = parse_qs(urlparse(url).query).get('seed', [None])[0]
    except Exception:
        query_seed = None

checks = [
    (provider == 'pollinations', f'expected provider pollinations, got {provider!r}'),
    (bool(model), f'expected non-empty model, got {model!r}'),
    (isinstance(seed, int) and seed >= 0, f'expected non-negative resolved seed, got {seed!r}'),
    ('QIG smoke fallback' in prompt, f'expected fallback prompt in generated prompt, got {prompt!r}'),
    (not re.search(r'<[^>]+>', prompt), f'prompt still contains raw HTML: {prompt!r}'),
    ('API Connections' not in prompt and 'Character Management' not in prompt and 'Extensions' not in prompt, f'prompt still leaks welcome-page UI strings: {prompt!r}'),
]
if query_seed is not None:
    checks.append((str(seed) == str(query_seed), f'URL seed {query_seed!r} did not match metadata seed {seed!r}'))

for ok, message in checks:
    if not ok:
        raise SystemExit('Smoke test failed: ' + message)
PY

before_metadata_json="$(eval_json "(JSON.parse(localStorage.getItem('qig_gallery') || '[]')[0]?.metadataSettings || null)")"
pw eval "(document.getElementById('qig-provider') && (document.getElementById('qig-provider').value='local',document.getElementById('qig-provider').dispatchEvent(new Event('change',{bubbles:true}))),document.getElementById('qig-prompt') && (document.getElementById('qig-prompt').value='UI changed after smoke generation',document.getElementById('qig-prompt').dispatchEvent(new Event('input',{bubbles:true})),document.getElementById('qig-prompt').dispatchEvent(new Event('change',{bubbles:true}))),true)" >/dev/null
after_metadata_json="$(eval_json "(JSON.parse(localStorage.getItem('qig_gallery') || '[]')[0]?.metadataSettings || null)")"
BEFORE_METADATA_JSON="$before_metadata_json" AFTER_METADATA_JSON="$after_metadata_json" python3 - <<'PY'
import json
import os
before = json.loads(os.environ['BEFORE_METADATA_JSON'])
after = json.loads(os.environ['AFTER_METADATA_JSON'])
if before != after:
    raise SystemExit('Smoke test failed: gallery metadata changed after live UI edits')
PY

SUMMARY_PATH="$ARTIFACT_DIR/summary.json" BASE_URL="$BASE_URL" ORIGINAL_STATE_JSON="$original_state_json" ENTRY_JSON="$entry_json" BEFORE_METADATA_JSON="$before_metadata_json" python3 - <<'PY'
import json
import os
from pathlib import Path
summary = {
    'baseUrl': os.environ.get('BASE_URL'),
    'entry': json.loads(os.environ['ENTRY_JSON']),
    'originalState': json.loads(os.environ['ORIGINAL_STATE_JSON']),
    'metadataSnapshot': json.loads(os.environ['BEFORE_METADATA_JSON']),
    'checks': {
        'promptFallbackNoHtmlLeak': True,
        'metadataSnapshotStableAfterUiChanges': True,
        'resolvedSeedCaptured': True,
    },
}
path = Path(os.environ['SUMMARY_PATH'])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(summary, indent=2) + '\n')
print(path)
PY

pw eval "$RESTORE_EXPR" >/dev/null
RESTORE_EXPR=""

echo "Smoke test passed. Summary: $ARTIFACT_DIR/summary.json"
