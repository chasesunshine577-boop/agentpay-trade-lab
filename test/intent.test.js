import assert from "node:assert/strict";
import test from "node:test";

import { parseIntent } from "../src/agent/intent.js";

const wallet = "J5CBzXpcYn6WR2JBah8zU4Yxct985CAFGwXRcFaX2pbS";

test("parses the social-hot strategy and Solana USDC amount", () => {
  const intent = parseIntent(
    "筛选 Solana 社媒热度代币，用 12.5 USDC 构建交易，滑点不超过 0.3%",
    { scenario: "social-hot", walletAddress: wallet, previewOnly: true },
  );

  assert.equal(intent.action, "market_scan_and_swap");
  assert.equal(intent.scenario, "social-hot");
  assert.equal(intent.walletAddress, wallet);
  assert.equal(intent.chainIndex, "501");
  assert.equal(intent.amount, "12.5");
  assert.equal(intent.fromSymbol, "USDC");
  assert.equal(intent.toSymbol, null);
  assert.equal(intent.maxSlippagePercent, 0.3);
  assert.equal(intent.previewOnly, true);
});

test("parses the RWA scenario with safe defaults", () => {
  const intent = parseIntent("查找 Solana 上最强的 RWA 代币并构建交易预览", {
    scenario: "solana-rwa",
    walletAddress: wallet,
  });

  assert.equal(intent.scenario, "solana-rwa");
  assert.equal(intent.amount, "25");
  assert.equal(intent.maxSlippagePercent, 0.5);
});

test("preserves a user-selected candidate address", () => {
  const selected = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const intent = parseIntent("Use 50 USDC with 0.4% slippage", {
    scenario: "solana-rwa",
    walletAddress: wallet,
    selectedTokenAddress: selected,
  });
  assert.equal(intent.amount, "50");
  assert.equal(intent.maxSlippagePercent, 0.4);
  assert.equal(intent.selectedTokenAddress, selected);
});
