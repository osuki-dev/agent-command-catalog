import { createHash } from "node:crypto";
import { join } from "node:path";

export const agents = ["claude-code", "codex-cli", "opencode", "qoder-cli"] as const;
export type Agent = (typeof agents)[number];
export type Availability = "default" | "conditional" | "unknown";
export type Command = {
  name: string;
  description: string;
  aliases: string[];
  argsHint: string | null;
  category: string;
  availability: Availability;
};
export type Catalog = {
  schemaVersion: 1;
  agent: Agent;
  version: string;
  source: {
    kind: "tagged-source" | "current-official-docs";
    url: string;
    revision: string | null;
    sha256: string;
  };
  commands: Command[];
};

const packages: Record<Agent, string> = {
  "claude-code": "@anthropic-ai/claude-code",
  "codex-cli": "@openai/codex",
  opencode: "@opencode/cli",
  "qoder-cli": "@qoder-ai/qodercli",
};
const root = join(import.meta.dir, "..");
const commandName = /^\/[a-z][a-z0-9-]{0,79}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function normalizeText(input: string): string {
  return input
    .replace(/\\\|/g, "|")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function markdownCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((part) => part.trim());
}

function makeCommand(
  name: string,
  description: string,
  category: string,
  aliases: string[] = [],
  argsHint: string | null = null,
  availability: Availability = "default",
): Command {
  return {
    name,
    description: normalizeText(description),
    aliases: [...new Set(aliases)].sort(),
    argsHint,
    category,
    availability,
  };
}

function sorted(commands: Command[]): Command[] {
  return commands.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function aliasesFrom(description: string): string[] {
  const aliasText = description.match(/\bAlias(?:es)?(?::|\s+)\s*([^.)]*)/i)?.[1];
  return aliasText ? [...aliasText.matchAll(/\/(?:[a-z][a-z0-9-]*)/g)].map((match) => match[0]) : [];
}

export function parseClaude(markdown: string): Command[] {
  const section = markdown.split("## All commands\n")[1]?.split(/\n## /)[0];
  if (!section) throw new Error("Claude commands table not found");
  const commands: Command[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const [first, second] = markdownCells(line);
    const match = first?.match(/^`(\/[a-z][a-z0-9-]*)([^`]*)`/);
    if (!match || !second) continue;
    const description = normalizeText(second);
    if (/^Removed\b/i.test(description)) continue;
    const aliases = aliasesFrom(description);
    const conditional = /\b(requires?|available (?:only|where)|doesn.t appear|only shows)\b/i.test(description);
    commands.push(makeCommand(match[1]!, description, "Built-in", aliases, match[2]?.trim().replaceAll("\\|", "|") || null, conditional ? "conditional" : "unknown"));
  }
  return sorted(commands);
}

export function parseQoder(markdown: string): Command[] {
  const body = markdown.split("## Conditional Commands\n")[0] ?? markdown;
  const commands: Command[] = [];
  let category = "Built-in";
  for (const line of body.split("\n")) {
    const heading = line.match(/^## (.+)$/);
    if (heading) category = heading[1]!;
    if (!line.startsWith("| `")) continue;
    const [first, second] = markdownCells(line);
    const name = first?.match(/^`(\/[a-z][a-z0-9-]*)`/)?.[1];
    if (!name || !second) continue;
    const aliases = aliasesFrom(normalizeText(second));
    const conditional = /\/agents|\/plan|\/workflows|\/marketplace|\/skills|\/mcp|\/setup-github/.test(name) || /\brequires\b|not available/i.test(second);
    commands.push(makeCommand(name, second, category, aliases, null, conditional ? "conditional" : "unknown"));
  }
  return sorted(commands);
}

