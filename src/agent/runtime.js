import { randomUUID } from "node:crypto";

import { config, assertLiveConfiguration } from "../config.js";
import {
  DEMO_RWA_TOKENS,
  DEMO_SOCIAL_ADVANCED_INFO,
  DEMO_SOCIAL_TOKENS,
} from "../market/demo-data.js";
import { buildMcpArguments, findTool } from "../mcp/arguments.js";
import { DemoOkxMcpClient } from "../mcp/demo-client.js";
import { OkxMcpClient } from "../mcp/okx-client.js";
import { summarizeMcpResult, unwrapMcpResult } from "../mcp/result.js";
import { getToken } from "../okx/tokens.js";
import {
  aggregatePayments,
  callPaidMarket,
  simulateMarketCall,
} from "../x402/okx-paid-market.js";
import { parseIntent } from "./intent.js";
import { refineIntentWithLlm } from "./llm-intent.js";
import {
  scoreRwaCandidates,
  scoreSocialCandidates,
  selectCandidate,
} from "./strategy.js";

const SCENARIOS = new Set(["social-hot", "solana-rwa"]);

function now() {
  return new Date().toISOString();
}

function createTracer(runId) {
  const trace = [];
  const push = (event) => {
    trace.push({
      id: `${runId}:${String(trace.length + 1).padStart(2, "0")}`,
      status: "success",
      at: now(),
      ...event,
    });
  };
  return { trace, push };
}

function listFromApi(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && value[0] && typeof value[0] === "object") {
      const nested = listFromContainer(value[0]);
      if (nested) return nested;
    }
    return value;
  }
  if (!value || typeof value !== "object") return [];
  return listFromContainer(value) ?? [];
}

