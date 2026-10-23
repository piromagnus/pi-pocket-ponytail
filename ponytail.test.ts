import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { needsVerification } from "./ponytail.ts";

const repo = resolve(process.env.PI_POCKET_REPO ?? join(dirname(import.meta.dirname), "pi-pocket"));
const { cleanUp, modelTexts, newSession, openApp, owner, root, scriptedModel, say } = await import(
    `${repo}/test/helpers.ts`
);
const { createHandler } = await import(`${repo}/src/server/http.ts`);

after(cleanUp);

function install(name: string) {
    const data = join(root, name);
    const dropIns = join(data, "extensions");

    mkdirSync(dropIns, { recursive: true });

    for (const file of ["ponytail.ts", "ponytail.js"]) {
        copyFileSync(join(import.meta.dirname, file), join(dropIns, file));
    }

    return data;
}

const call = (id: string, name: string, args: object) => ({
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
});
const result = (id: string, name: string, details: object = {}, isError = false) => ({
    role: "toolResult",
    toolCallId: id,
    toolName: name,
    details,
    isError,
});
const needs = (messages: any[]) => needsVerification(messages);

test("verification detection respects result success, order, and previous turns", () => {
    const write = call("w", "write", { path: "src/a.ts" });
    const check = call("c", "bash", { command: "npm test" });

    assert.equal(needs([write, result("w", "write")]), true);
    assert.equal(needs([write, result("w", "write", {}, true)]), false);
    assert.equal(needs([check, result("c", "bash"), write, result("w", "write")]), true);
    assert.equal(needs([write, result("w", "write"), check, result("c", "bash")]), false);
    assert.equal(
        needs([write, result("w", "write"), check, result("c", "bash", { exitCode: 1 })]),
        true,
    );
    assert.equal(needs([write, result("w", "write"), check, result("c", "bash", {}, true)]), true);
    assert.equal(
        needs([write, result("w", "write"), { role: "user", content: "new turn" }]),
        false,
    );
});

test("default full, session routes, permissions, command, and restart persistence", async () => {
    const data = install("settings");
    const prompts: string[] = [];
    const model = scriptedModel((request: any) => {
        let active = "";

        for (const message of request.messages) {
            if (
                message.role === "system" &&
                message.sections &&
                Object.hasOwn(message.sections, "ponytail")
            ) {
                active = message.sections.ponytail ?? "";
            }
        }

        prompts.push(active);

        return fauxAssistantMessage([fauxText("ok")]);
    });
    let app = await openApp(model, data);
    let server: ReturnType<typeof createServer> | undefined;

    try {
        await app.setExtensionEnabled(owner(app), "ponytail.ts", true);
        const session = await newSession(app);
        const other = await newSession(app);
        const guest = app.config.addUser("Guest", "guest");
        const viewer = app.config.addUser("Viewer", "viewer");
        const scoped = app.config.addUser("Scoped", "guest", [String(other)]);

        server = createServer(
            createHandler({ app, listen: { host: "127.0.0.1", port: 0 }, restart: () => {} }),
        );
        await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
        const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        const request = (token: string, id = session, mode?: unknown, header = true) =>
            fetch(`${base}/api/x/ponytail/session/${id}`, {
                method: mode === undefined ? "GET" : "PUT",
                headers: {
                    authorization: `Bearer ${token}`,
                    ...(header ? { "x-pocket": "1" } : {}),
                    "content-type": "application/json",
                },
                ...(mode === undefined ? {} : { body: JSON.stringify({ mode }) }),
            });
        const token = app.config.ownerToken;

        assert.deepEqual(await (await request(token)).json(), { mode: "full", override: null });
        await say(app, session, "hello");
        assert.match(prompts.at(-1)!, /PONYTAIL MODE ACTIVE — level: full/);
        assert.equal((await request(token, session, "invalid")).status, 400);
        assert.equal((await request(token, session, undefined, false)).status, 403);
        assert.equal((await request(viewer.token)).status, 404);
        assert.equal((await request(scoped.token)).status, 404);
        assert.equal((await request(guest.token, session, "lite")).status, 200);
        assert.equal((await (await request(token)).json()).mode, "lite");
        assert.equal((await (await request(token, other)).json()).mode, "full");

        const command = app.webs.commands().find((entry: any) => entry.name === "ponytail-mode");
        assert.ok(command);
        await app.extensionCommands.run(session, owner(app), {
            commandId: command.id,
            args: "off",
            requestId: crypto.randomUUID(),
        });
        await say(app, session, "mode is off");
        assert.doesNotMatch(prompts.at(-1)!, /PONYTAIL MODE ACTIVE/);
        assert.equal((await (await request(token)).json()).mode, "off");

        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
        await app.close();
        app = await openApp(model, data);
        await say(app, session, "after restart");
        assert.doesNotMatch(prompts.at(-1)!, /PONYTAIL MODE ACTIVE/);
        await say(app, other, "unrelated session");
        assert.match(prompts.at(-1)!, /PONYTAIL MODE ACTIVE — level: full/);
    } finally {
        server?.closeAllConnections();
        server?.close();
        await app.close();
    }
});

for (const mode of ["full", "ultra", "lite", "off"]) {
    test(`${mode}: real tool rounds get request-local reminders without extra turns`, async () => {
        const data = install(`hook-${mode}`);
        const observed: number[] = [];
        let step = 0;
        const app = await openApp(
            scriptedModel((request: any) => {
                observed.push(
                    request.messages.filter(
                        (message: any) =>
                            typeof message.content === "string" &&
                            message.content.startsWith("Ponytail reminder:"),
                    ).length,
                );
                const current = step++;

                if (current < 2) {
                    return fauxAssistantMessage(
                        [
                            fauxToolCall("write", {
                                path: join(root, `${mode}-${current}.txt`),
                                content: "test",
                            }),
                        ],
                        { stopReason: "toolUse" },
                    );
                }

                return fauxAssistantMessage([fauxText("done")]);
            }),
            data,
        );

        try {
            await app.setExtensionEnabled(owner(app), "ponytail.ts", true);
            const session = await newSession(app);
            const command = app.webs
                .commands()
                .find((entry: any) => entry.name === "ponytail-mode");

            await app.extensionCommands.run(session, owner(app), {
                commandId: command.id,
                args: mode,
                requestId: crypto.randomUUID(),
            });
            await say(app, session, "write two files");
            assert.match((await modelTexts(app, session)).at(-1), /done/);
            assert.deepEqual(observed, mode === "full" || mode === "ultra" ? [0, 1, 1] : [0, 0, 0]);
            await say(app, session, "no new edit");
            assert.equal(
                observed.at(-1),
                0,
                "previous edits do not cause a reminder in a new turn",
            );
        } finally {
            await app.close();
        }
    });
}
