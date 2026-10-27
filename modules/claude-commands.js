// Claude Code style slash commands for Pi.
// Commands Pi already has under the same name (/model, /compact, /resume,
// /export, /copy, /fork) are left to Pi; the rest map onto Pi's runtime.
// Reports are custom entries: shown in the transcript, never sent to the model.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

const REPORT = "claude-commands-report";
// Same lookup order as Pi's own context-file discovery.
const CONTEXT_FILES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

// Claude Code commands and what to use in Pi; "(this)" marks ones defined here.
const CLAUDE_TO_PI = [
  ["/clear", "/clear (this), same as /new"],
  ["/effort [level]", "/effort (extension); /thinking for Pi's selector"],
  ["/exit", "/exit (this), same as /quit"],
  ["/rename [name]", "/rename (this), same as /name"],
  ["/rewind", "/rewind (this); /tree for the full tree"],
  ["/context", "/context (this)"],
  ["/cost", "/cost (this)"],
  ["/status", "/status (this); /session for Pi's view"],
  ["/memory", "/memory (this)"],
  ["/init", "/init (this)"],
  ["/help", "/help (this)"],
  ["/model", "/model"],
  ["/compact [instructions]", "/compact"],
  ["/resume", "/resume"],
  ["/export", "/export"],
  ["/copy", "/copy"],
  ["/config", "/settings"],
  ["/permissions", "/permission-system"],
  ["/agents", "/subagents"],
  ["/hooks, /plugin", "/reload after editing ~/.pi/agent/extensions"],
];

