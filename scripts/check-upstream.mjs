// Compares upstream Ponytail's guidance with the snapshot this wrapper was adapted from.
// Exit 0: unchanged. Exit 2: upstream changed, review and adapt `rules()` in ponytail.ts, then run with --pin.
// Only downloads two text files from a fixed repo; never runs upstream code.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "DietrichGebert/ponytail";
const FILE = new URL("../upstream.json", import.meta.url);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const get = async (url, json) => {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 200_000) throw new Error(`${url}: too large`);
    return json ? JSON.parse(text) : text;
};

const { commit } = await get(`https://api.github.com/repos/${REPO}/commits/main`, true).then((c) => ({ commit: c.sha }));
const raw = (path) => get(`https://raw.githubusercontent.com/${REPO}/${commit}/${path}`);
const [skill, license] = await Promise.all([raw("skills/ponytail/SKILL.md"), raw("LICENSE")]);
if (!/^MIT License/m.test(license) || !license.includes("Copyright (c)")) {
    throw new Error("Upstream license is no longer MIT: stop and review before any reuse.");
}
const next = { repo: `https://github.com/${REPO}`, commit, skillSha256: sha256(skill), licenseSha256: sha256(license) };
const pinned = JSON.parse(readFileSync(FILE, "utf8"));
pinned.commit ??= "unpinned0";

if (process.argv.includes("--pin")) {
    writeFileSync(FILE, JSON.stringify(next, null, 4) + "\n");
    console.log(`Pinned ${commit}`);
} else if (next.skillSha256 === pinned.skillSha256 && next.licenseSha256 === pinned.licenseSha256) {
    console.log(`Up to date (guidance unchanged since ${pinned.commit.slice(0, 7)}).`);
} else {
    console.log(`Upstream changed: ${pinned.commit.slice(0, 7)} -> ${commit.slice(0, 7)}`);
    console.log(`Review: ${next.repo}/compare/${pinned.commit}...${commit}`);
    process.exit(2);
}
