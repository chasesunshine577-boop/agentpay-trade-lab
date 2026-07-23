import { loadEnv } from "./env.js";

loadEnv();

const [{ config }, { runAgent }] = await Promise.all([
  import("./config.js"),
  import("./agent/runtime.js"),
]);

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : config.appMode;
const scenarioIndex = process.argv.indexOf("--scenario");
const scenario =
  scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : "social-hot";
const optionValues = new Set(
  [modeIndex, scenarioIndex]
    .filter((index) => index >= 0)
    .flatMap((index) => [index, index + 1]),
);
const message = process.argv
  .slice(2)
  .filter((_value, index) => !optionValues.has(index + 2))
  .join(" ")
  .trim();

const result = await runAgent({
  mode,
  scenario,
  message:
    message ||
    (scenario === "solana-rwa"
      ? config.demo.prompts.rwa
      : config.demo.prompts.social),
  previewOnly: true,
});

console.log(JSON.stringify(result, null, 2));
