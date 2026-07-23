const elements = {
  form: document.querySelector("#agentForm"),
  input: document.querySelector("#messageInput"),
  previewOnly: document.querySelector("#previewOnly"),
  runButton: document.querySelector("#runButton"),
  conversation: document.querySelector("#conversation"),
  traceList: document.querySelector("#traceList"),
  runId: document.querySelector("#runId"),
  modeBadge: document.querySelector("#modeBadge"),
  connectionState: document.querySelector("#connectionState"),
  connectionLabel: document.querySelector("#connectionLabel"),
  marketState: document.querySelector("#marketState"),
  x402State: document.querySelector("#x402State"),
  mcpState: document.querySelector("#mcpState"),
  scenarioCode: document.querySelector("#scenarioCode"),
  scenarioDescription: document.querySelector("#scenarioDescription"),
  selectedSymbol: document.querySelector("#selectedSymbol"),
  eligibleCount: document.querySelector("#eligibleCount"),
  strategyWeight: document.querySelector("#strategyWeight"),
  candidateList: document.querySelector("#candidateList"),
  routeOutput: document.querySelector("#routeOutput"),
  routeVisual: document.querySelector("#routeVisual"),
  priceImpact: document.querySelector("#priceImpact"),
  gasEstimate: document.querySelector("#gasEstimate"),
  maxSlippage: document.querySelector("#maxSlippage"),
  paymentStatus: document.querySelector("#paymentStatus"),
  paymentProtocol: document.querySelector("#paymentProtocol"),
  paymentAsset: document.querySelector("#paymentAsset"),
  paymentAmount: document.querySelector("#paymentAmount"),
  paymentCalls: document.querySelector("#paymentCalls"),
  paymentReceipt: document.querySelector("#paymentReceipt"),
  transactionWallet: document.querySelector("#transactionWallet"),
  transactionProgram: document.querySelector("#transactionProgram"),
  transactionInstructions: document.querySelector("#transactionInstructions"),
  transactionData: document.querySelector("#transactionData"),
  toast: document.querySelector("#toast"),
};

const scenarioCopy = {
  "social-hot": {
    code: "SOCIAL HOT",
    description:
      "读取 X 社媒热榜，连接高级风险标签后再选择可交易候选。",
    weight: "40 / 30 / 30",
  },
  "solana-rwa": {
    code: "SOLANA RWA",
    description:
      "读取 Solana RWA 列表，综合市值与 24h 成交量选择流动性候选。",
    weight: "55 / 45",
  },
};

const state = {
  config: null,
  mode: "demo",
  scenario: "social-hot",
  running: false,
  toastTimer: null,
  selectedByScenario: {
    "social-hot": null,
    "solana-rwa": null,
  },
  resultsByScenario: {
    "social-hot": null,
    "solana-rwa": null,
  },
};

