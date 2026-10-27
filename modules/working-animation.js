// Claude-like activity animation and elapsed time in Pi's working indicator.
// Pi controls the indicator's visibility; the timer spans a whole exchange.
const FRAMES = ["✻", "✽", "✶", "✳", "✢", "·"];
const COPPER = "\x1b[38;2;217;119;87m";
const RESET_FOREGROUND = "\x1b[39m";

function formatElapsed(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours) return `${hours}h ${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export default function workingAnimation(pi) {
  let startedAt;
  let timer;

  function start(ctx) {
    if (ctx.mode !== "tui" || timer) return;
    startedAt = performance.now();
    const update = () => ctx.ui.setWorkingMessage(`Working · ${formatElapsed(performance.now() - startedAt)}`);
    update();
    timer = setInterval(update, 1000);
    timer.unref?.();
  }

  function stop(ctx) {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
    startedAt = undefined;
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage();
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingIndicator({
      frames: FRAMES.map((frame) => `${COPPER}${frame}${RESET_FOREGROUND}`),
      intervalMs: 120,
    });
  });
  // before_agent_start includes pre-run processing; agent_start also covers
  // continuation paths that start without a fresh user prompt.
  pi.on("before_agent_start", (_event, ctx) => start(ctx));
  pi.on("agent_start", (_event, ctx) => start(ctx));
  // agent_end can be followed by retries or queued work; settled is final idle.
  pi.on("agent_settled", (_event, ctx) => stop(ctx));
  pi.on("session_shutdown", (_event, ctx) => stop(ctx));
}