function listFromContainer(value) {
  for (const key of ["list", "tokenList", "tokens", "rwaTokens"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (value.data !== undefined) return listFromApi(value.data);
  return null;
}

function firstRecord(value) {
  if (Array.isArray(value)) return firstRecord(value[0]);
  if (value?.data !== undefined) return firstRecord(value.data);
  return value && typeof value === "object" ? value : {};
}

function addressKey(value) {
  return String(value ?? "").toLowerCase();
}

function fromAtomicUnits(value, decimals) {
  const normalized = String(value ?? "");
  const precision = Number(decimals);
  if (!/^\d+$/.test(normalized) || !Number.isInteger(precision) || precision <= 0) {
    return normalized || "--";
  }
  const padded = normalized.padStart(precision + 1, "0");
  const whole = padded.slice(0, -precision);
  const fraction = padded.slice(-precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function normalizeQuote(payload, intent) {
  const root = firstRecord(payload);
  const quote = root.routerResult ?? root;
  const fromDecimals =
    quote.fromToken?.decimal ?? quote.fromToken?.decimals ?? intent.fromToken.decimals;
  const toDecimals =
    quote.toToken?.decimal ?? quote.toToken?.decimals ?? intent.toToken.decimals;
  return {
    fromSymbol: intent.fromSymbol,
    toSymbol: intent.toSymbol,
    fromAmount: String(
      quote.fromAmount ??
        (quote.fromTokenAmount
          ? fromAtomicUnits(quote.fromTokenAmount, fromDecimals)
          : intent.amount),
    ),
    toAmount: String(
      quote.toAmount ??
        (quote.toTokenAmount
          ? fromAtomicUnits(quote.toTokenAmount, toDecimals)
          : quote.outputAmount ?? "--"),
    ),
    priceImpactPercent: String(
      quote.priceImpactPercent ?? quote.priceImpactPercentage ?? "--",
    ),
    estimatedGasUsd: String(
      quote.estimatedGasUsd ?? quote.tradeFee ?? quote.estimateGasFee ?? "--",
    ),
    route: quote.route ?? quote.dexRouterList ?? root.dexRouterList ?? [],
    raw: payload,
  };
}

function normalizeTransaction(payload, walletAddress) {
  const root = firstRecord(payload);
  const instructionLists = Array.isArray(root.instructionLists)
    ? root.instructionLists.flat(4).filter(Boolean)
    : Array.isArray(root.instructions)
      ? root.instructions.flat(4).filter(Boolean)
      : [];
  const lookupTables = Array.isArray(root.addressLookupTableAccount)
    ? root.addressLookupTableAccount
    : root.addressLookupTableAccount
      ? [root.addressLookupTableAccount]
      : [];
  const primaryInstruction =
    instructionLists.findLast?.((instruction) => instruction?.programId) ??
    instructionLists.at(-1) ??
    {};

  return {
    chainIndex: "501",
    network: "Solana",
    wallet: root.userWalletAddress ?? walletAddress,
    program: primaryInstruction.programId ?? "--",
    instructionCount: instructionLists.length,
    lookupTableCount: lookupTables.length,
    data: primaryInstruction.data ?? "--",
    broadcasted: false,
    raw: payload,
  };
}

async function invokeTool({ mcp, tool, args, kind, push }) {
  if (!tool) {
    const error = new Error(`Required OKX MCP ${kind} tool is unavailable.`);
    error.code = "MCP_TOOL_UNAVAILABLE";
    throw error;
  }

  const started = performance.now();
  try {
    const result = await mcp.callTool(tool.name, args);
    push({
      phase: "tool",
      title: tool.name,
      protocol: "MCP",
      tool: tool.name,
      durationMs: Math.round(performance.now() - started),
      detail: summarizeMcpResult(result),
    });
    return unwrapMcpResult(result);
  } catch (error) {
    push({
      phase: "tool",
      title: tool.name,
      protocol: "MCP",
      tool: tool.name,
      status: "error",
      durationMs: Math.round(performance.now() - started),
      detail: error.message,
    });
    throw error;
  }
}

async function scanSocialMarket({ mode, push }) {
  push({
    phase: "market",
    title: "Social ranking requested",
    protocol: "OKX Market API",
    detail: "Solana · X mentions · 24h · riskFilter=true",
  });

  const hotResult =
    mode === "demo"
      ? simulateMarketCall({
          config,
          data: DEMO_SOCIAL_TOKENS,
          requestPath:
            "/api/v6/dex/market/token/hot-token?chainIndex=501&rankingType=5",
          label: "Hot Token / Social",
          paid: true,
          amountAtomic: "100",
          receiptId: "demo_x402_social_01",
          onEvent: push,
        })
      : await callPaidMarket({
          config,
          method: "GET",
          requestPath: "/api/v6/dex/market/token/hot-token",
          query: {
            chainIndex: "501",
            rankingType: "5",
            rankBy: "11",
            rankingTimeFrame: "4",
            riskFilter: true,
            stableTokenFilter: true,
            limit: "12",
          },
          label: "Hot Token / Social",
          onEvent: push,
        });
  const payments = [hotResult.payment];
  const tokens = listFromApi(hotResult.data);
  const riskByAddress =
    mode === "demo" ? { ...DEMO_SOCIAL_ADVANCED_INFO } : {};

  if (mode === "live") {
    for (const token of tokens.slice(0, 8)) {
      const address = token.tokenContractAddress;
      try {
        const riskResult = await callPaidMarket({
          config,
          method: "GET",
          requestPath: "/api/v6/dex/market/token/advanced-info",
          query: { chainIndex: "501", tokenContractAddress: address },
          label: `Advanced Info / ${token.tokenSymbol ?? "TOKEN"}`,
          onEvent: push,
        });
        payments.push(riskResult.payment);
        riskByAddress[addressKey(address)] = firstRecord(riskResult.data);
      } catch (error) {
        riskByAddress[addressKey(address)] = {
          riskControlLevel: "3",
          tags: ["riskDataUnavailable"],
        };
        push({
          phase: "market",
          title: `Risk lookup failed / ${token.tokenSymbol ?? "TOKEN"}`,
          protocol: "Fail-closed policy",
          status: "warning",
          detail: error.message,
        });
      }
    }
  }

  const candidates = scoreSocialCandidates(tokens, riskByAddress);
  const rejected = candidates.filter((candidate) => !candidate.eligible).length;
  push({
    phase: "policy",
    title: "Risk intelligence joined",
    protocol: "Market strategy",
    detail: `${candidates.length} candidates · ${rejected} rejected by tags or risk history`,
  });

  return {
    market: {
      endpoint: "/api/v6/dex/market/token/hot-token",
      strategy: "X mentions + market cap + 24h volume",
      chainIndex: "501",
      candidateCount: candidates.length,
      riskVerifiedCount: Object.keys(riskByAddress).length,
      simulated: mode === "demo",
    },
    candidates,
    payments,
  };
}

async function scanRwaMarket({ mode, push }) {
  push({
    phase: "market",
    title: "Solana RWA universe requested",
    protocol: "OKX Market API",
    detail: "chainIndex=501 · category=All · limit=100",
  });
  const rwaResult =
    mode === "demo"
      ? simulateMarketCall({
          config,
          data: { list: DEMO_RWA_TOKENS },
          requestPath:
            "/api/v6/dex/market/rwa/tokens?chainIndex=501&category=47",
          label: "RWA Token List",
          paid: false,
          onEvent: push,
        })
      : await callPaidMarket({
          config,
          method: "GET",
          requestPath: "/api/v6/dex/market/rwa/tokens",
          query: { chainIndex: "501", category: "47", limit: "100" },
          label: "RWA Token List",
          onEvent: push,
        });
  const payments = [rwaResult.payment];
  const tokens = listFromApi(rwaResult.data);
  const riskByAddress = {};
  if (mode === "live") {
    for (const token of tokens.slice(0, 8)) {
      const address = token.tokenContractAddress;
      try {
        const riskResult = await callPaidMarket({
          config,
          method: "GET",
          requestPath: "/api/v6/dex/market/token/advanced-info",
          query: { chainIndex: "501", tokenContractAddress: address },
          label: `RWA Status / ${token.tokenSymbol ?? "TOKEN"}`,
          onEvent: push,
        });
        payments.push(riskResult.payment);
        riskByAddress[addressKey(address)] = firstRecord(riskResult.data);
      } catch (error) {
        riskByAddress[addressKey(address)] = {
          tokenTags: ["riskDataUnavailable"],
        };
        push({
          phase: "market",
          title: `RWA status lookup failed / ${token.tokenSymbol ?? "TOKEN"}`,
          protocol: "Market strategy",
          status: "warning",
          detail: error.message,
        });
      }
    }
  }
  const candidates = scoreRwaCandidates(tokens, riskByAddress);
  push({
    phase: "policy",
    title: "RWA liquidity ranking completed",
    protocol: "Market strategy",
    detail: `${candidates.length} candidates · 55% market cap + 45% 24h volume`,
  });

  return {
    market: {
      endpoint: "/api/v6/dex/market/rwa/tokens",
      strategy: "Market cap + 24h volume",
      chainIndex: "501",
      candidateCount: candidates.length,
      simulated: mode === "demo",
    },
    candidates,
    payments,
  };
}

function isChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function answerFor({ intent, quote, payment, candidates, selectedToken, mode }) {
  const passed = candidates.filter((candidate) => candidate.eligible).length;
  const paymentText =
    payment.status === "settled"
      ? `Market API 已通过 x402 结算 ${payment.amountDisplay} ${payment.token}`
      : "Market API 命中免费额度，未创建支付授权";
  if (isChinese(intent.raw)) {
    return `${mode === "demo" ? "模拟" : "实时"}筛选完成：${candidates.length} 个候选中 ${passed} 个通过，已选择 ${selectedToken.symbol}（策略分 ${selectedToken.score}）。${intent.amount} ${intent.fromSymbol} 预计得到 ${quote.toAmount} ${intent.toSymbol}；${paymentText}。Solana 指令已构建，未签名或广播。`;
  }
  return `${mode === "demo" ? "Demo" : "Live"} scan complete: ${passed} of ${candidates.length} candidates passed and ${selectedToken.symbol} was selected. ${intent.amount} ${intent.fromSymbol} is estimated at ${quote.toAmount} ${intent.toSymbol}. Market payment status: ${payment.status}. Solana instructions were built but not signed or broadcast.`;
}

export async function runAgent({
  message,
  mode = config.appMode,
  scenario = "social-hot",
  selectedTokenAddress = null,
  previewOnly = true,
}) {
  if (!new Set(["demo", "live"]).has(mode)) {
    const error = new Error("Mode must be demo or live.");
    error.code = "INVALID_MODE";
    error.statusCode = 400;
    throw error;
  }
  if (!SCENARIOS.has(scenario)) {
    const error = new Error("Scenario must be social-hot or solana-rwa.");
    error.code = "INVALID_SCENARIO";
    error.statusCode = 400;
    throw error;
  }
  if (mode === "live") assertLiveConfiguration();

  const runId = randomUUID();
  const startedAt = now();
  const { trace, push } = createTracer(runId);
  let intent = parseIntent(message, {
    scenario,
    selectedTokenAddress,
    walletAddress:
      mode === "live"
        ? config.trade.solanaWalletAddress
        : config.demo.solanaWalletAddress,
    previewOnly,
  });
  intent.previewOnly = true;
  push({
    phase: "plan",
    title: "Natural-language strategy parsed",
    protocol: "Agent",
    detail: `${scenario} · ${intent.amount} USDC · max slippage ${intent.maxSlippagePercent}%`,
  });

  try {
    const refined = await refineIntentWithLlm(intent, config.llm);
    intent = { ...refined.intent, previewOnly: true };
    push({
      phase: "plan",
      title: "Trading policy prepared",
      protocol: "Agent",
      detail: `Planner: ${refined.provider} · preview-only enforced`,
    });
  } catch (error) {
    push({
      phase: "plan",
      title: "LLM unavailable; local policy used",
      protocol: "Agent",
      status: "warning",
      detail: error.message,
    });
  }

  let mcp;
  try {
    const scan =
      scenario === "social-hot"
        ? await scanSocialMarket({ mode, push })
        : await scanRwaMarket({ mode, push });
    const selectedToken = selectCandidate(
      scan.candidates,
      intent.selectedTokenAddress,
    );
    const payment = aggregatePayments(scan.payments, config);
    intent = {
      ...intent,
      selectedTokenAddress: selectedToken.tokenContractAddress,
      fromToken: getToken("USDC", "501"),
      toSymbol: selectedToken.symbol,
      toToken: {
        symbol: selectedToken.symbol,
        name: selectedToken.name,
        address: selectedToken.tokenContractAddress,
        decimals: selectedToken.decimals ?? 9,
        price: selectedToken.price,
      },
    };
    push({
      phase: "policy",
      title: `Target selected / ${selectedToken.symbol}`,
      protocol: "Agent strategy",
      detail: `Score ${selectedToken.score} · ${selectedToken.tokenContractAddress}`,
    });

    mcp =
      mode === "demo"
        ? new DemoOkxMcpClient(intent)
        : new OkxMcpClient({
            url: config.okx.mcpUrl,
            accessKey: config.okx.accessKey,
          });
    await mcp.connect();
    const tools = await mcp.listTools();
    push({
      phase: "mcp",
      title: "OKX OnchainOS connected",
      protocol: "MCP Streamable HTTP",
      detail: `${tools.length} tools discovered at runtime`,
    });

    const quoteTool = findTool(tools, "dex-okx-dex-quote", ["dex", "quote"]);
    const quotePayload = await invokeTool({
      mcp,
      tool: quoteTool,
      args: buildMcpArguments(quoteTool, intent, "quote"),
      kind: "quote",
      push,
    });
    const quote = normalizeQuote(quotePayload, intent);

    const swapTool = findTool(
      tools,
      "dex-okx-dex-solana-swap-instruction",
      ["solana", "swap", "instruction"],
    );
    const swapPayload = await invokeTool({
      mcp,
      tool: swapTool,
      args: buildMcpArguments(swapTool, intent, "swap"),
      kind: "Solana swap instruction",
      push,
    });
    const transaction = normalizeTransaction(swapPayload, intent.walletAddress);
    push({
      phase: "policy",
      title: "Wallet signing blocked by demo guardrail",
      protocol: "Agent guardrail",
      detail: "Unsigned Solana instructions only; no signing or broadcast performed",
    });

    return {
      runId,
      mode,
      scenario,
      simulation: mode === "demo",
      startedAt,
      completedAt: now(),
      intent,
      answer: answerFor({
        intent,
        quote,
        payment,
        candidates: scan.candidates,
        selectedToken,
        mode,
      }),
      market: scan.market,
      candidates: scan.candidates,
      selectedToken,
      quote,
      transaction,
      payment,
      trace,
    };
  } finally {
    await mcp?.close();
  }
}
