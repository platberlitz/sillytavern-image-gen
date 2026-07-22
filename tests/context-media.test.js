import assert from "node:assert/strict";
import test from "node:test";

import {
    buildContextMediaCandidates,
    canDeleteContextMediaPath,
    CONTEXT_MEDIA_LIBRARY_VERSION,
    countContextMediaPathReferences,
    DEFAULT_CONTEXT_MEDIA_MAX_BYTES,
    normalizeContextMediaLibrary,
    parseContextMediaClassifierResponse,
    selectContextMedia,
    SUPPORTED_CONTEXT_MEDIA_FORMATS,
    validateContextMediaFile,
    validateContextMediaRemoteUrl,
} from "../lib/context-media.js";

function libraryFixture() {
    return {
        profiles: [{
            id: "fantasy",
            name: "Fantasy",
            folders: [{
                id: "locations",
                label: "Locations",
                media: [{ id: "city", label: "City", path: "media/city.jpg", mimeType: "image/jpeg", type: "image", size: 5 }],
                subfolders: [{
                    id: "castles",
                    name: "Castles",
                    description: "Stone keeps and royal halls",
                    media: [
                        { id: "castle-day", name: "Castle day", path: "media\\castle-day.png", mimeType: "image/png", type: "image", size: 10 },
                        { id: "castle-night", label: "Castle night", path: "media/castle-night.webp", mimeType: "image/webp", type: "image", size: 20 },
                    ],
                }, {
                    id: "empty",
                    label: "Empty",
                    media: [],
                }],
            }],
        }, {
            id: "modern",
            label: "Modern",
            folders: [{
                id: "motion",
                label: "Motion",
                subfolders: [{
                    id: "traffic",
                    label: "Traffic",
                    media: [{ id: "traffic-video", label: "Traffic", path: "media/traffic.webm", mimeType: "video/webm", type: "video", size: 30 }],
                }],
            }],
        }],
    };
}

test("normalizes the versioned hierarchy without mutating input", () => {
    const input = libraryFixture();
    const normalized = normalizeContextMediaLibrary(input);

    assert.equal(normalized.version, CONTEXT_MEDIA_LIBRARY_VERSION);
    assert.equal(normalized.profiles[0].label, "Fantasy");
    assert.equal(normalized.profiles[0].folders[0].subfolders[0].media[0].path, "media/castle-day.png");
    assert.equal(input.profiles[0].folders[0].subfolders[0].media[0].path, "media\\castle-day.png");
    assert.deepEqual(normalized.profiles[0].folders[0].subfolders[1].media, []);
});

test("generates stable scoped IDs and retains safe supplied IDs", () => {
    const input = {
        profiles: [{
            label: "Default",
            folders: [{
                label: "People",
                subfolders: [{
                    label: "Heroes",
                    media: [{ label: "Portrait", path: "portraits/hero.jpg", mimeType: "image/jpeg", size: 2 }],
                }],
            }],
        }],
    };
    const first = normalizeContextMediaLibrary(input);
    const second = normalizeContextMediaLibrary(input);

    assert.deepEqual(first, second);
    assert.match(first.profiles[0].id, /^profile-default-/);
    assert.match(first.profiles[0].folders[0].id, /^folder-people-/);
    assert.match(first.profiles[0].folders[0].subfolders[0].id, /^subfolder-heroes-/);
    assert.match(first.profiles[0].folders[0].subfolders[0].media[0].id, /^media-portraits-hero-jpg-/);
    assert.equal(first.profiles[0].folders[0].subfolders[0].media[0].type, "image");
});

test("makes duplicate IDs unique and deterministic", () => {
    const normalized = normalizeContextMediaLibrary({
        profiles: [
            { id: "duplicate", label: "First" },
            { id: "duplicate", label: "Second" },
        ],
    });

    assert.deepEqual(normalized.profiles.map((profile) => profile.id), ["duplicate", "duplicate-2"]);
});

test("rejects invalid roots and unsupported persisted versions", () => {
    assert.throws(() => normalizeContextMediaLibrary([]), /must be an object/);
    assert.throws(() => normalizeContextMediaLibrary({ version: 2 }), /Unsupported Context Media library version: 2/);
});

test("builds numbered candidates from non-empty subfolders", () => {
    const candidates = buildContextMediaCandidates(libraryFixture());

    assert.deepEqual(candidates.map((candidate) => ({
        number: candidate.number,
        id: candidate.id,
        label: candidate.label,
        mediaIds: candidate.media.map((media) => media.id),
    })), [{
        number: 1,
        id: "locations",
        label: "Fantasy / Locations",
        mediaIds: ["city"],
    }, {
        number: 2,
        id: "castles",
        label: "Fantasy / Locations / Castles",
        mediaIds: ["castle-day", "castle-night"],
    }, {
        number: 3,
        id: "traffic",
        label: "Modern / Motion / Traffic",
        mediaIds: ["traffic-video"],
    }]);
});

