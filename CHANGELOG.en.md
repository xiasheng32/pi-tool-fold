# Changelog

[简体中文](CHANGELOG.md) | [English](CHANGELOG.en.md)

## [0.1.0] - 2026-10-31

First public release: compact Claude Code-style tool calls for pi, with original details preserved when expanded.

- Collapsed rows show a tool title and one-line summary for common built-in tools, `codemode`, and MCP/custom tools without dedicated renderers.
- Expanded rows delegate to the original renderers, preserving code, actual diffs, and nested calls. Dedicated question, plan, Todo, and other custom interfaces remain unchanged.
- Keeps the host's global expand/collapse keybinding and per-tool clicks in fullscreen mode without resetting the user's expansion state after completion or redraw.
- Status, duration, returned/written line counts, and actual patch additions/removals use existing data. Errors and truncation warnings remain visible, with light/dark, CJK, emoji, and narrow-terminal support.
- Presentation only: no replacement execution tools or changes to arguments, original results, model context, permissions, models, or keybindings. No added network requests, background tasks, or runtime dependencies.
- Includes bilingual READMEs, install/update/removal instructions, and changelogs. Developed against pi 1.4.0's public rendering API.

### Verification

- `npm run check`: type checking and all 25 offline tests passed, including real host-component click expansion, an actual file edit/diff, state isolation, and light/dark and narrow layouts.
- `npm pack --dry-run --json`: 10 expected files containing the extension entry point, source, license, and bilingual documentation, without bundled host or other dependencies. Package and lockfile versions both match `0.1.0`.
- Known upstream development-dependency advisories remain: `npm audit` reports 2 moderate and 1 high affected packages with no fix currently available. Dependencies were not upgraded; see the README security note.

[0.1.0]: https://github.com/xiasheng32/pi-tool-fold/releases/tag/v0.1.0
