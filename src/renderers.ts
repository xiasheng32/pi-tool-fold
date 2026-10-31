import type { ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text, stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { Inset, SingleLine } from "./components.ts";
import { callTitle, resultSummary, toolStatus } from "./summaries.ts";

type CallRenderer = NonNullable<ToolRenderers["renderCall"]>;
type ResultRenderer = NonNullable<ToolRenderers["renderResult"]>;
export type RenderContext = Parameters<CallRenderer>[2];
type Result = Parameters<ResultRenderer>[0];

const nativeTools = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls", "codemode"]);

interface RowState {
  call?: Component;
  result?: Component;
  final?: {
    content: Result["content"];
    details: unknown;
    args: unknown;
    isError: boolean;
    durationMs: number | undefined;
    summary: string;
  };
}

function safeOutput(text: string): string {
  return stripTerminalSequences(text).replace(/\r\n?/g, "\n").replace(/\t/g, "   ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "");
}

function formatArguments(args: unknown): string {
  try { return safeOutput(JSON.stringify(args, null, 2) ?? "…"); }
  catch { return "[Arguments unavailable]"; }
}

function genericResult(result: Result, showImages: boolean): Component {
  const blocks = result.content.flatMap(block => {
    if (block.type === "text") return [safeOutput(block.text)];
    if (block.type === "image" && !showImages) return ["[Image: " + block.mimeType + "]"];
    return [];
  });
  // The enclosing renderer supplies theme color. The host remains responsible for image widgets.
  return new Text(blocks.join("\n"), 0, 0);
}

/** Rendering only: the original tool definitions, execute functions and result objects are untouched. */
export function compactRenderers(name: string, original: ToolRenderers | undefined): ToolRenderers {
  const rows = new WeakMap<object, RowState>();
  const rowFor = (context: RenderContext): RowState => {
    let row = rows.get(context.state);
    if (!row) { row = {}; rows.set(context.state, row); }
    return row;
  };
  const frame = (child: Component, context: RenderContext): Component =>
    original?.renderShell === "self" ? child : new Inset(child, context.outputPad);

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const row = rowFor(context);
      if (context.expanded) {
        if (original?.renderCall) {
          // A completed edit already has its actual diff. Do not start a new pre-execution
          // file preview against the now-modified file when it is expanded for the first time.
          const argsComplete = name === "edit" && !context.isPartial ? false : context.argsComplete;
          const component = original.renderCall(args, theme, { ...context, argsComplete, lastComponent: row.call });
          row.call = component;
          return frame(component, context);
        }
        return new Inset(new Text(theme.fg("toolTitle", theme.bold(name)) + "\n" + theme.fg("toolOutput", formatArguments(args)), 0, 0), context.outputPad);
      }
      const status = toolStatus(context);
      const title = callTitle(name, args, context.cwd);
      return new SingleLine(() =>
        theme.fg(status.color, status.icon) + " " +
        theme.fg("toolTitle", theme.bold(title.label)) +
        theme.fg("accent", "(" + title.target + ")") +
        (context.isPartial ? theme.fg("dim", " · " + status.label) : ""),
      context.outputPad);
    },

    renderResult(result, options, theme, context) {
      const row = rowFor(context);
      if (options.expanded) {
        if (original?.renderResult) {
          const component = original.renderResult(result, options, theme, { ...context, lastComponent: row.result });
          row.result = component;
          return frame(component, context);
        }
        const component = genericResult(result, context.showImages);
        // Apply semantic colors without altering the source result.
        return new Inset({
          render: width => component.render(width).map(line => theme.fg(context.isError ? "error" : "toolOutput", line)),
          invalidate: () => component.invalidate(),
        }, context.outputPad);
      }

      let summary: string;
      const cached = row.final;
      if (!options.isPartial && cached?.content === result.content && cached.details === result.details &&
          cached.args === context.args && cached.isError === context.isError && cached.durationMs === context.durationMs) {
        summary = cached.summary;
      } else {
        summary = resultSummary(name, context.args, result, { ...context, isPartial: options.isPartial });
        if (!options.isPartial) row.final = {
          content: result.content, details: result.details, args: context.args,
          isError: context.isError, durationMs: context.durationMs, summary,
        };
      }
      return new SingleLine(() =>
        theme.fg("dim", "  ⎿ ") + theme.fg(context.isError ? "error" : options.isPartial ? "warning" : "muted", summary),
      context.outputPad);
    },
  };
}

export const resolveToolRenderer: ToolRendererResolver = (name, next) => {
  const original = next();
  // Dedicated interfaces (questions, plans, todos, etc.) belong to their existing extensions.
  if (!nativeTools.has(name) && (original?.renderCall || original?.renderResult)) return original;
  return compactRenderers(name, original);
};
