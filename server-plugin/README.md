# Quick Image Gen Relay Server Plugin

This optional SillyTavern server plugin (protocol version `0.2.0`, shipped with Quick Image Gen `2.8.0`) lets Quick Image Gen use CivitAI and Replicate when SillyTavern is running with `basicAuthMode: true`.

## Install

1. Copy this `server-plugin` directory to your SillyTavern `plugins/quick-image-gen-relay/` directory.
2. Set `enableServerPlugins: true` in SillyTavern `config.yaml`.
3. Complete the required [host pre-parser integration](#required-host-pre-parser-integration).
4. Restart SillyTavern.
5. While logged in, open `/api/plugins/quick-image-gen-relay/healthz`. A blank page with HTTP 204 means the plugin and required installer were registered. HTTP 503 means the relay has failed closed because the pre-parser installer is missing.

## Required host pre-parser integration

The current SillyTavern/SillyBunny plugin API mounts server plugins after the host-wide JSON parser. Current SillyBunny installs configure that parser with a 500 MiB limit, so a parser mounted only inside this plugin cannot protect the relay path from oversized unauthenticated parsing.

The relay therefore fails closed unless `server-plugin/pre-parser.js` is mounted on the exact relay prefix **before** the host's global `express.json(...)` and `express.urlencoded(...)` calls. The HTTP 503 fallback prevents upstream relay calls but cannot undo body parsing that the host already performed, so do not expose the host until this integration is installed. In `src/server-main.js`, immediately after `const app = express();` and before any host body parser, add:

```js
const relayPlugin = await import('../plugins/quick-image-gen-relay/pre-parser.js');
const { installRelayPreParser } = relayPlugin.default ?? relayPlugin;
installRelayPreParser(app);
```

The relative path assumes the standard `src/server-main.js` and `plugins/quick-image-gen-relay/` layout. The installer mounts the middleware on the exact relay prefix and records that installation for the health check. The middleware applies only to `POST /civitai` and `POST /replicate`, acquires global and per-address upload concurrency before reading, rejects non-JSON and declared oversized requests, and parses at most 1 MiB. The normal host authentication chain still runs afterward. The plugin routes independently require an authenticated `req.user` and apply a separate per-account concurrency limit. Mounting after the global parser is detected on relay POSTs and rejected; omitting this integration leaves relay POSTs and health checks at HTTP 503.

## Security

SillyTavern server plugins are not sandboxed. Only install plugins from developers you trust.

This plugin is intentionally narrow:

- It only relays CivitAI v2 consumer workflow creation, status, and `DELETE` cancellation, plus Replicate prediction creation, status, and cancellation. CivitAI's [live v2 OpenAPI](https://orchestration.civitai.com/openapi/v2-consumers.json) names `DELETE /v2/consumer/workflows/{workflowId}` `DeleteWorkflow`; its [official JavaScript client](https://github.com/civitai/civitai-client-javascript/blob/main/src/generated/sdk.gen.ts) exposes the same operation as `deleteWorkflow()`.
- Provider output retrieval is limited to trusted CivitAI/Replicate HTTPS hosts and a 25 MiB streamed response; JSON relay bodies and responses have separate bounded limits.
- Provider API credentials are always sent to the fixed create/status/cancel API origins. Output requests are unauthenticated by default and can receive credentials only when explicitly requested and the output URL has the exact CivitAI orchestration or Replicate API origin.
- It does not accept arbitrary target URLs, so it is not a general-purpose open proxy.
- It does not store or log provider API keys. Keys are only used to build the upstream `Authorization` header for the current request.
