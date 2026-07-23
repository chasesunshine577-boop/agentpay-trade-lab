import assert from "node:assert/strict";
import test from "node:test";

import { runAgent } from "../src/agent/runtime.js";

test("runs the paid social-hot strategy and rejects dangerous tags", async () => {
  const result = await runAgent({
    mode: "demo",
    scenario: "social-hot",
    previewOnly: true,
    message:
      "筛选 Solana 社媒热度代币，排除貔貅盘和开发者清仓，用 25 USDC 构建预览",
  });

  assert.equal(result.simulation, true);
  assert.equal(result.payment.status, "settled");
  assert.equal(result.payment.settledCalls, 1);
  assert.equal(result.transaction.broadcasted, false);
  assert.equal(result.transaction.instructionCount, 2);
  assert.ok(Number(result.quote.toAmount) > 0);
  assert.ok(result.candidates.some((candidate) => candidate.eligible));
  assert.ok(
    result.candidates.some(
      (candidate) =>
        !candidate.eligible &&
        candidate.rejectionReasons.some((reason) => reason.includes("貔貅盘")),
    ),
  );
  assert.ok(result.trace.some((event) => event.title === "402 Payment Required"));
  assert.ok(result.trace.some((event) => event.tool === "dex-okx-dex-quote"));
  assert.ok(
    result.trace.some(
      (event) => event.tool === "dex-okx-dex-solana-swap-instruction",
    ),
  );
});

test("runs the Solana RWA strategy without making payment mandatory", async () => {
  const result = await runAgent({
    mode: "demo",
    scenario: "solana-rwa",
    previewOnly: true,
    message: "查询 Solana RWA，用 25 USDC 构建交易预览",
  });

  assert.equal(result.selectedToken.symbol, "NVDAx");
  assert.equal(result.payment.status, "not_required");
  assert.equal(result.payment.settledCalls, 0);
  assert.equal(
    result.trace.some((event) => event.title === "402 Payment Required"),
    false,
  );
  assert.equal(result.transaction.network, "Solana");
});

test("uses an eligible user-selected token as the quote target", async () => {
  const selectedAddress = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
  const result = await runAgent({
    mode: "demo",
    scenario: "social-hot",
    selectedTokenAddress: selectedAddress,
    message: "用 40 USDC 构建交易预览",
  });

  assert.equal(result.selectedToken.symbol, "JUP");
  assert.equal(result.intent.toToken.address, selectedAddress);
  assert.equal(result.quote.toSymbol, "JUP");
});
