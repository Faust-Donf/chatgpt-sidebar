# ChatGPT Sidebar

一个把 ChatGPT、Obsidian 本地知识库和远程 MCP 连接起来的个人知识工作台。

本仓库不是单一的 Obsidian 插件源码仓库，而是一个可直接打开的 Obsidian vault。它包含一套 llm-wiki 风格的知识库结构、ChatGPT 侧边栏插件、以及一个可供 ChatGPT 远程访问 vault 的 MCP server。

## 为什么做这个项目

ChatGPT 很适合对话和推理，Obsidian 很适合长期沉淀。这个仓库把两者连接起来：

- 在 Obsidian 里用侧边栏打开 ChatGPT，减少来回切窗口。
- 用 `wiki/` 保存可以长期复用的概念、项目、主题地图和资料摘要。
- 用 `mcp-server/` 把 vault 以受控工具形式暴露给 ChatGPT，让 ChatGPT 可以读取、搜索、整理和写入知识库。
- 保留明确的安全边界：不提交 token，不暴露 `.git`、`.obsidian`、`.env` 和服务端工程目录。

README 结构参考了几个成熟 Obsidian 项目的写法：Dataview 先讲清楚项目价值和使用场景，Obsidian sample plugin 强调安装/开发路径，Obsidian Copilot 明确说明 AI 能力和数据边界。

## 功能特性

- Obsidian vault 骨架：按 `raw/`、`wiki/`、`external/` 分层保存资料、知识和外部支持文件。
- ChatGPT Sidebar：通过 Obsidian 桌面插件在侧边栏打开 ChatGPT 网页。
- llm-wiki 知识结构：支持 sources、concepts、comparisons、maps、projects 和 meta 六类页面。
- 远程 MCP Server：通过 SSE 暴露 vault 访问工具，支持 ChatGPT MCP 客户端连接。
- 受控写入能力：写已有文件需要 `overwrite=true`，删除文件需要 `confirm=true`。
- 安全默认值：默认不暴露 `.git`、`.obsidian`、`mcp-server`、`.env`、依赖目录和插件缓存。

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Faust-Donf/chatgpt-sidebar.git
cd chatgpt-sidebar
```

### 2. 用 Obsidian 打开 vault

在 Obsidian 中选择：

```text
Open folder as vault
```

然后选择本仓库目录。

### 3. 启用插件

进入 Obsidian 设置：

```text
Settings -> Community plugins
```

确认需要的插件已经启用。重点插件包括：

- `chatgpt-web-sidebar`：在 Obsidian 桌面端打开 ChatGPT 网页侧边栏。
- `obsidian42-brat`：辅助安装和管理 beta 插件。
- `agent-client`：agent/MCP 相关交互入口。
- `surfing`：网页浏览辅助插件。

> 注意：`chatgpt-web-sidebar` 只是插件 ID。仓库名已经改为 `chatgpt-sidebar`，两者不必完全一致。

## MCP Server

`mcp-server/` 是这个 vault 的远程访问服务。它基于 Express、官方 MCP SDK、SSE transport 和 mock OAuth/DCR 端点，为 ChatGPT MCP 客户端提供受控 vault 工具。

### 安装依赖

```bash
cd mcp-server
npm install
cp .env.example .env
openssl rand -hex 32
```

把生成的随机值写入 `.env`：

```text
MCP_ACCESS_TOKEN=your-long-random-token
```

### 本地启动

```bash
npm run dev
```

健康检查：

```bash
curl http://localhost:3000/health
```

### 通过 ngrok 暴露给 ChatGPT

```bash
npm run tunnel
```

ChatGPT MCP URL 格式：

```text
https://<ngrok-host>/sse?token=<MCP_ACCESS_TOKEN>
```

如果使用本仓库的启动脚本，也可以运行：

```bash
npm run up
```

它会启动本地 MCP server、启动 ngrok，并打印当前可用的 MCP URL。

## MCP 工具

读取工具：

- `get_vault_structure`：查看浅层目录树。
- `list_vault_files`：分页列出可访问文件。
- `read_vault_file`：读取一个文本文件。
- `search_vault`：按关键词搜索 vault。

写入和整理工具：

- `write_vault_file`：创建或覆盖文本文件，覆盖已有文件需要 `overwrite=true`。
- `append_vault_file`：追加文本。
- `delete_vault_file`：删除单个文件，需要 `confirm=true`。
- `move_vault_path`：移动或重命名文件/目录。
- `create_vault_directory`：创建目录。
- `write_vault_binary_file`：写入二进制附件，推荐放在 `raw/assets/`。

## 目录结构

```text
raw/
  inbox/       # 新资料入口
  archive/     # 已归档原始资料
  assets/      # 图片、PDF、音视频等附件

wiki/
  sources/     # 原始资料摘要
  concepts/    # 概念与方法论
  comparisons/ # 对比分析
  maps/        # 主题地图
  projects/    # 项目页
  meta/        # 模板、提示词、维护资料

external/
  skills/      # 支持 llm-wiki 使用的外部 skill 文件

mcp-server/    # 面向 ChatGPT MCP 客户端的 vault 访问服务
AGENT*.md      # llm-wiki 维护规则、schema、工作流和写作规范
index.md       # 全局导航
log.md         # 时间线日志
hot.md         # 会话热缓存
```

## 知识库约定

`wiki/` 是知识主体：

- `sources/` 保存资料摘要和出处。
- `concepts/` 保存可长期复用的概念卡片。
- `comparisons/` 保存对比分析。
- `maps/` 保存主题导航。
- `projects/` 保存项目推进页。
- `meta/` 保存模板、检查清单和维护记录。

`raw/` 是原始资料层，默认只读优先。`external/` 和 `mcp-server/` 是支持工程，不进入知识主体。

## 安全说明

- 不提交 `.env`。
- 不把 ngrok token、MCP token、API key 写入 README 或受版本控制文件。
- MCP server 不暴露 `.git`、`.obsidian`、`mcp-server`、`.env` 和依赖目录。
- ChatGPT MCP 客户端建议保持“执行前询问”，尤其是写入、移动和删除工具。
- 不需要公网访问时，关闭 ngrok 终端。

## 开发与验证

```bash
cd mcp-server
npm run build
npm audit --omit=optional
curl http://localhost:3000/health
```

## English Summary

ChatGPT Sidebar is an Obsidian-based knowledge workspace that connects ChatGPT, a local Markdown vault, and a remote MCP server. It includes a structured llm-wiki vault, an Obsidian ChatGPT sidebar plugin, and a controlled MCP server for reading, searching, and organizing vault files from ChatGPT.

## License

MIT