function truncate(value, start = 8, end = 6) {
  const text = String(value ?? "");
  if (!text) return "--";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function compactNumber(value, money = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return money ? "$--" : "--";
  const prefix = money ? "$" : "";
  if (Math.abs(number) >= 1_000_000_000) {
    return `${prefix}${(number / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(number) >= 1_000_000) {
    return `${prefix}${(number / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(number) >= 1_000) {
    return `${prefix}${(number / 1_000).toFixed(1)}K`;
  }
  return `${prefix}${number.toLocaleString("en-US")}`;
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 4200);
}

function setProtocolState(element, label, className = "") {
  element.textContent = label;
  element.classList.remove("is-done", "is-running", "is-muted");
  if (className) element.classList.add(className);
}

function setConnection() {
  const ready = state.mode === "demo" || Boolean(state.config?.readiness?.live);
  elements.connectionState.classList.toggle("is-ready", ready);
  elements.connectionState.classList.toggle("is-error", !ready);
  elements.connectionLabel.textContent = ready
    ? state.mode === "demo"
      ? "DEMO READY"
      : "LIVE READY"
    : "NEEDS .ENV";
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  elements.modeBadge.textContent = mode === "demo" ? "DEMO DATA" : "LIVE API";
  elements.modeBadge.classList.toggle("is-live", mode === "live");
  setConnection();
  if (mode === "live" && !state.config?.readiness?.live) {
    showToast("Live 模式需要 OKX 凭证、x402 EVM 钱包和 Solana 交易地址。");
  }
}

function promptForScenario(scenario) {
  if (scenario === "solana-rwa") {
    return (
      state.config?.demoPrompts?.rwa ??
      "查询 Solana RWA 代币，综合市值和 24h 成交量，用 25 USDC 构建交易预览。"
    );
  }
  return (
    state.config?.demoPrompts?.social ??
    "筛选 Solana 24h 社媒热度代币，排除危险标签，用 25 USDC 构建交易预览。"
  );
}

function resetResultPanels() {
  elements.runId.textContent = "NO RUN";
  elements.selectedSymbol.textContent = "AUTO";
  elements.eligibleCount.textContent = "-- / --";
  elements.candidateList.replaceChildren();
  for (const short of [false, false, true]) {
    const placeholder = document.createElement("div");
    placeholder.className = `candidate-placeholder${short ? " short" : ""}`;
    elements.candidateList.append(placeholder);
  }
  elements.routeOutput.textContent = "-- TOKEN";
  renderRouteVisual(null, null);
  elements.priceImpact.textContent = "--";
  elements.gasEstimate.textContent = "--";
  elements.maxSlippage.textContent = "--";
  renderPayment(null);
  renderTransaction(null);
  elements.traceList.replaceChildren();
  const empty = document.createElement("li");
  empty.className = "trace-empty";
  const index = document.createElement("span");
  index.className = "empty-index";
  index.textContent = "00";
  const text = document.createElement("p");
  text.textContent = "等待 Agent 运行";
  empty.append(index, text);
  elements.traceList.append(empty);
  setProtocolState(elements.marketState, "IDLE");
  setProtocolState(elements.x402State, "ON DEMAND", "is-muted");
  setProtocolState(elements.mcpState, "IDLE");
}

function setScenario(scenario, { updatePrompt = true } = {}) {
  if (state.running) {
    showToast("当前策略仍在执行，请稍候。");
    return;
  }
  state.scenario = scenario;
  document.querySelectorAll(".scenario-button").forEach((button) => {
    const active = button.dataset.scenario === scenario;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.scenarioCode.textContent = scenarioCopy[scenario].code;
  elements.scenarioDescription.textContent = scenarioCopy[scenario].description;
  elements.strategyWeight.textContent = scenarioCopy[scenario].weight;
  if (updatePrompt) elements.input.value = promptForScenario(scenario);

  const cached = state.resultsByScenario[scenario];
  if (cached) renderResult(cached);
  else resetResultPanels();
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "agent-message"}`;
  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = role === "user" ? "YOU" : "AGENT";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(author, paragraph);
  elements.conversation.append(article);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function preset(name) {
  let prompt = promptForScenario(state.scenario);
  if (name === "conservative") {
    prompt += " 风险信息缺失也要排除，最大滑点 0.3%。";
  }
  if (name === "size50") {
    prompt = prompt.replace(/25\s*USDC/i, "50 USDC");
  }
  elements.input.value = prompt;
  elements.input.focus();
}

function clearResultsForRun() {
  elements.traceList.replaceChildren();
  const waiting = document.createElement("li");
  waiting.className = "trace-empty";
  const index = document.createElement("span");
  index.className = "empty-index";
  index.textContent = "..";
  const label = document.createElement("p");
  label.textContent = "Agent 正在读取市场并执行策略";
  waiting.append(index, label);
  elements.traceList.append(waiting);
  elements.runId.textContent = "RUNNING";
  setProtocolState(elements.marketState, "SCANNING", "is-running");
  setProtocolState(elements.x402State, "ON DEMAND", "is-muted");
  setProtocolState(elements.mcpState, "WAITING", "is-running");
}

function traceElement(event, index) {
  const item = document.createElement("li");
  const payment = event.phase === "payment";
  const warning = event.status === "warning" || event.status === "error";
  item.className = `trace-item${payment ? " is-payment" : ""}${warning ? " is-warning" : ""}`;

  const number = document.createElement("span");
  number.className = "trace-index";
  number.textContent = String(index + 1).padStart(2, "0");
  const copy = document.createElement("div");
  copy.className = "trace-copy";
  const title = document.createElement("strong");
  title.textContent = event.title;
  const detail = document.createElement("span");
  const duration = Number.isFinite(event.durationMs) ? ` · ${event.durationMs}ms` : "";
  detail.textContent = `${event.detail ?? "Completed"}${duration}`;
  copy.append(title, detail);
  const protocol = document.createElement("span");
  protocol.className = "protocol-badge";
  protocol.textContent = event.protocol ?? event.phase?.toUpperCase() ?? "EVENT";
  item.append(number, copy, protocol);
  return item;
}

function updateProtocolFromTrace(event) {
  if (event.phase === "market") {
    setProtocolState(elements.marketState, "FETCHING", "is-running");
  }
  if (event.title === "Risk intelligence joined" || event.title?.includes("ranking completed")) {
    setProtocolState(elements.marketState, "RANKED", "is-done");
  }
  if (event.phase === "payment") {
    const settled = /settled/i.test(event.title);
    setProtocolState(
      elements.x402State,
      settled ? "SETTLED" : "SIGNING",
      settled ? "is-done" : "is-running",
    );
  }
  if (event.protocol?.includes("MCP") || event.tool) {
    setProtocolState(elements.mcpState, "CONNECTED", "is-running");
  }
  if (event.tool?.includes("solana-swap-instruction")) {
    setProtocolState(elements.mcpState, "BUILT", "is-done");
  }
}

async function animateTrace(trace) {
  elements.traceList.replaceChildren();
  for (let index = 0; index < trace.length; index += 1) {
    const event = trace[index];
    elements.traceList.append(traceElement(event, index));
    elements.traceList.scrollTop = elements.traceList.scrollHeight;
    updateProtocolFromTrace(event);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
}

function candidateMetric(label, value) {
  const wrapper = document.createElement("span");
  const name = document.createElement("small");
  name.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  wrapper.append(name, strong);
  return wrapper;
}

function renderCandidates(candidates, selectedToken) {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  elements.eligibleCount.textContent = `${eligible.length} / ${candidates.length}`;
  elements.candidateList.replaceChildren();
  const selectedAddress =
    state.selectedByScenario[state.scenario] ?? selectedToken?.tokenContractAddress;
  const selected = candidates.find(
    (candidate) => candidate.tokenContractAddress === selectedAddress,
  );
  elements.selectedSymbol.textContent = selected?.symbol ?? "AUTO";

  for (const candidate of candidates) {
    const row = document.createElement(candidate.eligible ? "button" : "div");
    row.className = "candidate-row";
    if (candidate.eligible) row.type = "button";
    else row.classList.add("is-rejected");
    if (candidate.tokenContractAddress === selectedAddress) {
      row.classList.add("is-selected");
    }

    const top = document.createElement("div");
    top.className = "candidate-top";
    const identity = document.createElement("span");
    identity.className = "candidate-identity";
    const rank = document.createElement("small");
    rank.textContent = String(candidate.rank).padStart(2, "0");
    const symbol = document.createElement("strong");
    symbol.textContent = candidate.symbol;
    const name = document.createElement("span");
    name.textContent = candidate.name;
    identity.append(rank, symbol, name);
    const status = document.createElement("span");
    status.className = `candidate-status ${candidate.eligible ? "is-pass" : "is-reject"}`;
    status.textContent = candidate.eligible ? "PASS" : "REJECT";
    top.append(identity, status);

    const metrics = document.createElement("div");
    metrics.className = "candidate-metrics";
    metrics.append(
      candidateMetric("MCAP", compactNumber(candidate.marketCap, true)),
      candidateMetric("24H VOL", compactNumber(candidate.volume24h, true)),
      candidateMetric(
        candidate.strategy === "social-hot" ? "X MENTIONS" : "SCORE",
        candidate.strategy === "social-hot"
          ? compactNumber(candidate.mentionsCount)
          : String(candidate.score),
      ),
    );

    const footer = document.createElement("div");
    footer.className = "candidate-footer";
    const reason = document.createElement("span");
    reason.textContent = candidate.eligible
      ? `策略分 ${candidate.score} · 点击选择`
      : candidate.rejectionReasons.join(" · ");
    const bar = document.createElement("span");
    bar.className = "score-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(4, Math.min(100, candidate.score))}%`;
    bar.append(fill);
    footer.append(reason, bar);
    row.append(top, metrics, footer);

    if (candidate.eligible) {
      row.title = `选择 ${candidate.symbol}`;
      row.addEventListener("click", () => {
        state.selectedByScenario[state.scenario] = candidate.tokenContractAddress;
        const cached = state.resultsByScenario[state.scenario];
        renderCandidates(cached.candidates, cached.selectedToken);
        elements.routeOutput.textContent = `待构建 ${candidate.symbol}`;
        renderRouteVisual(null, { fromSymbol: "USDC", toSymbol: candidate.symbol });
        elements.priceImpact.textContent = "--";
        elements.gasEstimate.textContent = "--";
        renderTransaction(null);
        setProtocolState(elements.mcpState, "REBUILD", "is-running");
        showToast(`已选择 ${candidate.symbol}，点击“分析并构建”重新报价。`);
      });
    }
    elements.candidateList.append(row);
  }
}

function routeEntries(route) {
  if (!Array.isArray(route)) return [];
  return route
    .flat(4)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      if (Array.isArray(entry.subRouterList)) return entry.subRouterList;
      if (Array.isArray(entry.dexProtocol)) return entry.dexProtocol;
      return [entry];
    })
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 3);
}

