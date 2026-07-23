export class OkxMcpClient {
  constructor({ url, accessKey }) {
    this.url = url;
    this.accessKey = accessKey;
    this.client = null;
    this.transport = null;
  }

  async connect() {
    if (this.client) return;
    if (!this.accessKey) {
      const error = new Error("OKX_ACCESS_KEY is required for live MCP mode.");
      error.code = "OKX_ACCESS_KEY_MISSING";
      throw error;
    }

    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    ]);
    this.client = new Client({
      name: "agentpay-trade-lab",
      version: "0.1.0",
    });
    this.transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: {
        headers: {
          "OK-ACCESS-KEY": this.accessKey,
        },
      },
    });
    await this.client.connect(this.transport);
  }

  async listTools() {
    await this.connect();
    const tools = [];
    let cursor;

    do {
      const page = await this.client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(name, args) {
    await this.connect();
    return this.client.callTool({ name, arguments: args });
  }

  async close() {
    try {
      await this.transport?.close();
    } finally {
      this.client = null;
      this.transport = null;
    }
  }
}
