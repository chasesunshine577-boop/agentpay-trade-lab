import assert from "node:assert/strict";
import test from "node:test";

import { createOkxHeaders } from "../src/okx/auth.js";

test("creates deterministic OKX HMAC headers", () => {
  const headers = createOkxHeaders({
    accessKey: "access",
    secretKey: "secret",
    passphrase: "passphrase",
    method: "post",
    requestPath: "/api/v6/dex/market/price-info",
    body: '[{"chainIndex":196}]',
    timestamp: "2026-07-10T00:00:00.000Z",
  });

  assert.deepEqual(headers, {
    "OK-ACCESS-KEY": "access",
    "OK-ACCESS-SIGN": "0E2WJt4D80LLfeJTJHU1BdTmLGNUNwEOsvZ6kL2aZ/4=",
    "OK-ACCESS-TIMESTAMP": "2026-07-10T00:00:00.000Z",
    "OK-ACCESS-PASSPHRASE": "passphrase",
  });
});
