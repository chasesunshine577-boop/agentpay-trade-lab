import { getToken, toAtomicAmount } from "../okx/tokens.js";

function coerce(value, schema = {}) {
  if (schema.type === "number" || schema.type === "integer") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (schema.type === "array" && !Array.isArray(value)) return [value];
  return value;
}

function candidateFor(name, context, kind) {
  const key = name.toLowerCase();
  const from =
    context.fromToken ?? getToken(context.fromSymbol, context.chainIndex);
  const to = context.toToken ?? getToken(context.toSymbol, context.chainIndex);

  if (key === "chainindex" || key === "chainid") return context.chainIndex;
  if (key.includes("chainindex") && key.includes("list")) {
    return [context.chainIndex];
  }
  if (key === "chains") return [{ chainIndex: context.chainIndex }];
  if (key.includes("fromtoken") && key.includes("address")) return from.address;
  if (key.includes("totoken") && key.includes("address")) return to.address;
  if (key === "tokencontractaddress") {
    return kind === "market" ? to.address : from.address;
  }
  if (key.includes("slippage")) return String(context.maxSlippagePercent);
  if (key === "amount" || key.includes("fromtokenamount")) {
    return toAtomicAmount(context.amount, context.fromSymbol, context.chainIndex);
  }
  if (
    key === "address" ||
    key.includes("walletaddress") ||
    key.includes("useraddress")
  ) {
    return context.walletAddress;
  }
  if (key === "fromtokensymbol") return context.fromSymbol;
  if (key === "totokensymbol") return context.toSymbol;
  if (key === "symbol") return context.toSymbol;
  return undefined;
}

export function buildMcpArguments(tool, context, kind) {
  const schema = tool?.inputSchema ?? { type: "object", properties: {} };
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const args = {};
  const unresolved = [];

  for (const [name, propertySchema] of Object.entries(properties)) {
    let value = candidateFor(name, context, kind);
    if (value === undefined && propertySchema.default !== undefined) {
      value = propertySchema.default;
    }
    if (value === undefined && Array.isArray(propertySchema.enum)) {
      value = propertySchema.enum[0];
    }
    if (value !== undefined) {
      args[name] = coerce(value, propertySchema);
    } else if (required.has(name)) {
      unresolved.push(name);
    }
  }

  if (unresolved.length > 0) {
    const error = new Error(
      `Cannot infer required arguments for ${tool.name}: ${unresolved.join(", ")}`,
    );
    error.code = "MCP_ARGUMENTS_UNRESOLVED";
    error.details = { tool: tool.name, unresolved, inputSchema: schema };
    throw error;
  }

  return args;
}

export function findTool(tools, preferredName, fragments = []) {
  const exact = tools.find((tool) => tool.name === preferredName);
  if (exact) return exact;

  const loweredFragments = fragments.map((value) => value.toLowerCase());
  return tools.find((tool) => {
    const name = tool.name.toLowerCase();
    return loweredFragments.every((fragment) => name.includes(fragment));
  });
}
