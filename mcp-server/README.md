# Obsidian Repo MCP Server

This server uses the structure of `Faust-Donf/chatgpt-mcp-server-template`: Express, the official MCP SDK, SSE transport, and mock OAuth/DCR endpoints for ChatGPT remote MCP compatibility.

It exposes this vault over MCP with controlled read/write tools. It does not expose `.git`, `.obsidian`, `mcp-server`, `node_modules`, `.env`, or plugin cache files.

## Tools

- `get_vault_structure`: return a shallow tree of the exposed vault.
- `list_vault_files`: list exposed files with cursor pagination.
- `read_vault_file`: read one text-like file by relative path.
- `search_vault`: case-insensitive search with line previews and cursor pagination.
- `write_vault_file`: create or replace a text-like file. Existing files require `overwrite=true`.
- `append_vault_file`: append text to a text-like file.
- `delete_vault_file`: delete one file. Requires `confirm=true` and never deletes directories.
- `move_vault_path`: move or rename a file or directory inside the vault.
- `create_vault_directory`: create a directory inside the vault.

Mutation tools are intentionally scoped to the vault and reject excluded directories. Keep ChatGPT tool execution set to ask before running.

## Setup

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm install
cp .env.example .env
openssl rand -hex 32
```

Put the generated value into `.env`:

```text
MCP_ACCESS_TOKEN=your-long-random-token
```

Run locally:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## ngrok

Install ngrok:

```bash
brew install --cask ngrok
```

Configure your ngrok account token:

```bash
ngrok config add-authtoken <your-ngrok-authtoken>
```

Start the tunnel:

```bash
npm run tunnel
```

Use the HTTPS forwarding URL from ngrok and append `/sse`.

Example:

```text
https://example.ngrok-free.app/sse?token=your-long-random-token
```

If your MCP client supports bearer headers, prefer:

```text
Authorization: Bearer your-long-random-token
```

## Restart after shutdown

If the computer restarts, sleeps for a long time, or you close the terminal windows, start both processes again.

Terminal 1: start the local MCP server:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run dev
```

Keep this terminal open. You should see:

```text
MCP server listening on http://localhost:3000
SSE endpoint: http://localhost:3000/sse
```

Terminal 2: start the ngrok tunnel:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run tunnel
```

Copy the new HTTPS forwarding URL printed by ngrok. On free ngrok plans this URL usually changes after every restart.

Print the local MCP token query string:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run print-token-url
```

Combine them:

```text
https://new-ngrok-url/sse?token=your-token
```

Use that full URL in ChatGPT MCP settings. If the ngrok URL changed, update the ChatGPT MCP server URL.

Quick checks:

```bash
curl http://localhost:3000/health
curl https://new-ngrok-url/health
```

Stop the service:

- Press `Ctrl+C` in the ngrok terminal to close the public tunnel.
- Press `Ctrl+C` in the MCP server terminal to stop the local server.

## ChatGPT connection

In ChatGPT MCP / custom tools settings:

1. Add a remote MCP server.
2. Use the ngrok URL ending in `/sse`.
3. Select OAuth if required by the ChatGPT UI.
4. Keep tools set to ask before running, especially now that write/delete/move tools are enabled.

The OAuth endpoints are compatibility shims from the template. The real access gate is `MCP_ACCESS_TOKEN`.

## Security notes

- This exposes local vault data to any client that has the ngrok URL and access token.
- This also exposes controlled mutation tools to any client that has the ngrok URL and access token.
- Keep `.env` out of git.
- Rotate `MCP_ACCESS_TOKEN` if the URL or token is shared.
- Stop ngrok when you are done.
- Review write/delete/move requests before approving them in ChatGPT.
- The delete tool deletes files only and requires `confirm=true`; it does not recursively delete directories.
