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

function rules(mode: Mode): string | undefined {
    if (mode === "off") return undefined;
    return `PONYTAIL MODE ACTIVE — level: ${mode}
Use the least new code that fully solves the request.
1. Skip unrequested features, options, and flexibility.
2. Reuse existing helpers, components, services, and patterns.
3. Prefer platform features and installed dependencies when they fit.
4. Keep changes small and test non-trivial logic.
5. Fix shared root causes after checking callers.
${mode === "lite" ? "Prefer clarity; small helpers are fine when they improve it." : "Avoid needless abstractions and boilerplate."}
${mode === "ultra" ? "Be especially strict about scope and diff size. Never delete code without evidence that it is safe. Use or add a dependency when the request needs it; do not refuse a necessary dependency." : ""}
End your reply with a brief note on what you left unchanged and any known risk.`;
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
