import assert from "node:assert/strict";
import test from "node:test";

import {
    buildWorldInfoScanChat,
    composeWorldInfoScanChat,
    formatWorldInfoScanMessage,
    formatWorldInfoRecords,
    getWorldInfoContextBudget,
    normalizeWorldInfoRecords,
    resolveWorldInfoContext,
} from "../lib/world-info-context.js";

test("normalizes SillyTavern 1.14 buckets in stable slot and insertion order", () => {
    const outletEntries = {};
    outletEntries.secondOutlet = ["outlet second: one", "outlet second: two"];
    outletEntries.firstOutlet = ["outlet first"];

    const records = normalizeWorldInfoRecords({
        worldInfoBefore: "before",
        worldInfoAfter: "after",
        EMEntries: [
            { position: 0, content: "example before" },
            { position: 1, content: "example after" },
        ],
        ANBeforeEntries: ["note before: one", "note before: two"],
        ANAfterEntries: ["note after"],
        WIDepthEntries: [
            { depth: 4, role: 0, entries: ["depth four: one", "depth four: two"] },
            { depth: 2, role: 2, entries: ["depth two"] },
        ],
        outletEntries,
    });

    assert.deepEqual(records, [
        { slot: "before", content: "before" },
        { slot: "after", content: "after" },
        { slot: "example", anchor: "before", content: "example before" },
        { slot: "example", anchor: "after", content: "example after" },
        { slot: "authorsNote", anchor: "before", content: "note before: one" },
        { slot: "authorsNote", anchor: "before", content: "note before: two" },
        { slot: "authorsNote", anchor: "after", content: "note after" },
        { slot: "depth", depth: 4, role: 0, content: "depth four: one" },
        { slot: "depth", depth: 4, role: 0, content: "depth four: two" },
        { slot: "depth", depth: 2, role: 2, content: "depth two" },
        { slot: "outlet", outlet: "secondOutlet", content: "outlet second: one" },
        { slot: "outlet", outlet: "secondOutlet", content: "outlet second: two" },
        { slot: "outlet", outlet: "firstOutlet", content: "outlet first" },
    ]);
});

test("normalization skips only null and empty content without trimming retained strings", () => {
    const padded = "  keep leading and trailing whitespace  \n";
    const whitespaceOnly = " \t ";
    const records = normalizeWorldInfoRecords({
        worldInfoBefore: padded,
        worldInfoAfter: "",
        EMEntries: [
            { position: 0, content: null },
            { position: 1, content: whitespaceOnly },
        ],
        ANBeforeEntries: [undefined, ""],
        ANAfterEntries: ["\nkeep newline\n"],
        WIDepthEntries: [{ depth: 7, role: 1, entries: [null, "", "  depth  "] }],
        outletEntries: { preserved: [undefined, "", " outlet "] },
    });

    assert.deepEqual(records, [
        { slot: "before", content: padded },
        { slot: "example", anchor: "after", content: whitespaceOnly },
        { slot: "authorsNote", anchor: "after", content: "\nkeep newline\n" },
        { slot: "depth", depth: 7, role: 1, content: "  depth  " },
        { slot: "outlet", outlet: "preserved", content: " outlet " },
    ]);
    assert.equal(records[0].content, padded);
    assert.equal(records[1].content, whitespaceOnly);
});

test("formats an editable plain-text lore block without reordering records", () => {
    const text = formatWorldInfoRecords([
        { slot: "after", content: "after first" },
        { slot: "before", content: "before second" },
        { slot: "example", anchor: "before", content: "example one" },
        { slot: "example", anchor: "before", content: "example two" },
        { slot: "authorsNote", anchor: "after", content: "note" },
        { slot: "depth", depth: 3, role: 2, content: "deep lore" },
        { slot: "outlet", outlet: "memory", content: "outlet lore" },
    ]);

    assert.equal(text, `=== World Info ===

[After]
after first

[Before]
before second

[Example | anchor: before]
example one

example two

[Author's Note | anchor: after]
note

[Depth | depth: 3 | role: 2]
deep lore

[Outlet | name: memory]
outlet lore`);
    assert.equal(text.includes("<"), false);
    assert.equal(text.includes(">"), false);
    assert.equal(formatWorldInfoRecords([]), "");
});

