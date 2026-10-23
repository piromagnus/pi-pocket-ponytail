#!/usr/bin/env node
import { syncUpstream } from "./sync-upstream.ts";

const isCheck = process.argv.includes("--check");

try {
    const result = await syncUpstream({ check: isCheck });
    if (result.status === "unchanged") {
        console.log(`Upstream guidance is up to date (${result.commit.slice(0, 7)}).`);
        process.exit(0);
    }
    if (result.status === "update-available") {
        console.log(
            `Upstream update available: ${result.previousCommit?.slice(0, 7) ?? "none"} -> ${result.commit.slice(0, 7)}`,
        );
        process.exit(2);
    }
    console.log(
        `Synchronized upstream Ponytail: ${result.previousCommit?.slice(0, 7) ?? "none"} -> ${result.commit.slice(0, 7)}`,
    );
    process.exit(0);
} catch (error) {
    console.error(`Sync error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
