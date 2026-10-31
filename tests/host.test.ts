import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ToolExecutionComponent, createBashToolDefinition, createEditToolDefinition,
  createReadToolDefinition, createWriteToolDefinition, initTheme,
} from "@earendil-works/pi-coding-agent";
import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { TUI, TuiMouseEvent } from "@earendil-works/pi-tui";
import { compactRenderers } from "../src/renderers.ts";
import { record } from "../src/summaries.ts";

// The public resolver protocol erases per-tool argument schemas. These fixtures supply
// valid arguments for each native definition; the assertion is only that SDK boundary.
const presentation = (definition: unknown): ToolRenderers => definition as ToolRenderers;
const ui = { requestRender: () => {}, mode: "fullscreen" } as unknown as TUI;
const plain = (row: ToolExecutionComponent, width = 80) => stripTerminalSequences(row.render(width).join("\n"));
const visibleLines = (row: ToolExecutionComponent) => plain(row).split("\n").filter(line => line.trim());
const content = "DETAIL_START\n" + "body line\n".repeat(40) + "DETAIL_TAIL";
const result = { content: [{ type: "text", text: content }], details: undefined, isError: false, durationMs: 125 };

function click(row: ToolExecutionComponent): void {
  const rendered = row.render(80);
  const event: TuiMouseEvent = {
    type: "click", button: "left", x: 3, y: 1, screenX: 3, screenY: 1,
    width: 80, height: rendered.length, shift: false, alt: false, ctrl: false,
  };
  assert.equal(row.handleMouse(event)?.handled, true);
}

test("native read/bash/write and codemode/generic rows expand fully and fold with the host's click path", () => {
  initTheme("dark", false);
  const samples: { name: string; args: Record<string, unknown>; original?: ToolRenderers }[] = [
    { name: "read", args: { path: "sample.txt" }, original: presentation(createReadToolDefinition("/work")) },
    { name: "bash", args: { command: "printf harmless" }, original: presentation(createBashToolDefinition("/work")) },
    { name: "write", args: { path: "sample.txt", content }, original: presentation(createWriteToolDefinition("/work")) },
    { name: "codemode", args: { code: "text('SCRIPT_BODY')" }, original: {
      renderCall: args => new Text("codemode\n" + String(record(args).code), 0, 0),
      renderResult: value => new Text(value.content.filter(block => block.type === "text").map(block => block.text).join("\n"), 0, 0),
    } },
    { name: "mcp__server__query", args: { query: "查找🚀" } },
  ];
  for (const sample of samples) {
    const renderer = compactRenderers(sample.name, sample.original);
    const row = new ToolExecutionComponent(sample.name, sample.name, sample.args, { showImages: false }, renderer, ui, "/work");
    row.setArgsComplete(); row.markExecutionStarted();
    // Native write expands the written content, not its success acknowledgement.
    row.updateResult(sample.name === "write" ? {
      content: [{ type: "text", text: "Successfully wrote sample.txt" }],
      details: undefined, isError: false, durationMs: 125,
    } : result);
    assert.equal(visibleLines(row).length, 2, sample.name);
    assert(!plain(row).includes("DETAIL_TAIL"));
    row.setExpanded(true);
    assert.match(plain(row), /DETAIL_TAIL/, sample.name + ": no extra output truncation");
    click(row);
    assert.equal(visibleLines(row).length, 2);
    assert(!plain(row).includes("DETAIL_TAIL"));
    click(row);
    assert.match(plain(row), /DETAIL_TAIL/);
    if (sample.name === "codemode") assert.match(plain(row), /SCRIPT_BODY/);
  }
});

test("real completed edit keeps actual diff and never computes a stale post-edit preview", async t => {
  initTheme("dark", false);
  const directory = await mkdtemp(join(tmpdir(), "pi-tool-fold-edit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "sample.ts"), "const oldValue = 1;\n");
  const definition = createEditToolDefinition(directory);
  const executeBefore = definition.execute;
  const args = { path: "sample.ts", edits: [{ oldText: "oldValue = 1", newText: "newValue = 2" }] };
  const renderer = compactRenderers("edit", presentation(definition));
  const row = new ToolExecutionComponent("edit", "edit-real", args, { showImages: false }, renderer, ui, directory);
  row.setArgsComplete(); row.markExecutionStarted();
  const actual = await definition.execute("edit-real", args, undefined, undefined, { cwd: directory } as Parameters<typeof definition.execute>[4]);
  row.updateResult({ ...actual, isError: false, durationMs: 2 });
  assert.match(plain(row), /\+1 \/ −1/);
  assert(!plain(row).includes("const oldValue"));
  row.setExpanded(true);
  assert.match(plain(row), /oldValue/); assert.match(plain(row), /newValue/);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert(!plain(row).includes("Could not find"), "must not preview the already modified source");
  assert.equal(await readFile(join(directory, "sample.ts"), "utf8"), "const newValue = 2;\n");
  assert.equal(definition.execute, executeBefore, "render wrapper cannot replace execution");
});

test("two simultaneous tool rows keep partial/final/error state separate and preserve source objects", () => {
  initTheme("dark", false);
  const renderer = compactRenderers("bash", presentation(createBashToolDefinition("/work")));
  const argsA = Object.freeze({ command: "first" }), argsB = Object.freeze({ command: "second" });
  const a = new ToolExecutionComponent("bash", "a", argsA, {}, renderer, ui, "/work");
  const b = new ToolExecutionComponent("bash", "b", argsB, {}, renderer, ui, "/work");
  a.setArgsComplete(); b.setArgsComplete(); a.markExecutionStarted(); b.markExecutionStarted();
  a.updateResult({ content: [{ type: "text", text: "partial secret" }], isError: false }, true);
  assert.match(plain(a), /Running/); assert(!plain(a).includes("partial secret"));
  const failure = Object.freeze({ content: [{ type: "text", text: "Command exited with code 2" }], isError: true, durationMs: 42 });
  b.updateResult(failure);
  assert.match(plain(b), /✗/); assert.match(plain(b), /Error.*code 2/); assert.match(plain(a), /Running/);
  a.updateResult(result);
  a.setExpanded(true);
  assert.match(plain(a), /DETAIL_TAIL/); assert(!plain(b).includes("DETAIL_TAIL"));
  assert.match(plain(b), /second/); assert.deepEqual(argsA, { command: "first" });
  assert.equal(failure.content[0].text, "Command exited with code 2");
});

test("real host rendering adapts to theme invalidation and keeps every line within narrow widths/padding", () => {
  for (const name of ["read", "bash", "edit", "write", "codemode", "mcp__query"]) for (const pad of [0, 1]) {
    const row = new ToolExecutionComponent(name, name + pad, { path: "中文🚀/" + "长".repeat(60), command: "echo " + "long".repeat(60) }, { outputPad: pad, showImages: false }, compactRenderers(name, undefined), ui, "/work");
    row.setArgsComplete(); row.markExecutionStarted(); row.updateResult(result);
    initTheme("dark", false); row.invalidate(); const dark = row.render(80).join("\n");
    initTheme("light", false); row.invalidate(); const light = row.render(80).join("\n");
    assert.notEqual(dark, light, "injected theme must rebuild ANSI colors");
    for (const expanded of [false, true]) {
      row.setExpanded(expanded);
      for (const width of [20, 40, 80]) for (const line of row.render(width)) assert(visibleWidth(line) <= width, `${name}/pad${pad}/${width}`);
    }
  }
});
