import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { VaultAccess } from "../vault.js";

type JsonObject = Record<string, unknown>;

function textResponse(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function errorResponse(message: string) {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
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
          description: "List files exposed from the Obsidian vault. Use this before reading when you need valid relative paths. Results are paginated with an opaque cursor; pass nextCursor back as cursor to continue. Hidden implementation directories such as .git, .obsidian, node_modules, and .env files are intentionally excluded.",
          inputSchema: {
            type: "object",
            properties: {
              cursor: {
                type: "string",
                description: "Opaque cursor returned by a previous list_vault_files call."
              },
              limit: {
                type: "number",
                description: "Maximum files to return, from 1 to 500. Default is 100."
              },
              includeExtensions: {
                type: "array",
                description: "Optional file extensions to include, for example ['.md', '.json'].",
                items: {
                  type: "string"
                }
              }
            }
          }
        },
        {
          name: "read_vault_file",
          description: "Read a single text-like file from the vault by relative path. Use this after list_vault_files or search_vault identifies the file you need. This tool is read-only and rejects paths outside the vault or excluded directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative path inside the vault, for example 'index.md' or 'wiki/concepts/example.md'."
              },
              maxBytes: {
                type: "number",
                description: "Maximum file size to read. Default is 200000 bytes."
              }
            },
            required: ["path"]
          }
        },
        {
          name: "search_vault",
          description: "Search text-like vault files for a case-insensitive query and return matching file paths, line numbers, and short previews. Use this when you do not know the exact note path. Results are paginated with an opaque cursor.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Case-insensitive text query to search for."
              },
              pathPrefix: {
                type: "string",
                description: "Optional relative path prefix to scope search, such as 'wiki/' or 'raw/inbox/'."
              },
              cursor: {
                type: "string",
                description: "Opaque cursor returned by a previous search_vault call."
              },
              limit: {
                type: "number",
                description: "Maximum matches to return, from 1 to 200. Default is 50."
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_vault_structure",
          description: "Return a shallow directory tree for the exposed vault. Use this to understand the vault layout before selecting a specific source, concept, map, or project file. Hidden implementation directories are excluded.",
          inputSchema: {
            type: "object",
            properties: {
              maxDepth: {
                type: "number",
                description: "Directory depth to include, from 1 to 8. Default is 3."
              }
            }
          }
        },
        {
          name: "write_vault_file",
          description: "Create or replace a text-like file inside the vault. Use this for new notes, source summaries, concept pages, maps, project pages, or controlled edits where you already know the final full content. This refuses to overwrite existing files unless overwrite=true is explicitly provided, and it never writes outside the vault or into excluded directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault path to write, for example 'wiki/concepts/example.md'."
              },
              content: {
                type: "string",
                description: "Full file content to write."
              },
              overwrite: {
                type: "boolean",
                description: "Must be true to replace an existing file. Default is false."
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "append_vault_file",
          description: "Append text to a text-like vault file. Use this for append-only logs, changelogs, or adding a section when preserving existing content matters. It creates the file by default if missing; pass createIfMissing=false to require that the target already exists.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault path to append to, for example 'log.md'."
              },
              content: {
                type: "string",
                description: "Text to append exactly as provided."
              },
              createIfMissing: {
                type: "boolean",
                description: "Whether to create the file if it does not exist. Default is true."
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "delete_vault_file",
          description: "Delete a single file inside the vault. Use this only after listing or reading the target and confirming it is safe to remove. This tool never deletes directories and requires confirm=true to prevent accidental deletion.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault file path to delete."
              },
              confirm: {
                type: "boolean",
                description: "Must be true or the deletion is rejected."
              }
            },
            required: ["path", "confirm"]
          }
        },
        {
          name: "move_vault_path",
          description: "Move or rename a file or directory inside the vault. Use this to organize notes from raw/inbox into raw/archive, rename wiki pages, or move project files. The source and destination must both stay inside the vault and outside excluded directories; destination replacement requires overwrite=true.",
          inputSchema: {
            type: "object",
            properties: {
              fromPath: {
                type: "string",
                description: "Existing relative file or directory path."
              },
              toPath: {
                type: "string",
                description: "Destination relative file or directory path."
              },
              overwrite: {
                type: "boolean",
                description: "Whether to replace an existing destination. Default is false."
              }
            },
            required: ["fromPath", "toPath"]
          }
        },
        {
          name: "create_vault_directory",
          description: "Create a directory inside the vault. Use this before organizing files into a new topic, project, source group, or archive folder. It is recursive and succeeds if the directory already exists.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative vault directory path to create."
              }
            },
            required: ["path"]
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
        return textResponse(await vault.listFiles({
          cursor: getOptionalStringArg(args, "cursor"),
          limit: getOptionalNumberArg(args, "limit"),
          includeExtensions: getOptionalStringArrayArg(args, "includeExtensions")
        }));
      }

      if (name === "read_vault_file") {
        const content = await vault.readFile(
          getStringArg(args, "path"),
          getOptionalNumberArg(args, "maxBytes")
        );
        return textResponse(content);
      }

      if (name === "search_vault") {
        return textResponse(await vault.search(getStringArg(args, "query"), {
          pathPrefix: getOptionalStringArg(args, "pathPrefix"),
          cursor: getOptionalStringArg(args, "cursor"),
          limit: getOptionalNumberArg(args, "limit")
        }));
      }

      if (name === "get_vault_structure") {
        return textResponse(await vault.getStructure(getOptionalNumberArg(args, "maxDepth")));
      }

      if (name === "write_vault_file") {
        return textResponse(await vault.writeFile(
          getStringArg(args, "path"),
          getStringArg(args, "content"),
          {
            overwrite: getOptionalBooleanArg(args, "overwrite")
          }
        ));
      }

      if (name === "append_vault_file") {
        return textResponse(await vault.appendFile(
          getStringArg(args, "path"),
          getStringArg(args, "content"),
          {
            createIfMissing: getOptionalBooleanArg(args, "createIfMissing")
          }
        ));
      }

      if (name === "delete_vault_file") {
        return textResponse(await vault.deleteFile(
          getStringArg(args, "path"),
          getBooleanArg(args, "confirm")
        ));
      }

      if (name === "move_vault_path") {
        return textResponse(await vault.movePath(
          getStringArg(args, "fromPath"),
          getStringArg(args, "toPath"),
          {
            overwrite: getOptionalBooleanArg(args, "overwrite")
          }
        ));
      }

      if (name === "create_vault_directory") {
        return textResponse(await vault.createDirectory(getStringArg(args, "path")));
      }

      return errorResponse(`Unknown tool: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(message);
    }
  });
}
