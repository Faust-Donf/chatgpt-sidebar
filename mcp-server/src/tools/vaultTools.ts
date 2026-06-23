import { execFile } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { BinaryWriteResult, MutationResult, SearchMatch, VaultAccess, VaultFileEntry } from "../vault.js";

type JsonObject = Record<string, unknown>;
type VaultTree = Record<string, unknown>;

const execFileAsync = promisify(execFile);
const NOT_CONFIGURED_MESSAGE = "Agent Reach or required upstream CLI is not available in the MCP Server runtime.";
const COMMAND_TIMEOUT_MS = 20_000;
const YOUTUBE_TIMEOUT_MS = 90_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

const serverDir = process.cwd();
const homeDir = os.homedir();
const servicePath = [
  path.join(serverDir, ".venv-agent-reach", "bin"),
  path.dirname(process.execPath),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(homeDir, ".local", "bin"),
  path.join(homeDir, "Library", "Python", "3.11", "bin"),
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];

function textResponse(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function jsonResponse(payload: unknown): CallToolResult {
  return textResponse(JSON.stringify(payload, null, 2));
}

function notConfigured(command: string, details?: JsonObject): CallToolResult {
  return jsonResponse({
    ok: false,
    error: "not_configured",
    message: NOT_CONFIGURED_MESSAGE,
    details: {
      command,
      ...details
    }
  });
}

function upstreamError(command: string, error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({
    ok: false,
    error: "upstream_error",
    message,
    details: {
      command
    }
  });
}

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveCommand(command: string, envName?: string): string | null {
  const configured = envName ? process.env[envName] : undefined;
  const candidates = [
    ...(configured ? [configured] : []),
    ...servicePath.map((dir) => path.join(dir, command))
  ];

  return firstExisting(candidates);
}

async function runAllowedCommand(commandPath: string, args: string[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(commandPath, args, {
    timeout: timeoutMs,
    maxBuffer: MAX_STDOUT_BYTES,
    env: {
      ...process.env,
      PATH: servicePath.join(":")
    }
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function parseHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  return url;
}

function isYoutubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
}

function stripVtt(content: string): string {
  const seen = new Set<string>();
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter((line) => {
      if (!line || line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) {
        return false;
      }

      if (/^\d+$/.test(line) || line.includes("-->")) {
        return false;
      }

      if (seen.has(line)) {
        return false;
      }

      seen.add(line);
      return true;
    });

  return lines.join("\n");
}

function compactHtml(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, (entity) => decodeHtmlEntity(entity))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntity(entity: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&apos;": "'"
  };

  if (named[entity]) {
    return named[entity];
  }

  const decimal = entity.match(/^&#(\d+);$/);
  if (decimal) {
    return String.fromCodePoint(Number(decimal[1]));
  }

  const hex = entity.match(/^&#x([0-9a-fA-F]+);$/);
  if (hex) {
    return String.fromCodePoint(Number.parseInt(hex[1], 16));
  }

  return entity;
}

function getOptionalTrustedSite(args: JsonObject): string | undefined {
  const site = getOptionalStringArg(args, "site");
  if (!site) {
    return undefined;
  }

  if (!/^[a-zA-Z0-9.-]+$/.test(site)) {
    throw new Error("Invalid site filter. Use a hostname such as github.com or arxiv.org.");
  }

  return site;
}

async function fetchText(url: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 compatible; obsidian-repo-mcp/0.1"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return await response.text();
}

function unwrapDuckDuckGoUrl(rawHref: string): string {
  const decodedHref = decodeHtmlEntity(rawHref);
  try {
    const url = new URL(decodedHref, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return decodedHref;
  }
}

function parseDuckDuckGoResults(html: string, limit: number): JsonObject[] {
  const results: JsonObject[] = [];
  const seen = new Set<string>();
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) && results.length < limit) {
    const url = unwrapDuckDuckGoUrl(match[1]);
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    results.push({
      title: compactHtml(match[2]),
      url,
      snippet: compactHtml(match[3])
    });
  }

  return results;
}

function parseRssItems(xml: string, limit: number): JsonObject[] {
  const items: JsonObject[] = [];
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomBlocks = blocks.length > 0 ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  for (const block of [...blocks, ...atomBlocks].slice(0, limit)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const description = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?? "";
    const pubDate = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]
      ?? block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
      ?? "";
    const directLink = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1];
    const atomLink = block.match(/<link[^>]+href="([^"]+)"/i)?.[1];

    items.push({
      title: compactHtml(title.replace(/^<!\[CDATA\[|\]\]>$/g, "")),
      url: directLink ? compactHtml(directLink) : atomLink ? decodeHtmlEntity(atomLink) : "",
      publishedAt: compactHtml(pubDate),
      snippet: compactHtml(description.replace(/^<!\[CDATA\[|\]\]>$/g, "")).slice(0, 500)
    });
  }

  return items;
}

