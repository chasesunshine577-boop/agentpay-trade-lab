import { createHmac } from "node:crypto";

export function createOkxHeaders({
  accessKey,
  secretKey,
  passphrase,
  method,
  requestPath,
  body = "",
  timestamp = new Date().toISOString(),
}) {
  if (!accessKey || !secretKey || !passphrase) {
    const error = new Error("OKX API credentials are incomplete.");
    error.code = "OKX_CREDENTIALS_MISSING";
    throw error;
  }

  const normalizedMethod = method.toUpperCase();
  const signature = createHmac("sha256", secretKey)
    .update(`${timestamp}${normalizedMethod}${requestPath}${body}`)
    .digest("base64");

  return {
    "OK-ACCESS-KEY": accessKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
  };
}
