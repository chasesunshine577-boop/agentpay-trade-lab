const SOLANA_ADDRESS_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const AMOUNT_PATTERN = /([0-9]+(?:\.[0-9]+)?)\s*(USDC|USDG|USDT)\b/i;

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function readSlippage(message) {
  const match =
    message.match(
      /(?:slippage|滑点)(?:\s*(?:不超过|under|max(?:imum)?|<=|[:：]))?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    ) ??
    message.match(
      /([0-9]+(?:\.[0-9]+)?)\s*%?\s*(?:maximum\s+|max\s+)?(?:slippage|滑点)/i,
    );
  return match ? clamp(Number(match[1]), 0.01, 5) : 0.5;
}

export function parseIntent(message, defaults = {}) {
  const normalized = String(message ?? "").trim();
  if (!normalized) {
    const error = new Error("Message cannot be empty.");
    error.code = "EMPTY_MESSAGE";
    error.statusCode = 400;
    throw error;
  }

  const scenario =
    defaults.scenario === "solana-rwa" ? "solana-rwa" : "social-hot";
  const amountMatch = normalized.match(AMOUNT_PATTERN);
  const previewOnly =
    defaults.previewOnly !== false ||
    /preview|plan only|do not (?:send|broadcast)|不要广播|仅预览|只.*(?:路线|预览)/i.test(
      normalized,
    );

  return {
    raw: normalized,
    action: "market_scan_and_swap",
    scenario,
    walletAddress:
      defaults.walletAddress ?? normalized.match(SOLANA_ADDRESS_PATTERN)?.[0],
    selectedTokenAddress: defaults.selectedTokenAddress ?? null,
    chainIndex: "501",
    chainName: "Solana",
    amount: amountMatch?.[1] ?? "25",
    fromSymbol: "USDC",
    fromToken: defaults.fromToken ?? null,
    toSymbol: null,
    toToken: null,
    maxSlippagePercent: readSlippage(normalized),
    previewOnly,
  };
}

export function mergeLlmIntent(baseIntent, llmIntent) {
  if (!llmIntent || typeof llmIntent !== "object") return baseIntent;

  const amount = Number(llmIntent.amount);
  const slippage = Number(llmIntent.maxSlippagePercent);

  return {
    ...baseIntent,
    amount: Number.isFinite(amount) && amount > 0 ? String(amount) : baseIntent.amount,
    maxSlippagePercent:
      Number.isFinite(slippage) && slippage >= 0.01 && slippage <= 5
        ? slippage
        : baseIntent.maxSlippagePercent,
    previewOnly: llmIntent.previewOnly !== false,
  };
}
