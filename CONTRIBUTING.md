# Contributing

Contributions are welcome for additional MCP workflows, safer signing adapters, UI accessibility and test coverage.

1. Create a focused branch.
2. Keep secrets and funded wallet data out of fixtures.
3. Run `pnpm check` and `pnpm test`.
4. Explain protocol or behavior changes in the pull request.

Live tests must remain opt-in. The default test suite must not spend funds or require OKX credentials.
