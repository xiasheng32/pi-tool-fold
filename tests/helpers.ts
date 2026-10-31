import type { Theme } from "@earendil-works/pi-coding-agent";
import type { RenderContext } from "../src/renderers.ts";

export const plainTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

export function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    args: { path: "src/main.ts" }, toolCallId: "test-call", invalidate: () => {},
    lastComponent: undefined, state: {}, cwd: "/work", executionStarted: true,
    argsComplete: true, isPartial: false, expanded: false, showImages: false,
    isError: false, durationMs: undefined, outputPad: 1, ...overrides,
  };
}
