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
- `write_vault_binary_file`: create or replace a binary attachment from base64 content. Prefer `raw/assets/`; existing files require `overwrite=true`.
- `agent_reach_status`: read-only diagnostics for Agent Reach and its upstream CLIs in this MCP server runtime.
- `read_url`: read one HTTP(S) URL through the configured web reader backend and return structured JSON.
- `youtube_transcript`: extract subtitles or auto-subtitles from one YouTube URL through `yt-dlp`.
- `github_search`: search GitHub repositories through the `gh` CLI.
- `web_search`: search the web for learning sources, optionally restricted to one hostname.
- `youtube_search`: search YouTube videos through `yt-dlp`.
- `rss_read`: read recent entries from an RSS or Atom feed.

Mutation tools are intentionally scoped to the vault and reject excluded directories. Keep ChatGPT tool execution set to ask before running.

`write_vault_binary_file` accepts common attachment extensions such as PNG, JPG, WebP, GIF, SVG, PDF, ZIP, MP3, MP4, MOV, WAV, XLSX, DOCX, and PPTX. The default maximum decoded size is 25MB. It returns the written path, byte count, and SHA-256 hash so callers can verify the result.

## Agent Reach wrapper tools

Agent Reach is installed on the same machine and under the same runtime user as this MCP server. ChatGPT Web does not install or run Agent Reach directly. ChatGPT only calls the read-only MCP tools exposed by this service; those tools then call Agent Reach or the upstream tools that Agent Reach installs and checks.

Current local deployment:

- Runtime type: macOS user-level `launchd` service.
- Runtime user: `shenzhiheng`.
- MCP server path: `/Users/shenzhiheng/Documents/obsidian_repo/mcp-server`.
- Agent Reach path: `/Users/shenzhiheng/Documents/obsidian_repo/mcp-server/.venv-agent-reach/bin/agent-reach`.
- Upstream tools currently used by wrappers: `gh`, `yt-dlp`, and Jina Reader over HTTPS. If Jina Reader is unreachable from the MCP runtime, `read_url` falls back to a direct HTTP(S) fetch and marks the response as `source: "direct_fetch_fallback"`.

The wrapper layer deliberately exposes narrow interfaces only:

- `read_url(url, maxChars?)`
- `youtube_transcript(url, languages?)`
- `github_search(query, limit?)`
- `web_search(query, limit?, site?)`
- `youtube_search(query, limit?)`
- `rss_read(feedUrl, limit?)`
- `agent_reach_status()`

It does not expose arbitrary shell execution, and it does not assume Agent Reach provides a universal `search` or `exec` command. If a capability is implemented by an upstream CLI, the handler calls that CLI through a whitelist with fixed arguments.

For autonomous learning workflows, use the tools in this order:

1. Discover sources with `web_search`, `youtube_search`, `github_search`, or `rss_read`.
2. Read selected sources with `read_url` or `youtube_transcript`.
3. Save distilled notes with the vault tools, for example `write_vault_file` or `append_vault_file`.

Useful high-signal search patterns:

```text
web_search("MCP server best practices", 10, "modelcontextprotocol.io")
web_search("AI agents tool use evaluation", 10, "arxiv.org")
youtube_search("Obsidian MCP tutorial", 5)
rss_read("https://hnrss.org/frontpage", 10)
github_search("topic:mcp-server obsidian", 10)
```

Install or refresh Agent Reach in this MCP server runtime:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
python3.11 -m venv .venv-agent-reach
.venv-agent-reach/bin/python -m pip install --upgrade pip
.venv-agent-reach/bin/python -m pip install https://github.com/Panniantong/agent-reach/archive/main.zip
.venv-agent-reach/bin/agent-reach install --env=auto --dry-run
.venv-agent-reach/bin/agent-reach install --env=auto --safe
PATH="/Users/shenzhiheng/Documents/obsidian_repo/mcp-server/.venv-agent-reach/bin:$PATH" .venv-agent-reach/bin/agent-reach doctor
```

`agent-reach install --safe` is preferred for this service because it reports missing system dependencies without blindly changing the host. If `doctor` reports missing optional channels such as `mcporter` or Exa, install and configure only the channels this MCP service actually needs.

When Agent Reach or a required upstream CLI is unavailable, wrapper tools return structured JSON instead of throwing raw shell errors:

```json
{
  "ok": false,
  "error": "not_configured",
  "message": "Agent Reach or required upstream CLI is not available in the MCP Server runtime."
}
```

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

One-command manual startup:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run up
```

This command starts the local MCP server if needed, starts ngrok if needed, then prints the current ChatGPT MCP URL. The printed URL contains your MCP token; do not share screenshots or paste it into public places.

Logs are written to:

```text
mcp-server.log
ngrok.log
```

## Keep it running with launchd

For long-running use on macOS, install the user-level `launchd` services. This starts the MCP server and ngrok when you log in, and restarts them if either process crashes.

Install and start:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run service:install
```

Check status:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run service:status
curl http://localhost:3000/health
curl https://october-washed-android.ngrok-free.dev/health
```

Stop both background services:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run service:stop
```

Start them again:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run service:start
```

Remove the launchd services:

```bash
cd /Users/shenzhiheng/Documents/obsidian_repo/mcp-server
npm run service:uninstall
```

launchd logs are written to:

```text
mcp-server.launchd.log
mcp-server.launchd.err.log
ngrok.launchd.log
ngrok.launchd.err.log
```

If you use a free random ngrok URL, the URL can change after restart. This repository currently uses the stable reserved domain:

```text
https://october-washed-android.ngrok-free.dev
```

As long as that domain remains configured in your ngrok account, ChatGPT can keep using:

```text
https://october-washed-android.ngrok-free.dev/sse?token=your-token
```

Manual startup:

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
