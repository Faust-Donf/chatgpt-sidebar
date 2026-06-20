# Obsidian Web MCP Skill

![Obsidian Web MCP cover](assets/cover.png)

Turn an Obsidian vault into a ChatGPT-ready working environment: a desktop ChatGPT web sidebar, a vault-scoped MCP server, ngrok remote access, and safe file tools for reading, writing, deleting, and organizing notes.

This repository is a **Codex skill package**. It teaches Codex how to set up the workflow end to end. It is not a vault backup, not an Obsidian plugin marketplace package, and not a ChatGPT automation scraper.

## Why This Exists

Obsidian is a strong local knowledge base. ChatGPT is a strong reasoning interface. The missing piece is a practical bridge that lets ChatGPT work with a vault without turning the setup into a pile of one-off scripts.

This skill captures that bridge as a repeatable workflow:

- install a ChatGPT web sidebar inside Obsidian desktop
- scaffold a clean vault structure
- expose the vault through an MCP server
- tunnel the server with ngrok for ChatGPT remote MCP
- keep secrets and local state out of GitHub
- document restart, verification, and safety steps

## What Codex Can Build With This Skill

### ChatGPT Web Sidebar

An Obsidian community plugin that opens `https://chatgpt.com` in a desktop sidebar.

It deliberately does not:

- call the OpenAI API
- scrape ChatGPT responses
- inject scripts into ChatGPT
- automate login, CAPTCHA, clicks, or sending
- sync ChatGPT history

### Vault MCP Server

A local MCP server based on `Faust-Donf/chatgpt-mcp-server-template`, using Express, the official MCP SDK, SSE transport, and ChatGPT-compatible OAuth/DCR shims.

The server can expose controlled vault tools:

| Tool | Purpose |
|---|---|
| `get_vault_structure` | Inspect vault layout |
| `list_vault_files` | List exposed files with pagination |
| `read_vault_file` | Read a text-like file |
| `search_vault` | Search notes with line previews |
| `write_vault_file` | Create or overwrite a file with explicit `overwrite=true` |
| `append_vault_file` | Append content to a file |
| `delete_vault_file` | Delete one file with explicit `confirm=true` |
| `move_vault_path` | Move or rename files/directories |
| `create_vault_directory` | Create folders for organization |

### ngrok Remote Access

The skill includes the runbook for exposing the local MCP server through ngrok and connecting ChatGPT to:

```text
https://<ngrok-host>/sse?token=<MCP_ACCESS_TOKEN>
```

## Install The Skill

Clone this repository into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/Faust-Donf/obsidian_repo.git ~/.codex/skills/obsidian-web-mcp
```

Start a new Codex session so the skill is discovered.

## Trigger It

Use a prompt like:

```text
Use obsidian-web-mcp to set up this Obsidian vault with a ChatGPT web sidebar and an ngrok-exposed MCP server.
```

Other useful prompts:

```text
Use obsidian-web-mcp to add write/delete/move MCP tools to this vault safely.
```

```text
Use obsidian-web-mcp to document how to restart the Obsidian MCP server after shutdown.
```

```text
Use obsidian-web-mcp to prepare this Obsidian MCP setup for GitHub without committing secrets.
```

## Repository Contents

```text
obsidian-web-mcp/
├── SKILL.md                 # Main workflow used by Codex
├── README.md                # Human-facing project page
├── LICENSE
├── CONTRIBUTING.md
├── agents/
│   └── openai.yaml          # UI metadata
├── references/
│   └── repo-layout.md       # Recommended vault/repo layout
└── assets/
    └── cover.png            # README cover image
```

## Safety Model

The skill tells Codex to keep these boundaries:

- never commit `.env`, ngrok tokens, MCP tokens, cookies, or plugin session state
- keep MCP file access inside the target vault
- exclude `.git`, `.obsidian`, `mcp-server`, `node_modules`, `.env`, and cache files from MCP exposure
- require explicit flags for destructive operations
- keep ChatGPT tool execution set to ask before running
- avoid ChatGPT DOM scraping and automation

This matters because a remote MCP tunnel can expose local files if it is built casually. The skill biases toward explicit tools, path guards, token auth, and restart documentation.

## Typical Output

After Codex uses this skill on a vault, the target project usually has:

```text
.obsidian/plugins/chatgpt-web-sidebar/
mcp-server/
raw/
wiki/
AGENT.md
README.md
```

The MCP server has its own:

```text
mcp-server/.env.example
mcp-server/package.json
mcp-server/src/
mcp-server/README.md
```

The real `.env` stays local and ignored by Git.

## Validate

Run the local skill validator:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/obsidian-web-mcp
```

This repository also runs a lightweight GitHub Actions workflow on every push to verify the skill package shape.

## Status

This skill is opinionated and practical. It is designed for personal/local Obsidian workflows where you understand the risk of exposing a local MCP server through a public tunnel.

Use private repositories and rotate tokens if you share URLs or screenshots.