async function handleAgentReachStatus(): Promise<CallToolResult> {
  const agentReach = resolveCommand("agent-reach", "AGENT_REACH_BIN");
  const ytDlp = resolveCommand("yt-dlp", "YT_DLP_BIN");
  const gh = resolveCommand("gh", "GH_BIN");
  const mcporter = resolveCommand("mcporter", "MCPORTER_BIN");

  let doctor: JsonObject = {
    ok: false,
    error: "not_configured",
    message: NOT_CONFIGURED_MESSAGE
  };

  if (agentReach) {
    try {
      const result = await runAllowedCommand(agentReach, ["doctor"], COMMAND_TIMEOUT_MS);
      doctor = {
        ok: true,
        output: result.stdout || result.stderr
      };
    } catch (error) {
      doctor = {
        ok: false,
        error: "upstream_error",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return jsonResponse({
    ok: true,
    runtime: {
      user: os.userInfo().username,
      cwd: serverDir,
      path: servicePath
    },
    commands: {
      agentReach: agentReach ?? null,
      ytDlp: ytDlp ?? null,
      gh: gh ?? null,
      mcporter: mcporter ?? null
    },
    doctor
  });
}

async function handleReadUrl(args: JsonObject): Promise<CallToolResult> {
  const targetUrl = parseHttpUrl(getStringArg(args, "url")).toString();
  const maxChars = Math.min(Math.max(getOptionalNumberArg(args, "maxChars") ?? 12000, 1000), 50000);
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;

  try {
    const response = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS)
    });

    if (!response.ok) {
      return jsonResponse({
        ok: false,
        error: "upstream_error",
        message: `Jina Reader returned HTTP ${response.status}.`,
        details: {
          url: targetUrl
        }
      });
    }

    const text = await response.text();
    return jsonResponse({
      ok: true,
      url: targetUrl,
      source: "jina_reader",
      truncated: text.length > maxChars,
      content: text.slice(0, maxChars)
    });
  } catch (error) {
    const jinaError = error instanceof Error ? error.message : String(error);

    try {
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS)
      });

      if (!response.ok) {
        return jsonResponse({
          ok: false,
          error: "upstream_error",
          message: `Direct fetch returned HTTP ${response.status}. Jina Reader also failed: ${jinaError}`,
          details: {
            url: targetUrl
          }
        });
      }

      const text = compactHtml(await response.text());
      return jsonResponse({
        ok: true,
        url: targetUrl,
        source: "direct_fetch_fallback",
        warning: `Jina Reader failed: ${jinaError}`,
        truncated: text.length > maxChars,
        content: text.slice(0, maxChars)
      });
    } catch (fallbackError) {
      return jsonResponse({
        ok: false,
        error: "upstream_error",
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        details: {
          url: targetUrl,
          jinaError
        }
      });
    }
  }
}

async function handleGithubSearch(args: JsonObject): Promise<CallToolResult> {
  const gh = resolveCommand("gh", "GH_BIN");
  if (!gh) {
    return notConfigured("gh");
  }

  const query = getStringArg(args, "query");
  const limit = Math.min(Math.max(getOptionalNumberArg(args, "limit") ?? 10, 1), 20);

  try {
    const result = await runAllowedCommand(gh, [
      "search",
      "repos",
      query,
      "--json",
      "fullName,description,url,stargazersCount,updatedAt",
      "--limit",
      String(limit)
    ]);

    return jsonResponse({
      ok: true,
      query,
      results: JSON.parse(result.stdout) as unknown
    });
  } catch (error) {
    return upstreamError("gh", error);
  }
}

