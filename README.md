# Ponytail

A standalone, opt-in [Pi Pocket](https://github.com/TannerMidd/pi-pocket) extension for minimal-code guidance.

## Install

Copy `ponytail.ts` and `ponytail.js` into the data folder's `extensions/` directory, then enable **ponytail** in **Menu → Extensions**. No core patch, credentials, or additional runtime dependency is required. The source is MIT licensed.

The session menu shows **Ponytail** with the current mode on the right, for example **full**. Choose it to select **off**, **lite**, **full**, or **ultra**. Each session stores its own setting in the extension's durable document. New sessions default to **full**; forks inherit their parent's setting. Settings survive restarts.

- **off**: no Ponytail guidance or reminders.
- **lite**: small changes with clarity first.
- **full**: reuse existing code, control scope, and verify non-trivial changes.
- **ultra**: stricter scope and diff discipline, never unsafe deletion or refusal of a necessary dependency.

Use `/ponytail-mode [off|lite|full|ultra]` without a model call, or ask Pi to use the `ponytail_mode` tool. The earlier custom `/ponytail` command and duplicate `ponytail` tool are not registered: public Pi Pocket extension commands require a hyphen.

## Updates

The source of truth is [this repository’s `main` branch](https://github.com/piromagnus/pi-pocket-ponytail/tree/main). Updating Pi Pocket does not update a manually copied extension.

For a source installation, run these commands from your Ponytail checkout. They stop if Git cannot switch cleanly or fast-forward; do not discard local changes to get past an error.

```sh
git switch main &&
before=$(git rev-parse HEAD) &&
git pull --ff-only origin main &&
git diff "$before" HEAD -- ponytail.ts ponytail.js
```

Review the changes and back up any locally edited installed files. Then copy only the two runtime files into the data folder used by your Pi Pocket server:

```sh
data="${PI_POCKET_DIR:-$HOME/.pi-pocket}"
mkdir -p "$data/extensions" &&
cp ponytail.js ponytail.ts "$data/extensions/"
```

An enabled drop-in reloads automatically; its durable session settings stay unchanged. For a custom `--data` location, set `PI_POCKET_DIR` to that same location first. These commands overwrite installed Ponytail code, not settings. Do not use them for a gallery-managed installation. Once the [gallery entry](https://github.com/TannerMidd/pi-pocket-extensions/pull/20) is approved and installed through the gallery, use **Menu → Extensions → Updates** to review and apply pinned updates instead. Nothing updates silently.

## Compatibility

To check compatibility after an upstream Pi Pocket update, use a separate checkout of [Pi Pocket’s `main`](https://github.com/TannerMidd/pi-pocket/tree/main) and run the existing checks with `PI_POCKET_REPO` pointing to it (see [Development](#development)). A compatibility check does not install an update or modify a running server.

Requires Pi Pocket **0.20.0** and extension API **2**. The experimental `MenuSpec.group = "session"` host extension point places the selector in the Session menu group. On older hosts, the same extension works with the row under **App**. The proposed menu hook is a generic host capability; all Ponytail-specific behavior stays in this drop-in.

The extension never reads or writes core `config.json`. The old installation's global setting is not migrated; each session starts at full unless you select another mode.

## Runtime hook

In full and ultra, a `beforeRequest` hook observes successful, direct `write`/`edit` tool results since the latest user message. If no recognized successful check follows the latest edit, it appends **one request-local reminder** to that model request. The reminder is not saved in the chat, and does not start an extra model request or continuation. Later requests with unverified edits can receive the same reminder.

Recognized checks include `npm test`, `npm run check`, `npm run lint`, `npm run typecheck`, `node --check`, `cargo test`, `pytest`, `vitest`, and `jest`. Failed results do not count. This is a conservative heuristic, not proof of verification: it can miss project-specific checks, bash edits, and nested codemode calls. A shell command that masks a failure can also look successful.

The hook never executes or blocks commands, modifies files, approves calls, bypasses Lancet Guard, or forces extra work. The model must still obey the request and current approval flow. The extension makes no external network requests and reads no credentials.

## Development

Use Node 22.19+ and a Pi Pocket checkout with its dependencies installed. For example, link its installed dependencies locally:

```sh
export PI_POCKET_REPO=/path/to/pi-pocket
ln -s "$PI_POCKET_REPO/node_modules" node_modules
npm run check
npm test
```

The tests use Pi Pocket's isolated test helpers and temporary data, never your live data. They exercise permissions, route validation, command behavior, restart persistence, default full, real tool rounds, off/lite behavior, and request-local reminder boundaries. Chromium/mobile rendering is checked separately on a throwaway Pi Pocket server.
