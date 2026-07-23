## Summary

说明本次修改解决的问题和主要行为变化。

## Scope

- [ ] Agent strategy
- [ ] OKX Market API
- [ ] x402 payment
- [ ] MCP DEX tools
- [ ] Demo UI
- [ ] Documentation

## Verification

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] Demo 模式手动验证
- [ ] Live 模式验证（如适用，且未产生非预期费用）

## Security

- [ ] 未提交 `.env`、私钥、OKX Secret、Passphrase 或支付签名
- [ ] 新增外部调用具有超时、金额上限或失败处理
- [ ] 交易仍保持未签名、未广播，或已明确说明安全边界变化

## Screenshots

涉及界面修改时，请附桌面和移动端截图。
