import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SingleLine } from "../src/components.ts";
import { callTitle, cleanLine, countLines, formatDuration, patchStats, resultSummary, shortPath, toolStatus } from "../src/summaries.ts";

const done = { isPartial: false, isError: false };
const text = (value: string, details?: unknown) => ({ content: [{ type: "text", text: value }], details });

test("line counts cover empty text, trailing newlines and CRLF", () => {
  for (const [input, count] of [["", 0], ["a", 1], ["a\n", 1], ["a\nb", 2], ["a\r\nb\r\n", 2], ["\n", 1]] as const) assert.equal(countLines(input), count);
});
test("only actual finite nonnegative durations are displayed", () => {
  assert.equal(formatDuration(undefined), ""); assert.equal(formatDuration(Infinity), "");
  assert.equal(formatDuration(-1), ""); assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(45.4), "45ms"); assert.equal(formatDuration(1234), "1.2s");
});
test("paths use cwd and home only at actual directory boundaries", () => {
  assert.equal(shortPath("/work/project/src/你好.ts", "/work/project"), "src/你好.ts");
  assert.equal(shortPath("/work/project", "/work/project"), ".");
  assert.equal(shortPath("/work/project-other/a", "/work/project"), "/work/project-other/a");
  assert.equal(shortPath(homedir() + "/a", "/unrelated"), "~/a");
});
test("collapsed titles remove terminal controls and never dump arbitrary credentials", () => {
  const title = callTitle("bash", { command: "\x1b[31mecho 你好\x1b[0m\n\t🚀\x1b]0;spoofed\x07\u202e" }, "/work");
  assert.equal(title.target, "echo 你好 🚀");
  assert.deepEqual(callTitle("custom", { token: "secret", headers: { Authorization: "secret" } }, "/work"), { label: "custom", target: "…" });
  assert.deepEqual(callTitle("read", { path: 1 }, "/work"), { label: "Read", target: "…" });
  assert.equal(callTitle("codemode", { code: "secret code\n".repeat(1000) }, "/work").target, "JavaScript");
  assert(cleanLine("a".repeat(100000)).length <= 4096);
});
test("all native call targets are concise and tolerate missing/partial input", () => {
  for (const name of ["read", "write", "edit", "bash", "powershell", "find", "grep", "ls", "codemode", "mcp__server__tool"]) assert.doesNotThrow(() => callTitle(name, undefined, "/work"));
  assert.equal(callTitle("grep", { pattern: "TODO", path: "/work/src" }, "/work").target, "TODO in src");
  assert.equal(callTitle("read", { path: "src.ts", offset: 5 }, "/work").target, "src.ts:5");
});
test("status comes from lifecycle fields, never the output's wording", () => {
  assert.equal(toolStatus({ ...done, isPartial: true, executionStarted: false, argsComplete: false }).label, "Preparing");
  assert.equal(toolStatus({ ...done, isPartial: true, executionStarted: false, argsComplete: true }).label, "Queued");
  assert.equal(toolStatus({ ...done, isPartial: true, executionStarted: true, argsComplete: true }).label, "Running");
  assert.equal(toolStatus({ ...done, executionStarted: true, argsComplete: true }).label, "Done");
  assert.equal(toolStatus({ ...done, isError: true, executionStarted: false, argsComplete: true }).label, "Error");
  assert.match(resultSummary("bash", {}, text("Error handling is tested successfully"), done), /^Done/);
});
test("patch stats exclude headers but include code starting with +++ and ---", () => {
  const patch = "--- a/file\n+++ b/file\n@@ -1,2 +1,3 @@\n-old\n---oldcode\n+new\n++++code\n+third\n context\n\\ No newline at end of file\n";
  assert.deepEqual(patchStats(patch), { added: 3, removed: 2 });
  assert.equal(patchStats("--- file\n+++ file\n"), undefined);
  assert.match(resultSummary("edit", {}, text("Applied", { patch }), done), /^\+3 \/ −2$/);
});
test("missing patch never invents addition/removal counts from replacement lengths", () => {
  const summary = resultSummary("edit", { edits: [{ oldText: "a", newText: "a\nb\nc" }] }, text("Applied", { diff: "display-oriented diff" }), done);
  assert.equal(summary, "Applied · 1 block(s)");
});
test("read/write counts identify the counted data and retain truncation warnings", () => {
  assert.equal(resultSummary("read", {}, text("a\nb\n", { truncation: { truncated: true } }), { ...done, durationMs: 10 }), "2 lines returned · truncated (see details) · 10ms");
  assert.equal(resultSummary("write", { content: "a\nb\n" }, text("ok"), done), "Written · 2 content lines");
  assert.match(resultSummary("bash", {}, text(""), done), /no text output/);
  assert.match(resultSummary("read", {}, { content: [{ type: "image" }] }, done), /1 image\(s\)/);
});
test("errors are visible, including appended shell failure and empty errors", () => {
  assert.match(resultSummary("bash", {}, text("Starting...\nCommand exited with code 2"), { ...done, isError: true }), /^Error: Command exited with code 2/);
  assert.equal(resultSummary("read", {}, text(""), { ...done, isError: true }), "Error (no details)");
});
test("streaming summaries do not scan or reveal long partial output", () => {
  assert.equal(resultSummary("bash", {}, text("hidden\n".repeat(100000)), { ...done, isPartial: true }), "Running…");
  assert.equal(resultSummary("codemode", {}, text("", { calls: [{ status: "ok" }, { status: "running" }] }), { ...done, isPartial: true }), "Running · 2 calls, 1 running");
  assert.match(resultSummary("codemode", {}, text("Script completed", { calls: [{ status: "ok" }, { status: "error" }] }), done), /2 calls, 1 failed\/cancelled/);
});
test("one-line component respects widths, CJK, emoji and padding without wrapping", () => {
  for (const width of [0, 1, 2, 10, 20, 40, 80]) for (const pad of [0, 1]) {
    const lines = new SingleLine(() => "● Read(中文🚀/" + "长".repeat(100) + ")", pad).render(width);
    assert(lines.length <= 1);
    for (const line of lines) assert(visibleWidth(line) <= width, `width=${width} pad=${pad}`);
  }
});
