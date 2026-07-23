import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";

test("creates the HTTP server without opening a socket", () => {
  const server = createApp();
  assert.equal(typeof server.listen, "function");
  assert.equal(typeof server.close, "function");
  assert.equal(server.listening, false);
});
