# GitHub Publishing Guide

## Recommended repository metadata

| Field | Suggested value |
| --- | --- |
| Repository | `agentpay-trade-lab` |
| Visibility | Public |
| Description | `AI autonomous trading demo built with OKX OnchainOS MCP, Solana DEX routing and x402 micropayments.` |
| License | MIT |
| Default branch | `main` |
| Topics | `mcp`, `x402`, `okx`, `solana`, `ai-agent`, `web3`, `dex`, `autonomous-trading` |

创建 GitHub 仓库时不要再自动添加 README、`.gitignore` 或 License，因为本地项目已经包含这些文件。

## Repository layout

```text
agentpay-trade-lab/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/ci.yml
├── docs/
│   ├── ARCHITECTURE.md
│   └── GITHUB_PUBLISHING.md
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   └── check.js
├── src/
│   ├── agent/
│   ├── market/
│   ├── mcp/
│   ├── okx/
│   ├── x402/
│   ├── app.js
│   ├── client.js
│   └── server.js
├── test/
├── .env.example
├── .gitattributes
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
└── package.json
```

## Publish with GitHub CLI

确认 GitHub CLI 已登录：

```bash
gh auth status
```

在项目根目录执行：

```bash
git init
git branch -M main
git add .
git status
git commit -m "feat: initial open-source release"
gh repo create agentpay-trade-lab \
  --public \
  --source=. \
  --remote=origin \
  --push
```

`git status` 是发布前最重要的一步。确认其中没有 `.env`、钱包文件、录屏原始素材或本地缓存。

## Publish from the GitHub website

1. 在 GitHub 创建空仓库 `agentpay-trade-lab`。
2. 不选择 Initialize this repository。
3. 在本地执行：

```bash
git init
git branch -M main
git add .
git status
git commit -m "feat: initial open-source release"
git remote add origin git@github.com:YOUR_NAME/agentpay-trade-lab.git
git push -u origin main
```

## Recommended repository settings

1. 开启 Issues。
2. 开启 Private vulnerability reporting 和 Secret scanning。
3. 为 `main` 添加 branch protection，要求 CI 通过后才能合并。
4. 可选开启 Discussions，用于收集策略和 MCP 集成想法。
5. 在 About 区填写项目描述、文档链接和 Topics。

## README presentation

建议在第一次录屏完成后增加：

```text
docs/assets/demo-social.png
docs/assets/demo-rwa.png
docs/assets/demo-flow.gif
```

将一张清晰的操作台截图放在 README 标题和功能说明之间。GIF 控制在 10 MB 以内；更大的录屏建议上传到 GitHub Release 或视频平台，再在 README 中链接。

## First release

验证命令：

```bash
node scripts/check.js
node --test
```

发布首个版本：

```bash
git tag -a v0.1.0 -m "AgentPay Trade Lab v0.1.0"
git push origin v0.1.0
```

Release notes 建议说明：

- 两个可操作策略场景；
- Demo 与 Live 的区别；
- x402 仅在 HTTP 402 时触发；
- Solana 指令不会被签名或广播；
- Demo 行情和回执均为模拟数据。