function renderRouteVisual(quote, intent) {
  elements.routeVisual.replaceChildren();
  const from = document.createElement("span");
  from.className = "token-node";
  from.textContent = intent?.fromSymbol ?? "USDC";
  const firstLine = document.createElement("span");
  firstLine.className = "route-line";
  const dex = document.createElement("span");
  dex.className = "dex-node";
  const entries = routeEntries(quote?.route);
  dex.textContent =
    entries
      .map((entry) => entry.dex ?? entry.dexName ?? entry.name)
      .filter(Boolean)
      .join(" + ") || "WAITING";
  const secondLine = document.createElement("span");
  secondLine.className = "route-line";
  const to = document.createElement("span");
  to.className = "token-node accent";
  to.textContent = intent?.toSymbol ?? "TOKEN";
  elements.routeVisual.append(from, firstLine, dex, secondLine, to);
}

function renderRoute(quote, intent) {
  if (!quote || !intent) {
    renderRouteVisual(null, null);
    return;
  }
  elements.routeOutput.textContent = `${quote.toAmount} ${intent.toSymbol}`;
  elements.priceImpact.textContent = `${quote.priceImpactPercent}%`;
  elements.gasEstimate.textContent = quote.estimatedGasUsd.startsWith("$")
    ? quote.estimatedGasUsd
    : `$${quote.estimatedGasUsd}`;
  elements.maxSlippage.textContent = `${intent.maxSlippagePercent}%`;
  renderRouteVisual(quote, intent);
}