export function parseOpenCode(source: string): Command[] {
  const commands: Command[] = [];
  for (const match of source.matchAll(/slash:\s*\{([^}]+)\}/g)) {
    const body = match[1]!;
    const name = body.match(/\bname:\s*"([a-z][a-z0-9-]*)"/)?.[1];
    if (!name) continue;
    const context = source.slice(Math.max(0, match.index - 450), match.index);
    const titleStart = context.lastIndexOf("title:");
    const ownFields = titleStart >= 0 ? context.slice(titleStart) : context;
    const title = [...context.matchAll(/\btitle:\s*"([^"]+)"/g)].at(-1)?.[1] ?? name.replaceAll("-", " ");
    const category = [...ownFields.matchAll(/\b(?:category|group):\s*"([^"]+)"/g)].at(-1)?.[1] ?? "TUI";
    const aliases = [...(body.match(/\baliases:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z][a-z0-9-]*)"/g)].map((alias) => `/${alias[1]}`);
    const enabled = [...ownFields.matchAll(/\benabled:\s*(false|true)/g)].at(-1)?.[1];
    commands.push(makeCommand(`/${name}`, title, category, aliases, body.includes("arguments: true") ? "[arguments]" : null, enabled === "false" ? "conditional" : "default"));
  }
  return sorted([...new Map(commands.map((command) => [command.name, command])).values()]);
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function parseCodex(rust: string): Command[] {
  const enumBody = rust.match(/pub enum SlashCommand \{([\s\S]*?)\n\}/)?.[1];
  const descriptions = rust.match(/pub fn description\(self\)[\s\S]*?\n    \}/)?.[0];
  if (!enumBody || !descriptions) throw new Error("Codex command definitions not found");
  const commands: Command[] = [];
  let attributes: string[] = [];
  for (const line of enumBody.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#[strum(")) {
      attributes.push(trimmed);
      continue;
    }
    const variant = trimmed.match(/^([A-Z][A-Za-z0-9]*),$/)?.[1];
    if (!variant) continue;
    if (["MemoryDrop", "MemoryUpdate", "Rollout", "TestApproval"].includes(variant)) {
      attributes = [];
      continue;
    }
    const values = attributes.join(" ");
    const toString = values.match(/to_string\s*=\s*"([^"]+)"/)?.[1];
    const serializations = [...values.matchAll(/serialize\s*=\s*"([^"]+)"/g)].map((value) => value[1]!);
    const canonical = toString ?? serializations[0] ?? kebab(variant);
    const aliases = serializations.filter((value) => value !== canonical).map((value) => `/${value}`);
    const description = descriptions.match(new RegExp(`SlashCommand::${variant}\\s*=>\\s*"([^"]+)"`))?.[1]
      ?? descriptions.match(new RegExp(`SlashCommand::${variant}[\\s\\S]{0,80}?\\{\\s*"([^"]+)"`))?.[1]
      ?? variant.replace(/([a-z])([A-Z])/g, "$1 $2");
    const conditional = /\b(App|Voice|Experimental|AutoReview|Memories|Plugins|Import|Hooks)\b/.test(variant);
    commands.push(makeCommand(`/${canonical}`, description, "TUI", aliases, null, conditional ? "conditional" : "default"));
    attributes = [];
  }
  return sorted(commands);
}

export function validateCatalog(input: unknown): asserts input is Catalog {
  if (!input || typeof input !== "object") throw new Error("Catalog must be an object");
  const value = input as Partial<Catalog>;
  if (value.schemaVersion !== 1 || !agents.includes(value.agent as Agent)) throw new Error("Invalid catalog header");
  if (typeof value.version !== "string" || !versionPattern.test(value.version)) throw new Error("Invalid version");
  const source = value.source;
  if (!source || !["tagged-source", "current-official-docs"].includes(source.kind)) throw new Error("Invalid source kind");
  if (typeof source.url !== "string" || !source.url.startsWith("https://")) throw new Error("Invalid source URL");
  if (source.revision !== null && typeof source.revision !== "string") throw new Error("Invalid source revision");
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error("Invalid source hash");
  if (!Array.isArray(value.commands) || value.commands.length < 5 || value.commands.length > 500) throw new Error("Invalid command count");
  const seen = new Set<string>();
  for (const command of value.commands) {
    if (!command || !commandName.test(command.name)) throw new Error(`Invalid command: ${command?.name}`);
    if (seen.has(command.name)) throw new Error(`Duplicate command: ${command.name}`);
    seen.add(command.name);
    if (typeof command.description !== "string" || !command.description || command.description.length > 300 || /[\x00-\x1f]/.test(command.description)) throw new Error(`Invalid description: ${command.name}`);
    if (!Array.isArray(command.aliases) || !command.aliases.every((alias) => typeof alias === "string" && commandName.test(alias))) throw new Error(`Invalid aliases: ${command.name}`);
    if (command.argsHint !== null && (typeof command.argsHint !== "string" || command.argsHint.length > 120)) throw new Error(`Invalid arguments: ${command.name}`);
    if (typeof command.category !== "string" || !command.category || command.category.length > 80) throw new Error(`Invalid category: ${command.name}`);
    if (!["default", "conditional", "unknown"].includes(command.availability)) throw new Error(`Invalid availability: ${command.name}`);
  }
  if (value.commands.some((command, index) => index > 0 && value.commands![index - 1]!.name.localeCompare(command.name, "en") > 0)) throw new Error("Commands are not sorted");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "agent-command-catalog/0.1" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body = await response.text();
  if (body.length < 500 || body.length > 2_000_000) throw new Error(`${url}: unexpected source size`);
  return body;
}

