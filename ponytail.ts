/** Ponytail provides mode guidance, session controls, and conservative verification reminders; it never runs or blocks commands. */
import { Type, type Message } from "@earendil-works/pi-ai";
import {
    defineDoc,
    defineExtension,
    defineTool,
    GenerationTask,
    hook,
    section,
} from "@earendil-works/pi-durable";

const MODES = ["off", "lite", "full", "ultra"] as const;
type Mode = (typeof MODES)[number];
type Settings = { mode?: Mode };
const DEFAULT_MODE: Mode = "full";

const modeOf = (settings?: Settings): Mode => settings?.mode ?? DEFAULT_MODE;

const SessionDoc = defineDoc<Settings>({
    kind: "x.ponytail.session",
    version: 1,
    scope: "conversation",
    history: "latest",
    fork: "current",
    initial: () => ({}),
});

const modeSchema = Type.Union(MODES.map((mode) => Type.Literal(mode)));

// @generated upstream-data:start - do not edit manually, run scripts/sync-upstream.mjs
export const UPSTREAM_DATA = {
    repo: "https://github.com/DietrichGebert/ponytail",
    commit: "09c434ab73ca43761c5d8b0c5d341926c2fba710",
    skillSha256: "9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509",
    licenseSha256: "fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab",
    prompts: {
        lite: 'PONYTAIL MODE ACTIVE — level: lite\n\n# Ponytail\n\nYou are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.\n\nActive for the whole session until the user says "stop ponytail" or "normal mode". Switch level: `/ponytail-mode lite|full|ultra`.\n\n## Before you write\n\nRead the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.\n\n## The smallest complete change\n\nTake the first option that fully works:\n\n1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.\n2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.\n3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.\n4. An installed dependency? Use it. Never add a dependency for a few lines.\n5. Can it be one line a reader gets at a glance? One line.\n6. Otherwise: the minimum code that works.\n\n- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.\n- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.\n- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.\n- Comment only the why the code cannot show, in one line.\n- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.\n- Code you move or merge keeps its error handling and validation.\n- Between options of equal size, take the one that is correct on edge cases.\n- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.\n- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.\n\nNever cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.\n\n## Levels\n\n| Level | Behavior |\n|-------|----------|\n| **lite** | Build what was asked. Name the smaller option in one line and let the user pick. |\n\nPi Pocket safety: keep input validation, security controls, accessibility basics, requested features, and necessary dependencies.',
        full: 'PONYTAIL MODE ACTIVE — level: full\n\n# Ponytail\n\nYou are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.\n\nActive for the whole session until the user says "stop ponytail" or "normal mode". Switch level: `/ponytail-mode lite|full|ultra`.\n\n## Before you write\n\nRead the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.\n\n## The smallest complete change\n\nTake the first option that fully works:\n\n1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.\n2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.\n3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.\n4. An installed dependency? Use it. Never add a dependency for a few lines.\n5. Can it be one line a reader gets at a glance? One line.\n6. Otherwise: the minimum code that works.\n\n- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.\n- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.\n- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.\n- Comment only the why the code cannot show, in one line.\n- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.\n- Code you move or merge keeps its error handling and validation.\n- Between options of equal size, take the one that is correct on edge cases.\n- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.\n- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.\n\nNever cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.\n\n## Levels\n\n| Level | Behavior |\n|-------|----------|\n| **full** | The rules above. Default. |\n\nPi Pocket safety: keep input validation, security controls, accessibility basics, requested features, and necessary dependencies.',
        ultra: 'PONYTAIL MODE ACTIVE — level: ultra\n\n# Ponytail\n\nYou are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.\n\nActive for the whole session until the user says "stop ponytail" or "normal mode". Switch level: `/ponytail-mode lite|full|ultra`.\n\n## Before you write\n\nRead the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.\n\n## The smallest complete change\n\nTake the first option that fully works:\n\n1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.\n2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.\n3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.\n4. An installed dependency? Use it. Never add a dependency for a few lines.\n5. Can it be one line a reader gets at a glance? One line.\n6. Otherwise: the minimum code that works.\n\n- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.\n- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.\n- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.\n- Comment only the why the code cannot show, in one line.\n- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.\n- Code you move or merge keeps its error handling and validation.\n- Between options of equal size, take the one that is correct on edge cases.\n- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.\n- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.\n\nNever cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.\n\n## Levels\n\n| Level | Behavior |\n|-------|----------|\n| **ultra** | Also question the request: before building, push back on any part the need does not justify. |\n\nPi Pocket safety: keep input validation, security controls, accessibility basics, requested features, and necessary dependencies.',
    },
} as const;
// @generated upstream-data:end

function rules(mode: Mode): string | undefined {
    if (mode === "off") return undefined;
    return UPSTREAM_DATA.prompts[mode];
}

export const pocketApi = 2;

const CHECK_COMMAND =
    /(?:^|[;&|])\s*(?:npm run (?:check|lint|typecheck)|npm test|node --check|cargo test|pytest|vitest|jest)\b/;

