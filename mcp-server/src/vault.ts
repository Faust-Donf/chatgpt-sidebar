import fs from "node:fs/promises";
import path from "node:path";

export interface VaultFileEntry {
  path: string;
  size: number;
  modified: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  preview: string;
}

export interface MutationResult {
  ok: true;
  path: string;
  message: string;
}

const EXCLUDED_DIRS = new Set([
  ".git",
  ".obsidian",
  "mcp-server",
  "node_modules",
  "dist",
  ".cache",
  ".trash"
]);

const EXCLUDED_FILES = new Set([
  ".env",
  ".env.local",
  ".DS_Store"
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv"
]);

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

export class VaultAccess {
  constructor(private readonly vaultRoot: string) {}

  get root(): string {
    return this.vaultRoot;
  }

  async listFiles(options: {
    cursor?: string;
    limit?: number;
    includeExtensions?: string[];
  } = {}): Promise<{ files: VaultFileEntry[]; nextCursor: string | null }> {
    const allFiles = await this.walk(this.vaultRoot);
    const normalizedExtensions = options.includeExtensions?.map((ext) => ext.startsWith(".") ? ext : `.${ext}`);
    const filtered = normalizedExtensions?.length
      ? allFiles.filter((file) => normalizedExtensions.includes(path.extname(file.path)))
      : allFiles;

    const start = this.decodeCursor(options.cursor);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const page = filtered.slice(start, start + limit);
    const nextCursor = start + limit < filtered.length ? Buffer.from(String(start + limit)).toString("base64url") : null;

    return {
      files: page,
      nextCursor
    };
  }

