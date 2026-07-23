import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreRwaCandidates,
  scoreSocialCandidates,
  selectCandidate,
} from "../src/agent/strategy.js";
import {
  DEMO_RWA_TOKENS,
  DEMO_SOCIAL_ADVANCED_INFO,
  DEMO_SOCIAL_TOKENS,
} from "../src/market/demo-data.js";

test("social score keeps risky high-attention tokens out of selection", () => {
  const candidates = scoreSocialCandidates(
    DEMO_SOCIAL_TOKENS,
    DEMO_SOCIAL_ADVANCED_INFO,
  );
  const rug = candidates.find((candidate) => candidate.symbol === "RUGX");
  assert.equal(rug.eligible, false);
  assert.notEqual(selectCandidate(candidates).symbol, "RUGX");
});

test("RWA score combines market cap and 24h volume", () => {
  const candidates = scoreRwaCandidates(DEMO_RWA_TOKENS);
  assert.equal(candidates[0].symbol, "NVDAx");
  assert.ok(candidates[0].score > candidates[1].score);
});

test("reads the official tokenTags field for risk filtering", () => {
  const token = DEMO_SOCIAL_TOKENS[0];
  const candidates = scoreSocialCandidates([token], {
    [token.tokenContractAddress.toLowerCase()]: {
      riskControlLevel: "1",
      tokenTags: ["devHoldingStatusSellAll"],
    },
  });
  assert.equal(candidates[0].eligible, false);
  assert.ok(candidates[0].rejectionReasons.includes("开发者已清仓"));
});

test("a rejected token cannot be manually selected", () => {
  const candidates = scoreSocialCandidates(
    DEMO_SOCIAL_TOKENS,
    DEMO_SOCIAL_ADVANCED_INFO,
  );
  const rejected = candidates.find((candidate) => !candidate.eligible);
  assert.throws(
    () => selectCandidate(candidates, rejected.tokenContractAddress),
    (error) => error.code === "TOKEN_NOT_ELIGIBLE",
  );
});
