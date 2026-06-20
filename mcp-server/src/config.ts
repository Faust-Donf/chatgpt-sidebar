import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultVaultRoot = path.resolve(serverDir, "..");

export interface ServerConfig {
  port: number;
  vaultRoot: string;
  accessToken: string | null;
  allowedOrigins: string[];
}

export function loadConfig(): ServerConfig {
  const portValue = process.env.PORT ?? "3000";
  const port = Number.parseInt(portValue, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${portValue}`);
  }

  const vaultRoot = path.resolve(process.env.VAULT_ROOT ?? defaultVaultRoot);
  const accessToken = process.env.MCP_ACCESS_TOKEN?.trim() || null;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    vaultRoot,
    accessToken,
    allowedOrigins
  };
}