const INIT_PROMPT = `Please analyze this codebase and create an AGENTS.md file in the current directory, which will be given to future coding agent sessions working in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests, including how to run a single test.
2. High-level architecture and structure that requires reading several files to understand.

Usage notes:
- If an AGENTS.md (or CLAUDE.md) already exists, suggest improvements to it instead of starting over.
- Do not repeat yourself, and do not list every file or component; those are easy to discover.
- Do not include generic development practices or made-up sections.
- Include the important parts of README.md, .cursor/rules, .cursorrules, or .github/copilot-instructions.md if present.
- Begin the file with a short line saying it gives guidance to coding agents working in this repository.`;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function formatTokens(count) {
  if (!isNum(count)) return "?";
  if (count < 1000) return String(Math.round(count));
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

const estimateTokens = (text) => Math.ceil((text?.length ?? 0) / 4);

function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const pad = (text, width) => text + " ".repeat(Math.max(1, width - text.length));

function messageText(content) {
  if (typeof content === "string") return content;
  return (content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join(" ");
}

// The context files Pi loads for this cwd: the global one, then cwd and its ancestors.
function contextFilesFor(cwd) {
  const found = (dir) => {
    for (const name of CONTEXT_FILES) {
      const path = join(dir, name);
      try {
        if (existsSync(path) && statSync(path).isFile()) return path;
      } catch {}
    }
    return undefined;
  };
  const files = [];
  const global = found(getAgentDir());
  if (global) files.push(global);
  const ancestors = [];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const path = found(dir);
    if (path && !files.includes(path)) ancestors.unshift(path);
    if (dirname(dir) === dir) break;
  }
  return files.concat(ancestors);
}

export default function claudeCommands(pi) {
  pi.registerEntryRenderer(REPORT, (entry, _options, theme) => {
    const { title, lines } = entry.data ?? { title: "report", lines: [] };
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.fg("accent", theme.bold(title)), 0, 0));
    if (lines.length) box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  const report = (title, lines) => pi.appendEntry(REPORT, { title, lines });
  const own = new Set();
  const register = (name, options) => {
    own.add(name);
    pi.registerCommand(name, options);
  };

  register("clear", {
    description: "Clear the conversation and start a new session (Claude: /clear)",
    handler: async (_args, ctx) => {
      await ctx.newSession({ withSession: async (next) => next.ui.notify("New session started", "info") });
    },
  });

  register("exit", {
    description: "Quit Pi (Claude: /exit)",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });

  register("rename", {
    description: "Rename the current session (Claude: /rename)",
    handler: async (args, ctx) => {
      let name = args.trim();
      if (!name && ctx.hasUI) name = (await ctx.ui.input("Session name", pi.getSessionName() ?? ""))?.trim() ?? "";
      if (!name) return;
      pi.setSessionName(name);
      ctx.ui.notify(`Session renamed to "${name}"`, "info");
    },
  });

  register("rewind", {
    description: "Rewind the conversation to before an earlier message (Claude: /rewind)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish, or press Esc, before rewinding", "warning");
        return;
      }
      const prompts = ctx.sessionManager
        .getBranch()
        .filter((e) => e.type === "message" && e.message?.role === "user")
        .reverse();
      if (!prompts.length) {
        ctx.ui.notify("Nothing to rewind", "info");
        return;
      }
      const labels = prompts.map((e, i) => {
        const text = messageText(e.message.content).replace(/\s+/g, " ").trim() || "(no text)";
        return `${i + 1}. ${text.length > 100 ? text.slice(0, 100) + "…" : text}`;
      });
      const choice = await ctx.ui.select("Rewind to before which message? (code changes are not undone)", labels);
      if (!choice) return;
      // Navigating to a user message moves the leaf to its parent and puts its text back in the editor.
      await ctx.navigateTree(prompts[labels.indexOf(choice)].id);
    },
  });

  register("context", {
    description: "Show context window usage (Claude: /context)",
    handler: async (_args, ctx) => {
      const usage = ctx.getContextUsage();
      const window = usage?.contextWindow ?? ctx.model?.contextWindow;
      const system = estimateTokens(ctx.getSystemPrompt());
      const active = new Set(pi.getActiveTools());
      const tools = pi.getAllTools().filter((t) => active.has(t.name));
      const toolTokens = tools.reduce(
        (sum, t) => sum + estimateTokens(`${t.name} ${t.description ?? ""} ${JSON.stringify(t.parameters ?? {})}`),
        0,
      );
      const branch = ctx.sessionManager.getBranch().filter((e) => e.type === "message");
      const total = usage?.tokens;
      const messages = isNum(total) ? Math.max(0, total - system - toolTokens) : undefined;

      const lines = [];
      if (isNum(total) && isNum(window) && window > 0) {
        const width = 40;
        const filled = Math.min(width, Math.round((total / window) * width));
        lines.push("█".repeat(filled) + "░".repeat(width - filled));
        lines.push(`${formatTokens(total)} / ${formatTokens(window)} tokens (${((100 * total) / window).toFixed(1)}%)`);
      } else {
        lines.push(`Usage unknown until the next response${isNum(window) ? ` (window ${formatTokens(window)})` : ""}`);
      }
      lines.push("");
      lines.push(pad("System prompt", 18) + `~${formatTokens(system)}`);
      lines.push(pad(`Tools (${tools.length})`, 18) + `~${formatTokens(toolTokens)}`);
      lines.push(pad(`Messages (${branch.length})`, 18) + (isNum(messages) ? `~${formatTokens(messages)}` : "?"));
      if (isNum(total) && isNum(window)) lines.push(pad("Free", 18) + formatTokens(Math.max(0, window - total)));
      lines.push("");
      lines.push("Context files: " + (contextFilesFor(ctx.cwd).join(", ") || "none"));
      report("Context", lines);
    },
  });

  register("cost", {
    description: "Show token usage and cost for this session (Claude: /cost)",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const byModel = new Map();
      const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
      for (const entry of entries) {
        const msg = entry.type === "message" ? entry.message : undefined;
        if (msg?.role !== "assistant" || !msg.usage) continue;
        const key = `${msg.provider}/${msg.model}`;
        const row = byModel.get(key) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
        for (const target of [row, total]) {
          target.input += msg.usage.input ?? 0;
          target.output += msg.usage.output ?? 0;
          target.cacheRead += msg.usage.cacheRead ?? 0;
          target.cacheWrite += msg.usage.cacheWrite ?? 0;
          target.cost += msg.usage.cost?.total ?? 0;
          target.requests += 1;
        }
        byModel.set(key, row);
      }
      const describe = (r) =>
        `${formatTokens(r.input)} in, ${formatTokens(r.output)} out, ` +
        `${formatTokens(r.cacheRead)} cache read, ${formatTokens(r.cacheWrite)} cache write`;
      const started = entries.length ? Date.parse(entries[0].timestamp) : NaN;
      const lines = [
        pad("Total cost", 16) + `$${total.cost.toFixed(4)}`,
        pad("Requests", 16) + total.requests,
        pad("Tokens", 16) + describe(total),
      ];
      if (isNum(started)) lines.push(pad("Wall time", 16) + formatDuration(Date.now() - started));
      if (byModel.size > 1) {
        lines.push("", "By model:");
        for (const [model, r] of byModel) lines.push(`  ${model}: $${r.cost.toFixed(4)}, ${describe(r)}`);
      }
      report("Cost", lines);
    },
  });

  register("status", {
    description: "Show version, model, effort, session and context (Claude: /status)",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager;
      const usage = ctx.getContextUsage();
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
      const lines = [
        pad("Version", 14) + VERSION,
        pad("Model", 14) + model,
        pad("Effort", 14) + (ctx.model?.reasoning ? pi.getThinkingLevel() : "n/a"),
        pad("Directory", 14) + ctx.cwd,
        pad("Session", 14) + (pi.getSessionName() ? `${pi.getSessionName()} (${sm.getSessionId()})` : sm.getSessionId()),
        pad("Session file", 14) + (sm.getSessionFile() ?? "not saved"),
        pad("Context", 14) +
          (isNum(usage?.tokens) ? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} (${usage.percent?.toFixed(1)}%)` : "unknown"),
        pad("Active tools", 14) + pi.getActiveTools().length,
        pad("Memory files", 14) + (contextFilesFor(ctx.cwd).join(", ") || "none"),
      ];
      report("Status", lines);
    },
  });

  register("memory", {
    description: "Edit the AGENTS.md memory files Pi loads (Claude: /memory)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const files = contextFilesFor(ctx.cwd);
      const options = [...files];
      const projectFile = join(resolve(ctx.cwd), "AGENTS.md");
      const userFile = join(getAgentDir(), "AGENTS.md");
      if (!files.some((f) => dirname(f) === resolve(ctx.cwd))) options.push(`${projectFile}  (new)`);
      if (!files.some((f) => dirname(f) === resolve(getAgentDir()))) options.push(`${userFile}  (new)`);
      const choice = await ctx.ui.select("Edit which memory file?", options);
      if (!choice) return;
      const path = choice.replace(/ {2}\(new\)$/, "");
      const before = existsSync(path) ? readFileSync(path, "utf-8") : "";
      const after = await ctx.ui.editor(path, before);
      if (after === undefined || after === before) return;
      writeFileSync(path, after, "utf-8");
      ctx.ui.notify(`Saved ${path}; reloading`, "info");
      await ctx.reload();
    },
  });

  register("init", {
    description: "Analyze the codebase and write AGENTS.md (Claude: /init)",
    handler: async (args, ctx) => {
      const extra = args.trim();
      const prompt = extra ? `${INIT_PROMPT}\n\nAdditional instructions: ${extra}` : INIT_PROMPT;
      if (ctx.isIdle()) pi.sendUserMessage(prompt);
      else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    },
  });

  register("help", {
    description: "Show Claude Code commands and their Pi equivalents (Claude: /help)",
    handler: async () => {
      const width = Math.max(...CLAUDE_TO_PI.map(([c]) => c.length)) + 2;
      const lines = ["Claude Code → Pi", ...CLAUDE_TO_PI.map(([c, p]) => "  " + pad(c, width) + p)];
      const extra = pi.getCommands().filter((c) => c.source === "extension" && !own.has(c.name));
      if (extra.length) {
        lines.push("", "Extension commands:");
        for (const c of extra) lines.push(`  /${c.name}${c.description ? `  ${c.description}` : ""}`);
      }
      lines.push("", "Type / to search every command, including Pi's built-ins.");
      report("Help", lines);
    },
  });
}
