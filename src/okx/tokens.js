export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const X_LAYER_TOKENS = Object.freeze({
  USDG: {
    symbol: "USDG",
    name: "Global Dollar",
    address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    name: "USD Tether",
    address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    decimals: 6,
  },
  OKB: {
    symbol: "OKB",
    name: "OKB",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
  },
});

export const SOLANA_TOKENS = Object.freeze({
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  SOL: {
    symbol: "SOL",
    name: "Solana",
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
});

export function getToken(symbol, chainIndex = "196") {
  const registry = String(chainIndex) === "501" ? SOLANA_TOKENS : X_LAYER_TOKENS;
  const token = registry[String(symbol).toUpperCase()];
  if (!token) {
    const error = new Error(
      `${symbol} is not configured for chain ${chainIndex}. Add its address and decimals in src/okx/tokens.js.`,
    );
    error.code = "TOKEN_NOT_CONFIGURED";
    error.statusCode = 400;
    throw error;
  }
  return token;
}

export function toAtomicAmount(amount, symbol, chainIndex = "196") {
  const token = getToken(symbol, chainIndex);
  const normalized = String(amount).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid token amount: ${amount}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > token.decimals) {
    throw new Error(`${token.symbol} supports at most ${token.decimals} decimals.`);
  }
  const atomic = `${whole}${fraction.padEnd(token.decimals, "0")}`.replace(
    /^0+(?=\d)/,
    "",
  );
  return BigInt(atomic || "0").toString();
}
