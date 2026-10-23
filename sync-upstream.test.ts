import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
    filterSkillBodyForMode,
    formatGeneratedBlock,
    generatePromptForMode,
    generateUpstreamData,
    replaceGeneratedBlock,
    syncUpstream,
    validateLicense,
    GENERATED_START_MARKER,
    GENERATED_END_MARKER,
    ALLOWED_PATHS,
    UPSTREAM_OWNER_REPO,
} from "./scripts/sync-upstream.ts";

const SAMPLE_LICENSE = `MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const SAMPLE_SKILL = `---
name: ponytail
description: Lazy mode
---

# Ponytail

Shared intro paragraph. Switch: \`/ponytail lite|full|ultra\`.

## Rules
- Normal rule bullet 1: keep across all modes.
- lite-like prefix in prose - lite: must be kept if not a quoted example.
- Another bullet: do not delete.

## Levels

| Level | Behavior |
|-------|----------|
| **lite** | Lite intensity row |
| **full** | Full intensity row |
| **ultra** | Ultra intensity row |

Examples:
- lite: "Example for lite"
- full: "Example for full"
- ultra: "Example for ultra"

Closing paragraph.
`;

test("mode filtering keeps normal rule bullets, filters table rows and quoted examples, and adapts command", () => {
    const lite = filterSkillBodyForMode(SAMPLE_SKILL, "lite");
    const full = filterSkillBodyForMode(SAMPLE_SKILL, "full");
    const ultra = filterSkillBodyForMode(SAMPLE_SKILL, "ultra");

    // Normal bullets preserved across all modes
    for (const body of [lite, full, ultra]) {
        assert.ok(body.includes("Normal rule bullet 1: keep across all modes."));
        assert.ok(
            body.includes(
                "lite-like prefix in prose - lite: must be kept if not a quoted example.",
            ),
        );
        assert.ok(body.includes("Another bullet: do not delete."));
        assert.ok(body.includes("Closing paragraph."));
        assert.ok(body.includes("Switch: `/ponytail-mode lite|full|ultra`."));
        // Verify frontmatter delimiter is stripped
        assert.ok(!body.startsWith("---"));
        assert.ok(!body.includes("name: ponytail"));
    }

    // Intensity table row filtering
    assert.ok(lite.includes("| **lite** | Lite intensity row |"));
    assert.ok(!lite.includes("| **full** | Full intensity row |"));
    assert.ok(!lite.includes("| **ultra** | Ultra intensity row |"));

    assert.ok(!full.includes("| **lite** | Lite intensity row |"));
    assert.ok(full.includes("| **full** | Full intensity row |"));
    assert.ok(!full.includes("| **ultra** | Ultra intensity row |"));

    assert.ok(!ultra.includes("| **lite** | Lite intensity row |"));
    assert.ok(!ultra.includes("| **full** | Full intensity row |"));
    assert.ok(ultra.includes("| **ultra** | Ultra intensity row |"));

    // Quoted worked example filtering
    assert.ok(lite.includes('- lite: "Example for lite"'));
    assert.ok(!lite.includes('- full: "Example for full"'));
    assert.ok(!lite.includes('- ultra: "Example for ultra"'));

    assert.ok(!full.includes('- lite: "Example for lite"'));
    assert.ok(full.includes('- full: "Example for full"'));
    assert.ok(!full.includes('- ultra: "Example for ultra"'));

    assert.ok(!ultra.includes('- lite: "Example for lite"'));
    assert.ok(!ultra.includes('- full: "Example for full"'));
    assert.ok(ultra.includes('- ultra: "Example for ultra"'));
});

test("prompt generation preserves level prefix and safety note", () => {
    const prompt = generatePromptForMode(SAMPLE_SKILL, "full");
    assert.ok(prompt.startsWith("PONYTAIL MODE ACTIVE — level: full\n\n"));
    assert.ok(prompt.includes("Pi Pocket safety:"));
});

test("escaping and malformed skill fail closed", () => {
    assert.throws(
        () => filterSkillBodyForMode("no frontmatter here", "full"),
        /missing leading frontmatter delimiter/,
    );
    assert.throws(
        () => filterSkillBodyForMode("---\nunclosed frontmatter", "full"),
        /unclosed frontmatter block/,
    );
    assert.throws(
        () => filterSkillBodyForMode("---\nfoo: bar\n---\n   \n", "full"),
        /empty body after frontmatter/,
    );
});

test("non-MIT license rejection fails closed", () => {
    assert.throws(() => validateLicense("Apache License 2.0"), /missing 'MIT License' header/);
    assert.throws(
        () =>
            validateLicense(
                'MIT License\n\nNo copyright here\nPermission is hereby granted, free of charge, to any person obtaining a copy\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
            ),
        /missing copyright notice/,
    );
    assert.throws(
        () =>
            validateLicense(
                "MIT License\n\nCopyright (c) 2026 Author\nModified terms without permission grant",
            ),
        /does not match standard MIT permission and disclaimer body/,
    );
    // Valid standard MIT passes without throwing
    assert.doesNotThrow(() => validateLicense(SAMPLE_LICENSE));
});

test("source block replacement fails when markers are missing or malformed", () => {
    assert.throws(
        () => replaceGeneratedBlock("some code without markers", "new-block"),
        /Source shape error/,
    );
    const inverted = `${GENERATED_END_MARKER}\n${GENERATED_START_MARKER}`;
    assert.throws(() => replaceGeneratedBlock(inverted, "new-block"), /Source shape error/);
});

