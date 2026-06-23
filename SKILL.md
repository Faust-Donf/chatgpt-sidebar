---
name: obsidian-web-mcp
description: Set up or maintain an Obsidian vault with a desktop ChatGPT web sidebar community plugin and a vault-scoped MCP server exposed through ngrok. Use when asked to configure Obsidian plugins, install or update a ChatGPT web sidebar, expose an Obsidian vault to ChatGPT/MCP, add read/write vault tools, add Agent Reach-backed discovery tools, configure ngrok tunneling, document restart workflows, or prepare/push the resulting GitHub repository.
---

# ChatGPT Sidebar / Obsidian Web MCP

## Core Boundaries

- Do not use the OpenAI API for the sidebar plugin.
- Do not scrape, read, inject into, or automate ChatGPT DOM.
- Do not commit secrets, `.env`, ngrok tokens, cookies, plugin `data.json`, or vault-local session state.
- Treat remote MCP over ngrok as sensitive: require an access token and keep mutation tools explicit.
- Keep MCP path access inside the vault and exclude `.git`, `.obsidian`, `mcp-server`, `node_modules`, `.env`, and cache files.
- Treat Agent Reach as a local CLI/config helper in the MCP server runtime, not as a ChatGPT plugin and not as an MCP endpoint.
- Expose external internet access through narrow read-only MCP tools only. Do not expose arbitrary shell execution.

## Workflow

### 1. Identify The Vault

Confirm the target vault path. A valid target usually has `.obsidian/`; if absent, create it only when the user wants a new vault.

Before editing:

```bash
pwd
find . -maxdepth 2 -type d | sort
git status --short --branch
```

Do not delete existing vault content unless explicitly requested.

### 2. Install Or Update The ChatGPT Web Sidebar Plugin

Use an official Obsidian plugin structure:

```text
chatgpt-web-sidebar/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
└── src/main.ts
```

Required behavior:

- Register `chatgpt-web-sidebar-view`.
- Open in a workspace leaf, right sidebar by default.
- Prefer Electron `webview`; provide iframe/external browser fallback.
- Commands: open, close, toggle, reload, copy current note, copy current selection.
- Copy commands write only to clipboard.
- Add settings for URL, open location, startup open, persistent session, copy features.
- Do not store API keys or raw secrets.

Build and install into the vault:

```bash
npm install
npm run build
mkdir -p "<vault>/.obsidian/plugins/chatgpt-web-sidebar"
cp main.js manifest.json styles.css "<vault>/.obsidian/plugins/chatgpt-web-sidebar/"
```

Update `<vault>/.obsidian/community-plugins.json` only when the user wants the plugin enabled by default.

### 3. Create The Vault MCP Server

Place the server in `<vault>/mcp-server/`. Base it on `Faust-Donf/chatgpt-mcp-server-template`: Express, `@modelcontextprotocol/sdk`, SSE transport, and mock OAuth/DCR endpoints for ChatGPT remote MCP compatibility.

Use these files:

```text
mcp-server/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── evals.xml
├── scripts/print-token-url.mjs
└── src/
    ├── index.ts
    ├── config.ts
    ├── httpAuth.ts
    ├── vault.ts
    └── tools/vaultTools.ts
```

Default tools:

- `get_vault_structure`
- `list_vault_files`
- `read_vault_file`
- `search_vault`
- `runtime_context`: current MCP server date, time, timezone, runtime user. Use this before interpreting "latest", "recent", "today", or "this year".

Mutation tools may be added when requested:

- `write_vault_file`: require `overwrite=true` for existing files.
- `append_vault_file`
- `delete_vault_file`: require `confirm=true`; delete files only, not directories.
- `move_vault_path`
- `create_vault_directory`

Optional external discovery/read tools may be added when the user wants ChatGPT to learn from high-quality external sources:

- `agent_reach_status`: read-only diagnostics for Agent Reach and upstream CLIs.
- `web_search(query, limit?, site?)`: search web sources, optionally restricted to a hostname such as `arxiv.org` or `modelcontextprotocol.io`.
- `github_search(query, limit?)`: search repositories with `gh search repos`.
- `youtube_search(query, limit?)`: search YouTube videos with `yt-dlp`.
- `rss_read(feedUrl, limit?)`: read RSS or Atom feeds.
- `read_url(url, maxChars?)`: read one HTTP(S) URL through Jina Reader when available, with a direct HTTP(S) fallback.
- `youtube_transcript(url, languages?)`: extract subtitles or auto-subtitles with `yt-dlp`.

These tools must return structured JSON. If Agent Reach or an upstream CLI is missing, return:

```json
{
  "ok": false,
  "error": "not_configured",
  "message": "Agent Reach or required upstream CLI is not available in the MCP Server runtime."
}
```

Generate `.env` locally:

```bash
cp .env.example .env
openssl rand -hex 32
```

Set:

