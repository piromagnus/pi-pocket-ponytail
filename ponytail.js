export const pocketApi = 1;

export default function setup(pocket) {
    const modes = ["off", "lite", "full", "ultra"];
    const menu = pocket.menu({
        id: "mode",
        label: "Ponytail",
        hint: "…",
        group: "session",
        sheet: "mode",
    });
    let conversationId;
    let revision = 0;
    let disposed = false;

    async function refresh(force = false) {
        const id = pocket.conversationId();

        if (disposed || (!force && id === conversationId)) {
            return;
        }

        conversationId = id;
        const request = ++revision;

        menu.update({ hint: id === null ? "" : "…" });

        if (id === null) {
            return;
        }

        try {
            const value = await pocket.api(`session/${encodeURIComponent(id)}`);

            if (!disposed && request === revision && pocket.conversationId() === id) {
                menu.update({ hint: value.mode });
            }
        } catch {
            if (!disposed && request === revision) {
                menu.update({ hint: "" });
            }
        }
    }

    const update = () => refresh(true);
    const timer = setInterval(() => refresh(), 250);

    pocket.on("changed", update);
    globalThis.addEventListener?.("focus", update);
    pocket.onDispose(() => {
        disposed = true;
        clearInterval(timer);
        globalThis.removeEventListener?.("focus", update);
    });
    refresh();
    pocket.sheet({
        id: "mode",
        title: "Ponytail",
        component: function PonytailMode({ pocket: app }) {
            const { html, useEffect, useState } = app;
            const [mode, setMode] = useState(null);
            const [saving, setSaving] = useState(false);
            const [error, setError] = useState("");
            const conversationId = app.conversationId();
            useEffect(() => {
                let active = true;
                app.api(`session/${encodeURIComponent(conversationId)}`).then(
                    (value) => {
                        if (active) {
                            setMode(value.mode);
                            menu.update({ hint: value.mode });
                        }
                    },
                    (e) => {
                        if (active) setError(e.message);
                    },
                );
                return () => {
                    active = false;
                };
            }, [conversationId]);
            if (mode === null && !error)
                return html`<${app.Loader} label="Loading Ponytail mode" />`;
            return html`<div
                style=${{ display: "flex", flexWrap: "wrap", gap: "8px", maxWidth: "100%" }}
            >
                ${modes.map(
                    (value) =>
                        html`<button
                            class="button ${mode === value ? "primary" : ""}"
                            style=${{ minHeight: "44px", minWidth: "64px" }}
                            aria-pressed=${mode === value}
                            disabled=${saving || mode === null}
                            onclick=${async () => {
                                setSaving(true);
                                setError("");
                                try {
                                    await app.api(
                                        `session/${encodeURIComponent(conversationId)}`,
                                        { mode: value },
                                        { method: "PUT" },
                                    );
                                    setMode(value);
                                    menu.update({ hint: value });
                                } catch (e) {
                                    setError(e.message);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            ${value}
                        </button>`,
                )}
                ${error ? html`<div class="error-box" style=${{ width: "100%", overflowWrap: "anywhere" }}>${error}</div>` : ""}
            </div>`;
        },
    });
}
