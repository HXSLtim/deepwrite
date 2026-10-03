# 全自动审批 + 批量审批 + 工具卡收起 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `auto-approve-all` 审批档（含删除自动通过）、审批卡批量接受/拒绝、streaming 中已完成工具卡自动收起。

**Architecture:** 契约层加第三档枚举（两处 schema），Renderer 本地联合类型同步加值并提供 `isAutoApprovalMode` / `shouldForceManualReview` 判定函数；生效点把 `=== "auto-approve"` 替换为判定函数调用，长篇删除降级改为经 `shouldForceManualReview` 放行新档；impact_mismatch 与版本冲突回退保持不动。批量 UI 与收起均为 Renderer 纯函数 + 薄模板层改动。

**Tech Stack:** pnpm workspace、Zod 4、Vue 3.5 + Pinia、Vitest 4（测试与源码共置）。

**规格:** `docs/superpowers/specs/2026-10-04-auto-approve-all-design.md`

## Global Constraints

- 默认档位保持 `auto-approve` 不变；`auto-approve-all` 必须显式选择。
- `impact_mismatch` 与版本冲突（expectedImpact / baseRevision）回退**不随档位放开**。
- 删除自动落盘仍走按 workspace 串行队列，不引入并行。
- 提交身份 `carswj <wenjia@wenjiadeMacBook-Air.local>`（仓库级 config）；不加 Co-authored-by 等尾注；只 `git add` 任务清单内文件。
- 视觉沿用现有主题变量与控件（单选卡片、PopupSelect、toast）；文案 zh/en 成对新增，`pnpm lint:i18n` 必须通过。
- 所有行号基于 1186ee2 快照，实施时以实际代码为准（先读后改）。
- 定向测试命令：仓库根目录 `pnpm exec vitest run <文件路径>`。

---

### Task 1: contracts 第三档枚举

**Files:**
- Modify: `packages/contracts/src/session/runtime.ts:15-18`
- Modify: `packages/contracts/src/general-settings.ts:25-29`
- Test: `packages/contracts/src/general-settings.approval-mode.test.ts`（新建）

**Interfaces:**
- Produces: `AgentWriteApprovalMode` / `GeneralPermissionMode` 联合类型新增 `"auto-approve-all"`（后续所有任务的类型基础）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/contracts/src/general-settings.approval-mode.test.ts
import { describe, expect, it } from "vitest";
import { AgentWriteApprovalModeSchema } from "./session/runtime";
import {
  GeneralPermissionModeSchema,
  createDefaultGeneralSettings
} from "./general-settings";

