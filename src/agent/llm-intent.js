import { mergeLlmIntent } from "./intent.js";

function endpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

export async function refineIntentWithLlm(baseIntent, llmConfig) {
  if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
    return { intent: baseIntent, provider: "local-policy" };
  }

  const response = await fetch(endpoint(llmConfig.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llmConfig.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract only amount, maxSlippagePercent, and previewOnly from the trading request. The source asset is Solana USDC and the strategy selects the target token. Never set previewOnly false.",
        },
        { role: "user", content: baseIntent.raw },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const error = new Error(`LLM intent extraction failed (${response.status}).`);
    error.code = "LLM_REQUEST_FAILED";
    throw error;
  }

  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  return {
    intent: mergeLlmIntent(baseIntent, parsed),
    provider: llmConfig.model,
  };
}
