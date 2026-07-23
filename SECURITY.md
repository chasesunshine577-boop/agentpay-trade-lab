# Security Policy

## Demo boundary

This repository signs x402 EIP-3009 payment authorizations in Live mode. It does not sign or broadcast the swap transaction returned by OKX DEX tools.

## Secret handling

- Keep `.env` out of version control.
- Never place private keys or OKX Secret/Passphrase values in browser code.
- Use a dedicated low-balance demo wallet.
- Rotate credentials immediately if they appear in a terminal recording, screenshot, issue or commit.
- Use an isolated signer, KMS or HSM before adapting this project for production.

## Payment controls

- `X402_NETWORK` defaults to X Layer `eip155:196`.
- `X402_PAYMENT_TOKEN` restricts payment to USDG or USDT.
- `X402_MAX_AMOUNT_ATOMIC` rejects payment options above the local ceiling.
- Each resource retry uses the requirements for that exact URL. Do not reuse payment payloads.

## Reporting

Please use GitHub private vulnerability reporting rather than opening a public issue for security-sensitive findings.