async function latestVersion(agent: Agent): Promise<string> {
  const name = encodeURIComponent(packages[agent]);
  const response = await fetch(`https://registry.npmjs.org/${name}/latest`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`npm registry ${agent}: HTTP ${response.status}`);
  const metadata: unknown = await response.json();
  const version = (metadata as { version?: unknown }).version;
  if (typeof version !== "string" || !versionPattern.test(version)) throw new Error(`npm registry ${agent}: invalid version`);
  return version;
}

export async function collect(agent: Agent, version: string): Promise<Catalog> {
  if (!versionPattern.test(version)) throw new Error(`Invalid requested version: ${version}`);
  const tagged = agent === "codex-cli" || agent === "opencode";
  const revision = agent === "codex-cli" ? `rust-v${version}` : agent === "opencode" ? `v${version}` : null;
  const url = agent === "codex-cli"
    ? `https://raw.githubusercontent.com/openai/codex/${revision}/codex-rs/tui/src/slash_command.rs`
    : agent === "opencode"
      ? `https://github.com/anomalyco/opencode/tree/${revision}/packages/tui/src`
      : agent === "claude-code"
        ? "https://code.claude.com/docs/en/commands.md"
        : "https://docs.qoder.com/cli/slash-reference.md";
  const source = agent === "opencode"
    ? (await Promise.all([
      "app.tsx",
      "routes/session/index.tsx",
      "component/prompt/index.tsx",
    ].map((path) => fetchText(`https://raw.githubusercontent.com/anomalyco/opencode/${revision}/packages/tui/src/${path}`)))).join("\n")
    : await fetchText(url);
  const commands = agent === "codex-cli" ? parseCodex(source)
    : agent === "opencode" ? parseOpenCode(source)
      : agent === "claude-code" ? parseClaude(source) : parseQoder(source);
  const catalog: Catalog = {
    schemaVersion: 1,
    agent,
    version,
    source: {
      kind: tagged ? "tagged-source" : "current-official-docs",
      url,
      revision,
      sha256: createHash("sha256").update(source).digest("hex"),
    },
    commands,
  };
  validateCatalog(catalog);
  return catalog;
}

async function validateFiles(): Promise<void> {
  const indexFile = Bun.file(join(root, "catalog/index.json"));
  const index: unknown = await indexFile.json();
  if (!index || typeof index !== "object") throw new Error("Invalid index");
  const entries = index as Record<string, string>;
  for (const agent of agents) {
    const path = entries[agent];
    if (path !== `catalog/${agent}.json`) throw new Error(`Invalid index path for ${agent}`);
    const catalog: unknown = await Bun.file(join(root, path)).json();
    validateCatalog(catalog);
    if (catalog.agent !== agent) throw new Error(`Index mismatch for ${agent}`);
    console.log(`${agent} ${catalog.version}: ${catalog.commands.length} commands`);
  }
}

async function update(): Promise<void> {
  const versions = await Promise.all(agents.map((agent) => latestVersion(agent)));
  const catalogs = await Promise.all(agents.map((agent, index) => collect(agent, versions[index]!)));
  const index: Record<string, string> = {};
  for (const catalog of catalogs) {
    const path = `catalog/${catalog.agent}.json`;
    const file = Bun.file(join(root, path));
    const existing = await file.json().catch(() => null) as Catalog | null;
    if (existing && JSON.stringify(existing.commands) === JSON.stringify(catalog.commands) && existing.version === catalog.version) {
      index[catalog.agent] = path;
      continue;
    }
    await Bun.write(file, `${JSON.stringify(catalog, null, 2)}\n`);
    index[catalog.agent] = path;
    console.log(`Updated ${path}: ${catalog.commands.length} commands`);
  }
  await Bun.write(join(root, "catalog/index.json"), `${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.main) {
  const operation = Bun.argv[2];
  try {
    if (operation === "update") await update();
    else if (operation === "validate") await validateFiles();
    else throw new Error("Usage: bun scripts/catalog.ts <update|validate>");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
