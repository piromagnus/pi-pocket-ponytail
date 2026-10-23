import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const { default: setup } = await import(new URL("./ponytail.js", import.meta.url).href);

async function until(check: () => boolean) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) {
            return;
        }

        await delay(10);
    }

    assert.fail("Timed out waiting for the menu hint");
}

test("the menu hint follows the session, mode events, and async request ordering", async () => {
    let conversationId: number | null = 1;
    let hint = "";
    const modes = new Map([
        [1, "full"],
        [2, "off"],
    ]);
    const listeners = new Map<string, () => unknown>();
    const cleanups: (() => void)[] = [];
    const requests: string[] = [];
    let delayed: ((value: { mode: string }) => void) | undefined;
    let holdNext = false;

    setup({
        conversationId: () => conversationId,
        menu: (spec: { hint: string }) => {
            hint = spec.hint;

            return {
                update: (patch: { hint: string }) => {
                    hint = patch.hint;
                },
            };
        },
        sheet: () => {},
        on: (event: string, run: () => unknown) => listeners.set(event, run),
        onDispose: (run: () => void) => cleanups.push(run),
        api: async (path: string) => {
            requests.push(path);

            if (holdNext) {
                holdNext = false;

                return new Promise<{ mode: string }>((resolve) => {
                    delayed = resolve;
                });
            }

            return { mode: modes.get(Number(path.split("/").at(-1))) };
        },
    });

    try {
        await until(() => hint === "full");
        await delay(300);
        assert.equal(requests.length, 1, "the navigation timer does not poll the server");
        modes.set(1, "lite");
        await listeners.get("changed")!();
        assert.equal(hint, "lite");

        holdNext = true;
        void listeners.get("changed")!();
        await until(() => delayed !== undefined);
        conversationId = 2;
        await until(() => hint === "off");
        delayed!({ mode: "ultra" });
        await delay(0);
        assert.equal(hint, "off", "a late response cannot show the previous session's mode");

        conversationId = null;
        await until(() => hint === "");
        holdNext = true;
        conversationId = 1;
        delayed = undefined;
        void listeners.get("changed")!();
        await until(() => delayed !== undefined);
        cleanups.forEach((run) => run());
        delayed!({ mode: "full" });
        await delay(0);
        assert.equal(hint, "…", "a disposed module cannot update the menu");
    } finally {
        cleanups.forEach((run) => run());
    }
});