test("candidate building filters profiles and can include empty subfolders", () => {
    const candidates = buildContextMediaCandidates(libraryFixture(), {
        profileIds: "fantasy",
        includeEmpty: true,
    });

    assert.deepEqual(candidates.map((candidate) => candidate.id), ["locations", "castles", "empty"]);
    assert.deepEqual(candidates.map((candidate) => candidate.number), [1, 2, 3]);
});

test("parses raw and fenced classifier JSON", () => {
    const candidates = buildContextMediaCandidates(libraryFixture());

    assert.deepEqual(parseContextMediaClassifierResponse('{"candidates":[2,1],"confidence":84}', candidates), { candidateNumbers: [2, 1], confidence: 84 });
    assert.deepEqual(parseContextMediaClassifierResponse('```json\n{"candidates":[],"confidence":0}\n```', candidates), { candidateNumbers: [], confidence: 0 });
    assert.deepEqual(parseContextMediaClassifierResponse('```\n{"candidates":[1],"confidence":100}\n```', candidates), { candidateNumbers: [1], confidence: 100 });
});

test("classifier parsing rejects prose, malformed shapes, duplicates, and unknown candidates", () => {
    const candidates = buildContextMediaCandidates(libraryFixture());

    assert.throws(() => parseContextMediaClassifierResponse('Result: {"candidates":[1],"confidence":80}', candidates), /Invalid classifier response/);
    assert.throws(() => parseContextMediaClassifierResponse('```json\n{"candidates":[1],"confidence":80}\n``` trailing', candidates), /invalid JSON fence/);
    assert.throws(() => parseContextMediaClassifierResponse("[1]", candidates), /must be an object/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":[1],"confidence":80,"reason":"castle"}', candidates), /contain only/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":["1"],"confidence":80}', candidates), /must be integers/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":[1,1],"confidence":80}', candidates), /must be unique/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":[99],"confidence":80}', candidates), /Unknown classifier candidate: 99/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":[1],"confidence":"80"}', candidates), /finite number/);
    assert.throws(() => parseContextMediaClassifierResponse('{"candidates":[1],"confidence":101}', candidates), /finite number/);
});

test("selects across candidates and avoids an immediate repeat", () => {
    const candidates = buildContextMediaCandidates(libraryFixture());

    assert.equal(selectContextMedia(candidates, [2], { random: () => 0 }).id, "castle-day");
    assert.equal(selectContextMedia(candidates, [2], { previousMediaId: "castle-day", random: () => 0 }).id, "castle-night");
    assert.equal(selectContextMedia(candidates, [2, 3], { previousMediaId: "castle-day", random: () => 0.75 }).id, "traffic-video");
});

test("selection permits the repeat when it is the only choice and handles no match", () => {
    const candidates = buildContextMediaCandidates(libraryFixture());

    assert.equal(selectContextMedia(candidates, [3], { previousMediaId: "traffic-video", random: () => 0 }).id, "traffic-video");
    assert.equal(selectContextMedia(candidates, [], { random: () => 0 }), null);
    assert.throws(() => selectContextMedia(candidates, [99]), /Unknown classifier candidate: 99/);
    assert.throws(() => selectContextMedia(candidates, [2], { random: () => 1 }), /Random source/);
});

test("declares the initial supported image and video formats", () => {
    assert.deepEqual(SUPPORTED_CONTEXT_MEDIA_FORMATS.map((format) => [format.extensions, format.mimeType, format.type]), [
        [[".jpg", ".jpeg"], "image/jpeg", "image"],
        [[".png"], "image/png", "image"],
        [[".gif"], "image/gif", "image"],
        [[".webp"], "image/webp", "image"],
        [[".mp4"], "video/mp4", "video"],
        [[".webm"], "video/webm", "video"],
    ]);
});

test("validates every supported extension, MIME, and media type combination", () => {
    for (const format of SUPPORTED_CONTEXT_MEDIA_FORMATS) {
        for (const extension of format.extensions) {
            const result = validateContextMediaFile({
                name: `sample${extension.toUpperCase()}`,
                mimeType: format.mimeType.toUpperCase(),
                mediaType: format.type.toUpperCase(),
                size: 100,
            });
            assert.equal(result.valid, true, `${extension} should be accepted: ${result.errors.join(", ")}`);
            assert.deepEqual(result.format, { extension, mimeType: format.mimeType, type: format.type });
        }
    }
});

test("accepts the browser File type field as a MIME type", () => {
    assert.equal(validateContextMediaFile({ name: "portrait.png", type: "image/png", size: 1 }).valid, true);
    assert.equal(validateContextMediaFile({ path: "clips/scene.mp4?cache=1", type: "video/mp4", size: 1 }).valid, true);
});

