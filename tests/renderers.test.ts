import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI, ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text, stripTerminalSequences } from "@earendil-works/pi-tui";
import toolFold from "../extensions/index.ts";
import { compactRenderers, resolveToolRenderer } from "../src/renderers.ts";
import { context, plainTheme } from "./helpers.ts";

const output = (text: string, details?: unknown) => ({ content: [{ type: "text" as const, text }], details });
const lines = (component: { render(width: number): string[] }) => stripTerminalSequences(component.render(80).join("\n"));

test("factory only registers a renderer, including in non-interactive hosts", () => {
  let resolver: ToolRendererResolver | undefined;
  toolFold({ registerToolRenderer: value => { resolver = value; } } as ExtensionAPI);
  assert.equal(resolver, resolveToolRenderer);
  assert.throws(() => toolFold({} as ExtensionAPI), /requires Pi 1.4.0/);
});

test("dedicated custom renderers pass through while native and generic tools are compacted", () => {
  const dedicated: ToolRenderers = { renderCall: () => new Text("special", 0, 0) };
  for (const name of ["todo", "ask_user_question", "plan_task", "mcp__special"]) assert.equal(resolveToolRenderer(name, () => dedicated), dedicated);
  for (const name of ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls", "codemode"]) {
    assert.notEqual(resolveToolRenderer(name, () => dedicated), dedicated);
    assert.equal(resolveToolRenderer(name, () => dedicated)?.renderShell, "self");
  }
  assert.equal(resolveToolRenderer("mcp__late__query", () => undefined)?.renderShell, "self");
});

test("collapsed call/result form two compact lines and do not expose body or code", () => {
  for (const name of ["read", "bash", "write", "edit", "codemode", "mcp__late__query"]) {
    const renderer = compactRenderers(name, undefined);
    const ctx = context({ args: { path: "src.ts", code: "BODY_SECRET", command: "npm test" } });
    const title = lines(renderer.renderCall!(ctx.args, plainTheme, ctx));
    const summary = lines(renderer.renderResult!(output("BODY_SECRET\n".repeat(100)), { expanded: false, isPartial: false }, plainTheme, ctx));
    assert.equal(title.split("\n").length, 1); assert.equal(summary.split("\n").length, 1);
    assert(!title.includes("BODY_SECRET")); assert(!summary.includes("BODY_SECRET"));
  }
});

test("preparing, queued, running and errors remain truthful", () => {
  const renderer = compactRenderers("bash", undefined);
  for (const [overrides, label] of [
    [{ isPartial: true, executionStarted: false, argsComplete: false }, "Preparing"],
    [{ isPartial: true, executionStarted: false, argsComplete: true }, "Queued"],
    [{ isPartial: true }, "Running"],
  ] as const) assert.match(lines(renderer.renderCall!({}, plainTheme, context(overrides))), new RegExp(label));
  const ctx = context({ isError: true });
  assert.match(lines(renderer.renderCall!({}, plainTheme, ctx)), /✗/);
  assert.match(lines(renderer.renderResult!(output("ENOENT: missing"), { expanded: false, isPartial: false }, plainTheme, ctx)), /Error: ENOENT/);
});

test("expanded original renderers get their own cached components and unchanged data/state", () => {
  let calls = 0, results = 0;
  const args = Object.freeze({ command: "command" });
  const result = Object.freeze(output("FULL_DETAIL"));
  const ctx = context({ args });
  const original: ToolRenderers = {
    renderCall: (actual, _theme, delegated) => {
      assert.equal(actual, args); assert.equal(delegated.state, ctx.state);
      assert(delegated.lastComponent === undefined || delegated.lastComponent instanceof Text);
      calls++;
      const text = delegated.lastComponent as Text | undefined ?? new Text("", 0, 0);
      text.setText("ORIGINAL_CALL"); return text;
    },
    renderResult: (actual, options, _theme, delegated) => {
      assert.equal(actual, result); assert.equal(options.expanded, true);
      assert(delegated.lastComponent === undefined || delegated.lastComponent instanceof Text);
      results++;
      const text = delegated.lastComponent as Text | undefined ?? new Text("", 0, 0);
      text.setText("FULL_DETAIL"); return text;
    },
  };
  const renderer = compactRenderers("bash", original);
  for (const expanded of [false, true, false, true]) {
    ctx.expanded = expanded;
    const call = renderer.renderCall!(args, plainTheme, ctx);
    const body = renderer.renderResult!(result, { expanded, isPartial: false }, plainTheme, ctx);
    if (expanded) assert.match(lines(body), /FULL_DETAIL/); else assert(!lines(body).includes("FULL_DETAIL"));
    ctx.lastComponent = call; // Simulate the host's compact component slot, not the original's slot.
  }
  assert.equal(calls, 2); assert.equal(results, 2);
  assert.deepEqual(args, { command: "command" }); assert.equal(result.content[0].text, "FULL_DETAIL");
});

test("generic expansion retains the final text, full parameters and image placeholders", () => {
  const renderer = compactRenderers("mcp__generic", undefined);
  const ctx = context({ expanded: true, args: { query: "full query", value: "long\n".repeat(100) + "PARAMETER_TAIL" } });
  const call = lines(renderer.renderCall!(ctx.args, plainTheme, ctx));
  const body = lines(renderer.renderResult!({ content: [{ type: "text", text: "body\n".repeat(100) + "RESULT_TAIL" }, { type: "image", data: "base64-secret", mimeType: "image/png" }], details: undefined }, { expanded: true, isPartial: false }, plainTheme, ctx));
  assert.match(call, /PARAMETER_TAIL/); assert.match(body, /RESULT_TAIL/); assert.match(body, /image\/png/);
  assert(!body.includes("base64-secret"));
});

test("completed edit delegation does not request a new preview against modified files", () => {
  const ctx = context({ expanded: true, args: { path: "modified.ts", edits: [{ oldText: "old", newText: "new" }] } });
  let delegatedComplete: boolean | undefined;
  const renderer = compactRenderers("edit", { renderShell: "self", renderCall: (_args, _theme, delegated) => {
    delegatedComplete = delegated.argsComplete; return new Text("actual diff", 0, 0);
  } });
  assert.match(lines(renderer.renderCall!(ctx.args, plainTheme, ctx)), /actual diff/);
  assert.equal(delegatedComplete, false);
  assert.equal(ctx.argsComplete, true);
});

test("final summary is cached per call, never rescanned on ordinary redraws", () => {
  let reads = 0;
  const details = { get patch() { reads++; return "--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n"; } };
  const result = output("Applied", details);
  const renderer = compactRenderers("edit", undefined);
  const a = context(), b = context({ toolCallId: "other", args: { path: "b" } });
  renderer.renderResult!(result, { expanded: false, isPartial: false }, plainTheme, a);
  const first = reads;
  renderer.renderResult!(result, { expanded: false, isPartial: false }, plainTheme, a);
  assert.equal(reads, first);
  renderer.renderResult!(result, { expanded: false, isPartial: false }, plainTheme, b);
  assert(reads > first);
});

test("streaming updates stay compact without reading the partial text", () => {
  const renderer = compactRenderers("bash", undefined);
  const result = { content: [{ type: "text" as const, get text(): string { throw new Error("must not scan partial body"); } }], details: undefined };
  const body = renderer.renderResult!(result, { expanded: false, isPartial: true }, plainTheme, context({ isPartial: true }));
  assert.match(lines(body), /Running/);
});