export function needsVerification(messages: readonly Message[]): boolean {
    // A real user message starts a new turn; request-local reminders are never stored in this history.
    const start = messages.map((message) => message.role).lastIndexOf("user") + 1;
    const calls = new Map<string, { write: boolean; check: boolean }>();
    let changed = false;
    let checked = false;
    for (const message of messages.slice(start)) {
        if (message.role === "assistant") {
            for (const part of message.content ?? []) {
                if (part.type !== "toolCall") continue;
                const args = part.arguments ?? {};
                calls.set(part.id, {
                    write:
                        ["write", "edit"].includes(part.name) &&
                        typeof (args.path ?? args.filePath) === "string",
                    check:
                        part.name === "bash" &&
                        typeof args.command === "string" &&
                        CHECK_COMMAND.test(args.command),
                });
            }
        } else if (message.role === "toolResult" && !message.isError) {
            const call = calls.get(message.toolCallId);
            if (!call) continue;
            const exitCode = (message.details as { exitCode?: unknown } | undefined)?.exitCode;
            if (call.check && typeof exitCode === "number" && exitCode !== 0) continue;
            if (call.write) {
                changed = true;
                checked = false;
            }
            if (call.check && changed) checked = true;
        }
    }
    return changed && !checked;
}

export default function createPonytail(_host: unknown, web: any) {
    web.client("ponytail.js", { access: "steer" });
    web.conversationRoute(
        "GET",
        "session/:conversation",
        async (request: any) => {
            const override = await request.snapshot(
                SessionDoc,
                request.conversation.id,
                request.context,
            );
            return { mode: modeOf(override), override: override?.mode ?? null };
        },
        { conversation: "conversation", access: "steer" },
    );
    web.conversationRoute(
        "PUT",
        "session/:conversation",
        async (request: any) => {
            if (!MODES.includes(request.body.mode))
                throw web.error(400, "Choose off, lite, full, or ultra.");
            await request.commit(async (tx: any) => {
                (await tx.doc(SessionDoc, request.conversation.id)).mode = request.body.mode;
            });
            web.send("changed");

            return { mode: request.body.mode };
        },
        { conversation: "conversation", access: "steer" },
    );
    web.command("ponytail-mode", {
        description: "Show or set Ponytail mode for this session",
        args: "[off|lite|full|ultra]",
        scope: "conversation",
        handler: async (args: string, ctx: any) => {
            const mode = args.trim();
            if (!mode) {
                const current = await ctx.snapshot(SessionDoc, ctx.conversationId, ctx.context);
                return { type: "toast", level: "info", message: `Ponytail: ${modeOf(current)}` };
            }
            if (!MODES.includes(mode as Mode))
                throw web.error(400, "Use off, lite, full, or ultra.");
            await ctx.commit(async (tx: any) => {
                (await tx.doc(SessionDoc, ctx.conversationId)).mode = mode;
            });
            web.send("changed");

            return { type: "toast", level: "info", message: `Ponytail: ${mode}` };
        },
    });

    const modeTool = defineTool({
        name: "ponytail_mode",
        description: "Get or set Ponytail mode for this session.",
        parameters: Type.Object({
            action: Type.Union([Type.Literal("status"), Type.Literal("set")]),
            mode: Type.Optional(modeSchema),
        }),
        replay: "safe",
        execute: async (args, api, context) => {
            if (args.action === "set") {
                const mode = (args.mode ?? DEFAULT_MODE) as Mode;
                await api.commit(async (tx: any) => {
                    (await tx.doc(SessionDoc, api.conversationId)).mode = mode;
                }, context);
                web.send("changed");

                return { output: [{ type: "text" as const, text: `Ponytail session: ${mode}.` }] };
            }
            const current = await api.snapshot(SessionDoc, api.conversationId, context);
            return {
                output: [{ type: "text" as const, text: `Ponytail session: ${modeOf(current)}.` }],
            };
        },
    });
    const reminder = hook(GenerationTask, {
        beforeRequest: async (request, api, context) => {
            const mode = modeOf(await api.snapshot(SessionDoc, api.conversationId, context));
            if (mode !== "full" && mode !== "ultra") return;
            const messages = request.messages;

            if (!needsVerification(messages)) return;

            return {
                messages: [
                    ...messages,
                    {
                        role: "system",
                        content:
                            "Ponytail reminder: new file changes have no recognized successful verification after the latest edit. Consider a suitable check if needed. Do not run commands unless the request and current guard flow permit them.",
                        timestamp: Date.now(),
                    },
                ],
            };
        },
    });
    return defineExtension({
        name: "ponytail",
        tools: [modeTool],
        sections: [
            section("ponytail", async (input: any, context: any) => {
                const mode = modeOf(
                    await input.read.snapshot(SessionDoc, input.conversationId, context),
                );
                return rules(mode);
            }),
        ],
        hooks: [reminder],
    });
}