function renderPayment(payment) {
  const statusLabels = {
    settled: "SETTLED",
    not_required: "FREE QUOTA",
    not_requested: "NOT REQUESTED",
  };
  elements.paymentStatus.textContent = payment
    ? statusLabels[payment.status] ?? String(payment.status).toUpperCase()
    : "ON DEMAND";
  elements.paymentStatus.classList.toggle("is-settled", payment?.status === "settled");
  elements.paymentStatus.classList.toggle(
    "is-free",
    payment?.status === "not_required",
  );
  elements.paymentProtocol.textContent = payment?.protocol ?? "x402 v2";
  elements.paymentAsset.textContent = payment?.token
    ? `${payment.token} · ${payment.network}`
    : "--";
  elements.paymentAmount.textContent = payment?.token
    ? `${payment.amountDisplay} ${payment.token}`
    : "--";
  elements.paymentCalls.textContent = payment
    ? `${payment.settledCalls} / ${payment.totalCalls}`
    : "--";
  const receipt = payment?.receipt?.transaction ?? payment?.receipt?.txHash;
  elements.paymentReceipt.textContent = truncate(receipt, 16, 10);
  elements.paymentReceipt.title = receipt ?? "";
}

function renderTransaction(transaction) {
  elements.transactionWallet.textContent = truncate(transaction?.wallet, 12, 8);
  elements.transactionWallet.title = transaction?.wallet ?? "";
  elements.transactionProgram.textContent = truncate(transaction?.program, 12, 8);
  elements.transactionProgram.title = transaction?.program ?? "";
  elements.transactionInstructions.textContent = transaction
    ? `${transaction.instructionCount} instructions · ${transaction.lookupTableCount} LUT`
    : "--";
  elements.transactionData.textContent = truncate(transaction?.data, 18, 10);
  elements.transactionData.title = transaction?.data ?? "";
}