describe("agent write approval modes", () => {
  it("accepts auto-approve-all on both schemas", () => {
    expect(AgentWriteApprovalModeSchema.parse("auto-approve-all")).toBe(
      "auto-approve-all"
    );
    expect(GeneralPermissionModeSchema.parse("auto-approve-all")).toBe(
      "auto-approve-all"
    );
  });

  it("keeps legacy modes and the default unchanged", () => {
    expect(AgentWriteApprovalModeSchema.parse("request-approval")).toBe(
      "request-approval"
    );
    expect(AgentWriteApprovalModeSchema.parse("auto-approve")).toBe(
      "auto-approve"
    );
    expect(createDefaultGeneralSettings().permissionMode).toBe("auto-approve");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run packages/contracts/src/general-settings.approval-mode.test.ts`
Expected: FAIL（`auto-approve-all` 被 Zod 枚举拒绝）

- [ ] **Step 3: 最小实现**

```ts
// packages/contracts/src/session/runtime.ts:15-18
export const AgentWriteApprovalModeSchema = z.enum([
  "request-approval",
  "auto-approve",
  "auto-approve-all"
]);
```

```ts
// packages/contracts/src/general-settings.ts:25-28
export const GeneralPermissionModeSchema = z.enum([
  "request-approval",
  "auto-approve",
  "auto-approve-all"
]);
```

（`createDefaultGeneralSettings` 的 `permissionMode: "auto-approve"` 不动。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run packages/contracts/src/general-settings.approval-mode.test.ts`
Expected: PASS（2 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/contracts/src/session/runtime.ts packages/contracts/src/general-settings.ts packages/contracts/src/general-settings.approval-mode.test.ts
git commit -m "feat: add auto-approve-all approval mode to contracts"
```

---

### Task 2: Renderer 模式类型与判定函数

**Files:**
- Modify: `apps/desktop/src/renderer/src/types/conversation.ts:18`
- Create: `apps/desktop/src/renderer/src/utils/approvalMode.ts`
- Test: `apps/desktop/src/renderer/src/utils/approvalMode.test.ts`

**Interfaces:**
- Consumes: Task 1 的类型语义（本地联合类型与 contracts 保持同构）。
- Produces: `isAutoApprovalMode(mode: AgentApprovalMode | undefined): boolean`、`shouldForceManualReview(mode: AgentApprovalMode | undefined, requiresImpactConfirmation: boolean): boolean`（Task 4 使用）。

- [ ] **Step 1: 扩展本地联合类型**

```ts
// apps/desktop/src/renderer/src/types/conversation.ts:18
export type AgentApprovalMode =
  | "request-approval"
  | "auto-approve"
  | "auto-approve-all";
```

- [ ] **Step 2: 写失败测试**

```ts
// apps/desktop/src/renderer/src/utils/approvalMode.test.ts
import { describe, expect, it } from "vitest";
import {
  isAutoApprovalMode,
  shouldForceManualReview
} from "./approvalMode";

describe("isAutoApprovalMode", () => {
  it("accepts both automatic modes", () => {
    expect(isAutoApprovalMode("auto-approve")).toBe(true);
    expect(isAutoApprovalMode("auto-approve-all")).toBe(true);
  });

  it("rejects manual and missing modes", () => {
    expect(isAutoApprovalMode("request-approval")).toBe(false);
    expect(isAutoApprovalMode(undefined)).toBe(false);
  });
});

describe("shouldForceManualReview", () => {
  it("forces review for impact-confirmed proposals under plain auto-approve", () => {
    expect(shouldForceManualReview("auto-approve", true)).toBe(true);
    expect(shouldForceManualReview("request-approval", true)).toBe(true);
  });

  it("lets auto-approve-all skip impact confirmation", () => {
    expect(shouldForceManualReview("auto-approve-all", true)).toBe(false);
  });

  it("never forces review without impact confirmation", () => {
    expect(shouldForceManualReview("request-approval", false)).toBe(false);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/utils/approvalMode.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

```ts
// apps/desktop/src/renderer/src/utils/approvalMode.ts
import type { AgentApprovalMode } from "../types/conversation";

export function isAutoApprovalMode(
  mode: AgentApprovalMode | undefined
): mode is Exclude<AgentApprovalMode, "request-approval"> {
  return mode === "auto-approve" || mode === "auto-approve-all";
}

/**
 * 删除/解除关联类 impact 确认在普通 auto-approve 下仍强制人工；
 * 只有 auto-approve-all 显式跳过。impact_mismatch 与版本冲突回退
 * 不经过此函数，任何档位都保持回退。
 */
export function shouldForceManualReview(
  mode: AgentApprovalMode | undefined,
  requiresImpactConfirmation: boolean
): boolean {
  if (!requiresImpactConfirmation) return false;
  return mode !== "auto-approve-all";
}
```

- [ ] **Step 5: 运行确认通过 + 提交**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/utils/approvalMode.test.ts`
Expected: PASS（5 个用例）

```bash
git add apps/desktop/src/renderer/src/types/conversation.ts apps/desktop/src/renderer/src/utils/approvalMode.ts apps/desktop/src/renderer/src/utils/approvalMode.test.ts
git commit -m "feat: add renderer approval mode helpers for auto-approve-all"
```

---

### Task 3: 档位可选——设置页第三张单选卡、会话面板选项、白名单

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/GeneralSettingsPanel.vue:73-87`（auto-approve 卡后加第三卡）
- Modify: `apps/desktop/src/renderer/src/composables/useConversationModelOptions.ts:146-165`
- Modify: `apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.ts:176-183`
- Modify: `apps/desktop/src/renderer/src/components/ConversationComposer.vue:228-231`
- Modify: i18n `apps/desktop/src/renderer/src/i18n/messages/foundation/zh-CN.ts`、`en-US.ts`、`apps/desktop/src/renderer/src/i18n/messages/workspace/zh-CN-conversations.ts`、`en-US-conversations.ts`（在 `approveAutomatically` 既有键附近成对新增）
- Test: `apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.approval-mode.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1/2 的 `"auto-approve-all"` 值。
- Produces: 设置页与会话面板可选中并保存第三档；`selectApprovalMode` 接受第三档（Task 4 的运行时来源）。

**设计偏差说明（相对规格 4.2）**：设置页现有权限控件是带描述的单选卡片组（`role="radiogroup"`），沿用加第三张卡而非改 PopupSelect——贴合现有控件形态，且"含删除不可恢复"警示可常驻展示。

- [ ] **Step 1: 写失败测试**

```ts
// apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.approval-mode.test.ts
import { describe, expect, it } from "vitest";
import { selectApprovalMode } from "./run-settings";

function approvalContext(initial: string) {
  return { approvalMode: { value: initial } };
}

describe("selectApprovalMode", () => {
  it("accepts all three modes", () => {
    for (const mode of [
      "request-approval",
      "auto-approve",
      "auto-approve-all"
    ] as const) {
      const ctx = approvalContext("request-approval");
      selectApprovalMode(ctx as never, mode);
      expect(ctx.approvalMode.value).toBe(mode);
    }
  });

  it("ignores unknown values", () => {
    const ctx = approvalContext("auto-approve");
    selectApprovalMode(ctx as never, "yolo" as never);
    expect(ctx.approvalMode.value).toBe("auto-approve");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.approval-mode.test.ts`
Expected: FAIL（`auto-approve-all` 被白名单拒绝）

- [ ] **Step 3: 实现——run-settings 白名单**

```ts
// apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.ts:176-183
export function selectApprovalMode(
  ctx: RunSettingsContext,
  mode: AgentApprovalMode
): void {
  if (
    mode === "request-approval" ||
    mode === "auto-approve" ||
    mode === "auto-approve-all"
  ) {
    ctx.approvalMode.value = mode;
  }
}
```

- [ ] **Step 4: Composer 白名单**

```ts
// apps/desktop/src/renderer/src/components/ConversationComposer.vue:228-231
function handleApprovalChange(value: string | number): void {
  if (
    value === "request-approval" ||
    value === "auto-approve" ||
    value === "auto-approve-all"
  )
    emit("selectApproval", value);
}
```

- [ ] **Step 5: 会话面板第三选项**（`useConversationModelOptions.ts`，`approvalOptions` 数组追加）

```ts
    {
      value: "auto-approve-all" as const,
      get label() {
        return t("approveEverythingAutomatically");
      },
      get description() {
        return t(
          "automaticallyApproveAllOperationsIncludingDeletionsWhichCannotBeUndone"
        );
      }
    }
```

（`approvalModeIcon` 不改：`request-approval ? "user" : "check"` 对新档仍合理。）

- [ ] **Step 6: 设置页第三张单选卡**（`GeneralSettingsPanel.vue`，插在 auto-approve 卡之后、`</div>`（radiogroup 结束）之前）

```vue
      <label class="settings-item">
        <span class="settings-item-text"
          ><strong>{{ t("fullAutoApproval") }}</strong
          ><small>{{ t("fullAutoApprovalDescription") }}</small></span
        >
        <span class="settings-toggle"
          ><input
            type="radio"
            name="general-permission-mode"
            :checked="permissionMode === 'auto-approve-all'"
            :aria-label="t('fullAutoApproval')"
            @change="emit('updatePermissionMode', 'auto-approve-all')"
        /></span>
      </label>
```

- [ ] **Step 7: i18n 文案**（四个文件各加对应键，位置放在既有同类键旁）

foundation/zh-CN.ts：
```ts
  fullAutoApproval: "全自动（含删除）",
  fullAutoApprovalDescription:
    "自动通过全部写入审批，包括删除章节、素材等不可恢复操作，直接落盘。",
```
foundation/en-US.ts：
```ts
  fullAutoApproval: "Full auto (incl. delete)",
  fullAutoApprovalDescription:
    "Automatically approve every write, including irreversible deletions of chapters and materials, and save immediately.",
```
workspace/zh-CN-conversations.ts（`approveAutomatically` 键旁）：
```ts
  approveEverythingAutomatically: "全自动通过",
  automaticallyApproveAllOperationsIncludingDeletionsWhichCannotBeUndone:
    "自动通过全部操作（含删除，不可恢复）",
```
workspace/en-US-conversations.ts：
```ts
  approveEverythingAutomatically: "Approve everything",
  automaticallyApproveAllOperationsIncludingDeletionsWhichCannotBeUndone:
    "Automatically approve all operations including irreversible deletions",
```

- [ ] **Step 8: 验证 + 提交**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.approval-mode.test.ts && pnpm lint:i18n`
Expected: PASS / 无缺键

```bash
git add apps/desktop/src/renderer/src/components/GeneralSettingsPanel.vue apps/desktop/src/renderer/src/components/ConversationComposer.vue apps/desktop/src/renderer/src/composables/useConversationModelOptions.ts apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.ts apps/desktop/src/renderer/src/composables/agent-conversation/run-settings.approval-mode.test.ts apps/desktop/src/renderer/src/i18n/messages/foundation/zh-CN.ts apps/desktop/src/renderer/src/i18n/messages/foundation/en-US.ts apps/desktop/src/renderer/src/i18n/messages/workspace/zh-CN-conversations.ts apps/desktop/src/renderer/src/i18n/messages/workspace/en-US-conversations.ts
git commit -m "feat: expose auto-approve-all in settings and conversation approval options"
```

---

### Task 4: 生效点替换与删除降级豁免

**Files:**
- Modify: `apps/desktop/src/renderer/src/composables/useProposalCoordinator.ts`（14 处 + 953 处，见 Step 3）
- Modify: `apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.ts`（964/1082/1092/1267/1326 五处 + 899-918 降级块）
- Modify: `apps/desktop/src/renderer/src/components/LongProposalReview.vue`（253-433 区间约 12 处展示态判断 + 716/761 两处 `!==`）
- Test: `apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.auto-approve-all.test.ts`（新建，复用 `useLongWorkspaceProposals.test-support.ts` 的 harness）

**Interfaces:**
- Consumes: Task 2 的 `isAutoApprovalMode` / `shouldForceManualReview`。
- Produces: 行为变更——`auto-approve-all` 下非冲突提案（含删除）自动落盘；`auto-approve` 行为不变。

- [ ] **Step 1: 写失败测试**

```ts
// apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.auto-approve-all.test.ts
import type { LongWorkspaceImpactConfirmation } from "@deepwrite/contracts";
import {
  createEnvelope,
  describe,
  emptyConfirmation,
  envelopeContext,
  expect,
  harness,
  it,
  proposalBase,
  systemEvent
} from "./useLongWorkspaceProposals.test-support";

function previewResult(confirmation: LongWorkspaceImpactConfirmation) {
  return {
    bookId: proposalBase.bookId,
    preview: {
      ...confirmation,
      confirmation,
      documentWrites: [],
      provisionalIdMap: {}
    }
  };
}

function deleteMutationEvent() {
  return systemEvent(
    createEnvelope(
      "long.mutation_proposal",
      {
        ...proposalBase,
        summary: "删除世界观分类",
        batch: {
          updatedAt: "2026-07-26T12:00:00.000Z",
          operations: [{ type: "worldbuilding.delete", id: "world_rules" }],
          documentWrites: []
        }
      },
      { id: "event_delete_auto_all", context: envelopeContext }
    )
  );
}

describe("long workspace proposals: auto-approve-all", () => {
  it("auto-applies delete batches under auto-approve-all", async () => {
    const test = harness();
    test.previewOperations.mockResolvedValue(
      previewResult({
        ...emptyConfirmation(),
        entityIntents: [{ intent: "delete", entity: "worldbuilding:world_rules" }]
      })
    );
    await test.controller.enqueueProposalEvent(
      deleteMutationEvent(),
      "auto-approve-all"
    );
    expect(test.applyOperations).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook(proposalBase.bookId)[0]).toMatchObject({
      approvalMode: "auto-approve-all"
    });
  });

  it("still downgrades delete batches under plain auto-approve", async () => {
    const test = harness();
    test.previewOperations.mockResolvedValue(
      previewResult({
        ...emptyConfirmation(),
        entityIntents: [{ intent: "delete", entity: "worldbuilding:world_rules" }]
      })
    );
    await test.controller.enqueueProposalEvent(
      deleteMutationEvent(),
      "auto-approve"
    );
    expect(test.applyOperations).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook(proposalBase.bookId)[0]).toMatchObject({
      approvalMode: "request-approval"
    });
  });
});
```

（若 harness 的 preview mock 名称或 `enqueueProposalEvent` 暴露方式与上述不符，以 `useLongWorkspaceProposals.structure-and-manual-proposals.test.ts:50-116` 的实际用法为准调整——该文件已有同型删除降级用例可对照。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.auto-approve-all.test.ts`
Expected: FAIL（第一个用例：删除批次被降级，`applyOperations` 未调用）

- [ ] **Step 3: useProposalCoordinator 替换**

顶部 import 区加：
```ts
import { isAutoApprovalMode } from "../utils/approvalMode";
```
批量替换（14 处，行 1115/1203/1287/1372/1569/1711/1834/1975/2064/2178/2304/2389 及 953）：
```bash
sed -i '' 's/runApprovalMode === "auto-approve"/isAutoApprovalMode(runApprovalMode)/g' apps/desktop/src/renderer/src/composables/useProposalCoordinator.ts
```
953 行单独改：
```ts
// 前：proposal.approvalMode !== "auto-approve" ||
// 后：
!isAutoApprovalMode(proposal.approvalMode) ||
```
验证：
```bash
grep -c 'approvalMode === "auto-approve"\|approvalMode !== "auto-approve"' apps/desktop/src/renderer/src/composables/useProposalCoordinator.ts
```
Expected: `0`

- [ ] **Step 4: useLongWorkspaceProposals 替换 + 降级豁免**

import 区加 `import { isAutoApprovalMode, shouldForceManualReview } from "../utils/approvalMode";`

五处替换：964、1082、1092、1267、1326 行的 `=== "auto-approve"` → 包成 `isAutoApprovalMode(...)`（964 是 `approvalMode`，其余四处是 `item.approvalMode` / `waiting.approvalMode` / `current?.approvalMode`，按原变量名替换）。

899-918 降级块改为：
```ts
      if (
        isBatchProposal(current.event) &&
        current.preview &&
        shouldForceManualReview(
          current.approvalMode,
          longWorkspaceOperationsRequireImpactConfirmation(
            (current.effectiveBatch ?? current.event.payload.batch).operations,
            current.preview.confirmation
          )
        )
      ) {
```
（块体不变——仍降级 request-approval + 警告 toast + return。）

验证：
```bash
grep -c '=== "auto-approve"' apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.ts
```
Expected: 仅剩 1002 行 ledger 的字面量赋值 `"auto-approve"`（1 处，语义不变可保留）。

- [ ] **Step 5: LongProposalReview 展示态替换**

import 区加 `import { isAutoApprovalMode } from "../composables/utils/approvalMode";`（按该文件现有相对路径习惯调整），253-433 区间及 716/761 的 `item.approvalMode === "auto-approve"` → `isAutoApprovalMode(item.approvalMode)`、`item.approvalMode !== "auto-approve"` → `!isAutoApprovalMode(item.approvalMode)`。
验证：`grep -c 'approvalMode === "auto-approve"\|approvalMode !== .auto-approve.' <文件>` → `0`

- [ ] **Step 6: 运行测试**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.auto-approve-all.test.ts apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.structure-and-manual-proposals.test.ts apps/desktop/src/renderer/src/composables/useProposalCoordinator.test.ts`
Expected: 全部 PASS（新增 2 用例 + 既有回归不破）

- [ ] **Step 7: 提交**

```bash
git add apps/desktop/src/renderer/src/composables/useProposalCoordinator.ts apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.ts apps/desktop/src/renderer/src/composables/useLongWorkspaceProposals.auto-approve-all.test.ts apps/desktop/src/renderer/src/components/LongProposalReview.vue
git commit -m "feat: honor auto-approve-all in proposal coordinators, keep conflict fallback"
```

---

### Task 5: Agent 层提示文案三档化

**Files:**
- Modify: `packages/pi-runtime-adapter/src/long-agent-tools/context.ts:37`
- Modify: `packages/pi-runtime-adapter/src/library-agent-tools/mutations.ts:22`
- Modify: `packages/pi-runtime-adapter/src/short-agent-tools/unified-proposal.ts:22`

**Interfaces:**
- Consumes: Task 1 的枚举（`writeApprovalMode` 类型已含新值，类型层面自动兼容）。
- Produces: 两种自动档下 pending 摘要都改写为"已提交自动保存队列"文案。

- [ ] **Step 1: 修改三处条件**

```ts
// context.ts:37   前：input.writeApprovalMode === "auto-approve"
//                后：
  return input.writeApprovalMode !== "request-approval"

// mutations.ts:22 前：approvalMode === "auto-approve"
//                后：
  return approvalMode !== "request-approval"

// unified-proposal.ts:22 前：if (input.writeApprovalMode !== "auto-approve") return summary;
//                后：
  if (input.writeApprovalMode === "request-approval") return summary;
```

- [ ] **Step 2: 回归**

Run: `pnpm exec vitest run packages/pi-runtime-adapter/src/long-agent-tools packages/pi-runtime-adapter/src/library-agent-tools packages/pi-runtime-adapter/src/short-agent-tools`
Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add packages/pi-runtime-adapter/src/long-agent-tools/context.ts packages/pi-runtime-adapter/src/library-agent-tools/mutations.ts packages/pi-runtime-adapter/src/short-agent-tools/unified-proposal.ts
git commit -m "feat: apply auto-save summary copy for auto-approve-all tool results"
```

---

### Task 6: 批量接受/拒绝

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/conversationToolPresentation.ts`（新增纯函数）
- Modify: `apps/desktop/src/renderer/src/components/ConversationMessageItem.vue`（approval-card-stack 头部）
- Modify: `apps/desktop/src/renderer/src/components/LongProposalReview.vue`（非 embedded 模式工具条）
- Modify: i18n（`approvalCardsForThisTurn` 所在 scope 文件，zh/en 成对；实施时 `grep -rn "approvalCardsForThisTurn" apps/desktop/src/renderer/src/i18n/messages` 定位）
- Test: `apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`（扩展）

**Interfaces:**
- Consumes: 既有 `approvalItemsForMessage`、AgentEditProposalCard 的 review 载荷 `{runId, proposalId, decision}`、LongProposalReview 的 `approve`/`reject`（参数 eventId）事件。
- Produces: `actionableApprovalItems(message, longProposalItems): ApprovalCardItem[]`（可批量处理的卡：edit 类 status==="pending"；long 类 status==="ready"）。

- [ ] **Step 1: 写失败测试**（追加到 conversationToolPresentation.test.ts，测试构造沿用该文件既有的 message/longProposalItems 工厂）

```ts
describe("actionableApprovalItems", () => {
  it("returns pending edit proposals and ready long proposals only", () => {
    // message.editProposals 含 pending 与 accepted 各一；
    // longProposalItems 含 status "ready" 与 "accepted" 各一。
    // 期望只返回 pending 的 edit 卡与 ready 的 long 卡（按 createdAt 排序）。
    const items = actionableApprovalItems(message, longItems);
    expect(items.map((item) => item.id)).toEqual([
      "edit:pending-edit",
      "long:event_ready"
    ]);
  });

  it("returns empty when nothing is actionable", () => {
    expect(actionableApprovalItems(emptyMessage, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`
Expected: FAIL（函数未导出）

- [ ] **Step 3: 实现纯函数**（conversationToolPresentation.ts，`approvalItemsForMessage` 之后）

```ts
export function actionableApprovalItems(
  message: ChatMessage,
  longProposalItems: readonly LongWorkspaceProposalItem[]
): ApprovalCardItem[] {
  return approvalItemsForMessage(message, longProposalItems).filter((item) =>
    item.type === "edit-proposal"
      ? item.proposal.status === "pending"
      : item.item.status === "ready"
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`
Expected: PASS

- [ ] **Step 5: ConversationMessageItem 栈头部批量按钮**

script 增补（emit 事件签名沿用文件中已有声明）：
```ts
import { actionableApprovalItems } from "./conversationToolPresentation";

function acceptAllApprovals(message: ChatMessage): void {
  for (const approval of actionableApprovalItems(message, longProposalItems)) {
    if (approval.type === "edit-proposal") {
      emit("reviewEdit", {
        runId: approval.proposal.runId,
        proposalId: approval.proposal.id,
        decision: "accept"
      });
    } else {
      emit("approveLongProposal", approval.item.event.id);
    }
  }
}

function rejectAllApprovals(message: ChatMessage): void {
  for (const approval of actionableApprovalItems(message, longProposalItems)) {
    if (approval.type === "edit-proposal") {
      emit("reviewEdit", {
        runId: approval.proposal.runId,
        proposalId: approval.proposal.id,
        decision: "reject"
      });
    } else {
      emit("rejectLongProposal", approval.item.event.id);
    }
  }
}
```
（`longProposalItems` 以该文件现有 prop 名为准。）

template：`approval-card-stack` 的 `<template v-for>` 之前插入：
```vue
          <div
            v-if="actionableApprovalItems(message, longProposalItems).length > 1"
            class="approval-stack-batch"
          >
            <button
              type="button"
              class="primary-button"
              @click="acceptAllApprovals(message)"
            >
              {{ t("acceptAllApprovals") }}
            </button>
            <button type="button" class="secondary-button" @click="rejectAllApprovals(message)">
              {{ t("rejectAllApprovals") }}
            </button>
          </div>
```
（按钮 class 沿用项目现有中性实心主按钮与普通按钮样式；"全部拒绝"不是删除持久数据，不用红色危险按钮。样式类名以文件/全局样式现有命名为准，必要时在 `styles/conversation-messages.css` 加一条 `.approval-stack-batch { display: flex; gap: 8px; }`。）

- [ ] **Step 6: LongProposalReview 非 embedded 工具条**

script 增补：
```ts
const actionableItems = computed(() =>
  props.items.filter(
    (item) => item.status === "ready" && item.event.type !== "long.ledger_commit_proposal"
  )
);

function acceptAll(): void {
  for (const item of actionableItems.value) emit("approve", item.event.id);
}

function rejectAll(): void {
  for (const item of actionableItems.value) emit("reject", item.event.id);
}
```
template：根容器顶部（`v-if="!embedded && actionableItems.length > 1"`）插入与 Step 5 相同的一对按钮（文案键相同）。

- [ ] **Step 7: i18n**（zh/en 成对，加在 `approvalCardsForThisTurn` 同 scope）

```ts
  acceptAllApprovals: "全部接受",
  rejectAllApprovals: "全部拒绝",
```
```ts
  acceptAllApprovals: "Accept all",
  rejectAllApprovals: "Reject all",
```

- [ ] **Step 8: 验证 + 提交**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts && pnpm lint:i18n && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/desktop/src/renderer/src/components/conversationToolPresentation.ts apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts apps/desktop/src/renderer/src/components/ConversationMessageItem.vue apps/desktop/src/renderer/src/components/LongProposalReview.vue apps/desktop/src/renderer/src/i18n
git commit -m "feat: add batch accept and reject controls for approval cards"
```

---

### Task 7: streaming 工具卡收起

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/conversationToolPresentation.ts`（新增 `splitLiveCollapsedItems`）
- Modify: `apps/desktop/src/renderer/src/components/ConversationProcessingTimeline.vue:56-99`（live 分支）
- Modify: `apps/desktop/src/renderer/src/composables/conversationDisclosureState.ts`（新增 scope 清理）
- Modify: `apps/desktop/src/renderer/src/components/ConversationMessageItem.vue`（streaming 结束时调用清理）
- Modify: i18n `apps/desktop/src/renderer/src/i18n/messages/components/` 下 conversationToolPresentation scope（zh/en）
- Test: `apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`（扩展）

**Interfaces:**
- Consumes: `ProcessingDisplayItem`、`AgentToolTrace.status`（`"preparing" | "running" | "completed" | "error"`）。
- Produces: `splitLiveCollapsedItems(items): { collapsed: ProcessingDisplayItem[]; active: ProcessingDisplayItem[] }`；`clearConversationDisclosureScope(id: () => string): void`。

- [ ] **Step 1: 写失败测试**（追加）

```ts
describe("splitLiveCollapsedItems", () => {
  it("folds completed tool groups and keeps running/error/write items active", () => {
    const items: ProcessingDisplayItem[] = [
      { id: "g1", type: "tool-group", tools: [completedTool, completedTool] },
      { id: "t1", type: "tool", tool: runningWriteTool },
      { id: "g2", type: "tool-group", tools: [completedTool, errorTool] },
      { id: "s1", type: "subagent", /* 既有工厂字段 */ }
    ];
    const split = splitLiveCollapsedItems(items);
    expect(split.collapsed.map((item) => item.id)).toEqual(["g1"]);
    expect(split.active.map((item) => item.id)).toEqual(["t1", "g2", "s1"]);
  });

  it("keeps approval cards active", () => {
    const split = splitLiveCollapsedItems([pendingEditCard, completedGroup]);
    expect(split.active.some((item) => item.type === "edit-proposal")).toBe(
      true
    );
  });
});
```
（`completedTool`/`runningWriteTool`/`errorTool`/`pendingEditCard` 用该测试文件既有的工具/提案构造工厂补齐字段。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`
Expected: FAIL（函数未导出）

- [ ] **Step 3: 实现纯函数**（conversationToolPresentation.ts）

```ts
export interface LiveCollapsedSplit {
  collapsed: ProcessingDisplayItem[];
  active: ProcessingDisplayItem[];
}

/**
 * streaming（live）块内：已完成的工具/工具组折进 collapsed，
 * 由渲染层收成"已完成 N 项"一行；运行中、失败、子代理、
 * 审批卡一律保持 active 平铺。
 */
export function splitLiveCollapsedItems(
  items: ProcessingDisplayItem[]
): LiveCollapsedSplit {
  const collapsed: ProcessingDisplayItem[] = [];
  const active: ProcessingDisplayItem[] = [];
  for (const item of items) {
    if (
      (item.type === "tool-group" &&
        item.tools.length > 0 &&
        item.tools.every((tool) => tool.status === "completed")) ||
      (item.type === "tool" && item.tool.status === "completed")
    ) {
      collapsed.push(item);
    } else {
      active.push(item);
    }
  }
  return { collapsed, active };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts`
Expected: PASS

- [ ] **Step 5: Timeline live 分支消费**

`ConversationProcessingTimeline.vue` script 增补：
```ts
import {
  conversationTimelineBlocks,
  splitLiveCollapsedItems,
  timelineProcessingLabel
} from "./conversationToolPresentation";

const liveSplits = computed(() => {
  const splits = new Map<
    string,
    ReturnType<typeof splitLiveCollapsedItems>
  >();
  for (const block of blocks.value) {
    if (block.kind === "processing" && block.live && block.items.length) {
      splits.set(block.id, splitLiveCollapsedItems(block.items));
    }
  }
  return splits;
});
```
live 分支模板改为（collapsed 摘要行在前、active 平铺在后，条目渲染沿用原有三种组件分支）：
```vue
    <div
      v-if="block.kind === 'processing' && block.live"
      class="processing-live-list"
      :aria-label="t('components.conversationProcessingTimeline.execution')"
    >
      <div class="processing-live-status" aria-live="off">
        <ConversationRunClock
          v-slot="{ now }"
          :active="message.status === 'streaming' || Boolean(message.retry)"
        >
          {{ timelineProcessingLabel(message, block, now) }}
        </ConversationRunClock>
      </div>
      <ConversationDetails
        v-if="liveSplits.get(block.id)?.collapsed.length"
        :detail-id="`${message.id}:${block.id}:live-collapsed`"
        class="processing-block"
      >
        <template #summary>
          <span>{{
            t("components.conversationToolPresentation.completedToolsValue", {
              arg0: liveSplits.get(block.id)!.collapsed.length
            })
          }}</span>
          <AppIcon name="chevron" :size="13" />
        </template>
        <div class="processing-content">
          <template
            v-for="item in liveSplits.get(block.id)!.collapsed"
            :key="item.id"
          >
            <!-- 与下方 active 相同的三分支渲染：ConversationWorkGroup /
                 SubagentRunList / ConversationProcessingItem，事件绑定照抄 -->
          </template>
        </div>
      </ConversationDetails>
      <template
        v-for="item in liveSplits.get(block.id)?.active ?? block.items"
        :key="item.id"
      >
        <!-- 原 block.items 的三分支渲染原样保留 -->
      </template>
    </div>
```
（实施时把原 70-98 行的 item 渲染模板复制到两个槽位；collapsed 与 active 的渲染完全一致，只是外层容器不同。）

- [ ] **Step 6: 手动展开态重置**

conversationDisclosureState.ts 末尾追加：
```ts
/** 清掉某个 scope（如一条消息）下所有手动展开记录。需在 setup 内调用。 */
export function clearConversationDisclosureScope(id: () => string): void {
  const parent = inject(DISCLOSURE_CONTEXT, undefined);
  if (!parent) return;
  const scopeId = id();
  for (const key of [...parent.states.keys()]) {
    try {
      const path: unknown = JSON.parse(key);
      if (Array.isArray(path) && path.includes(scopeId)) {
        parent.states.delete(key);
      }
    } catch {
      // 忽略异常键
    }
  }
}
```
ConversationMessageItem.vue script 增补（watch 已随 Vue 导入）：
```ts
import { clearConversationDisclosureScope } from "../composables/conversationDisclosureState";

watch(
  () => props.message.status === "streaming",
  (streaming, was) => {
    if (was && !streaming) {
      clearConversationDisclosureScope(() => props.message.id);
    }
  }
);
```

- [ ] **Step 7: i18n**

conversationToolPresentation scope（zh）：
```ts
  completedToolsValue: "已完成 {arg0} 项工具操作",
```
（en）：
```ts
  completedToolsValue: "Completed {arg0} tool operations",
```

- [ ] **Step 8: 验证 + 提交**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts apps/desktop/src/renderer/src/components/conversationWorkGroups.test.ts && pnpm lint:i18n && pnpm typecheck`
Expected: 全部通过

```bash
git add apps/desktop/src/renderer/src/components/conversationToolPresentation.ts apps/desktop/src/renderer/src/components/conversationToolPresentation.test.ts apps/desktop/src/renderer/src/components/ConversationProcessingTimeline.vue apps/desktop/src/renderer/src/composables/conversationDisclosureState.ts apps/desktop/src/renderer/src/components/ConversationMessageItem.vue apps/desktop/src/renderer/src/i18n
git commit -m "feat: collapse completed tool cards during streaming and reset manual disclosure"
```

---

### Task 8: 全量验证与收尾

**Files:**
- 无新改动（验证任务；发现问题回对应 Task 修复）

- [ ] **Step 1: 全量检查**

Run: `pnpm verify`
Expected: format:check / typecheck（5 个 tsconfig）/ lint（ESLint+边界+i18n）/ vitest 全量 / build + 渲染器体积预算全部通过

- [ ] **Step 2: 桌面手动验证清单**

Run: `pnpm dev`，逐项确认：
1. 设置 → 通用 → 权限出现三张单选卡，默认仍是"自动通过"；切到"全自动（含删除）"后重启应用仍保持。
2. 会话面板"更多设置"下拉出现第三项"全自动通过"，选择后发送消息，本会话生效；新会话回落到全局档。
3. request-approval 档：让 agent 做一次删除类操作 → 仍弹审批卡（回归不变）。
4. auto-approve 档：删除类操作 → 仍强制人工 + 警告 toast（回归不变）。
5. auto-approve-all 档：删除类操作 → 自动落盘，审批卡短暂出现后自动接受，历史可查；制造版本冲突（外部改文件）→ 冲突卡回退人工。
6. 审批卡 ≥2 张时出现"全部接受/全部拒绝"；全部接受后 toast/状态汇总，冲突卡单独回退。
7. 长 run 中已完成工具折成"已完成 N 项"一行，点开可查；运行中/失败/待确认卡片平铺醒目；消息结束后手动展开过的卡片自动收回。
8. 浅色/深色/自定义强调色、紧凑窗口下新控件无裁切。

- [ ] **Step 3: 分支整理**

确认提交历史干净（每 Task 一笔），无夹带文件：
```bash
git log --oneline main..HEAD && git status --short
```

- [ ] **Step 4: 汇报**

向用户汇报验证结果与手动清单执行情况；推送与 PR 待用户指示。

---

## Self-Review 记录

- 规格覆盖：4.1→Task 1/2；4.2→Task 3；4.3→Task 4/5；4.4→Task 6；4.5→Task 7；4.6→各 Task 测试 + Task 8；4.7→未纳入（by design）。
- 类型一致性：`isAutoApprovalMode`/`shouldForceManualReview`/`splitLiveCollapsedItems`/`actionableApprovalItems`/`clearConversationDisclosureScope` 在生产任务与测试中的签名一致。
- 已知不确定点（实施时以实际代码为准，已在对应 Step 标注）：Task 4 harness mock 细节；Task 6 按钮样式类名与 `longProposalItems` prop 名；Task 7 collapsed 槽位的模板复制。