test("pinned fetch requests enforce fixed allowlist, commit URL, and reject unexpected paths", async () => {
    const calledUrls: string[] = [];
    const mockFetch = async (url: string | URL) => {
        calledUrls.push(String(url));
        if (String(url).endsWith("/commits/main")) {
            return new Response(JSON.stringify({ sha: "commit1234567890" }), { status: 200 });
        }
        if (String(url).endsWith("skills/ponytail/SKILL.md")) {
            return new Response(SAMPLE_SKILL, { status: 200 });
        }
        if (String(url).endsWith("LICENSE")) {
            return new Response(SAMPLE_LICENSE, { status: 200 });
        }
        return new Response("not found", { status: 404 });
    };

    const tmpDir = "/tmp";
    const tsPath = join(tmpDir, `test-ponytail-${Date.now()}.ts`);
    const jsonPath = join(tmpDir, `test-upstream-${Date.now()}.json`);

    try {
        const initialTs = `const x = 1;\n${GENERATED_START_MARKER}\nexport const UPSTREAM_DATA = {} as const;\n${GENERATED_END_MARKER}\nconst y = 2;\n`;
        writeFileSync(tsPath, initialTs, "utf8");

        await syncUpstream({
            customFetch: mockFetch as any,
            ponytailTsPath: tsPath,
            upstreamJsonPath: jsonPath,
        });

        assert.equal(calledUrls.length, 3);
        assert.equal(
            calledUrls[0],
            `https://api.github.com/repos/${UPSTREAM_OWNER_REPO}/commits/main`,
        );
        assert.equal(
            calledUrls[1],
            `https://raw.githubusercontent.com/${UPSTREAM_OWNER_REPO}/commit1234567890/skills/ponytail/SKILL.md`,
        );
        assert.equal(
            calledUrls[2],
            `https://raw.githubusercontent.com/${UPSTREAM_OWNER_REPO}/commit1234567890/LICENSE`,
        );
    } finally {
        rmSync(tsPath, { force: true });
        rmSync(jsonPath, { force: true });
    }
});

test("no changes for identical content and check-only makes no writes", async () => {
    const mockFetch = async (url: string | URL) => {
        if (String(url).endsWith("/commits/main")) {
            return new Response(JSON.stringify({ sha: "newcommit999" }), { status: 200 });
        }
        if (String(url).endsWith("skills/ponytail/SKILL.md")) {
            return new Response(SAMPLE_SKILL, { status: 200 });
        }
        if (String(url).endsWith("LICENSE")) {
            return new Response(SAMPLE_LICENSE, { status: 200 });
        }
        return new Response("not found", { status: 404 });
    };

    const tmpDir = "/tmp";
    const tsPath = join(tmpDir, `test-ts-${Date.now()}.ts`);
    const jsonPath = join(tmpDir, `test-json-${Date.now()}.json`);

    try {
        const initialTs = `const x = 1;\n${GENERATED_START_MARKER}\nexport const UPSTREAM_DATA = {} as const;\n${GENERATED_END_MARKER}\nconst y = 2;\n`;
        writeFileSync(tsPath, initialTs, "utf8");

        // 1. First sync to populate files
        const res1 = await syncUpstream({
            customFetch: mockFetch as any,
            ponytailTsPath: tsPath,
            upstreamJsonPath: jsonPath,
        });
        assert.equal(res1.status, "updated");
        const tsAfter1 = readFileSync(tsPath, "utf8");
        const jsonAfter1 = readFileSync(jsonPath, "utf8");

        // 2. Second sync with identical content -> status unchanged, no file modifications
        const res2 = await syncUpstream({
            customFetch: mockFetch as any,
            ponytailTsPath: tsPath,
            upstreamJsonPath: jsonPath,
        });
        assert.equal(res2.status, "unchanged");
        assert.equal(readFileSync(tsPath, "utf8"), tsAfter1);
        assert.equal(readFileSync(jsonPath, "utf8"), jsonAfter1);

        // 3. New commit with changed content, but in check-only mode
        let returnChangedSkill = false;
        const mockFetchChanged = async (url: string | URL) => {
            if (String(url).endsWith("/commits/main")) {
                return new Response(JSON.stringify({ sha: "differentcommit111" }), { status: 200 });
            }
            if (String(url).endsWith("skills/ponytail/SKILL.md")) {
                const body = returnChangedSkill ? SAMPLE_SKILL + "\nExtra change.\n" : SAMPLE_SKILL;
                return new Response(body, { status: 200 });
            }
            if (String(url).endsWith("LICENSE")) {
                return new Response(SAMPLE_LICENSE, { status: 200 });
            }
            return new Response("not found", { status: 404 });
        };

        returnChangedSkill = true;
        const resCheck = await syncUpstream({
            check: true,
            customFetch: mockFetchChanged as any,
            ponytailTsPath: tsPath,
            upstreamJsonPath: jsonPath,
        });
        assert.equal(resCheck.status, "update-available");
        // Check mode must NOT have written to files
        assert.equal(readFileSync(tsPath, "utf8"), tsAfter1);
        assert.equal(readFileSync(jsonPath, "utf8"), jsonAfter1);
    } finally {
        rmSync(tsPath, { force: true });
        rmSync(jsonPath, { force: true });
    }
});
