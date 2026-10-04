#!/usr/bin/env node
// 校验种子树无残留 novel-system 相对路径与未参数化的番茄默认值
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const BAD_PATTERNS = [
  /(?:^|[\s(`(])dynamic\//,
  /(?:^|[\s(`(])static\//,
  /novel-system\//,
  /python +tools\/metrics\.py/,
  /1200[-—~]+1500/
];
let failures = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!p.endsWith(".md")) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of BAD_PATTERNS)
        if (re.test(line)) {
          failures++;
          console.error(`${p}:${i + 1}: ${re}`);
        }
    });
  }
}
walk(ROOT);
if (failures) {
  console.error(`${failures} violations`);
  process.exit(1);
}
console.log("seed references clean");