test("builds a historical scan chat through the endpoint in newest-first order", () => {
    const messages = [
        { text: "  oldest  " },
        { text: " \n " },
        { text: "current" },
        { text: "future" },
    ];
    const formattedIndices = [];

    const chat = buildWorldInfoScanChat(messages, 2, (message, index) => {
        formattedIndices.push(index);
        return message.text;
    });

    assert.deepEqual(formattedIndices, [0, 1, 2]);
    assert.deepEqual(chat, ["current", "  oldest  "]);
    assert.deepEqual(messages.map(message => message.text), ["  oldest  ", " \n ", "current", "future"]);
});

test("clamps scan endpoints to the available message range", () => {
    const messages = ["zero", "one", "two"];
    const formatMessage = value => value;

    assert.deepEqual(buildWorldInfoScanChat(messages, 99, formatMessage), ["two", "one", "zero"]);
    assert.deepEqual(buildWorldInfoScanChat(messages, -99, formatMessage), ["zero"]);
    assert.deepEqual(buildWorldInfoScanChat([], 10, formatMessage), []);
});

test("scene text leads the scan chat so keyword entries always see it", () => {
    const history = ["newest message", "older message"];

    assert.deepEqual(composeWorldInfoScanChat("selected scene", history), [
        "selected scene",
        "newest message",
        "older message",
    ]);
    assert.deepEqual(composeWorldInfoScanChat("  ", history), history);
    assert.deepEqual(composeWorldInfoScanChat("scene only", null), ["scene only"]);
    assert.deepEqual(composeWorldInfoScanChat("", undefined), []);

    const returned = composeWorldInfoScanChat("", history);
    assert.notEqual(returned, history);
});

test("scan message formatting skips system messages and follows the host name setting", () => {
    assert.equal(formatWorldInfoScanMessage({ is_system: true }, {
        text: "hidden instruction",
        speakerName: "System",
    }), "");
    assert.equal(formatWorldInfoScanMessage({}, {
        text: "visible scene",
        speakerName: "Alice",
        includeNames: true,
    }), "Alice: visible scene");
    assert.equal(formatWorldInfoScanMessage({}, {
        text: "visible scene",
        speakerName: "Alice",
        includeNames: false,
    }), "visible scene");
});

test("uses SillyTavern's live prompt-token budget for World Info", () => {
    let budget = 7000;
    const scriptModule = {
        max_context: 8192,
        getMaxPromptTokens: () => budget,
    };

    assert.equal(getWorldInfoContextBudget(scriptModule), 7000);
    budget = 6500;
    assert.equal(getWorldInfoContextBudget(scriptModule), 6500);
    assert.equal(getWorldInfoContextBudget({ max_context: 4096 }), 4096);
    assert.throws(() => getWorldInfoContextBudget({}), /context budget is unavailable/);
});

test("resolves World Info with one dry-run call and returns normalized text", async () => {
    const chat = ["newest", "oldest"];
    const globalScanData = { personaDescription: "persona" };
    const calls = [];
    const result = {
        worldInfoBefore: "before lore",
        worldInfoAfter: "",
        EMEntries: [],
        ANBeforeEntries: [],
        ANAfterEntries: [],
        WIDepthEntries: [],
        outletEntries: {},
    };
    const checkWorldInfo = async (...args) => {
        calls.push(args);
        return result;
    };

    const context = await resolveWorldInfoContext({
        checkWorldInfo,
        chat,
        maxContext: 8192,
        globalScanData,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], chat);
    assert.equal(calls[0][1], 8192);
    assert.equal(calls[0][2], true);
    assert.equal(calls[0][3], globalScanData);
    assert.deepEqual(context, {
        records: [{ slot: "before", content: "before lore" }],
        text: "=== World Info ===\n\n[Before]\nbefore lore",
    });
});

test("fails clearly when the injected World Info API is unavailable", async () => {
    await assert.rejects(
        resolveWorldInfoContext({ chat: [], maxContext: 2048, globalScanData: {} }),
        /World Info API unavailable: checkWorldInfo dependency is required/,
    );
    await assert.rejects(
        resolveWorldInfoContext({ checkWorldInfo: null }),
        /checkWorldInfo dependency is required/,
    );
});