test("rejects unsupported, mismatched, malformed, and oversized media", () => {
    assert.match(validateContextMediaFile({ name: "notes.txt", mimeType: "text/plain", mediaType: "text", size: 1 }).errors.join(" "), /Unsupported media extension/);
    assert.match(validateContextMediaFile({ name: "photo.png", mimeType: "image/jpeg", size: 1 }).errors.join(" "), /does not match MIME/);
    assert.match(validateContextMediaFile({ name: "clip.mp4", mimeType: "video/mp4", mediaType: "image", size: 1 }).errors.join(" "), /Media type image does not match video/);
    assert.match(validateContextMediaFile({ name: "photo.png", mimeType: "", size: 1 }).errors.join(" "), /Unsupported media MIME type/);
    assert.match(validateContextMediaFile({ name: "photo.png", mimeType: "image/png", size: 1.5 }).errors.join(" "), /non-negative safe integer/);
    assert.match(validateContextMediaFile({ name: "photo.png", mimeType: "image/png", size: 11 }, { maxBytes: 10 }).errors.join(" "), /10 byte limit/);
    assert.throws(() => validateContextMediaFile({ name: "photo.png", mimeType: "image/png", size: 1 }, { maxBytes: -1 }), /maxBytes/);
    assert.equal(DEFAULT_CONTEXT_MEDIA_MAX_BYTES, 50 * 1024 * 1024);
});

test("accepts credential-free public HTTPS media URLs", () => {
    assert.deepEqual(validateContextMediaRemoteUrl("https://cdn.example.com/path/scene.WEBM"), {
        valid: true,
        errors: [],
        url: "https://cdn.example.com/path/scene.WEBM",
        format: { extension: ".webm", mimeType: "video/webm", type: "video" },
    });
    assert.equal(validateContextMediaRemoteUrl("https://images.example.org/picture.gif").format.type, "image");
});

test("rejects unsafe or non-direct remote media URLs", () => {
    assert.match(validateContextMediaRemoteUrl("http://cdn.example.com/picture.png").errors.join(" "), /HTTPS/);
    assert.match(validateContextMediaRemoteUrl("https://user:pass@cdn.example.com/picture.png").errors.join(" "), /credentials/);
    assert.match(validateContextMediaRemoteUrl("https://cdn.example.com/picture.png?cache=1").errors.join(" "), /query/);
    assert.match(validateContextMediaRemoteUrl("https://cdn.example.com/picture.png#token%3Dsecret").errors.join(" "), /fragments/);
    assert.match(validateContextMediaRemoteUrl("https://127.0.0.1/picture.png").errors.join(" "), /private/);
    assert.match(validateContextMediaRemoteUrl("https://localhost/picture.png").errors.join(" "), /private/);
    assert.match(validateContextMediaRemoteUrl("https://printer/picture.png").errors.join(" "), /private/);
    assert.match(validateContextMediaRemoteUrl("https://gallery.home/picture.png").errors.join(" "), /private/);
    assert.match(validateContextMediaRemoteUrl("https://[::1]/picture.png").errors.join(" "), /private/);
    assert.match(validateContextMediaRemoteUrl("https://cdn.example.com/view?id=1").errors.join(" "), /extension/);
    assert.match(validateContextMediaRemoteUrl("data:image/png;base64,AAAA").errors.join(" "), /absolute HTTPS|HTTPS/);
});

test("normalization preserves valid remote sources and drops invalid ones", () => {
    const normalized = normalizeContextMediaLibrary({
        profiles: [{
            id: "remote",
            folders: [{
                id: "links",
                media: [{
                    id: "valid",
                    label: "Valid",
                    path: "https://cdn.example.com/image.webp",
                    source: "remote",
                    mimeType: "wrong/type",
                }, {
                    id: "invalid",
                    path: "http://cdn.example.com/image.webp",
                    source: "remote",
                }],
            }],
        }],
    });

    assert.deepEqual(normalized.profiles[0].folders[0].media, [{
        id: "valid",
        label: "Valid",
        path: "https://cdn.example.com/image.webp",
        source: "remote",
        mimeType: "image/webp",
        type: "image",
        size: null,
        verifiedAt: "",
    }]);
});

test("counts normalized media path references", () => {
    const library = libraryFixture();
    library.profiles[1].folders[0].subfolders[0].media.push({
        id: "shared-castle",
        path: "media\\castle-day.png",
        mimeType: "image/png",
        size: 10,
    });

    assert.deepEqual([...countContextMediaPathReferences(library)], [
        ["media/city.jpg", 1],
        ["media/castle-day.png", 2],
        ["media/castle-night.webp", 1],
        ["media/traffic.webm", 1],
    ]);
});

test("allows path deletion only when every reference is being removed", () => {
    const library = libraryFixture();
    library.profiles[1].folders[0].subfolders[0].media.push({
        id: "shared-castle",
        path: "media/castle-day.png",
        mimeType: "image/png",
        size: 10,
    });

    assert.equal(canDeleteContextMediaPath(library, "media/castle-night.webp", "castle-night"), true);
    assert.equal(canDeleteContextMediaPath(library, "media/castle-day.png", "castle-day"), false);
    assert.equal(canDeleteContextMediaPath(library, "media\\castle-day.png", ["castle-day", "shared-castle"]), true);
    assert.equal(canDeleteContextMediaPath(library, "media/castle-day.png", ["not-a-media-id"]), false);
    assert.equal(canDeleteContextMediaPath(library, "media/missing.png", []), false);
    assert.equal(canDeleteContextMediaPath(library, "", "castle-day"), false);
});