async function handleWebSearch(args: JsonObject): Promise<CallToolResult> {
  const query = getStringArg(args, "query");
  const limit = Math.min(Math.max(getOptionalNumberArg(args, "limit") ?? 10, 1), 20);
  const site = getOptionalTrustedSite(args);
  const effectiveQuery = site ? `${query} site:${site}` : query;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(effectiveQuery)}`;

  try {
    const html = await fetchText(searchUrl);
    const results = parseDuckDuckGoResults(html, limit);

    return jsonResponse({
      ok: true,
      query,
      site: site ?? null,
      source: "duckduckgo_html",
      results
    });
  } catch (error) {
    return upstreamError("duckduckgo_html", error);
  }
}

async function handleYoutubeSearch(args: JsonObject): Promise<CallToolResult> {
  const ytDlp = resolveCommand("yt-dlp", "YT_DLP_BIN");
  if (!ytDlp) {
    return notConfigured("yt-dlp");
  }

  const query = getStringArg(args, "query");
  const limit = Math.min(Math.max(getOptionalNumberArg(args, "limit") ?? 10, 1), 20);
  const node = resolveCommand("node", "NODE_BIN");

  try {
    const result = await runAllowedCommand(ytDlp, [
      ...(node ? ["--js-runtimes", `node:${node}`] : []),
      "--flat-playlist",
      "--dump-json",
      `ytsearch${limit}:${query}`
    ], YOUTUBE_TIMEOUT_MS);

    const results = result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JsonObject)
      .map((entry) => ({
        title: entry.title ?? "",
        url: entry.webpage_url ?? entry.url ?? "",
        channel: entry.channel ?? entry.uploader ?? "",
        duration: entry.duration ?? null,
        viewCount: entry.view_count ?? null,
        description: entry.description ?? ""
      }));

    return jsonResponse({
      ok: true,
      query,
      source: "yt-dlp",
      results
    });
  } catch (error) {
    return upstreamError("yt-dlp", error);
  }
}

async function handleRssRead(args: JsonObject): Promise<CallToolResult> {
  const feedUrl = parseHttpUrl(getStringArg(args, "feedUrl")).toString();
  const limit = Math.min(Math.max(getOptionalNumberArg(args, "limit") ?? 10, 1), 50);

  try {
    const xml = await fetchText(feedUrl);
    const items = parseRssItems(xml, limit);

    return jsonResponse({
      ok: true,
      feedUrl,
      source: "rss",
      items
    });
  } catch (error) {
    return upstreamError("rss", error);
  }
}

async function handleYoutubeTranscript(args: JsonObject): Promise<CallToolResult> {
  const ytDlp = resolveCommand("yt-dlp", "YT_DLP_BIN");
  if (!ytDlp) {
    return notConfigured("yt-dlp");
  }

  const url = parseHttpUrl(getStringArg(args, "url"));
  if (!isYoutubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported.");
  }

  const languages = getOptionalStringArrayArg(args, "languages") ?? ["zh-Hans", "zh-Hant", "zh", "en"];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "obsidian-mcp-ytdlp-"));
  const node = resolveCommand("node", "NODE_BIN");

  try {
    await runAllowedCommand(ytDlp, [
      ...(node ? ["--js-runtimes", `node:${node}`] : []),
      "--skip-download",
      "--write-auto-subs",
      "--write-subs",
      "--sub-langs",
      languages.join(","),
      "--sub-format",
      "vtt",
      "--output",
      path.join(tempDir, "%(id)s.%(ext)s"),
      url.toString()
    ], YOUTUBE_TIMEOUT_MS);

    const entries = fs.readdirSync(tempDir)
      .filter((entry) => entry.endsWith(".vtt"))
      .sort();

    if (entries.length === 0) {
      return jsonResponse({
        ok: false,
        error: "no_transcript",
        message: "No subtitles or auto subtitles were found for this YouTube URL.",
        details: {
          url: url.toString(),
          languages
        }
      });
    }

    const transcriptPath = path.join(tempDir, entries[0]);
    const content = await readFile(transcriptPath, "utf8");
    return jsonResponse({
      ok: true,
      url: url.toString(),
      source: "yt-dlp",
      subtitleFile: entries[0],
      transcript: stripVtt(content)
    });
  } catch (error) {
    return upstreamError("yt-dlp", error);
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    });
  }
}

function errorResponse(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `操作失败：${message}`
      }
    ],
    isError: true
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function compactPreview(text: string, maxLength = 140): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

function formatFileList(files: VaultFileEntry[], nextCursor: string | null): string {
  if (files.length === 0) {
    return "未找到匹配文件。";
  }

  const lines = files.map((file) => `- \`${file.path}\` (${formatBytes(file.size)})`);
  if (nextCursor) {
    lines.push(``, `还有更多文件。继续翻页时使用 cursor：\`${nextCursor}\``);
  }

  return `找到 ${files.length} 个文件：\n\n${lines.join("\n")}`;
}

