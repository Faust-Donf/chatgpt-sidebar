---
name: obsidian-web-mcp
description: Set up or maintain an Obsidian vault with a desktop ChatGPT web sidebar community plugin and a vault-scoped MCP server exposed through ngrok. Use when asked to configure Obsidian plugins, install or update a ChatGPT web sidebar, expose an Obsidian vault to ChatGPT/MCP, add read/write vault tools, configure ngrok tunneling, document restart workflows, or prepare/push the resulting GitHub repository.
---

# ChatGPT Sidebar / Obsidian Web MCP

## Core Boundaries

- Do not use the OpenAI API for the sidebar plugin.
- Do not scrape, read, inject into, or automate ChatGPT DOM.
- Do not commit secrets, `.env`, ngrok tokens, cookies, plugin `data.json`, or vault-local session state.
- Treat remote MCP over ngrok as sensitive: require an access token and keep mutation tools explicit.
- Keep MCP path access inside the vault and exclude `.git`, `.obsidian`, `mcp-server`, `node_modules`, `.env`, and cache files.

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

Mutation tools may be added when requested:

- `write_vault_file`: require `overwrite=true` for existing files.
- `append_vault_file`
- `delete_vault_file`: require `confirm=true`; delete files only, not directories.
- `move_vault_path`
- `create_vault_directory`

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
