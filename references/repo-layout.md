# ChatGPT Sidebar Repository Layout

Recommended root files:

```text
.gitignore
.obsidian/
AGENT.md
AGENT-schema.md
AGENT-workflows.md
AGENT-writing.md
CHANGELOG.md
README.md
hot.md
index.md
log.md
mcp-server/
raw/
wiki/
```

`mcp-server/` may contain local-only runtime artifacts that must not be committed:

```text
mcp-server/.env
mcp-server/node_modules/
mcp-server/dist/
mcp-server/.venv-agent-reach/
```

When implementing MCP tools, keep schemas in source code and rebuild generated files locally. Generated `dist/` output is a deployment artifact for the vault runtime, not part of this skill package.

Recommended generic wiki structure:

```text
raw/
  inbox/
  archive/
  assets/
wiki/
  sources/
  concepts/
  comparisons/
  maps/
  projects/
  meta/prompts/
```

When external discovery tools are enabled, save distilled learning outputs as:

- `wiki/sources/` for source notes from web pages, papers, videos, RSS posts, or GitHub READMEs.
- `wiki/concepts/` for reusable ideas extracted from multiple sources.
- `wiki/comparisons/` for benchmark, tool, project, or pattern comparisons.
- `wiki/maps/` for topic navigation pages.

Do not hard-code topic folders like `ai-tools` unless the user explicitly wants domain-specific structure.