```text
PORT=3000
VAULT_ROOT=<absolute-vault-path>
MCP_ACCESS_TOKEN=<long-random-token>
ALLOWED_ORIGINS=
```

Never print the token in final responses.

### 3.1 Agent Reach And External Discovery Tools

Install Agent Reach only in the same machine/container/user environment that runs the MCP server. Do not install it in an unrelated root shell, host user, or ChatGPT web environment.

First identify the runtime:

```bash
ps aux | grep -E 'mcp-server|dist/index|tsx src/index|ngrok'
id
which agent-reach || true
which yt-dlp || true
which gh || true
which mcporter || true
```

Prefer a dedicated virtual environment inside `<vault>/mcp-server/` when Python is externally managed:

```bash
cd <vault>/mcp-server
python3.11 -m venv .venv-agent-reach
.venv-agent-reach/bin/python -m pip install --upgrade pip
.venv-agent-reach/bin/python -m pip install https://github.com/Panniantong/agent-reach/archive/main.zip
.venv-agent-reach/bin/agent-reach install --env=auto --dry-run
.venv-agent-reach/bin/agent-reach install --env=auto --safe
PATH="$PWD/.venv-agent-reach/bin:$PATH" .venv-agent-reach/bin/agent-reach doctor
```

Add this to the vault root `.gitignore`:

```gitignore
mcp-server/.venv-agent-reach/
```

Implementation constraints:

- Use `execFile` or equivalent argument-array execution for whitelisted CLIs. Do not use arbitrary shell strings.
- Validate HTTP(S) URLs before fetching.
- Validate YouTube hosts before calling `yt-dlp`.
- Clamp limits such as search result count and returned content length.
- Add timeouts and structured `upstream_error` responses.
- For "recent/latest/current" tasks, the model must call `runtime_context()` first and use its `currentYear`, `localDate`, and `timeZone` to choose date filters.
- External learning workflows should follow: discover with `web_search` / `github_search` / `youtube_search` / `rss_read`, read with `read_url` / `youtube_transcript`, then write source/concept/comparison/map notes to the vault.

### 4. ngrok Tunnel

Install and configure ngrok:

```bash
brew install --cask ngrok
ngrok config add-authtoken <user-ngrok-authtoken>
```

Start services:

```bash
cd <vault>/mcp-server
npm run dev
```

In another terminal:

```bash
cd <vault>/mcp-server
npm run tunnel
```

MCP URL shape:

```text
https://<ngrok-host>/sse?token=<MCP_ACCESS_TOKEN>
```

If the client supports bearer headers, prefer `Authorization: Bearer <MCP_ACCESS_TOKEN>`. For ChatGPT UI, query token is usually easier.

### 5. Verification

Run:

```bash
npm run build
npm audit --omit=optional
curl http://localhost:3000/health
```

Verify MCP with the SDK client when possible:

- `client.listTools()` shows expected tool names.
- `get_vault_structure` excludes `.git`, `.obsidian`, and `mcp-server`.
- `runtime_context` returns current local date, timezone, and year.
- `web_search` can find a high-signal source, for example an arXiv result.
- `read_url` can read a selected URL or return a structured upstream error.
- `github_search` returns repository results through `gh`.
- `youtube_search` returns video URLs through `yt-dlp`.
- `rss_read` returns entries from a known feed such as `https://hnrss.org/frontpage`.
- `youtube_transcript` returns transcript text for a video with subtitles, or a structured `no_transcript` / `upstream_error`.
- For mutation tools, create a temporary file under `raw/inbox`, append, read, move to `raw/archive`, delete it, then confirm no `.mcp-test-*` remains.

Check ngrok:

```bash
curl https://<ngrok-host>/health
curl "https://<ngrok-host>/sse?token=<token>" --max-time 5
```

Redact tokens in all logs and final messages.

### 6. Repository Hygiene And Push

Root `.gitignore` should exclude:

```gitignore
.DS_Store
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
mcp-server/.env
mcp-server/node_modules/
mcp-server/dist/
mcp-server/.venv-agent-reach/
node_modules/
```

Commit source, lockfiles, manifests, README, skill docs, and vault skeleton. Do not commit generated secrets or dependency directories.

Before push:

```bash
git status --short
git diff --check
git add .
git commit -m "Initialize Obsidian web MCP vault"
```

If no remote exists and GitHub CLI is authenticated:

```bash
gh repo create <repo-name> --private --source=. --remote=origin --push
```

If remote exists:

```bash
git push -u origin <branch>
```

## Restart Runbook

After reboot:

1. Start local server: `cd <vault>/mcp-server && npm run dev`
2. Start tunnel: `cd <vault>/mcp-server && npm run tunnel`
3. Print token suffix: `npm run print-token-url`
4. Combine new ngrok URL with `/sse?token=...`
5. Update ChatGPT MCP settings if the ngrok URL changed.
