# Obsidian Repo

通用 Obsidian vault，包含：

- llm-wiki 风格知识库骨架
- 已安装的 Obsidian 社区插件
- ChatGPT Web Sidebar 插件
- 面向 ChatGPT/MCP 客户端的 vault MCP server

## 目录结构

```text
raw/
  inbox/       # 新资料入口
  archive/     # 已归档原始资料
  assets/      # 附件

wiki/
  sources/     # 原始资料摘要
  concepts/    # 概念与方法论
  comparisons/ # 对比分析
  maps/        # 主题地图
  projects/    # 项目页
  meta/        # 模板、提示词、维护资料

mcp-server/    # Vault MCP server
.obsidian/     # Obsidian vault 配置和插件
```

## Obsidian 插件

插件安装在：

```text
.obsidian/plugins/
```

当前重点插件：

- `chatgpt-web-sidebar`: 在 Obsidian 桌面端打开 ChatGPT 网页侧边栏，不使用 OpenAI API，不抓取 ChatGPT 输出。
- `obsidian42-brat`
- `agent-client`
- `surfing`

启用列表在：

```text
.obsidian/community-plugins.json
```

## MCP Server

MCP server 位于：

```text
mcp-server/
```

它基于 `Faust-Donf/chatgpt-mcp-server-template` 的 Express + MCP SDK + SSE + mock OAuth/DCR 结构，增加了 vault 访问控制和 token 认证。

### 暴露工具

读取工具：

- `get_vault_structure`
- `list_vault_files`
- `read_vault_file`
- `search_vault`

写入/整理工具：

- `write_vault_file`
- `append_vault_file`
- `delete_vault_file`
- `move_vault_path`
- `create_vault_directory`

安全限制：

- 不暴露 `.git`
- 不暴露 `.obsidian`
- 不暴露 `mcp-server`
- 不暴露 `.env`
- 写已有文件需要 `overwrite=true`
- 删除文件需要 `confirm=true`
- 删除工具只删除单个文件，不递归删除目录

## 启动 MCP 服务

终端 1：启动本地 MCP server。

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run dev
```

终端 2：启动 ngrok。

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run tunnel
```

打印 token query：

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run print-token-url
```

ChatGPT MCP URL 格式：

```text
https://<ngrok-host>/sse?token=<MCP_ACCESS_TOKEN>
```

免费 ngrok 地址重启后通常会变化，需要在 ChatGPT MCP 设置里更新 URL。

## 验证

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run build
npm audit --omit=optional
curl http://localhost:3000/health
```

## 安全说明

- `.env` 不提交 git。
- ngrok token 和 MCP token 不写入文档。
- 远程 MCP 已具备写入/删除能力，ChatGPT 里应保持“执行前询问”。
- 不需要公网访问时，关闭 ngrok 终端。
