// Synchronizes upstream Ponytail guidance (data-only) into ponytail.ts and upstream.json.
// Only downloads GitHub JSON commit metadata and two pinned raw text files over HTTPS.
// Rejects redirects, enforces size caps and timeouts, and validates MIT license text.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const UPSTREAM_REPO = "https://github.com/DietrichGebert/ponytail";
export const UPSTREAM_OWNER_REPO = "DietrichGebert/ponytail";
export const ALLOWED_PATHS = ["skills/ponytail/SKILL.md", "LICENSE"] as const;
export const MAX_FILE_BYTES = 200_000;
export const FETCH_TIMEOUT_MS = 15_000;

export const PI_POCKET_SAFETY_NOTE =
    "Pi Pocket safety: keep input validation, security controls, accessibility basics, requested features, and necessary dependencies.";

export const MIT_PERMISSION_SNIPPET =
    "Permission is hereby granted, free of charge, to any person obtaining a copy";
export const MIT_DISCLAIMER_SNIPPET =
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND';

export interface UpstreamMetadata {
    repo: string;
    commit: string;
    skillSha256: string;
    licenseSha256: string;
}

export interface UpstreamDataBlock extends UpstreamMetadata {
    prompts: {
        lite: string;
        full: string;
        ultra: string;
    };
}

export function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

export function validateLicense(licenseText: string): void {
    const text = String(licenseText || "");
    if (!/^MIT License/m.test(text)) {
        throw new Error("License validation failed: missing 'MIT License' header.");
    }
    if (!/Copyright\s+(?:\(c\)\s+)?\d{4}/i.test(text)) {
        throw new Error("License validation failed: missing copyright notice.");
    }
    if (!text.includes(MIT_PERMISSION_SNIPPET) || !text.includes(MIT_DISCLAIMER_SNIPPET)) {
        throw new Error(
            "License validation failed: text does not match standard MIT permission and disclaimer body.",
        );
    }
}

export function filterSkillBodyForMode(skillText: string, mode: "lite" | "full" | "ultra"): string {
    const text = String(skillText || "");
    if (!text.startsWith("---")) {
        throw new Error("Malformed skill: missing leading frontmatter delimiter.");
    }
    const endFrontmatter = text.indexOf("\n---", 3);
    if (endFrontmatter === -1) {
        throw new Error("Malformed skill: unclosed frontmatter block.");
    }
    const afterDelimiter = endFrontmatter + 4;
    const body = text.slice(afterDelimiter).replace(/^\r?\n+/, "");
    if (!body.trim()) {
        throw new Error("Malformed skill: empty body after frontmatter.");
    }

    const lines = body.split(/\r?\n/);
    const filtered = lines.filter((line) => {
        const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
        if (tableLabel) {
            const labelMode = tableLabel[1].trim().toLowerCase();
            if (["lite", "full", "ultra"].includes(labelMode)) {
                return labelMode === mode;
            }
        }
        const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
        if (exampleLabel) {
            const labelMode = exampleLabel[1].trim().toLowerCase();
            if (["lite", "full", "ultra"].includes(labelMode)) {
                return labelMode === mode;
            }
        }
        return true;
    });

    const result = filtered
        .join("\n")
        .replace(/\/ponytail\b(?!\-)/g, "/ponytail-mode")
        .trim();

    return result;
}

export function generatePromptForMode(skillText: string, mode: "lite" | "full" | "ultra"): string {
    const filteredBody = filterSkillBodyForMode(skillText, mode);
    return `PONYTAIL MODE ACTIVE — level: ${mode}\n\n${filteredBody}\n\n${PI_POCKET_SAFETY_NOTE}`;
}

export function generateUpstreamData(
    commit: string,
    skillText: string,
    licenseText: string,
    repoUrl: string = UPSTREAM_REPO,
): UpstreamDataBlock {
    validateLicense(licenseText);
    const skillSha = sha256(skillText);
    const licenseSha = sha256(licenseText);

    return {
        repo: repoUrl,
        commit,
        skillSha256: skillSha,
        licenseSha256: licenseSha,
        prompts: {
            lite: generatePromptForMode(skillText, "lite"),
            full: generatePromptForMode(skillText, "full"),
            ultra: generatePromptForMode(skillText, "ultra"),
        },
    };
}

export const GENERATED_START_MARKER =
    "// @generated upstream-data:start - do not edit manually, run scripts/sync-upstream.mjs";
export const GENERATED_END_MARKER = "// @generated upstream-data:end";

export function formatGeneratedBlock(data: UpstreamDataBlock): string {
    const json = JSON.stringify(data, null, 4);
    return `${GENERATED_START_MARKER}\nexport const UPSTREAM_DATA = ${json} as const;\n${GENERATED_END_MARKER}`;
}

