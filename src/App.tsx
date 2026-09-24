import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Search } from "lucide-react";
import claude from "../catalog/claude-code.json";
import codex from "../catalog/codex-cli.json";
import opencode from "../catalog/opencode.json";
import qoder from "../catalog/qoder-cli.json";
import pi from "../catalog/pi.json";
import copilot from "../catalog/copilot.json";
import droid from "../catalog/droid.json";
import kilo from "../catalog/kilo.json";
import qwen from "../catalog/qwen.json";
import cursor from "../catalog/cursor.json";
import antigravity from "../catalog/antigravity-cli.json";
import "./index.css";

const catalogs = [
  { id: "claude-code", label: "Claude Code", data: claude, mark: "C" },
  { id: "codex-cli", label: "Codex CLI", data: codex, mark: "X" },
  { id: "opencode", label: "OpenCode v2", data: opencode, mark: "O" },
  { id: "qoder-cli", label: "Qoder CLI", data: qoder, mark: "Q" },
  { id: "pi", label: "Pi", data: pi, mark: "π" },
  { id: "copilot", label: "Copilot CLI", data: copilot, mark: "G" },
  { id: "droid", label: "Factory Droid", data: droid, mark: "D" },
  { id: "kilo", label: "Kilo CLI", data: kilo, mark: "K" },
  { id: "qwen", label: "Qwen Code", data: qwen, mark: "W" },
  { id: "cursor", label: "Cursor CLI", data: cursor, mark: "C" },
  { id: "antigravity-cli", label: "Antigravity CLI", data: antigravity, mark: "A" },
] as const;

type AgentId = (typeof catalogs)[number]["id"];

export function App() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [agent, setAgent] = useState<AgentId>("claude-code");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [copied, setCopied] = useState<string | null>(null);
  const selected = catalogs.find((entry) => entry.id === agent)!;
  const categories = ["All categories", ...new Set(selected.data.commands.map((command) => command.category))];
  const search = query.trim().toLowerCase();
  const commands = selected.data.commands.filter((command) =>
    (category === "All categories" || command.category === category) &&
    (!search || [command.name, command.description, ...command.aliases].some((part) => part.toLowerCase().includes(search))),
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  async function copyCommand(name: string) {
    await navigator.clipboard.writeText(name);
    setCopied(name);
    window.setTimeout(() => setCopied((current) => current === name ? null : current), 1600);
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Agent Command Catalog home"><span className="brand-icon">/</span><span>agent commands<span className="brand-dot">.</span></span></a>
        <div className="topbar-right"><span className="status-dot" /> Official-source snapshots<a className="topbar-link" href="https://github.com/osuki-dev/agent-command-catalog" target="_blank" rel="noreferrer" aria-label="View on GitHub"><span>GitHub</span><ArrowUpRight size={13} /></a><a className="topbar-link" href="https://muqun.dev/" target="_blank" rel="noreferrer" aria-label="Visit Muqun App"><span>Muqun App</span><ArrowUpRight size={13} /></a></div>
      </header>

      <main className="main-layout">
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> A reference for the tools we build with</div>
          <h1>Every command.<br /><span>One place.</span></h1>
          <p>Browse built-in slash commands across coding agents. Sourced from official code or documentation, refreshed as releases evolve.</p>
        </section>

        <section className="directory" aria-label="Command directory">
          <div className="section-heading"><div><div className="eyebrow small">THE DIRECTORY</div><h2>Explore by agent</h2></div><span className="section-count">01 — {String(catalogs.length).padStart(2, "0")}</span></div>
          <div className="agent-grid" role="tablist" aria-label="Agent">
            {catalogs.map((entry) => <div key={entry.id} role="presentation" className={`agent-card ${agent === entry.id ? "selected" : ""}`}>
              <button type="button" role="tab" aria-selected={agent === entry.id} className="agent-select" onClick={() => { setAgent(entry.id); setCategory("All categories"); setQuery(""); }}>
                <span className="agent-card-top"><span className="agent-mark">{entry.mark}</span></span>
                <strong>{entry.label}</strong><span className="agent-card-bottom"><span>{entry.data.version === "current" ? "Current docs" : `v${entry.data.version}`}</span><span>{entry.data.commands.length} commands</span></span>
              </button>
              <a className="agent-json" href={`/catalog/${entry.id}.json`} target="_blank" rel="noreferrer" aria-label={`${entry.label} JSON catalog`}>JSON <ArrowUpRight size={14} /></a>
            </div>)}
          </div>

          <div className="catalog-panel">
            <div className="catalog-head"><div><div className="eyebrow small">COMMAND INDEX <span className="header-slash">/</span> {selected.label.toUpperCase()}</div><h2>{selected.label}</h2><p>Built-in commands recorded from {selected.data.source.kind === "tagged-source" ? "a tagged upstream release" : "current official documentation"}.</p></div><a className="source-link" href={selected.data.source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={15} /></a></div>
            <div className="filter-bar"><label className="search-box"><Search size={18} aria-hidden="true" /><span className="sr-only">Search commands</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, aliases, descriptions..." /><kbd>/</kbd></label><select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select><span className="result-count">{commands.length} / {selected.data.commands.length}</span></div>
            <div className="command-list">{commands.length ? commands.map((command) => <article className="command-row" key={command.name}><div className="command-primary"><button type="button" className="command-name" onClick={() => void copyCommand(command.name)} title={`Copy ${command.name}`}>{command.name}</button><span className="command-category">{command.category}</span>{command.availability === "conditional" && <span className="conditional">Conditional</span>}</div><p>{command.description}</p><div className="command-end">{command.aliases.length > 0 && <span className="aliases">{command.aliases.join(" · ")}</span>}<button className="copy-button" type="button" onClick={() => void copyCommand(command.name)} aria-label={`Copy ${command.name}`}>{copied === command.name ? <Check size={16} /> : <Copy size={16} />}</button></div></article>) : <div className="empty-state">No commands match this search.</div>}</div>
          </div>
        </section>
      </main>
      <footer className="footer"><span>Agent Command Catalog</span><span>One latest snapshot per agent · Local availability may differ</span><a href={`/catalog/${selected.id}.json`} target="_blank" rel="noreferrer">Raw JSON <ArrowUpRight size={13} /></a></footer>
    </div>
  );
}

export default App;
