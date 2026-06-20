import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadConfig } from "./config.js";
import { createAuthMiddleware, createOriginMiddleware } from "./httpAuth.js";
import { registerVaultTools } from "./tools/vaultTools.js";
import { VaultAccess } from "./vault.js";

dotenv.config();

const config = loadConfig();
const app = express();

app.disable("x-powered-by");
app.use(cors({
  origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
  credentials: false
}));
app.use(createOriginMiddleware(config));

const server = new Server({
  name: "obsidian-repo-mcp-server",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

registerVaultTools(server, new VaultAccess(config.vaultRoot));

let transport: SSEServerTransport | null = null;

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "obsidian-repo-mcp-server",
    vaultRoot: config.vaultRoot,
    authRequired: Boolean(config.accessToken)
  });
});

app.get("/sse", createAuthMiddleware(config), async (req, res) => {
  if (transport) {
    try {
      await transport.close();
    } catch {
      // Closing a stale transport should not block a new client session.
    }
  }

  const messageEndpoint = typeof req.query.token === "string"
    ? `/messages?token=${encodeURIComponent(req.query.token)}`
    : "/messages";

  transport = new SSEServerTransport(messageEndpoint, res);
  await server.connect(transport);
});

app.post("/messages", createAuthMiddleware(config), async (req, res) => {
  if (!transport) {
    res.status(500).send("SSE transport is not initialized. Connect to /sse first.");
    return;
  }

  await transport.handlePostMessage(req, res);
});

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  const host = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const baseUrl = `${protocol}://${host}`;
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl]
  });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const host = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const baseUrl = `${protocol}://${host}`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"]
  });
});

app.post("/oauth/register", express.json(), (_req, res) => {
  res.status(201).json({
    client_id: "obsidian_repo_mcp_client",
    client_secret: "obsidian_repo_mcp_client_secret",
    client_id_issued_at: Math.floor(Date.now() / 1000)
  });
});

app.get("/oauth/authorize", (req, res) => {
  const redirectUri = req.query.redirect_uri;
  const state = req.query.state;
  if (typeof redirectUri !== "string") {
    res.status(400).send("Missing redirect_uri");
    return;
  }

  const url = new URL(redirectUri);
  url.searchParams.set("code", "obsidian_repo_mock_auth_code");
  if (typeof state === "string") {
    url.searchParams.set("state", state);
  }

  res.redirect(url.toString());
});

app.post("/oauth/token", express.urlencoded({ extended: true }), (_req, res) => {
  res.json({
    access_token: config.accessToken ?? "local_development_token",
    token_type: "Bearer",
    expires_in: 31536000
  });
});

app.listen(config.port, () => {
  console.log(`MCP server listening on http://localhost:${config.port}`);
  console.log(`SSE endpoint: http://localhost:${config.port}/sse`);
  console.log(`Vault root: ${config.vaultRoot}`);
  console.log(`HTTP token auth: ${config.accessToken ? "enabled" : "disabled"}`);
});
