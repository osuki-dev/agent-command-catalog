import { describe, expect, test } from "bun:test";
import { parseClaude, parseCodex, parseCommandTable, parseOpenCode, parseQoder, validateCatalog } from "./catalog";

describe("official source collectors", () => {
  test("Claude skips removed commands and keeps aliases", () => {
    const markdown = "## All commands\n| Command | Purpose |\n| `/desktop` | Continue in desktop. Alias: `/app` |\n| `/vim` | Removed in v2.1.92. |\n## Next\n";
    expect(parseClaude(markdown)).toEqual([
      { name: "/desktop", description: "Continue in desktop. Alias: /app", aliases: ["/app"], argsHint: null, category: "Built-in", availability: "unknown" },
    ]);
  });

  test("Codex honors canonical names, aliases, and debug exclusions", () => {
    const rust = `pub enum SlashCommand {
    #[strum(to_string = "pwd", serialize = "cwd")]
    Pwd,
    #[strum(serialize = "subagents")]
    MultiAgents,
    MemoryDrop,
}
impl SlashCommand {
    pub fn description(self) -> &'static str {
        match self {
            SlashCommand::Pwd => "show working directory",
            SlashCommand::MultiAgents => "switch between agents",
            SlashCommand::MemoryDrop => "DO NOT USE",
        }
    }
}`;
    expect(parseCodex(rust).map(({ name, aliases }) => ({ name, aliases }))).toEqual([
      { name: "/pwd", aliases: ["/cwd"] },
      { name: "/subagents", aliases: [] },
    ]);
  });

  test("OpenCode v2 collects commands from tagged TUI source", () => {
    const source = `{
      title: "Switch session",
      category: "Session",
      slash: { name: "sessions", aliases: ["resume", "continue"] },
      run: () => {},
    }, {
      title: "Unavailable action",
      enabled: false,
      slash: { name: "unshare" },
    }, {
      title: "New session",
      slash: { name: "new" },
    }`;
    expect(parseOpenCode(source).map(({ name, availability, aliases }) => ({ name, availability, aliases }))).toEqual([
      { name: "/new", availability: "default", aliases: [] },
      { name: "/sessions", availability: "default", aliases: ["/continue", "/resume"] },
      { name: "/unshare", availability: "conditional", aliases: [] },
    ]);
  });

  test("Qoder keeps categories and conditional commands", () => {
    const markdown = "## Work Modes\n| Command | Description |\n| `/plan` | Enter Plan mode. |\n| `/tasks` | Open tasks (aliases `/bg`, `/background`). |\n## Conditional Commands\n";
    expect(parseQoder(markdown)).toEqual([
      { name: "/plan", description: "Enter Plan mode.", aliases: [], argsHint: null, category: "Work Modes", availability: "conditional" },
      { name: "/tasks", description: "Open tasks (aliases /bg, /background).", aliases: ["/background", "/bg"], argsHint: null, category: "Work Modes", availability: "unknown" },
    ]);
  });

  test("official command tables keep aliases and stop before unrelated sections", () => {
    const markdown = `### Interactive Slash Commands
#### Session Commands
| Command | Aliases | Description |
| --- | --- | --- |
| \`/sessions\` | \`/resume\`, \`/continue\` | Switch session |
| \`/goal [objective]\` | - | Set a goal when connected to Gateway |
| \`/model\` | - | Switch model |
| \`/new\` | - | Start session |
| \`/help\` | - | Show help |
### Other commands
| Command | Description |
| --- | --- |
| \`/unrelated\` | Not a slash command for this surface |
`;
    const commands = parseCommandTable(markdown, "### Interactive Slash Commands", "### Other commands");
    expect(commands.map((command) => command.name)).toEqual(["/goal", "/help", "/model", "/new", "/sessions"]);
    expect(commands.find((command) => command.name === "/sessions")?.aliases).toEqual(["/continue", "/resume"]);
    expect(commands.find((command) => command.name === "/goal")).toMatchObject({ argsHint: "[objective]", availability: "conditional" });
  });
});

test("catalog validation rejects malformed command data", () => {
  const base = {
    schemaVersion: 1,
    agent: "opencode",
    version: "1.18.32",
    source: { kind: "tagged-source", url: "https://example.com/source", revision: "v1.18.32", sha256: "a".repeat(64) },
    commands: ["/a", "/b", "/c", "/d", "/e"].map((name) => ({ name, description: "Command", aliases: [], argsHint: null, category: "TUI", availability: "default" })),
  };
  expect(() => validateCatalog(base)).not.toThrow();
  expect(() => validateCatalog({ ...base, commands: [...base.commands.slice(0, 4), { ...base.commands[4], name: "/a" }] })).toThrow(/Duplicate command/);
  expect(() => validateCatalog({ ...base, commands: [...base.commands.slice(0, 4), { ...base.commands[4], name: "/bad;rm" }] })).toThrow(/Invalid command/);
});
