# pi-tool-fold

[简体中文](README.md) | [English](README.en.md)

> **中文：** 一个 [pi](https://pi.dev) 扩展：以 Claude Code 风格折叠工具调用，默认显示标题与一行摘要，展开时保留原有详情。
>
> **English:** A [pi](https://pi.dev) extension that folds tool calls into Claude Code-style titles and one-line summaries, preserving the original details when expanded.

`pi-tool-fold` 只改变工具调用的显示，不替换执行工具，不改变参数、原始结果、模型上下文、权限或模型选择，也不新增网络请求或后台任务。

```text
● Read(src/main.ts)
  ⎿ 128 lines returned · 100ms

● Bash(npm test)
  ⎿ Done · 24 output lines · 1.2s

● Update(src/app.ts)
  ⎿ +12 / −4
```

## 功能特性

- **紧凑的工具行**：折叠时显示工具名称、路径或命令，以及一行结果摘要；长内容在当前终端宽度内截断，不挤占多行。
- **保留展开详情**：优先委托原有渲染器，保留代码、实际 diff 和 codemode 嵌套调用；无专用渲染器时展示完整参数和可用文本结果。
- **真实状态与统计**：区分准备、排队、运行、完成和错误；耗时、编辑增删、输出行数仅使用已有数据，错误与截断提示保持可见。
- **兼容现有界面**：问答、计划、Todo 等工具已有的专用渲染原样保留；覆盖常见内置工具，并为适用的 MCP / 自定义工具提供通用折叠显示。
- **跟随宿主设置**：使用 pi 的亮暗主题、横向 padding 和展开状态，适配中文、emoji、长命令及窄窗口；不会在执行完成或刷新后强制收起已展开的工具。
- **仅展示层逻辑**：不修改工具执行和模型收到的结果，没有额外运行时依赖。

## 安装

需要 **Node.js >=22.19** 和 **pi 1.4.0+** 的 `registerToolRenderer()` API；开发与离线测试固定使用 **pi 1.4.0**。宿主包由 pi 提供，不随扩展捆绑。

```bash
pi install git:github.com/xiasheng32/pi-tool-fold
pi update git:github.com/xiasheng32/pi-tool-fold   # 已安装时更新
```

安装或更新后重启 pi，或在已有会话中执行 `/reload`。

如需固定首个版本：

```bash
pi install git:github.com/xiasheng32/pi-tool-fold@v0.1.0
```

Git tag 为固定版本；后续更新不会自动切换到其他 tag。

### 从本地安装迁移

先运行 `pi list` 确认已有的本地安装来源，移除后再安装 Git 版本，避免同一扩展从本地路径和 Git 仓库重复加载。将下面的路径替换为实际来源：

```bash
pi remove /path/to/pi-tool-fold
pi install git:github.com/xiasheng32/pi-tool-fold
```

### 本地开发与临时试用

在克隆后的仓库目录运行：

```bash
pi install .                       # 作为本地包安装
pi -e ./extensions/index.ts         # 仅本次会话加载，不写安装配置
```

临时试用时不要同时加载另一份本扩展。

## 使用

- **`Ctrl+O`**：沿用 pi 的全局工具展开 / 折叠操作；如已自定义快捷键，继续使用宿主配置。
- **fullscreen 模式**：工具产生结果后，可点击单条工具切换展开状态。
- **regular 模式**：鼠标由终端管理，请使用展开快捷键。
- 没有新增斜杠命令或配置项；移除扩展后恢复宿主原有渲染。

## 支持范围与边界

| 工具 | 折叠时的主要内容 |
| --- | --- |
| `read` | 文件路径、起始行（如有）、返回文本行数 |
| `bash` / `powershell` | 命令、输出行数或错误摘要 |
| `edit` | 文件路径、实际 patch 的增删数；缺少 patch 时仅展示已应用的编辑块数或状态 |
| `write` | 文件路径、写入内容行数 |
| `grep` / `find` / `ls` | 搜索条件或路径、输出摘要 |
| `codemode` | JavaScript 标题、可用的嵌套调用统计 |
| 无专用渲染器的 MCP / 自定义工具 | 通用标题与结果摘要，展开查看参数和可用文本 |

- 不增加原工具已有的输出截断，也不恢复原工具未提供的内容。`read` 的行数是返回文本的行数，不代表文件的全部行数。
- 通用摘要不会倾倒任意参数，但这不是凭据脱敏工具：路径、命令、查询、URL 和展开详情仍可能包含敏感数据。分享会话前请自行检查。
- 图片仍由宿主根据设置显示；文字折叠不能阻止 pi 自动显示图片。
- 其他工具已有专用渲染器时保持原样；内置工具及 `codemode` 的展开显示仍委托原有渲染器。

## 开发与验证

```bash
npm ci --ignore-scripts
npm run typecheck                  # tsc --noEmit
npm test                           # node --test tests/*.test.ts
npm run check                      # 类型检查与测试一起执行
npm pack --dry-run --json           # 检查包内容，不发布 npm
```

测试全部离线，无需模型 API 或真实 MCP 服务。覆盖摘要、折叠 / 展开、专用渲染兼容、状态隔离、主题和窄屏布局；宿主集成测试使用真实 `ToolExecutionComponent` 检查鼠标展开，以及临时目录中的实际文件编辑和 diff。

```text
extensions/index.ts       注册工具渲染器
src/renderers.ts          折叠与展开、原有渲染委托、兼容策略
src/summaries.ts          标题、状态、耗时、行数与 patch 摘要
src/components.ts         单行截断与宿主 padding
tests/                    离线单元测试与宿主集成测试
```

### 上游依赖安全提示

开发环境固定 pi 1.4.0，以匹配已验证的宿主 API。已知上游安全告警涉及该宿主及其 `minimatch`、`undici` 依赖链；可运行 `npm audit` 查看当前报告。本扩展不捆绑宿主运行时，也不调用这些网络 / 模式匹配接口，但这不代表上游告警已消除。请关注 pi 上游安全更新，升级宿主后重新验证兼容性；本扩展不会自动升级全局 pi。

## 更新日志

[简体中文](CHANGELOG.md) | [English](CHANGELOG.en.md) · [GitHub Releases](https://github.com/xiasheng32/pi-tool-fold/releases)

## 移除

```bash
pi remove git:github.com/xiasheng32/pi-tool-fold
```

固定 tag 或本地安装请移除 `pi list` 中对应的来源。之后执行 `/reload` 或重启 pi。

## 许可

[MIT](LICENSE)
