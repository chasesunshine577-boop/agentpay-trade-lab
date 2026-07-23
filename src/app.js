import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAgent } from "./agent/runtime.js";
import {
  assertLiveConfiguration,
  config,
  getPublicConfig,
  getReadiness,
} from "./config.js";
import { DemoOkxMcpClient } from "./mcp/demo-client.js";
import { OkxMcpClient } from "./mcp/okx-client.js";

const publicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function securityHeaders() {
  // Local IDE/browser previews may embed localhost in a managed webview.
  return {
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65_536) {
      const error = new Error("Request body is too large.");
      error.code = "BODY_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    throw error;
  }
}

function publicError(error) {
  const body = {
    error: {
      code: error.code ?? "INTERNAL_ERROR",
      message: error.message ?? "Internal Server Error",
    },
  };
  if (error.code === "MCP_ARGUMENTS_UNRESOLVED") {
    body.error.details = error.details;
  }
  return body;
}

async function listTools(mode) {
  if (mode === "live") assertLiveConfiguration();
  const mcp =
    mode === "live"
      ? new OkxMcpClient({
          url: config.okx.mcpUrl,
          accessKey: config.okx.accessKey,
        })
      : new DemoOkxMcpClient({
          amount: "10",
          fromSymbol: "USDT",
          toSymbol: "OKB",
        });
  try {
    const tools = await mcp.listTools();
    return {
      mode,
      count: tools.length,
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    };
  } finally {
    await mcp.close();
  }
}

async function serveStatic(url, response) {
  const entry = staticFiles.get(url.pathname);
  const [fileName, contentType] = entry ?? ["index.html", "text/html; charset=utf-8"];
  const content = await readFile(path.join(publicDirectory, fileName));
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentType,
    "Content-Length": content.length,
    "Cache-Control": fileName === "index.html" ? "no-store" : "public, max-age=60",
  });
  response.end(content);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "agentpay-trade-lab",
      mode: config.appMode,
      readiness: getReadiness(),
    });
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, getPublicConfig());
  }
  if (request.method === "GET" && url.pathname === "/api/mcp/tools") {
    const mode = url.searchParams.get("mode") === "live" ? "live" : "demo";
    return sendJson(response, 200, await listTools(mode));
  }
  if (request.method === "POST" && url.pathname === "/api/agent/run") {
    const body = await readJson(request);
    const result = await runAgent({
      message: body.message,
      mode: body.mode ?? config.appMode,
      scenario: body.scenario ?? "social-hot",
      selectedTokenAddress: body.selectedTokenAddress ?? null,
      previewOnly: body.previewOnly !== false,
    });
    return sendJson(response, 200, result);
  }
  if (url.pathname.startsWith("/api/")) {
    return sendJson(response, 404, {
      error: { code: "NOT_FOUND", message: "API route not found." },
    });
  }
  if (request.method === "GET") return serveStatic(url, response);
  return sendJson(response, 405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
  });
}

export function createApp() {
  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      const status =
        Number.isInteger(error.statusCode) && error.statusCode >= 400
          ? error.statusCode
          : 500;
      if (status >= 500) console.error(error);
      if (!response.headersSent) sendJson(response, status, publicError(error));
      else response.end();
    });
  });
}
