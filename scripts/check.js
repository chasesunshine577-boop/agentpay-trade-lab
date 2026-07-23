import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function javascriptFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return javascriptFiles(fullPath);
    return fullPath.endsWith(".js") ? [fullPath] : [];
  });
}

const files = [
  ...javascriptFiles(path.resolve("src")),
  ...javascriptFiles(path.resolve("public")),
  ...javascriptFiles(path.resolve("scripts")),
  ...javascriptFiles(path.resolve("test")),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked: ${files.length} JavaScript files`);
