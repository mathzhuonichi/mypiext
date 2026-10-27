import test from "node:test";
import assert from "node:assert/strict";
import { matchesKey, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import effortPicker from "../modules/effort-picker.js";

test("picker offers supported levels, handles navigation and cancellation, and fits narrow terminals", async () => {
  let command;
  let value = "high";
  let keys = [];
  let rendered = "";
  const notices = [];
  effortPicker({
    registerCommand(name, options) { assert.equal(name, "effort"); command = options; },
    getThinkingLevel: () => value,
    setThinkingLevel: (level) => { value = level; },
    getSettings: () => ({ defaultThinkingLevel: "high" }),
  });
  const theme = { bold: (s) => s, fg: (_, s) => s };
  const kb = { matches: (data, action) => action === "tui.select.cancel" ? matchesKey(data, "escape") : action === "tui.select.confirm" && matchesKey(data, "enter") };
  const model = { reasoning: true, thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" } };
  const ctx = { model, mode: "tui", hasUI: true, ui: {
    notify: (text, type) => notices.push([text, type]),
    custom: async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, theme, kb, (x) => { result = x; });
      rendered = component.render(90).map(stripTerminalSequences).join("\n");
      for (const width of [8, 16, 30, 90]) {
        for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
      }
      for (const key of keys) component.handleInput(key);
      return result;
    },
  } };
  keys = ["\x1b[C", "\r"];
  await command.handler("", ctx);
  assert.equal(value, "xhigh");
  assert.match(rendered, /LOW/); assert.match(rendered, /MAX/);
  assert.doesNotMatch(rendered, /MINIMAL|OFF/);
  value = "high"; keys = ["\x1b[D", "\x1b"];
  await command.handler("", ctx); assert.equal(value, "high");
  keys = ["\t", " "]; await command.handler("", ctx); assert.equal(value, "xhigh");
  value = "high"; keys = ["\x1b[Z", "\r"]; await command.handler("", ctx); assert.equal(value, "medium");
  value = "high"; await command.handler("off", ctx); assert.equal(value, "high"); assert.match(notices.at(-1)[0], /not supported/);
  await command.handler("low", ctx); assert.equal(value, "low");
  await command.handler("auto", ctx); assert.equal(value, "high");
  value = "off"; keys = ["\r"];
  await command.handler("", { ...ctx, model: { reasoning: false } });
  assert.equal(value, "off"); assert.doesNotMatch(rendered, /HIGH|LOW/);
});
