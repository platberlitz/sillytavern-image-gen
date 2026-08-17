import assert from "node:assert/strict";
import test from "node:test";

import {
    PrivacyLogBuffer,
    redactLogMessage,
    truncateLogEntry,
    utf8ByteLength,
} from "../lib/privacy-log.js";

test("privacy logs redact URL and credential canaries", () => {
    const signedCanary = "SIGNED_QUERY_CANARY_7f91";
    const authCanary = "AUTH_CANARY_8c42";
    const raw = `GET https://user:pass@example.test/private/${signedCanary}?X-Amz-Signature=${signedCanary}&view=full Authorization: Bearer ${authCanary}`;
    const redacted = redactLogMessage(raw);

    assert.doesNotMatch(redacted, new RegExp(`${signedCanary}|${authCanary}|user:pass`));
    assert.match(redacted, /\[URL redacted\]/);
    assert.match(redacted, /Authorization: \[redacted\]/);
    assert.equal(redactLogMessage(`/result?unknown=${signedCanary}&token=${authCanary}`).includes(signedCanary), false);
});

test("privacy logs require explicit debug mode for prompt and LLM diagnostics", () => {
    const promptCanary = "PROMPT_CANARY_f30d";
    const responseCanary = "LLM_RESPONSE_CANARY_31aa";
    const buffer = new PrivacyLogBuffer({ formatTimestamp: () => "time" });

    assert.equal(buffer.append(`Prompt: ${promptCanary}`, { diagnostic: true }), null);
    assert.equal(buffer.append(`LLM response: ${responseCanary}`, { diagnostic: true, debugEnabled: false }), null);
    assert.doesNotMatch(buffer.entries.join("\n"), new RegExp(`${promptCanary}|${responseCanary}`));

    buffer.append(`Prompt: ${promptCanary}`, { diagnostic: true, debugEnabled: true });
    assert.match(buffer.entries.join("\n"), new RegExp(promptCanary));
});

test("privacy logs bound entry count, aggregate UTF-8 bytes, and individual entries", () => {
    const buffer = new PrivacyLogBuffer({
        maxEntries: 3,
        maxBytes: 72,
        maxEntryBytes: 32,
        formatTimestamp: () => "",
    });

    for (let index = 0; index < 8; index++) buffer.append(`${index}:${"é".repeat(30)}`);

    assert.ok(buffer.entries.length <= 3);
    assert.ok(buffer.totalBytes <= 72);
    assert.ok(buffer.entries.every(entry => utf8ByteLength(entry) <= 32));
    assert.ok(buffer.entries.every(entry => !entry.includes("�")));
    assert.ok(utf8ByteLength(truncateLogEntry("é".repeat(40), 31)) <= 31);
});

test("privacy logs bound hostile input before redaction and bound the returned message", () => {
    const buffer = new PrivacyLogBuffer({ maxEntryBytes: 64, formatTimestamp: () => "" });
    const huge = "A".repeat(4 * 1024 * 1024);
    const result = buffer.append(huge);

    assert.ok(result, "append returns a record for non-diagnostic messages");
    assert.ok(utf8ByteLength(result.message) <= 64 * 8 + 64, "returned redacted message is bounded for console output");
    assert.ok(utf8ByteLength(result.entry) <= 64, "stored entry respects the per-entry limit");
    assert.ok(buffer.entries.every(entry => utf8ByteLength(entry) <= 64));
});
