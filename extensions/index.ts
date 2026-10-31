import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveToolRenderer } from "../src/renderers.ts";

export default function toolFold(pi: ExtensionAPI): void {
  if (typeof pi.registerToolRenderer !== "function") {
    throw new Error("pi-tool-fold requires Pi 1.4.0+ with registerToolRenderer().");
  }
  pi.registerToolRenderer(resolveToolRenderer);
}
