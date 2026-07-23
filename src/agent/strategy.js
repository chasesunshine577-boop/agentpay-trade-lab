const SOCIAL_BLOCKED_TAGS = new Map([
  ["honeypot", "疑似貔貅盘"],
  ["lowLiquidity", "流动性过低"],
  ["devHoldingStatusSell", "开发者持续减仓"],
  ["devHoldingStatusSellAll", "开发者已清仓"],
  ["volumeChangeRateHoldersPlunge", "持币地址异常下降"],
  ["riskDataUnavailable", "风险数据不可用"],
]);

const RWA_BLOCKED_TAGS = new Map([
  ["rwaOndoStatusPaused", "发行方已暂停交易"],
  ["rwaOndoStatusClosed", "发行方已关闭交易"],
  ["riskDataUnavailable", "发行状态数据不可用"],
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addressKey(value) {
  return String(value ?? "").toLowerCase();
}

function normalizedLogs(values) {
  const logs = values.map((value) => Math.log10(Math.max(0, number(value)) + 1));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return values.map(() => 0);
  if (max === min) return values.map(() => (max > 0 ? 1 : 0));
  return logs.map((value) => (value - min) / (max - min));
}

function tagsFromRisk(risk = {}) {
  const direct = Array.isArray(risk.tags) ? risk.tags : [];
  const tokenTags = Array.isArray(risk.tokenTags) ? risk.tokenTags : [];
  const nested = Array.isArray(risk.tagList)
    ? risk.tagList.map((item) => item?.tag ?? item?.name ?? item).filter(Boolean)
    : [];
  return [...new Set([...direct, ...tokenTags, ...nested].map(String))];
}

function sortCandidates(candidates) {
  return candidates.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    return right.score - left.score;
  });
}

export function scoreSocialCandidates(tokens, riskByAddress = {}) {
  const rows = Array.isArray(tokens) ? tokens : [];
  const marketCaps = normalizedLogs(rows.map((token) => token.marketCap));
  const volumes = normalizedLogs(
    rows.map((token) => token.volume24h ?? token.volume),
  );
  const mentions = normalizedLogs(rows.map((token) => token.mentionsCount));

  return sortCandidates(
    rows.map((token, index) => {
      const risk =
        riskByAddress[addressKey(token.tokenContractAddress)] ??
        token.advancedInfo ??
        {};
      const tags = tagsFromRisk(risk);
      const rejectionReasons = tags
        .filter((tag) => SOCIAL_BLOCKED_TAGS.has(tag))
        .map((tag) => SOCIAL_BLOCKED_TAGS.get(tag));
      const riskLevel = number(
        risk.riskControlLevel ?? token.riskLevelControl ?? token.riskControlLevel,
      );
      if (riskLevel >= 3) rejectionReasons.push(`风险等级 ${riskLevel}`);
      if (number(risk.devRugPullTokenCount) > 0) {
        rejectionReasons.push("开发者存在历史 Rug Pull 记录");
      }

      const vibeScore = Math.min(100, Math.max(0, number(token.vibeScore))) / 100;
      const socialScore = mentions[index] * 0.7 + vibeScore * 0.3;
      const score =
        socialScore * 40 + marketCaps[index] * 30 + volumes[index] * 30;

      return {
        rank: 0,
        strategy: "social-hot",
        chainIndex: String(token.chainIndex ?? "501"),
        symbol: token.tokenSymbol ?? token.symbol ?? "TOKEN",
        name: token.tokenName ?? token.name ?? token.tokenSymbol ?? "Token",
        tokenContractAddress: token.tokenContractAddress,
        decimals: number(token.tokenDecimal ?? token.decimals) || 9,
        price: String(token.price ?? "0"),
        marketCap: number(token.marketCap),
        volume24h: number(token.volume24h ?? token.volume),
        liquidity: number(token.liquidity),
        mentionsCount: number(token.mentionsCount),
        vibeScore: number(token.vibeScore),
        devHoldPercent: number(token.devHoldPercent ?? risk.devHoldPercent),
        score: Number(score.toFixed(1)),
        eligible: rejectionReasons.length === 0,
        rejectionReasons: [...new Set(rejectionReasons)],
        tags,
        simulated: Boolean(token.simulated),
      };
    }),
  ).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function scoreRwaCandidates(tokens, riskByAddress = {}) {
  const rows = Array.isArray(tokens) ? tokens : [];
  const marketCaps = normalizedLogs(rows.map((token) => token.marketCap));
  const volumes = normalizedLogs(rows.map((token) => token.volume24h));

  return sortCandidates(
    rows.map((token, index) => {
      const risk =
        riskByAddress[addressKey(token.tokenContractAddress)] ??
        token.advancedInfo ??
        token;
      const tags = tagsFromRisk(risk);
      const rejectionReasons = tags
        .filter((tag) => RWA_BLOCKED_TAGS.has(tag))
        .map((tag) => RWA_BLOCKED_TAGS.get(tag));
      const score = marketCaps[index] * 55 + volumes[index] * 45;

      return {
        rank: 0,
        strategy: "solana-rwa",
        chainIndex: String(token.chainIndex ?? "501"),
        symbol: token.tokenSymbol ?? token.symbol ?? "TOKEN",
        name: token.tokenName ?? token.name ?? token.tokenSymbol ?? "Token",
        tokenContractAddress: token.tokenContractAddress,
        decimals: number(token.tokenDecimal ?? token.decimals) || 9,
        issuer: token.issuer ?? "--",
        category: token.category ?? "RWA",
        price: String(token.price ?? "0"),
        marketCap: number(token.marketCap),
        volume24h: number(token.volume24h),
        score: Number(score.toFixed(1)),
        eligible: rejectionReasons.length === 0,
        rejectionReasons,
        tags,
        simulated: Boolean(token.simulated),
      };
    }),
  ).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function selectCandidate(candidates, selectedTokenAddress) {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (!eligible.length) {
    const error = new Error("No token passed the strategy risk policy.");
    error.code = "NO_ELIGIBLE_TOKEN";
    error.statusCode = 422;
    throw error;
  }

  if (!selectedTokenAddress) return eligible[0];
  const selected = candidates.find(
    (candidate) =>
      addressKey(candidate.tokenContractAddress) === addressKey(selectedTokenAddress),
  );
  if (!selected) {
    const error = new Error("The selected token is not in the current candidate set.");
    error.code = "TOKEN_NOT_IN_CANDIDATE_SET";
    error.statusCode = 400;
    throw error;
  }
  if (!selected.eligible) {
    const error = new Error(
      `The selected token failed risk checks: ${selected.rejectionReasons.join("、")}`,
    );
    error.code = "TOKEN_NOT_ELIGIBLE";
    error.statusCode = 422;
    throw error;
  }
  return selected;
}

export const strategyPolicy = Object.freeze({
  socialBlockedTags: [...SOCIAL_BLOCKED_TAGS.keys()],
  rwaBlockedTags: [...RWA_BLOCKED_TAGS.keys()],
});
