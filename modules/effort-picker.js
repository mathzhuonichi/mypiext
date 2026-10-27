// A compact, model-aware thinking selector. /thinking remains Pi's built-in command.
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const STYLE = {
  off:     { label: "OFF",     icon: "○", color: [148, 163, 184] },
  minimal: { label: "MINIMAL", icon: "◔", color: [96, 165, 250] },
  low:     { label: "LOW",     icon: "◐", color: [59, 130, 246] },
  medium:  { label: "MED",     icon: "◕", color: [45, 212, 191] },
  high:    { label: "HIGH",    icon: "●", color: [255, 204, 0] },
  xhigh:   { label: "XHIGH",   icon: "✧", color: [255, 145, 0] },
  max:     { label: "MAX",     icon: "✦", color: [255, 51, 30] },
};
const color = (rgb, text) => `\x1b[38;2;${rgb.join(";")}m${text}\x1b[39m`;

function centered(text, width) {
  const clipped = truncateToWidth(text, Math.max(0, width), "");
  return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped;
}

function makePicker(levels, current, tui, theme, keys, done) {
  let selected = Math.max(0, levels.indexOf(current));
  const requestRender = () => tui.requestRender();
  return {
    invalidate() {},
    render(width) {
      if (width <= 0) return [];
      const level = levels[selected];
      const selectedStyle = STYLE[level];
      const paint = (name, text) => color(STYLE[name].color, text);
      const title = `${paint(level, selectedStyle.icon)} ${theme.bold("Thinking Effort:")} ${paint(level, theme.bold(level.toUpperCase()))} ${theme.fg("muted", level === current ? "(CURRENT)" : "(PREVIEW)")}`;
      const items = levels.map((name, index) => {
        const s = STYLE[name];
        const label = `${s.icon} ${s.label}`;
        if (index === selected) return paint(name, `▶ ${label} ◀`);
        if (name === current) return paint(name, `[ ${label}* ]`);
        return theme.fg("muted", label);
      });
      const row = items.join(theme.fg("muted", "  ─  "));
      const barWidth = Math.max(0, Math.min(68, width - 2));
      const filled = levels.length === 1 ? barWidth : Math.round(barWidth * (selected + 1) / levels.length);
      const bar = theme.fg("muted", "[") + paint(level, "━".repeat(filled)) + theme.fg("muted", "─".repeat(barWidth - filled) + "]");
      const hints = theme.fg("muted", "◂ Left/Right/Tab/H/L: adjust · Enter/Space: confirm · Esc: cancel ▸");
      return ["", centered(title, width), ...wrapTextWithAnsi(row, width).map((line) => centered(line, width)), centered(bar, width), ...wrapTextWithAnsi(hints, width).map((line) => centered(line, width)), ""];
    },
    handleInput(data) {
      if (keys.matches(data, "tui.select.cancel")) return done(undefined);
      if (keys.matches(data, "tui.select.confirm") || matchesKey(data, Key.space)) return done(levels[selected]);
      if (matchesKey(data, Key.left) || matchesKey(data, "h") || matchesKey(data, Key.up)) {
        selected = (selected - 1 + levels.length) % levels.length;
      } else if (matchesKey(data, Key.right) || matchesKey(data, "l") || matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
        selected = (selected + 1) % levels.length;
      } else if (matchesKey(data, Key.shift("tab"))) {
        selected = (selected - 1 + levels.length) % levels.length;
      } else return;
      requestRender();
    },
  };
}

export default function effortPicker(pi) {
  pi.registerCommand("effort", {
    description: "Choose thinking effort with a model-aware visual selector",
    getArgumentCompletions: (prefix) => [...LEVELS, "auto"]
      .filter((level) => level.startsWith(prefix.trim().toLowerCase()))
      .map((level) => ({ value: level, label: level })),
    handler: async (args, ctx) => {
      const model = ctx.model;
      if (!model) return ctx.ui.notify("Select a model first", "warning");
      const levels = getSupportedThinkingLevels(model);
      if (!levels.length) return ctx.ui.notify("This model has no selectable thinking levels", "warning");
      let requested = args.trim().toLowerCase();
      if (requested === "auto") requested = clampThinkingLevel(model, pi.getSettings().defaultThinkingLevel ?? "medium");
      if (requested && !LEVELS.includes(requested)) {
        return ctx.ui.notify(`Unknown effort '${requested}'. Use ${levels.join(", ")} or auto`, "error");
      }
      if (requested && !levels.includes(requested)) {
        return ctx.ui.notify(`Effort '${requested}' is not supported by this model. Available: ${levels.join(", ")}`, "warning");
      }
      if (!requested) {
        if (ctx.mode === "tui") {
          requested = await ctx.ui.custom((tui, theme, keys, done) => makePicker(levels, pi.getThinkingLevel(), tui, theme, keys, done));
        } else if (ctx.hasUI) {
          requested = await ctx.ui.select("Thinking effort", levels);
        } else {
          return ctx.ui.notify(`Effort: ${pi.getThinkingLevel()} (available: ${levels.join(", ")})`, "info");
        }
      }
      if (!requested) return;
      // The model may have changed while the picker was open; Pi performs the final clamp.
      pi.setThinkingLevel(requested);
      const applied = pi.getThinkingLevel();
      ctx.ui.notify(applied === requested ? `Thinking effort: ${applied}` : `Thinking effort: ${applied} (${requested} unavailable)`, applied === requested ? "info" : "warning");
    },
  });
}
