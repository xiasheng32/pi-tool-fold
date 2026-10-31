# pi-tool-fold

[简体中文](README.md) | [English](README.en.md)

> **中文：** 一个 [pi](https://pi.dev) 扩展：以 Claude Code 风格折叠工具调用，默认显示标题与一行摘要，展开时保留原有详情。
>
> **English:** A [pi](https://pi.dev) extension that folds tool calls into Claude Code-style titles and one-line summaries, preserving the original details when expanded.

`pi-tool-fold` changes presentation only. It does not replace execution tools or alter arguments, original results, model context, permissions, or model selection. It adds no network requests or background tasks.

```text
● Read(src/main.ts)
  ⎿ 128 lines returned · 100ms

● Bash(npm test)
  ⎿ Done · 24 output lines · 1.2s

● Update(src/app.ts)
  ⎿ +12 / −4
```

## Features

- **Compact tool rows**: a tool name, path or command, and one-line result summary. Long content is truncated to the terminal width instead of wrapping across multiple rows.
- **Original expanded details**: delegates to existing renderers where available, preserving code, actual diffs, and nested codemode calls. Tools without dedicated renderers show full arguments and available text results.
- **Truthful status and statistics**: distinguishes preparing, queued, running, completed, and failed calls. Durations, edit counts, and output line counts use existing data; errors and truncation warnings remain visible.
- **Compatible with dedicated interfaces**: preserves custom question, plan, and Todo renderers; covers common built-in tools and provides generic folding for applicable MCP and custom tools.
- **Follows the host**: uses pi's light/dark themes, horizontal padding, and expansion state. Supports CJK text, emoji, long commands, and narrow terminals without forcing an expanded tool closed after execution or redraw.
- **Presentation only**: tool execution and the results received by the model stay unchanged. No additional runtime dependencies.

## Install

Requires **Node.js >=22.19** and the `registerToolRenderer()` API in **pi 1.4.0+**. Development and offline tests are pinned to **pi 1.4.0**. Host packages are supplied by pi and are not bundled with this extension.

```bash
pi install git:github.com/xiasheng32/pi-tool-fold
pi update git:github.com/xiasheng32/pi-tool-fold   # if already installed
```

Restart pi or run `/reload` in an existing session after installing or updating.

To pin the first release:

```bash
pi install git:github.com/xiasheng32/pi-tool-fold@v0.1.0
```

Git tags are pinned; future updates do not automatically switch to another tag.

### Migrating from a local installation

Run `pi list` to find the existing local source, remove it, then install the Git version. This avoids loading the extension twice through local and Git sources. Replace the placeholder with your actual source path:

```bash
pi remove /path/to/pi-tool-fold
pi install git:github.com/xiasheng32/pi-tool-fold
```

### Local development and temporary use

From the cloned repository:

```bash
pi install .                       # install as a local package
pi -e ./extensions/index.ts         # load for this invocation without saving an install
```

Do not load another copy of the extension at the same time.

## Usage

- **`Ctrl+O`**: keeps pi's global tool expand/collapse action. Custom host keybindings continue to apply.
- **Fullscreen mode**: click an individual tool row after a result is available to toggle expansion.
- **Regular mode**: the terminal owns mouse input; use the keyboard expansion action.
- No new slash commands or configuration options. Removing the extension restores the host's rendering.

## Coverage and boundaries

| Tool | Main collapsed content |
| --- | --- |
| `read` | path, starting line when supplied, and returned text line count |
| `bash` / `powershell` | command, output line count or error excerpt |
| `edit` | path and actual patch additions/removals; without a patch, only the applied edit-block count or status |
| `write` | path and written content line count |
| `grep` / `find` / `ls` | search criteria or path and an output summary |
| `codemode` | JavaScript title and available nested-call statistics |
| MCP / custom tools without a dedicated renderer | generic title and result summary; expand for arguments and available text |

- Adds no extra output truncation and cannot recover content the original tool did not provide. A `read` line count measures returned text, not the entire file.
- Generic summaries do not dump arbitrary parameters, but this is not a credential-redaction tool: paths, commands, queries, URLs, and expanded details may still contain sensitive data. Review sessions before sharing.
- The host still displays images according to its settings; collapsing text cannot prevent pi from displaying images automatically.
- Dedicated custom tool renderers pass through unchanged. Built-in tools and `codemode` still delegate expanded rendering to their originals.

## Development and verification

```bash
npm ci --ignore-scripts
npm run typecheck                  # tsc --noEmit
npm test                           # node --test tests/*.test.ts
npm run check                      # type checking and tests
npm pack --dry-run --json           # inspect package contents; does not publish to npm
```

All tests are offline, with no model API or live MCP service. Coverage includes summaries, folding/expansion, dedicated-renderer compatibility, state isolation, themes, and narrow layouts. Host integration tests use the real `ToolExecutionComponent` to check click expansion, plus an actual file edit and diff in a temporary directory.

```text
extensions/index.ts       renderer registration
src/renderers.ts          folding/expansion, original-renderer delegation, compatibility
src/summaries.ts          titles, status, duration, line counts, and patch summaries
src/components.ts         single-line truncation and host padding
tests/                    offline unit and host integration tests
```

### Upstream dependency security

The development environment pins pi 1.4.0 to match the verified host API. Known upstream advisories affect that host and its `minimatch` / `undici` dependency chains; run `npm audit` for the current report. This extension does not bundle the host runtime or call those networking/pattern-matching interfaces, but that does not resolve the upstream advisories. Follow pi's security updates and recheck compatibility after upgrading the host. This extension never upgrades global pi automatically.

## Changelog

[简体中文](CHANGELOG.md) | [English](CHANGELOG.en.md) · [GitHub Releases](https://github.com/xiasheng32/pi-tool-fold/releases)

## Remove

```bash
pi remove git:github.com/xiasheng32/pi-tool-fold
```

For a pinned tag or local installation, remove the matching source shown by `pi list`. Then run `/reload` or restart pi.

## License

[MIT](LICENSE)