function formatSearchMatches(query: string, matches: SearchMatch[], nextCursor: string | null): string {
  if (matches.length === 0) {
    return `没有找到包含“${query}”的内容。`;
  }

  const lines = matches.map((match) => {
    return `- \`${match.path}:${match.line}\` ${compactPreview(match.preview)}`;
  });

  if (nextCursor) {
    lines.push(``, `还有更多结果。继续翻页时使用 cursor：\`${nextCursor}\``);
  }

  return `“${query}”的搜索结果，共返回 ${matches.length} 条：\n\n${lines.join("\n")}`;
}

function formatTree(tree: VaultTree, maxLines = 120): string {
  const lines: string[] = [];

  function visit(node: VaultTree, depth: number): void {
    for (const [name, value] of Object.entries(node)) {
      if (lines.length >= maxLines) {
        return;
      }

      const indent = "  ".repeat(depth);
      if (value === "[file]") {
        lines.push(`${indent}- ${name}`);
        continue;
      }

      lines.push(`${indent}- ${name}/`);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        visit(value as VaultTree, depth + 1);
      }
    }
  }

  visit(tree, 0);
  if (lines.length >= maxLines) {
    lines.push(``, `目录较大，已截断显示前 ${maxLines} 行。`);
  }

  return lines.length > 0 ? `Vault 结构：\n\n${lines.join("\n")}` : "Vault 当前没有可展示的文件。";
}

function formatMutation(result: MutationResult): string {
  return `完成：${result.message}\n路径：\`${result.path}\``;
}

function formatBinaryWrite(result: BinaryWriteResult): string {
  const mimeType = result.mimeType ? `\nMIME：${result.mimeType}` : "";
  return [
    `完成：${result.message}`,
    `路径：\`${result.path}\``,
    `大小：${formatBytes(result.bytesWritten)}`,
    `SHA-256：\`${result.sha256.slice(0, 16)}…\`${mimeType}`
  ].join("\n");
}

function getStringArg(args: JsonObject, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`Missing or invalid string argument: ${name}`);
  }

  return value;
}

function getOptionalStringArg(args: JsonObject, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid string argument: ${name}`);
  }

  return value;
}

function getOptionalNumberArg(args: JsonObject, name: string): number | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error(`Invalid number argument: ${name}`);
  }

  return value;
}

function getOptionalStringArrayArg(args: JsonObject, name: string): string[] | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid string array argument: ${name}`);
  }

  return value;
}

