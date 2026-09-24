# Agent Command Catalog

A small catalog of built-in slash commands for coding agents. Each agent has **one latest JSON file** in [`catalog/`](catalog/). The files can be consumed directly by a gateway or the static website; no runtime dependency on this repository is required.

| Agent | Catalog | Official source |
| --- | --- | --- |
| Claude Code | [`claude-code.json`](catalog/claude-code.json) | [Commands reference](https://code.claude.com/docs/en/commands) |
| Codex CLI | [`codex-cli.json`](catalog/codex-cli.json) | [Tagged TUI source](https://github.com/openai/codex/blob/main/codex-rs/tui/src/slash_command.rs) |
| OpenCode v2 | [`opencode.json`](catalog/opencode.json) | [Tagged v2 TUI source](https://github.com/anomalyco/opencode/tree/dev/packages/tui/src) |
| Qoder CLI | [`qoder-cli.json`](catalog/qoder-cli.json) | [Slash-command reference](https://docs.qoder.com/cli/slash-reference) |
| Pi | [`pi.json`](catalog/pi.json) | [Slash-command reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/slash-commands.md) |
| GitHub Copilot CLI | [`copilot.json`](catalog/copilot.json) | [CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) |
| Factory Droid | [`droid.json`](catalog/droid.json) | [CLI reference](https://docs.factory.ai/droid-cli/cli-reference) |
| Kilo CLI | [`kilo.json`](catalog/kilo.json) | [CLI reference](https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/code-with-ai/platforms/cli.md) |
| Qwen Code | [`qwen.json`](catalog/qwen.json) | [Commands reference](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/commands.md) |
| Cursor CLI | [`cursor.json`](catalog/cursor.json) | [Slash-command reference](https://cursor.com/docs/cli/reference/slash-commands) |
| Antigravity CLI | [`antigravity-cli.json`](catalog/antigravity-cli.json) | [CLI reference](https://antigravity.google/docs/cli/reference/) |

The `version` field is the latest npm release observed when available, or the latest GitHub release for Antigravity CLI; `current` means the source does not expose a suitable release channel. Codex and OpenCode v2 sources are pinned to that release's Git tag; OpenCode v1 is intentionally excluded. Other sources use current official documentation, not versioned command definitions, so their `source.kind` is `current-official-docs`: the JSON must not be interpreted as a guarantee that every command exists in a specific installed version. Platform, account, feature flags, and local configuration can also affect availability.

## Use the data

[`catalog/index.json`](catalog/index.json) maps agent IDs to the JSON files. Each file contains `schemaVersion`, `agent`, `version`, official `source` provenance, and a sorted `commands` array. A command contains its literal `name`, `description`, `aliases`, optional `argsHint`, `category`, and `availability`. The format is described by [`schema/catalog.schema.json`](schema/catalog.schema.json).

For an interactive client, treat this as a suggestion catalog. Prefer live agent-provided commands when an API exists, then add local project/user commands separately. Sending an unavailable slash command is handled by the agent itself.

## Update

```bash
bun install --frozen-lockfile
bun run catalog:update
bun run catalog:validate
bun test
bun run typecheck
```

The update script reads the latest release number from the npm registry, then fetches tagged official GitHub content where available and official command documentation otherwise. It writes only `catalog/<agent>.json` and `catalog/index.json`. No agent login, API key, or running terminal session is required.

The weekly GitHub Actions workflow runs the same checks and opens a review PR when the JSON changes. It never auto-merges. A collector or validation failure fails the workflow without publishing a new catalog.

## Scope

This repository catalogs built-in TUI commands only. It does not collect a user's skills, plugins, MCP prompts, or project commands. Those are local and should be discovered by the application serving that user. `bun run build` produces a static browser and copies the raw JSON into `dist/catalog/`.

## Add another agent

1. Find the agent's official tagged source on GitHub. If its command definitions are not open source, use the official command reference instead. Record which kind of source was used; do not present an unversioned document as an exact release snapshot.
2. Add its ID to `agents` and its npm package to `packages` in [`scripts/catalog.ts`](scripts/catalog.ts). If releases are not published to npm, extend `latestVersion` to query that agent's official release channel. Add a small parser and a `collect` branch for its source.
3. Add the ID to [`schema/catalog.schema.json`](schema/catalog.schema.json), and add the JSON import and display card to [`src/App.tsx`](src/App.tsx). The build copies every `catalog/*.json` file automatically.
4. Add a focused parser test, run `bun run catalog:update`, inspect the generated names and aliases against the official source, then run `bun run catalog:validate`, `bun test`, `bun run typecheck`, and `bun run build`.
5. Update the source table above. Submit the parser, test, and generated `catalog/<agent>.json` together for review. The weekly updater will refresh it after merge.

## License

Project code and documentation are licensed under [MIT](LICENSE). Command names and descriptions are drawn from the linked vendors' official sources and remain subject to their respective terms.
