// Hide tool calls from the transcript so only prompts and replies show.
// Ctrl+O (expand tool output) brings them back, drawn by the tool's own
// renderers, or as "name args" plus the result text when it has none.
import { Text } from "@earendil-works/pi-tui";

const EMPTY = { render: () => [], invalidate() {} };
const MAX_ARGS = 200;

function argsLine(name, args, theme) {
  let text = "";
  try {
    text = JSON.stringify(args ?? {});
  } catch {}
  if (text.length > MAX_ARGS) text = text.slice(0, MAX_ARGS) + "...";
  return new Text(theme.bold(name) + " " + theme.fg("muted", text), 1, 0);
}

function resultText(result, theme) {
  const text = (result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text ? new Text(theme.fg("toolOutput", text), 1, 0) : EMPTY;
}

export default function hideTools(pi) {
  pi.registerToolRenderer((toolName, next) => {
    const base = next();
    return {
      // "self" lets an empty render take no lines at all, not even the frame.
      renderShell: "self",
      renderCall(args, theme, context) {
        if (!context.expanded) return EMPTY;
        if (base?.renderCall) return base.renderCall(args, theme, context);
        return argsLine(toolName, args, theme);
      },
      renderResult(result, options, theme, context) {
        if (!options.expanded) return EMPTY;
        if (base?.renderResult) return base.renderResult(result, options, theme, context);
        return resultText(result, theme);
      },
    };
  });
}
