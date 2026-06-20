import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const token = env
  .split(/\r?\n/)
  .find((line) => line.startsWith("MCP_ACCESS_TOKEN="))
  ?.slice("MCP_ACCESS_TOKEN=".length);

if (!token) {
  console.error("MCP_ACCESS_TOKEN is missing in .env");
  process.exit(1);
}

console.log("Append this query string to your ngrok /sse URL:");
console.log(`?token=${token}`);
