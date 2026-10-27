import test from "node:test";
import assert from "node:assert/strict";
import workingAnimation from "../modules/working-animation.js";

test("working animation tracks a whole exchange and cleans up", async () => {
  const events = {};
  const messages = [];
  let indicator;
  workingAnimation({ on(name, handler) { events[name] = handler; } });
  const ctx = { mode: "tui", ui: {
    setWorkingIndicator(value) { indicator = value; },
    setWorkingMessage(value) { messages.push(value); },
  } };
  events.session_start({}, ctx);
  assert.equal(indicator.frames.length, 6);
  assert.equal(indicator.intervalMs, 120);
  events.before_agent_start({}, ctx);
  events.agent_start({}, ctx);
  assert.deepEqual(messages, ["Working · 0s"]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const elapsed = messages.at(-1);
  assert.match(elapsed, /^Working · [1-9]\d*s$/);
  events.agent_start({}, ctx); // continuation does not reset the clock
  assert.equal(messages.at(-1), elapsed);
  events.agent_settled({}, ctx);
  assert.equal(messages.at(-1), undefined);
  events.agent_start({}, ctx);
  assert.equal(messages.at(-1), "Working · 0s");
  events.session_shutdown({}, ctx);
  assert.equal(messages.at(-1), undefined);
  const rpc = { mode: "rpc", ui: { setWorkingMessage() { throw new Error("RPC must be untouched"); } } };
  events.agent_start({}, rpc);
  events.agent_settled({}, rpc);
});
