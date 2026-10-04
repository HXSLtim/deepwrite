# NovelOps 写作流程接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 NovelOps v2.10 的 G0-G8 写作流程接入 DeepWrite 创作域：知识四组进本地技能库，ORCHESTRATOR 做主编门禁、15 个角色提示词直接移植为子智能体，状态与落盘全用原生结构。

**Architecture:** 内容移植（路径引用重写）产出种子树 → 种子导入机制落进用户本地技能库（Core 唯一写入者约束不变）→ 创作域注册"连载团队"（主编 + 角色子智能体，走既有 subagent 机制，不新增契约域）→ renderer 入口接线。

**Tech Stack:** 既有 subagent/team 机制（pi-runtime-adapter + contracts subagent 档案 + renderer 默认子智能体设置）、folder-catalog 技能库、Node 脚本。

**规格:** `docs/superpowers/specs/2026-10-04-novelops-workflow-integration-design.md`
**侦察:** `.superpowers/sdd/novelops-scout-report.md`（G 映射表、组件分类、风险清单）
**知识源:** `~/.claude/skills/novelops-v2/novel-system/`（只读）

## Global Constraints

- 状态用原生：流程文档中一切 `dynamic/`、`static/`、`knowledge/` 引用必须重写为 DeepWrite 结构名（章卡/人物卡/伏笔/时间线/连续性/世界观/作品设置）或技能库条目名；种子树中不得残留 `novel-system` 相对路径。
- 落盘走 proposal；不新增契约域；不向 session.prompt/WorkspaceRuntimeContext 加扩展字段。
- 版权声明保留（各导入文件保留原始来源/作者声明块）；models.json（112MB）与 aitext_detector 绝不进入仓库或种子。
- 番茄系默认值参数化（字数/赛道/平台画像 → 作品设置占位符，不硬编码）。
- 中文文件名保留（避免断链）；提交身份 carswj 无尾注；只暂存任务清单内文件。
- 定向测试：仓库根 `pnpm exec vitest run <file>`；最终 `pnpm verify` 全绿。

---

### Task 1: 知识内容移植（种子树）

**Files:**
- Create: `tools/novelops-seed/`（四组：`style/`、`techniques/`、`workflow/`、`genres/` + `SEED_MANIFEST.json` + `check-refs.mjs`）
- Source (只读): `~/.claude/skills/novelops-v2/novel-system/`

**Interfaces:**
- Produces: `SEED_MANIFEST.json`（`{ groups: [{ id, title, entries: [{ file, title, source }]}] }`），Task 2 的导入依据；`check-refs.mjs`（Task 5 验证复用）。

