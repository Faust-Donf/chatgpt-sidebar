import type { NextFunction, Request, Response } from "express";
import type { ServerConfig } from "./config.js";

function getBearerToken(req: Request): string | null {
  const header = req.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function createAuthMiddleware(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.accessToken) {
      next();
      return;
    }

    const token = getBearerToken(req) ?? String(req.query.token ?? "");
    if (token === config.accessToken) {
      next();
      return;
    }

    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid MCP access token."
    });
  };
}

export function createOriginMiddleware(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.allowedOrigins.length === 0) {
      next();
      return;
    }

    const origin = req.get("origin");
    if (!origin || config.allowedOrigins.includes(origin)) {
      next();
      return;
    }

    res.status(403).json({
      error: "forbidden_origin",
      message: `Origin is not allowed: ${origin}`
    });
  };
}
