import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

export interface ResultLike {
  content: readonly { type: string; text?: string }[];
  details?: unknown;
}
export interface SummaryContext {
  isPartial: boolean;
  isError: boolean;
  durationMs?: number;
}
export interface StatusContext extends SummaryContext {
  executionStarted: boolean;
  argsComplete: boolean;
}
export type Status = { icon: string; color: "dim" | "warning" | "success" | "error"; label: string };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Bounded work for streaming titles. Never put arbitrary terminal control sequences in a summary. */
export function cleanLine(value: string): string {
  return stripTerminalSequences(value.slice(0, 4096))
    .replace(/[\r\n\t\u2028\u2029]+/gu, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ").trim();
}

export function countLines(text: string): number {
  if (!text) return 0;
  let lines = text.endsWith("\n") ? 0 : 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return lines;
}

function field(args: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) if (typeof args[key] === "string" && args[key]) return args[key] as string;
  return "";
}

export function shortPath(path: string, cwd: string): string {
  if (isAbsolute(path) && cwd) {
    const local = relative(cwd, path);
    if (!local) return ".";
    if (local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local)) return cleanLine(local);
  }
  const home = homedir();
  return cleanLine(path === home ? "~" : path.startsWith(home + sep) ? "~" + path.slice(home.length) : path);
}

const labels: Record<string, string> = {
  read: "Read", bash: "Bash", powershell: "PowerShell", edit: "Update", write: "Write",
  grep: "Search", find: "Find", ls: "List", codemode: "Code",
};

export function callTitle(name: string, input: unknown, cwd: string): { label: string; target: string } {
  const args = record(input);
  const label = labels[name] ?? cleanLine(name);
  const path = field(args, "path", "file_path");
  let target = "";
  if (name === "codemode") target = "JavaScript";
  else if (name === "bash" || name === "powershell") target = cleanLine(field(args, "command"));
  else if (name === "grep" || name === "find") {
    const pattern = cleanLine(field(args, "pattern"));
    target = [pattern, path && shortPath(path, cwd)].filter(Boolean).join(" in ");
  } else if (["read", "edit", "write", "ls"].includes(name)) {
    target = path ? shortPath(path, cwd) : name === "ls" ? "." : "";
    if (name === "read" && typeof args.offset === "number") target += `:${args.offset}`;
  } else {
    // A generic tool may take credentials or large payloads. Don't serialize arbitrary fields here.
    target = path ? shortPath(path, cwd) : cleanLine(field(args, "command", "pattern", "query", "url"));
  }
  return { label: label || "Tool", target: target || "…" };
}

export function toolStatus(context: StatusContext): Status {
  if (context.isError) return { icon: "✗", color: "error", label: "Error" };
  if (!context.isPartial) return { icon: "●", color: "success", label: "Done" };
  if (context.executionStarted) return { icon: "◌", color: "warning", label: "Running" };
  return { icon: "…", color: "dim", label: context.argsComplete ? "Queued" : "Preparing" };
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Count only unified-patch hunk bodies, including real code lines beginning with +++ or ---. */
export function patchStats(patch: string): { added: number; removed: number } | undefined {
  let inHunk = false, found = false, added = 0, removed = 0;
  for (const line of patch.split("\n")) {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) {
      inHunk = true; found = true;
    } else if (line.startsWith("diff --git ") || line.startsWith("Index: ")) {
      inHunk = false;
    } else if (inHunk && line.startsWith("+")) added++;
    else if (inHunk && line.startsWith("-")) removed++;
  }
  return found ? { added, removed } : undefined;
}

function firstTextLine(content: ResultLike["content"]): string {
  for (const block of content) {
    if (block.type !== "text" || !block.text) continue;
    // Only inspect a small prefix during streaming and when selecting an error excerpt.
    const line = block.text.slice(0, 4096).split(/\r?\n/).find(part => part.trim());
    if (line) return cleanLine(line);
  }
  return "";
}

function errorExcerpt(result: ResultLike, details: Record<string, unknown>): string {
  const explicit = typeof details.error === "string" ? details.error : record(details.error).message;
  if (typeof explicit === "string" && explicit) return cleanLine(explicit);
  // Shell errors often append the exit status after otherwise successful-looking output.
  for (let i = result.content.length - 1; i >= 0; i--) {
    const block = result.content[i];
    if (block.type !== "text" || !block.text) continue;
    const exit = block.text.slice(-4096).match(/Command exited with code \d+[^\r\n]*/);
    if (exit) return cleanLine(exit[0]);
  }
  return firstTextLine(result.content);
}

export function resultSummary(name: string, input: unknown, result: ResultLike, context: SummaryContext): string {
  const args = record(input);
  const details = record(result.details);
  const calls = Array.isArray(details.calls) ? details.calls : [];
  if (context.isPartial) {
    if (context.isError) return "Error · " + (errorExcerpt(result, details) || "details pending");
    if (name === "codemode" && calls.length) {
      const running = calls.filter(call => record(call).status === "running").length;
      return `Running · ${calls.length} calls${running ? `, ${running} running` : ""}`;
    }
    return "Running…";
  }
  const parts: string[] = [];
  if (context.isError) {
    parts.push("Error" + (errorExcerpt(result, details) ? ": " + errorExcerpt(result, details) : " (no details)"));
  } else if (name === "edit") {
    const stats = typeof details.patch === "string" ? patchStats(details.patch) : undefined;
    const edits = Array.isArray(args.edits) ? args.edits.length : 0;
    parts.push(stats ? `+${stats.added} / −${stats.removed}` : edits ? `Applied · ${edits} block(s)` : "Applied");
  } else if (name === "write") {
    parts.push(typeof args.content === "string" ? `Written · ${countLines(args.content)} content lines` : "Written");
  } else {
    const images = result.content.filter(block => block.type === "image").length;
    const texts = result.content.filter(block => block.type === "text" && block.text);
    const lines = texts.reduce((sum, block) => sum + countLines(block.text ?? ""), 0);
    if (name === "read") parts.push(`${lines} lines returned`);
    else if (name === "codemode" && calls.length) {
      const failed = calls.filter(call => record(call).status === "error" || record(call).status === "cancelled").length;
      parts.push(`Done · ${calls.length} calls${failed ? `, ${failed} failed/cancelled` : ""}`);
    } else parts.push(lines ? `Done · ${lines} output lines` : "Done · no text output");
    if (images) parts.push(`${images} image(s)`);
  }
  if (record(details.truncation).truncated === true || details.truncated === true || typeof details.fullOutputPath === "string") parts.push("truncated (see details)");
  const duration = formatDuration(context.durationMs);
  if (duration) parts.push(duration);
  return parts.join(" · ");
}
