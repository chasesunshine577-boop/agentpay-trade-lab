import { pathToFileURL } from "node:url";

import { loadEnv } from "./env.js";

loadEnv();

const [{ config }, { createApp }] = await Promise.all([
  import("./config.js"),
  import("./app.js"),
]);

export function startServer(port = config.port) {
  const server = createApp();
  server.listen(port, "127.0.0.1", () => {
    console.log(`AgentPay Trade Lab: http://localhost:${port}`);
    console.log(`Mode: ${config.appMode} | Network: ${config.x402.network}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
