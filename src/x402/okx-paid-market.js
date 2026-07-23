import { createHash } from "node:crypto";

import { createOkxHeaders } from "../okx/auth.js";

function decodeHeader(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      return { encoded: true };
    }
  }
}

async function readChallenge(response) {
  const decoded = decodeHeader(response.headers.get("PAYMENT-REQUIRED"));
  if (decoded) return decoded;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function requestHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  const additions = new Headers(init?.headers);
  additions.forEach((value, key) => headers.set(key, value));
  return headers;
}

function paymentFingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function selectRequirement(challenge, assetAddress) {
  return challenge?.accepts?.find(
    (item) => item.asset?.toLowerCase() === assetAddress.toLowerCase(),
  );
}

function appendQuery(url, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function displayAmount(amountAtomic) {
  return (Number(amountAtomic) / 1_000_000).toFixed(6);
}

export async function callPaidMarket({
  config,
  method = "GET",
  requestPath,
  query,
  body,
  label = "OKX Market API",
  onEvent,
}) {
  const [evmSdk, fetchSdk, accounts] = await Promise.all([
    import("@okxweb3/x402-evm"),
    import("@okxweb3/x402-fetch"),
    import("viem/accounts"),
  ]);
  const { ExactEvmScheme, toClientEvmSigner } = evmSdk;
  const { wrapFetchWithPaymentFromConfig } = fetchSdk;
  const { privateKeyToAccount } = accounts;
  const account = privateKeyToAccount(config.x402.privateKey);
  const signer = toClientEvmSigner(account);
  const paymentAsset = config.x402.assets[config.x402.paymentToken];
  let challenge = null;
  let paymentSigned = false;

  const observedFetch = async (input, init) => {
    const headers = requestHeaders(input, init);
    const paymentSignature =
      headers.get("PAYMENT-SIGNATURE") ?? headers.get("X-PAYMENT");

    if (paymentSignature && !paymentSigned) {
      paymentSigned = true;
      onEvent?.({
        phase: "payment",
        title: "EIP-3009 authorization signed",
        protocol: "x402",
        detail: `${label} · signature ${paymentFingerprint(paymentSignature)}`,
      });
    }

    const response = await fetch(input, init);
    if (response.status === 402) {
      challenge = await readChallenge(response);
      const requirement = selectRequirement(challenge, paymentAsset);
      onEvent?.({
        phase: "payment",
        title: "402 Payment Required",
        protocol: "x402",
        detail: requirement
          ? `${label} · ${requirement.amount} atomic ${config.x402.paymentToken}`
          : `${label} · payment requirements received`,
      });
    }
    return response;
  };

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(observedFetch, {
    schemes: [
      {
        network: config.x402.network,
        client: new ExactEvmScheme(signer),
      },
    ],
    policies: [
      (_version, requirements) =>
        requirements.filter(
          (requirement) =>
            requirement.network === config.x402.network &&
            requirement.asset?.toLowerCase() === paymentAsset.toLowerCase() &&
            BigInt(requirement.amount) <= config.x402.maxAmountAtomic,
        ),
    ],
    paymentRequirementsSelector: (_version, requirements) => {
      if (!requirements.length) {
        throw new Error(
          "No x402 payment option passed the network, token, and amount policy.",
        );
      }
      return requirements.reduce((lowest, item) =>
        BigInt(item.amount) < BigInt(lowest.amount) ? item : lowest,
      );
    },
  });

  const normalizedMethod = method.toUpperCase();
  const url = new URL(requestPath, config.okx.apiBaseUrl);
  appendQuery(url, query);
  const signedPath = `${url.pathname}${url.search}`;
  const serializedBody = body === undefined ? "" : JSON.stringify(body);
  const response = await fetchWithPayment(url, {
    method: normalizedMethod,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...createOkxHeaders({
        accessKey: config.okx.accessKey,
        secretKey: config.okx.secretKey,
        passphrase: config.okx.passphrase,
        method: normalizedMethod,
        requestPath: signedPath,
        body: serializedBody,
      }),
    },
    ...(body === undefined ? {} : { body: serializedBody }),
    signal: AbortSignal.timeout(30_000),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || (responseBody.code && responseBody.code !== "0")) {
    const error = new Error(
      responseBody.msg || `OKX Market API failed (${response.status}).`,
    );
    error.code = responseBody.code || "OKX_MARKET_REQUEST_FAILED";
    error.statusCode = response.status;
    error.details = responseBody;
    throw error;
  }

  const settlement = decodeHeader(response.headers.get("PAYMENT-RESPONSE"));
  const requirement = selectRequirement(challenge, paymentAsset);
  const status = challenge ? "settled" : "not_required";
  if (status === "settled") {
    onEvent?.({
      phase: "payment",
      title: "Micropayment settled",
      protocol: "x402",
      detail:
        settlement?.transaction || settlement?.txHash
          ? `${label} · ${settlement.transaction ?? settlement.txHash}`
          : `${label} · settlement receipt returned`,
    });
  }

  return {
    data: responseBody.data ?? responseBody,
    raw: responseBody,
    payment: {
      label,
      endpoint: signedPath,
      status,
      protocol: "x402 v2 / EIP-3009",
      network: config.x402.network,
      token: config.x402.paymentToken,
      amountAtomic: requirement?.amount ?? "0",
      amountDisplay: displayAmount(requirement?.amount ?? "0"),
      payer: account.address,
      payTo: requirement?.payTo ?? null,
      receipt: settlement,
      simulated: false,
    },
  };
}

export function simulateMarketCall({
  config,
  data,
  requestPath,
  label,
  paid,
  amountAtomic = "100",
  receiptId = "demo_x402_market_01",
  onEvent,
}) {
  if (paid) {
    onEvent?.({
      phase: "payment",
      title: "402 Payment Required",
      protocol: "x402",
      detail: `${label} · ${amountAtomic} atomic ${config.x402.paymentToken}`,
    });
    onEvent?.({
      phase: "payment",
      title: "EIP-3009 authorization signed",
      protocol: "x402",
      detail: `${label} · demo signature 91c7d95b247a`,
    });
    onEvent?.({
      phase: "payment",
      title: "Micropayment settled",
      protocol: "x402",
      detail: `${label} · ${receiptId}`,
    });
  }

  return {
    data,
    payment: {
      label,
      endpoint: requestPath,
      status: paid ? "settled" : "not_required",
      protocol: "x402 v2 / EIP-3009",
      network: config.x402.network,
      token: config.x402.paymentToken,
      amountAtomic: paid ? amountAtomic : "0",
      amountDisplay: displayAmount(paid ? amountAtomic : "0"),
      payer: config.demo.paymentWalletAddress,
      payTo: paid
        ? "0x0dedc3c5e15bee45166924ea5b02f54a35b1f9c6"
        : null,
      receipt: paid
        ? { success: true, transaction: receiptId, network: config.x402.network }
        : null,
      simulated: true,
    },
  };
}

export function aggregatePayments(payments, config) {
  const calls = (payments ?? []).filter(Boolean);
  const settled = calls.filter((payment) => payment.status === "settled");
  const amountAtomic = calls
    .reduce((total, payment) => total + BigInt(payment.amountAtomic ?? "0"), 0n)
    .toString();
  const receipt = settled.at(-1)?.receipt ?? null;

  return {
    status: settled.length
      ? "settled"
      : calls.length
        ? "not_required"
        : "not_requested",
    protocol: "x402 v2 / EIP-3009",
    network: config.x402.network,
    token: config.x402.paymentToken,
    amountAtomic,
    amountDisplay: displayAmount(amountAtomic),
    payer: calls[0]?.payer ?? null,
    payTo: settled.at(-1)?.payTo ?? null,
    receipt,
    calls,
    totalCalls: calls.length,
    settledCalls: settled.length,
    simulated: calls.every((payment) => payment.simulated),
  };
}
