function tryJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function unwrapMcpResult(result) {
  if (!result || typeof result !== "object") return result;
  if (result.structuredContent) return result.structuredContent;

  const content = Array.isArray(result.content) ? result.content : [];
  const textItems = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => tryJson(item.text));

  if (textItems.length === 1) return textItems[0];
  if (textItems.length > 1) return textItems;
  return result;
}

export function summarizeMcpResult(result, maxLength = 180) {
  const value = unwrapMcpResult(result);
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value ?? null);
  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength)}...`
    : serialized;
}