export function replaceGeneratedBlock(sourceText: string, generatedBlock: string): string {
    const startIndex = sourceText.indexOf(GENERATED_START_MARKER);
    const endIndex = sourceText.indexOf(GENERATED_END_MARKER);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(
            `Source shape error: cannot find markers ${GENERATED_START_MARKER} and ${GENERATED_END_MARKER}`,
        );
    }
    const before = sourceText.slice(0, startIndex);
    const after = sourceText.slice(endIndex + GENERATED_END_MARKER.length);
    return `${before}${generatedBlock}${after}`;
}

export type FetchFunction = (url: string | URL, init?: RequestInit) => Promise<Response>;

export async function defaultFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    return fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
}

export async function fetchUpstreamCommit(
    customFetch: FetchFunction = defaultFetch,
): Promise<string> {
    const url = `https://api.github.com/repos/${UPSTREAM_OWNER_REPO}/commits/main`;
    const res = await customFetch(url, {
        headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) {
        throw new Error(`${url}: HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.length > MAX_FILE_BYTES) {
        throw new Error(`${url}: response exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
    }
    const data = JSON.parse(text);
    if (!data.sha || typeof data.sha !== "string") {
        throw new Error("Invalid GitHub commit response: missing sha property");
    }
    return data.sha;
}

export async function fetchRawFile(
    commit: string,
    filePath: (typeof ALLOWED_PATHS)[number],
    customFetch: FetchFunction = defaultFetch,
): Promise<string> {
    if (!ALLOWED_PATHS.includes(filePath)) {
        throw new Error(`Path ${filePath} is not in the pinned allowlist`);
    }
    const url = `https://raw.githubusercontent.com/${UPSTREAM_OWNER_REPO}/${commit}/${filePath}`;
    const res = await customFetch(url);
    if (!res.ok) {
        throw new Error(`${url}: HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.length > MAX_FILE_BYTES) {
        throw new Error(`${url}: file exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
    }
    return text;
}

export interface SyncOptions {
    check?: boolean;
    customFetch?: FetchFunction;
    ponytailTsPath?: string;
    upstreamJsonPath?: string;
}

export interface SyncResult {
    status: "unchanged" | "updated" | "update-available";
    commit: string;
    previousCommit?: string;
    skillSha256: string;
    licenseSha256: string;
}

export async function syncUpstream(options: SyncOptions = {}): Promise<SyncResult> {
    const ponytailTsPath =
        options.ponytailTsPath ?? new URL("../ponytail.ts", import.meta.url).pathname;
    const upstreamJsonPath =
        options.upstreamJsonPath ?? new URL("../upstream.json", import.meta.url).pathname;
    const customFetch = options.customFetch ?? defaultFetch;

    let pinned: Partial<UpstreamMetadata> = {};
    try {
        pinned = JSON.parse(readFileSync(upstreamJsonPath, "utf8"));
    } catch {
        // Not present or unreadable, defaults to empty
    }

    const commit = await fetchUpstreamCommit(customFetch);
    const [skillText, licenseText] = await Promise.all([
        fetchRawFile(commit, "skills/ponytail/SKILL.md", customFetch),
        fetchRawFile(commit, "LICENSE", customFetch),
    ]);

    validateLicense(licenseText);

    const nextData = generateUpstreamData(commit, skillText, licenseText);
    const skillChanged = nextData.skillSha256 !== pinned.skillSha256;
    const licenseChanged = nextData.licenseSha256 !== pinned.licenseSha256;

    if (!skillChanged && !licenseChanged) {
        return {
            status: "unchanged",
            commit,
            previousCommit: pinned.commit,
            skillSha256: nextData.skillSha256,
            licenseSha256: nextData.licenseSha256,
        };
    }

    if (options.check) {
        return {
            status: "update-available",
            commit,
            previousCommit: pinned.commit,
            skillSha256: nextData.skillSha256,
            licenseSha256: nextData.licenseSha256,
        };
    }

    // Default writes local generated source block and upstream.json
    const currentTs = readFileSync(ponytailTsPath, "utf8");
    const generatedBlock = formatGeneratedBlock(nextData);
    const updatedTs = replaceGeneratedBlock(currentTs, generatedBlock);

    writeFileSync(ponytailTsPath, updatedTs, "utf8");

    const metadata: UpstreamMetadata = {
        repo: nextData.repo,
        commit: nextData.commit,
        skillSha256: nextData.skillSha256,
        licenseSha256: nextData.licenseSha256,
    };
    writeFileSync(upstreamJsonPath, JSON.stringify(metadata, null, 4) + "\n", "utf8");

    return {
        status: "updated",
        commit,
        previousCommit: pinned.commit,
        skillSha256: nextData.skillSha256,
        licenseSha256: nextData.licenseSha256,
    };
}
