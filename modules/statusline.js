// Pi status line: model effort cache hit rate context usage tok/s.
// CH is the latest response's cache-read share of prompt tokens; context is
// the percentage used and the total window size. Extension statuses go below.
import { truncateToWidth } from "@earendil-works/pi-tui";

const RESET = "\x1b[0m";

const MODEL_COLOR = [217, 119, 87];
const EFFORT_COLORS = {
  off: [100, 116, 139],
  minimal: [100, 116, 139],
  low: [148, 163, 184],
  medium: [56, 189, 248],
  high: [129, 140, 248],
  xhigh: [192, 132, 252],
  max: [244, 114, 182],
};
const EFFORT_FALLBACK = [56, 189, 248];
const TPS_COLOR = [250, 204, 21];
const CACHE_COLOR = [56, 189, 248];
const CONTEXT_COLOR = [74, 222, 128];
const CONTEXT_WARNING_COLOR = [251, 191, 36];
const CONTEXT_ERROR_COLOR = [248, 113, 113];

const fg = ([r, g, b], text) => `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function formatTokens(count) {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// Match Pi's built-in CH metric, using the latest response on the active branch.
function cacheHitRate(sessionManager) {
  const branch = sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const usage = entry.message.usage;
    if (!usage || !isNum(usage.input) || !isNum(usage.cacheRead) || !isNum(usage.cacheWrite)) return null;
    const total = usage.input + usage.cacheRead + usage.cacheWrite;
    return total > 0 ? (100 * usage.cacheRead) / total : null;
  }
  return null;
}

export default function statusline(pi) {
  let requestStart = null;
  let tps = null;
  let rerender = () => {};

  function render(ctx, footerData, width) {
    const segments = [];
    const model = ctx.model;
    if (model) segments.push(fg(MODEL_COLOR, model.name || model.id));

    if (model?.reasoning) {
      const level = pi.getThinkingLevel();
      if (level) segments.push(fg(EFFORT_COLORS[level] || EFFORT_FALLBACK, level));
    }

    const cache = cacheHitRate(ctx.sessionManager);
    if (isNum(cache)) segments.push(fg(CACHE_COLOR, `CH${cache.toFixed(1)}%`));

    const usage = ctx.getContextUsage();
    const window = usage?.contextWindow ?? model?.contextWindow;
    if (isNum(window) && window > 0) {
      const percent = isNum(usage?.percent) ? `${usage.percent.toFixed(1)}%` : "?";
      const color = usage?.percent > 90 ? CONTEXT_ERROR_COLOR : usage?.percent > 70 ? CONTEXT_WARNING_COLOR : CONTEXT_COLOR;
      segments.push(fg(color, `ctx ${percent}/${formatTokens(window)}`));
    }

    if (isNum(tps)) segments.push(fg(TPS_COLOR, Math.round(tps) + " tok/s"));

    const lines = [truncateToWidth(segments.join(" "), width, "")];
    const statuses = footerData.getExtensionStatuses();
    if (statuses.size > 0) {
      const text = [...statuses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, t]) => t.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim())
        .join(" ");
      lines.push(truncateToWidth(text, width, "..."));
    }
    return lines;
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setFooter((tui, _theme, footerData) => {
      rerender = () => tui.requestRender();
      return {
        invalidate() {},
        render: (width) => render(ctx, footerData, width),
        dispose() {
          rerender = () => {};
        },
      };
    });
  });

  // Each turn is one model request (plus its tools). before_provider_request
  // would also catch the cache warmer's pings, which have no message_end.
  pi.on("turn_start", async (event) => {
    requestStart = event.timestamp;
  });

  // Output tokens per second of the last response, request sent to last token.
  pi.on("message_end", async (event) => {
    const m = event.message;
    if (m?.role !== "assistant" || !m.usage || requestStart === null) return;
    const secs = (Date.now() - requestStart) / 1000;
    if (secs > 0 && isNum(m.usage.output) && m.usage.output > 0) tps = m.usage.output / secs;
    rerender();
  });

  // The assistant message has been persisted to the branch by turn_end.
  pi.on("turn_end", async () => rerender());
  pi.on("model_select", async () => rerender());
  pi.on("thinking_level_select", async () => rerender());
}