function renderResult(result, { syncSelection = false } = {}) {
  elements.runId.textContent = truncate(result.runId, 8, 4).toUpperCase();
  if (syncSelection || !state.selectedByScenario[result.scenario]) {
    state.selectedByScenario[result.scenario] =
      result.selectedToken.tokenContractAddress;
  }
  renderCandidates(result.candidates, result.selectedToken);
  renderRoute(result.quote, result.intent);
  renderPayment(result.payment);
  renderTransaction(result.transaction);
}

function finalizeProtocolStates(result) {
  setProtocolState(elements.marketState, "RANKED", "is-done");
  setProtocolState(
    elements.x402State,
    result.payment.status === "settled" ? "SETTLED" : "FREE QUOTA",
    "is-done",
  );
  setProtocolState(elements.mcpState, "BUILT", "is-done");
}

async function run(event) {
  event.preventDefault();
  if (state.running) return;
  const message = elements.input.value.trim();
  if (!message) {
    showToast("请输入一条自然语言指令。");
    elements.input.focus();
    return;
  }

  state.running = true;
  elements.runButton.disabled = true;
  elements.runButton.querySelector("span:last-child").textContent = "执行中";
  appendMessage("user", message);
  clearResultsForRun();

  try {
    const response = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mode: state.mode,
        scenario: state.scenario,
        selectedTokenAddress: state.selectedByScenario[state.scenario],
        previewOnly: true,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error?.message ?? `Request failed (${response.status})`);
    }

    state.resultsByScenario[state.scenario] = body;
    appendMessage("agent", body.answer);
    renderResult(body, { syncSelection: true });
    await animateTrace(body.trace);
    finalizeProtocolStates(body);
  } catch (error) {
    appendMessage("agent", `执行失败：${error.message}`);
    showToast(error.message);
    elements.traceList.replaceChildren(
      traceElement(
        {
          title: "Run failed",
          detail: error.message,
          protocol: "ERROR",
          status: "error",
        },
        0,
      ),
    );
    setProtocolState(elements.marketState, "ERROR");
    setProtocolState(elements.x402State, "STOPPED");
    setProtocolState(elements.mcpState, "STOPPED");
  } finally {
    state.running = false;
    elements.runButton.disabled = false;
    elements.runButton.querySelector("span:last-child").textContent = "分析并构建";
  }
}

async function initialize() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Config endpoint unavailable");
    state.config = await response.json();
    setMode(state.config.appMode ?? "demo");
    setScenario("social-hot");
  } catch (error) {
    elements.connectionState.classList.add("is-error");
    elements.connectionLabel.textContent = "OFFLINE";
    showToast(error.message);
  }
}

elements.form.addEventListener("submit", run);
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
document.querySelectorAll(".scenario-button").forEach((button) => {
  button.addEventListener("click", () => setScenario(button.dataset.scenario));
});
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => preset(button.dataset.preset));
});

initialize();