  async readFile(relativePath: string, maxBytes = 200_000): Promise<string> {
    const safePath = this.resolveSafePath(relativePath);
    const stats = await fs.stat(safePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${relativePath}`);
    }

    if (!this.isReadableTextFile(safePath)) {
      throw new Error(`Only text-like vault files can be read. Unsupported extension: ${path.extname(safePath) || "(none)"}`);
    }

    if (stats.size > maxBytes) {
      throw new Error(`File is ${stats.size} bytes, larger than maxBytes=${maxBytes}. Request a smaller file or raise maxBytes intentionally.`);
    }

    return fs.readFile(safePath, "utf8");
  }

  async writeFile(relativePath: string, content: string, options: {
    overwrite?: boolean;
  } = {}): Promise<MutationResult> {
    const safePath = this.resolveSafePath(relativePath);
    this.assertWritableTextFile(safePath);

    const exists = await this.pathExists(safePath);
    if (exists && !options.overwrite) {
      throw new Error(`File already exists: ${relativePath}. Pass overwrite=true to replace it.`);
    }

    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, "utf8");

    return {
      ok: true,
      path: normalizeRelativePath(path.relative(this.vaultRoot, safePath)),
      message: exists ? "File overwritten." : "File created."
    };
  }

  async appendFile(relativePath: string, content: string, options: {
    createIfMissing?: boolean;
  } = {}): Promise<MutationResult> {
    const safePath = this.resolveSafePath(relativePath);
    this.assertWritableTextFile(safePath);

    const exists = await this.pathExists(safePath);
    if (!exists && options.createIfMissing === false) {
      throw new Error(`File does not exist: ${relativePath}. Pass createIfMissing=true or omit it to create the file.`);
    }

    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.appendFile(safePath, content, "utf8");

    return {
      ok: true,
      path: normalizeRelativePath(path.relative(this.vaultRoot, safePath)),
      message: exists ? "Content appended." : "File created and content appended."
    };
  }

  async deleteFile(relativePath: string, confirm: boolean): Promise<MutationResult> {
    if (!confirm) {
      throw new Error("Deletion requires confirm=true.");
    }

    const safePath = this.resolveSafePath(relativePath);
    const stats = await fs.stat(safePath);
    if (!stats.isFile()) {
      throw new Error(`delete_vault_file only deletes files, not directories: ${relativePath}`);
    }

    await fs.unlink(safePath);

    return {
      ok: true,
      path: normalizeRelativePath(path.relative(this.vaultRoot, safePath)),
      message: "File deleted."
    };
  }

  async movePath(fromPath: string, toPath: string, options: {
    overwrite?: boolean;
  } = {}): Promise<MutationResult> {
    const safeFrom = this.resolveSafePath(fromPath);
    const safeTo = this.resolveSafePath(toPath);

    if (!await this.pathExists(safeFrom)) {
      throw new Error(`Source path does not exist: ${fromPath}`);
    }

    const destinationExists = await this.pathExists(safeTo);
    if (destinationExists && !options.overwrite) {
      throw new Error(`Destination already exists: ${toPath}. Pass overwrite=true to replace it.`);
    }

    await fs.mkdir(path.dirname(safeTo), { recursive: true });
    if (destinationExists) {
      await fs.rm(safeTo, { recursive: true, force: true });
    }

    await fs.rename(safeFrom, safeTo);

    return {
      ok: true,
      path: normalizeRelativePath(path.relative(this.vaultRoot, safeTo)),
      message: "Path moved."
    };
  }

  async createDirectory(relativePath: string): Promise<MutationResult> {
    const safePath = this.resolveSafePath(relativePath);
    await fs.mkdir(safePath, { recursive: true });

    return {
      ok: true,
      path: normalizeRelativePath(path.relative(this.vaultRoot, safePath)),
      message: "Directory created."
    };
  }

  async search(query: string, options: {
    cursor?: string;
    limit?: number;
    pathPrefix?: string;
  } = {}): Promise<{ matches: SearchMatch[]; nextCursor: string | null }> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error("Search query must not be empty.");
    }

    const allFiles = await this.walk(this.vaultRoot);
    const textFiles = allFiles.filter((file) => this.isReadableTextFile(file.path));
    const scopedFiles = options.pathPrefix
      ? textFiles.filter((file) => file.path.startsWith(normalizeRelativePath(options.pathPrefix ?? "")))
      : textFiles;

    const allMatches: SearchMatch[] = [];
    for (const file of scopedFiles) {
      const content = await fs.readFile(path.join(this.vaultRoot, file.path), "utf8");
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.toLowerCase().includes(trimmedQuery.toLowerCase())) {
          allMatches.push({
            path: file.path,
            line: index + 1,
            preview: line.trim().slice(0, 300)
          });
        }
      }
    }

    const start = this.decodeCursor(options.cursor);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const page = allMatches.slice(start, start + limit);
    const nextCursor = start + limit < allMatches.length ? Buffer.from(String(start + limit)).toString("base64url") : null;

    return {
      matches: page,
      nextCursor
    };
  }

  async getStructure(maxDepth = 3): Promise<Record<string, unknown>> {
    return this.readDirectoryTree(this.vaultRoot, 0, Math.min(Math.max(maxDepth, 1), 8));
  }

  private async walk(directory: string): Promise<VaultFileEntry[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: VaultFileEntry[] = [];

    for (const entry of entries) {
      if (this.shouldSkipEntry(entry.name, entry.isDirectory())) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walk(absolutePath));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = await fs.stat(absolutePath);
      files.push({
        path: normalizeRelativePath(path.relative(this.vaultRoot, absolutePath)),
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async readDirectoryTree(directory: string, depth: number, maxDepth: number): Promise<Record<string, unknown>> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const tree: Record<string, unknown> = {};

    for (const entry of entries) {
      if (this.shouldSkipEntry(entry.name, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        tree[entry.name] = depth + 1 >= maxDepth
          ? "[directory]"
          : await this.readDirectoryTree(path.join(directory, entry.name), depth + 1, maxDepth);
        continue;
      }

      if (entry.isFile()) {
        tree[entry.name] = "[file]";
      }
    }

    return tree;
  }

  private resolveSafePath(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    const resolved = path.resolve(this.vaultRoot, normalized);
    const rootWithSeparator = `${this.vaultRoot}${path.sep}`;

    if (resolved !== this.vaultRoot && !resolved.startsWith(rootWithSeparator)) {
      throw new Error("Access denied: path is outside the vault.");
    }

    const parts = normalized.split("/");
    if (parts.some((part) => EXCLUDED_DIRS.has(part)) || EXCLUDED_FILES.has(path.basename(normalized))) {
      throw new Error("Access denied: path is excluded from MCP exposure.");
    }

    return resolved;
  }

  private shouldSkipEntry(name: string, isDirectory: boolean): boolean {
    if (isDirectory) {
      return EXCLUDED_DIRS.has(name);
    }

    return EXCLUDED_FILES.has(name);
  }

  private isReadableTextFile(filePath: string): boolean {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  private assertWritableTextFile(filePath: string): void {
    if (!this.isReadableTextFile(filePath)) {
      throw new Error(`Only text-like vault files can be written. Unsupported extension: ${path.extname(filePath) || "(none)"}`);
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) {
      return 0;
    }

    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const value = Number.parseInt(decoded, 10);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Invalid cursor.");
    }

    return value;
  }
}
