import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";

function padding(width: number, requested: number): number {
  return Math.min(Math.max(0, Math.floor(requested)), Math.max(0, Math.floor((width - 1) / 2)));
}

/** A logical line must stay one visual line, even when its target or CJK characters are long. */
export class SingleLine implements Component {
  private readonly text: () => string;
  private readonly paddingX: number;

  constructor(text: () => string, paddingX = 0) {
    this.text = text;
    this.paddingX = paddingX;
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const pad = padding(width, this.paddingX);
    return [" ".repeat(pad) + truncateToWidth(this.text(), width - pad * 2)];
  }

  invalidate(): void { /* No themed ANSI or width cache to become stale. */ }
}

/** Default-shell renderers expect their parent to apply outputPad. Self-shell renderers already do. */
export class Inset implements Component {
  private readonly child: Component;
  private readonly paddingX: number;

  constructor(child: Component, paddingX: number) {
    this.child = child;
    this.paddingX = paddingX;
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const pad = padding(width, this.paddingX);
    return this.child.render(width - pad * 2).map(line => " ".repeat(pad) + line);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const pad = padding(event.width, this.paddingX);
    if (event.x < pad || event.x >= event.width - pad) return undefined;
    return this.child.handleMouse?.({ ...event, x: event.x - pad, width: event.width - pad * 2 });
  }

  invalidate(): void { this.child.invalidate(); }
}
