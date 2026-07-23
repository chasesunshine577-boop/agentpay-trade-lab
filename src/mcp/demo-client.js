import { getToken, toAtomicAmount } from "../okx/tokens.js";

const objectSchema = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const DEMO_TOOLS = Object.freeze([
  {
    name: "dex-okx-dex-quote",
    description: "Find the best aggregated DEX swap quote and route.",
    inputSchema: objectSchema(
      {
        chainIndex: { type: "string" },
        fromTokenAddress: { type: "string" },
        toTokenAddress: { type: "string" },
        amount: { type: "string" },
        slippagePercent: { type: "string" },
      },
      [
        "chainIndex",
        "fromTokenAddress",
        "toTokenAddress",
        "amount",
      ],
    ),
  },
  {
    name: "dex-okx-dex-solana-swap-instruction",
    description: "Build unsigned Solana swap instructions for wallet signing.",
    inputSchema: objectSchema(
      {
        chainIndex: { type: "string" },
        fromTokenAddress: { type: "string" },
        toTokenAddress: { type: "string" },
        amount: { type: "string" },
        userWalletAddress: { type: "string" },
        slippagePercent: { type: "string" },
      },
      [
        "chainIndex",
        "fromTokenAddress",
        "toTokenAddress",
        "amount",
        "userWalletAddress",
      ],
    ),
  },
]);

export class DemoOkxMcpClient {
  constructor(context) {
    this.context = context;
  }

  async connect() {}

  async listTools() {
    return [...DEMO_TOOLS];
  }

  async callTool(name, args) {
    if (name === "dex-okx-dex-quote") {
      const input = Number(this.context.amount);
      const price = Math.max(Number(this.context.toToken?.price ?? 1), 0.000000001);
      const output = (input / price) * 0.9984;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              chainIndex: "501",
              fromToken: getToken(this.context.fromSymbol, "501"),
              toToken: this.context.toToken,
              fromAmount: input.toFixed(2),
              toAmount: output < 0.001 ? output.toPrecision(6) : output.toFixed(6),
              priceImpactPercent: "0.16",
              estimatedGasUsd: "0.002",
              route: [
                { dex: "Jupiter", sharePercent: 72 },
                { dex: "Raydium", sharePercent: 28 },
              ],
              simulated: true,
            }),
          },
        ],
      };
    }

    if (name === "dex-okx-dex-solana-swap-instruction") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              chainIndex: "501",
              userWalletAddress: args.userWalletAddress,
              addressLookupTableAccount: [
                "CZ4Dfb6rE7qL9vHfSUjA5M6h7xMvt6H8x3x4R7DemoLT",
              ],
              instructionLists: [
                {
                  programId: "ComputeBudget111111111111111111111111111111",
                  accounts: [],
                  data: "AQL9AQAAAA==",
                },
                {
                  programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
                  accounts: [
                    { pubkey: args.userWalletAddress, isSigner: true, isWritable: true },
                    { pubkey: args.toTokenAddress, isSigner: false, isWritable: true },
                  ],
                  data: "ZGVtb19zb2xhbmFfc3dhcF9pbnN0cnVjdGlvbg==",
                },
              ],
              routerResult: {
                fromTokenAmount: args.amount,
                toTokenAddress: args.toTokenAddress,
                priceImpactPercent: "0.16",
              },
              broadcasted: false,
              simulated: true,
            }),
          },
        ],
      };
    }

    const error = new Error(`Unknown demo MCP tool: ${name}`);
    error.code = "MCP_TOOL_NOT_FOUND";
    throw error;
  }

  async close() {}
}

export function demoAtomicAmount(context) {
  return toAtomicAmount(context.amount, context.fromSymbol, context.chainIndex);
}