**移植规则（逐文件执行）：**
1. **style/**：`knowledge/文风六卡.md`、`knowledge/anti-ai-patterns.md` 原样复制 + 头部加来源声明；文件互引保持相对名。
2. **techniques/**：`knowledge/技法卡路由.md` + `技法卡大全_索引.md` + 15 分册原样复制；路由内 `dynamic/rhythm_tracker.json`、`dynamic/scene-plan.md` 引用改写为「章卡节奏标记 / 章卡规划区」；`python tools/metrics.py` 引用改写为「指标自检（文风六卡·卡6 体检清单）」并保留降级说明。
3. **workflow/**：ORCHESTRATOR 四文件 + `prompts/`×5 + `static/prompts/`×10，按侦察报告 B 表重写：G1 段改「上下文由 DeepWrite 原生注入（章卡/人物/连续性/伏笔/时间线）」；G7 段改「正文与结构变更经 proposal 差异审阅落盘」；22 轨引用全部改原生结构名（速记表见侦察报告）；G2 的 sample-library 改「素材库样本条目」；字数/赛道/平台默认值改 `{{作品设置:xxx}}` 占位符。
4. **genres/**：7 个题材文件原样复制 + 来源声明。

**Steps:**
- [ ] 建目录结构，按上述规则移植（每组一个逻辑批次，边移边自检）
- [ ] 写 `check-refs.mjs`：

```js
#!/usr/bin/env node
// 校验种子树无残留 novel-system 相对路径与未参数化的番茄默认值
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const BAD_PATTERNS = [
  /(?:^|[\s(`(])dynamic\//, /(?:^|[\s(`(])static\//,
  /novel-system\//, /python +tools\/metrics\.py/,
  /1200[-—~]+1500/
];
let failures = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith(".md")) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of BAD_PATTERNS)
        if (re.test(line)) { failures++; console.error(`${p}:${i + 1}: ${re}`); }
    });
  }
}
walk(ROOT);
if (failures) { console.error(`${failures} violations`); process.exit(1); }
console.log("seed references clean");
```

- [ ] `node tools/novelops-seed/check-refs.mjs` → `seed references clean`
- [ ] 生成 `SEED_MANIFEST.json`（如实列出全部条目与来源）
- [ ] Commit: `feat: port novelops knowledge into deepwrite seed tree`

### Task 2: 种子导入机制（技能库落位）

**Files:**
- Create: `tools/novelops-seed/seed.mjs`（或按调查结论落在更合适处）
- Modify: 视调查结论（contracts 不预期变更；若需命令则先契约后实现）

**Interfaces:**
- Consumes: Task 1 的种子树与 SEED_MANIFEST；既有 catalog 契约（skill domain、manifests schema）。
- Produces: 可重复执行的导入流程——目标状态：DeepWrite 本地技能库出现四组条目，`catalog.snapshot` 可见。

**Steps:**
- [ ] 调查（只读）：技能库 folder 的磁盘布局与注册方式（contracts `catalog/manifests` + Core 注册表 + 既有 `importLibraryEntries`/`importLegacyLibrary` 命令的真实调用方），在报告里写明选择： 借道既有导入命令； 或 应用关闭时按契约 schema 构造库文件夹+注册（需注明为何安全、如何验证）。
- [ ] 实现 `seed.mjs`：从 SEED_MANIFEST 生成技能库文件夹（清单 `deepwrite.json` 按契约 schema、条目 .md 含元数据头）并完成注册路径。
- [ ] 测试：对生成的清单跑 contracts schema parse 的单测（`tools/novelops-seed/seed.test.mjs` 或共置）；手动验收步骤写入报告。
- [ ] Commit: `feat: add novelops skill library seeding script`

### Task 3: 连载团队定义（主编 + 15 角色子智能体）

**Files:**
- Create/Modify: `packages/pi-runtime-adapter/src/`（subagent 定义处，按现有 subagent-* 机制落位；主编门禁提示词从 Task 1 workflow/ 组取材）
- Modify: renderer 默认子智能体设置接线（若契约有对应清单）

**Interfaces:**
- Consumes: 既有创作域 subagent 机制（subagentDefinitions 注入、team 模式）；Task 1 workflow 提示词。
- Produces: 主编档案（G0-G8 门禁 + 触发语）+ writer/editor/humanizer/imitate/continue + 阶段0 十角色档案；含 faux 响应。

**Steps:**
- [ ] 先读现有 subagent 定义与注册链（adapter + renderer 默认设置），对齐命名与档案格式
- [ ] 定义主编与 15 角色（提示词本体来自 workflow/ 种子，运行边界块按项目惯例附加）
- [ ] 注册 + faux 响应
- [ ] 测试：档案组装/注册单测（对齐既有 subagent 测试文件形态）
- [ ] Commit: `feat: add novelops serialization team subagents`

### Task 4: 入口接线（renderer）

**Files:**
- Modify: renderer 会话智能体选择/默认子智能体设置相关文件（按 Task 3 实际注册面定）

**Steps:**
- [ ] 连载团队可在创作空间会话选用；默认设置入口正常
- [ ] i18n zh/en 成对；lint:boundary/i18n/typecheck 过
- [ ] Commit: `feat: expose novelops serialization team in workspace`

### Task 5: 验证与打包

- [ ] `node tools/novelops-seed/check-refs.mjs` 复跑 clean
- [ ] `pnpm verify` 全绿（慢用例 20s + retry 已在位）
- [ ] 桌面手动清单：种子导入后技能库四组可见可检索；连载团队可选用；模拟一次 G0→G3 小循环（faux 模型）；proposal 正常
- [ ] `pnpm pack:test:mac:arm64` 终包 → 换装（直接替换，不经改名中转；装后刷新 Dock 清 Launchpad 幽灵）

## Self-Review

- 规格覆盖：§2 原则→全局约束；§3.1→Task 1/2；§3.2→Task 3/4；§4 关键点→各任务；§5→Task 5。
- 类型一致性：SEED_MANIFEST 结构在 Task 1/2 间一致；主编档案来源（workflow 组）在 Task 1/3 间一致。
- 已知不确定点：Task 2 的导入路径需调查后二选一（已写明决策要求与安全论证义务）；Task 3 的 subagent 落位文件以现有机制为准（步骤含先读后写）。
