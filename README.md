# Obsidian Web MCP Skill

A Codex skill for setting up an Obsidian vault with:

- a desktop ChatGPT web sidebar community plugin
- a vault-scoped MCP server
- ngrok tunneling for ChatGPT remote MCP access
- safe read/write/delete/move vault tools
- restart and security runbooks

This repository is a skill package, not an Obsidian plugin distribution and not a vault backup.

## What This Skill Helps Codex Do

Use this skill when you want Codex to:

- configure an Obsidian desktop community plugin that embeds the ChatGPT website
- avoid OpenAI API usage and ChatGPT DOM automation
- build a local MCP server for an Obsidian vault
- expose that MCP server with ngrok
- add controlled vault mutation tools
- document restart steps after shutdown
- prepare a clean GitHub repository without committing secrets

## Install

Copy this skill folder into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/Faust-Donf/obsidian_repo.git ~/.codex/skills/obsidian-web-mcp
```

Restart Codex or start a new session so the skill is discovered.

## Trigger Example

```text
Use obsidian-web-mcp to set up this Obsidian vault with a ChatGPT web sidebar and an ngrok-exposed MCP server.
```

## Skill Contents

```text
obsidian-web-mcp/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    └── repo-layout.md
```

## Safety Boundaries

The skill instructs Codex to:

- not use the OpenAI API for the sidebar plugin
- not scrape, inject into, or automate ChatGPT DOM
- not commit `.env`, ngrok tokens, cookies, plugin session state, or vault-local chat histories
- keep MCP access inside the vault
- exclude `.git`, `.obsidian`, `mcp-server`, `node_modules`, `.env`, and cache files from MCP exposure
- require explicit confirmation flags for overwrite/delete operations

## Validation

Run the bundled skill validator from your local Codex install:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/obsidian-web-mcp
```

This repository also includes a GitHub Actions workflow that checks basic skill metadata on every push.

## Notes

This skill documents a workflow. It does not include secrets, a live ngrok tunnel, an Obsidian vault, or generated `node_modules`.
