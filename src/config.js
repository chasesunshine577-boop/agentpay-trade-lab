const USDG_X_LAYER = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
const USDT_X_LAYER = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedPrivateKey(value) {
  if (!value) return undefined;
  return value.startsWith("0x") ? value : `0x${value}`;
}

const evmPrivateKey = normalizedPrivateKey(process.env.EVM_PRIVATE_KEY);
const demoPaymentWallet =
  process.env.DEMO_PAYMENT_WALLET_ADDRESS ??
  process.env.DEMO_WALLET_ADDRESS ??
  "0x7E57D0045E3A1A2DcdA3E30B31fB5fB7bE2AF00D";
const demoSolanaWallet =
  process.env.DEMO_SOLANA_WALLET_ADDRESS ??
  "J5CBzXpcYn6WR2JBah8zU4Yxct985CAFGwXRcFaX2pbS";

export const config = Object.freeze({
  port: positiveInteger(process.env.PORT, 4021),
  appMode: process.env.APP_MODE === "live" ? "live" : "demo",
  okx: {
    mcpUrl:
      process.env.OKX_MCP_URL ??
      "https://web3.okx.com/api/v1/onchainos-mcp",
    apiBaseUrl: process.env.OKX_API_BASE_URL ?? "https://web3.okx.com",
    accessKey: process.env.OKX_ACCESS_KEY,
    secretKey: process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_PASSPHRASE,
  },
  x402: {
    privateKey: evmPrivateKey,
    walletAddress: process.env.EVM_WALLET_ADDRESS || null,
    network: process.env.X402_NETWORK ?? "eip155:196",
    paymentToken:
      (process.env.X402_PAYMENT_TOKEN ?? "USDG").toUpperCase() === "USDT"
        ? "USDT"
        : "USDG",
    maxAmountAtomic: BigInt(
      positiveInteger(process.env.X402_MAX_AMOUNT_ATOMIC, 10_000),
    ),
    assets: {
      USDG: USDG_X_LAYER,
      USDT: USDT_X_LAYER,
    },
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  },
  trade: {
    solanaWalletAddress: process.env.SOLANA_WALLET_ADDRESS || null,
  },
  demo: {
    paymentWalletAddress: demoPaymentWallet,
    solanaWalletAddress: demoSolanaWallet,
    prompts: {
      social:
        process.env.DEMO_SOCIAL_PROMPT ??
        "筛选 Solana 24h 社媒热度代币，综合市值和成交量，排除貔貅盘、低流动性及开发者清仓，用 25 USDC 构建交易预览。",
      rwa:
        process.env.DEMO_RWA_PROMPT ??
        "查询 Solana RWA 代币，综合市值和 24h 成交量选择最强候选，用 25 USDC 构建交易预览。",
    },
  },
});

export function getReadiness() {
  const okxReady = Boolean(
    config.okx.accessKey && config.okx.secretKey && config.okx.passphrase,
  );
  const paymentWalletReady = Boolean(config.x402.privateKey);
  const tradeWalletReady = Boolean(config.trade.solanaWalletAddress);
  const llmReady = Boolean(
    config.llm.baseUrl && config.llm.apiKey && config.llm.model,
  );

  return {
    demo: true,
    mcp: okxReady,
    x402: okxReady && paymentWalletReady,
    solanaWallet: tradeWalletReady,
    llm: llmReady,
    live: okxReady && paymentWalletReady && tradeWalletReady,
  };
}

export function getPublicConfig() {
  return {
    appMode: config.appMode,
    network: config.x402.network,
    paymentToken: config.x402.paymentToken,
    paymentWalletAddress: config.x402.walletAddress,
    solanaWalletAddress: config.trade.solanaWalletAddress,
    demoPaymentWalletAddress: config.demo.paymentWalletAddress,
    demoSolanaWalletAddress: config.demo.solanaWalletAddress,
    demoPrompts: config.demo.prompts,
    readiness: getReadiness(),
  };
}

export function assertLiveConfiguration() {
  const missing = [];
  if (!config.okx.accessKey) missing.push("OKX_ACCESS_KEY");
  if (!config.okx.secretKey) missing.push("OKX_SECRET_KEY");
  if (!config.okx.passphrase) missing.push("OKX_PASSPHRASE");
  if (!config.x402.privateKey) {
    missing.push("EVM_PRIVATE_KEY");
  }
  if (!config.trade.solanaWalletAddress) {
    missing.push("SOLANA_WALLET_ADDRESS");
  }

  if (missing.length > 0) {
    const error = new Error(
      `Live mode is not ready. Configure: ${missing.join(", ")}`,
    );
    error.code = "LIVE_CONFIG_MISSING";
    error.statusCode = 503;
    throw error;
  }
}