function getOptionalBooleanArg(args: JsonObject, name: string): boolean | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid boolean argument: ${name}`);
  }

  return value;
}

function getBooleanArg(args: JsonObject, name: string): boolean {
  const value = args[name];
  if (typeof value !== "boolean") {
    throw new Error(`Missing or invalid boolean argument: ${name}`);
  }

  return value;
}

export function registerVaultTools(server: Server, vault: VaultAccess): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_vault_files",
          description: "List exposed vault files. Paginated; hidden implementation folders are excluded.",
          inputSchema: {
            type: "object",
            properties: {
              cursor: {
                type: "string",
                description: "Cursor from a previous page."
              },
              limit: {
                type: "number",
                description: "Files to return, 1-500. Default 50."
              },
              includeExtensions: {
                type: "array",
                description: "Optional extensions, e.g. ['.md', '.json'].",
                items: {
                  type: "string"
                }
              }
            }
          }
        },
        {
          name: "read_vault_file",
          description: "Read one text-like vault file by relative path.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault path, e.g. 'index.md'."
              },
              maxBytes: {
                type: "number",
                description: "Maximum bytes to read. Default 80000."
              }
            },
            required: ["path"]
          }
        },
        {
          name: "search_vault",
          description: "Search text-like vault files and return path, line, and short preview.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Case-insensitive query."
              },
              pathPrefix: {
                type: "string",
                description: "Optional path prefix, e.g. 'wiki/'."
              },
              cursor: {
                type: "string",
                description: "Cursor from a previous page."
              },
              limit: {
                type: "number",
                description: "Matches to return, 1-200. Default 20."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_vault_structure",
          description: "Show a shallow vault directory tree.",
          inputSchema: {
            type: "object",
            properties: {
              maxDepth: {
                type: "number",
                description: "Depth to include, 1-8. Default 2."
              }
            }
          }
        },
        {
          name: "write_vault_file",
          description: "Create or replace a text-like vault file. Existing files require overwrite=true.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault path to write."
              },
              content: {
                type: "string",
                description: "Full text content."
              },
              overwrite: {
                type: "boolean",
                description: "Set true to replace an existing file."
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "append_vault_file",
          description: "Append text to a text-like vault file.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault path."
              },
              content: {
                type: "string",
                description: "Text to append."
              },
              createIfMissing: {
                type: "boolean",
                description: "Create file if missing. Default true."
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "delete_vault_file",
          description: "Delete one vault file. Requires confirm=true.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative file path."
              },
              confirm: {
                type: "boolean",
                description: "Must be true."
              }
            },
            required: ["path", "confirm"]
          }
        },
        {
          name: "move_vault_path",
          description: "Move or rename a vault file or directory. Existing destination requires overwrite=true.",
          inputSchema: {
            type: "object",
            properties: {
              fromPath: {
                type: "string",
                description: "Existing relative path."
              },
              toPath: {
                type: "string",
                description: "Destination relative path."
              },
              overwrite: {
                type: "boolean",
                description: "Replace existing destination. Default false."
              }
            },
            required: ["fromPath", "toPath"]
          }
        },
        {
          name: "create_vault_directory",
          description: "Create a vault directory recursively.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative directory path."
              }
            },
            required: ["path"]
          }
        },
        {
          name: "write_vault_binary_file",
          description: "Save a base64 binary attachment. Prefer raw/assets/. Existing files require overwrite=true.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative path, e.g. 'raw/assets/cover.png'."
              },
              contentBase64: {
                type: "string",
                description: "Base64 file content."
              },
              mimeType: {
                type: "string",
                description: "Optional MIME type."
              },
              overwrite: {
                type: "boolean",
                description: "Set true to replace an existing file."
              },
              maxBytes: {
                type: "number",
                description: "Optional decoded byte limit. Server cap 25MB."
              }
            },
            required: ["path", "contentBase64"]
          }
        },
        {
          name: "agent_reach_status",
          description: "Read-only Agent Reach runtime diagnostics for this MCP server user.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "read_url",
          description: "Read one http(s) URL through the configured web reader backend. Returns structured JSON.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "HTTP or HTTPS URL to read."
              },
              maxChars: {
                type: "number",
                description: "Maximum returned characters, 1000-50000. Default 12000."
              }
            },
            required: ["url"]
          }
        },
        {
          name: "youtube_transcript",
          description: "Extract subtitles or auto-subtitles from one YouTube URL through yt-dlp. Returns structured JSON.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "YouTube URL."
              },
              languages: {
                type: "array",
                description: "Optional subtitle language preferences, e.g. ['zh.*', 'en.*'].",
                items: {
                  type: "string"
                }
              }
            },
            required: ["url"]
          }
        },
        {
          name: "github_search",
          description: "Search GitHub repositories through the gh CLI. Returns structured JSON.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "GitHub repository search query."
              },
              limit: {
                type: "number",
                description: "Results to return, 1-20. Default 10."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "web_search",
          description: "Search the web for learning sources. Optional site filter restricts results to one hostname.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query."
              },
              limit: {
                type: "number",
                description: "Results to return, 1-20. Default 10."
              },
              site: {
                type: "string",
                description: "Optional hostname filter, e.g. arxiv.org, github.com, docs.anthropic.com."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "youtube_search",
          description: "Search YouTube videos through yt-dlp. Returns structured JSON with video URLs.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "YouTube search query."
              },
              limit: {
                type: "number",
                description: "Results to return, 1-20. Default 10."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "rss_read",
          description: "Read an RSS or Atom feed and return recent entries as structured JSON.",
          inputSchema: {
            type: "object",
            properties: {
              feedUrl: {
                type: "string",
                description: "HTTP or HTTPS RSS/Atom feed URL."
              },
              limit: {
                type: "number",
                description: "Items to return, 1-50. Default 10."
              }
            },
            required: ["feedUrl"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as JsonObject;

    try {
      if (name === "list_vault_files") {
        const result = await vault.listFiles({
          cursor: getOptionalStringArg(args, "cursor"),
          limit: getOptionalNumberArg(args, "limit"),
          includeExtensions: getOptionalStringArrayArg(args, "includeExtensions")
        });
        return textResponse(formatFileList(result.files, result.nextCursor));
      }

      if (name === "read_vault_file") {
        const content = await vault.readFile(
          getStringArg(args, "path"),
          getOptionalNumberArg(args, "maxBytes")
        );
        return textResponse(content);
      }

      if (name === "search_vault") {
        const query = getStringArg(args, "query");
        const result = await vault.search(query, {
          pathPrefix: getOptionalStringArg(args, "pathPrefix"),
          cursor: getOptionalStringArg(args, "cursor"),
          limit: getOptionalNumberArg(args, "limit")
        });
        return textResponse(formatSearchMatches(query, result.matches, result.nextCursor));
      }

      if (name === "get_vault_structure") {
        return textResponse(formatTree(await vault.getStructure(getOptionalNumberArg(args, "maxDepth"))));
      }

      if (name === "write_vault_file") {
        return textResponse(formatMutation(await vault.writeFile(
          getStringArg(args, "path"),
          getStringArg(args, "content"),
          {
            overwrite: getOptionalBooleanArg(args, "overwrite")
          }
        )));
      }

      if (name === "append_vault_file") {
        return textResponse(formatMutation(await vault.appendFile(
          getStringArg(args, "path"),
          getStringArg(args, "content"),
          {
            createIfMissing: getOptionalBooleanArg(args, "createIfMissing")
          }
        )));
      }

      if (name === "delete_vault_file") {
        return textResponse(formatMutation(await vault.deleteFile(
          getStringArg(args, "path"),
          getBooleanArg(args, "confirm")
        )));
      }

      if (name === "move_vault_path") {
        return textResponse(formatMutation(await vault.movePath(
          getStringArg(args, "fromPath"),
          getStringArg(args, "toPath"),
          {
            overwrite: getOptionalBooleanArg(args, "overwrite")
          }
        )));
      }

      if (name === "create_vault_directory") {
        return textResponse(formatMutation(await vault.createDirectory(getStringArg(args, "path"))));
      }

      if (name === "write_vault_binary_file") {
        return textResponse(formatBinaryWrite(await vault.writeBinaryFile(
          getStringArg(args, "path"),
          getStringArg(args, "contentBase64"),
          {
            mimeType: getOptionalStringArg(args, "mimeType"),
            overwrite: getOptionalBooleanArg(args, "overwrite"),
            maxBytes: getOptionalNumberArg(args, "maxBytes")
          }
        )));
      }

      if (name === "agent_reach_status") {
        return await handleAgentReachStatus();
      }

      if (name === "read_url") {
        return await handleReadUrl(args);
      }

      if (name === "youtube_transcript") {
        return await handleYoutubeTranscript(args);
      }

      if (name === "github_search") {
        return await handleGithubSearch(args);
      }

      if (name === "web_search") {
        return await handleWebSearch(args);
      }

      if (name === "youtube_search") {
        return await handleYoutubeSearch(args);
      }

      if (name === "rss_read") {
        return await handleRssRead(args);
      }

      return errorResponse(`Unknown tool: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(message);
    }
  });
}
