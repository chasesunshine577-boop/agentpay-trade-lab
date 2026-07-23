# Architecture

## Components

| Component | Responsibility |
| --- | --- |
| `public/` | 双场景录屏操作台；不接触任何 Secret 或私钥 |
| `src/agent/intent.js` | 从自然语言提取 USDC 金额、滑点和场景 |
| `src/agent/strategy.js` | 社媒/RWA 评分、危险标签淘汰和候选选择 |
| `src/market/` | 明确标记为模拟值的本地录屏数据 |
| `src/x402/` | 通用 Market 请求、402 检测、支付策略、签名和回执聚合 |
| `src/mcp/` | OKX MCP 连接、运行时工具发现、Quote 与 Solana 指令构建 |
| `src/app.js` | 面向浏览器的窄 HTTP 边界 |

## Scenario 1: Social Hot

1. 请求 `GET /api/v6/dex/market/token/hot-token`，限定 Solana、X mentions 和 24h 时间窗。
2. Live 模式对排名靠前的候选请求 `token/advanced-info`；风险信息不可用时 fail closed。
3. 硬淘汰 `honeypot`、`lowLiquidity`、`devHoldingStatusSellAll` 等标签，以及高风险等级或有历史 Rug Pull 的开发者。
4. 对剩余候选按社媒 40%、市值 30%、24h 成交量 30% 评分。
5. Demo 模式模拟这条 Market 请求返回 402，用于稳定展示 x402 状态机。

## Scenario 2: Solana RWA

1. 请求 `GET /api/v6/dex/market/rwa/tokens?chainIndex=501&category=47`。
2. 排除发行方暂停或关闭状态。
3. 按市值 55%、24h 成交量 45% 评分，自动选择第一名，也允许用户选择其他合格候选。
4. Demo 模式模拟命中免费额度，因此轨迹中没有 402、签名或结算步骤。

## Trade construction

两个场景共用同一条交易构建链路：

1. 以 Solana USDC 为输入资产，把候选合约地址注入动态 MCP 参数。
2. 调用 `dex-okx-dex-quote` 取得聚合报价与路径。
3. 调用 `dex-okx-dex-solana-swap-instruction` 取得 instruction list 和 address lookup table。
4. 返回未签名预览。代码不读取 Solana 私钥，也不签名或广播。

## x402 on demand

Market 客户端先发送普通 OKX 鉴权请求。仅当服务返回 HTTP 402 时才：

1. 读取 `PAYMENT-REQUIRED`；
2. 过滤为 `eip155:196`、配置的 USDG/USDT 和金额硬上限；
3. 在服务端创建 EIP-3009 authorization；
4. 携带 payment signature 重试原请求；
5. 解析 `PAYMENT-RESPONSE` 并聚合到 UI 回执。

若 Market API 直接返回 200，结果为 `not_required / FREE QUOTA`，不会创建支付授权。

## Wallet separation

```text
x402 payer: EVM private key -> USDG/USDT on X Layer (eip155:196)
trade target: public Solana wallet -> unsigned instructions on chainIndex 501
```

两类钱包用途不同。浏览器只会看到截断后的公开地址、支付金额和回执 ID。

## Production boundary

该仓库故意停在未签名指令。生产化还需要用户认证、预算和速率限制、持久化幂等记录、KMS/隔离签名器、模拟交易、明确的钱包确认，以及合规和风险审查。
