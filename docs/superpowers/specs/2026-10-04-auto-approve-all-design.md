# 全自动审批（auto-approve-all）、批量审批与工具卡收起 — 设计文档

- 日期：2026-10-04
- 状态：设计定稿，用户已认可；待实施
- 基线：main @ bd1e58a（当前工作分支 `fix/duplicate-chapter-card-creates` 的父提交）
- 关联：PR #24（fix: 同卷同名章卡去重）与本设计正交，互不依赖

## 1. 背景与痛点

1. 剧情设计变更、删除等 agent 工具操作强制用户逐条确认，写作流程被打断。
2. agent 失控（一回合重复调用 / 父子 subagent 并行）曾批量产生空章节卡；清理积压审批时仍需逐个确认。根因修复已在 PR #24（同 run 双层拦截：contracts 同卷同名校验 + proposal-overlay 记录 chapter.create）。
3. 会话 streaming 中工具卡片平铺在 AI 文字回答之后、不自动收起，长 run 时把回答顶出可视区。

## 2. 现状（侦察核实 @1186ee2，行号为快照值）

- `writeApprovalMode` 仅两档 `request-approval | auto-approve`（`packages/contracts/src/session/runtime.ts` 的 `AgentWriteApprovalModeSchema`）；全局默认 `auto-approve`（general-settings 契约 `GeneralPermissionModeSchema`），会话面板"更多设置"可逐会话覆盖（`ConversationComposer.vue` / `run-settings.ts` / `useConversationModelOptions.ts`）。
- 生效点全部在 Renderer：`useProposalCoordinator.ts`（约 6 处 `=== "auto-approve"` 分支）与长篇 `useLongWorkspaceProposals.ts`（previewMutation → approveCurrent 自动链）；Agent 层不拦截，只改提示文案（`long-agent-tools/context.ts`、`library-agent-tools/mutations.ts`、短篇 `unified-proposal.ts`）。
- **删除/解除关联强制人工**：即使 auto-approve，`impact-policy`（contracts）按模拟结果（entity/relationship/fileIntents 含 delete、ledgerRecordEdits>0）降回 request-approval，按结果判定防改名绕过；`impact_mismatch` 错误同样回退人工。
- 落盘一致性：按 workspace 串行提交队列（`proposal-coordinator/queue.ts` 的 keyedSerialTaskQueue），版本冲突（expectedImpact / catalog baseRevision）回退冲突卡。
- **全仓无批量接受/拒绝 UI**（acceptAll/rejectAll 零命中）；长篇 `LongProposalReview.vue` 与短篇/剧本 `AgentEditProposalCard` 栈均逐卡操作。
- streaming 工具卡：live 块内卡片平铺（`ConversationProcessingTimeline.vue` live 分支），消息完成才整块收起为"已处理 X 秒"；手动展开态存于 `conversationDisclosureState.ts` 且永不重置；写工具卡片不进折叠组（`conversationToolPresentation.ts`）；视口钉底 `useConversationScrollFollow.ts` 持续把文字顶出可视区。

## 3. 决策记录（用户已确认）

| 决策点 | 选择 |
| --- | --- |
| 自动通过边界 | 全自动：档位开启后所有确认（含删除持久数据）自动通过 |
| 开关位置 | 设置页全局档位，持久化；会话面板可逐会话覆盖（沿用现有两级结构） |
| 默认档位 | 保持现状 `auto-approve` 不变，即"含删除的全自动"默认关闭、需显式选择 |
| 实现方案 | 新增第三档 `auto-approve-all` + 批量接受/拒绝 + streaming 收起 |
| 空 ID 章节根因 | 本次不处理（PR #24 已修） |

## 4. 设计

### 4.1 契约层
- `AgentWriteApprovalModeSchema` 增加枚举值 `auto-approve-all`；设置侧 `GeneralPermissionModeSchema` 同步。
- Renderer 需要的新运行时值（枚举常量/选项 schema）从 `packages/contracts/src/renderer.ts` 导出。
- 旧数据兼容：存量仅两值，无需迁移；新值随整包发版，无新旧混布。

### 4.2 设置与传递链
- 设置页通用面板 permissionMode 控件改为三选一 `PopupSelect`：请求审阅 / 自动通过 / 全自动（含删除，不可恢复）。
- 会话面板 PopupSelect 同步增加第三项；会话覆盖全局、关会话回落，行为与现有两档一致。
- 传递链结构不变：`send-message.ts`（approvalModeByAttempt）→ `agent-run-input.ts` → 工具构建输入；缺省 `?? "request-approval"` 保持。

### 4.3 生效点与安全边界
- `useProposalCoordinator.ts` 等约 6 处 `=== "auto-approve"` 分支扩展为含 `auto-approve-all`；长篇 `useLongWorkspaceProposals.ts` 删除降级逻辑对该档放行，删除类直接进按 workspace 串行的自动提交队列（不引入并行落盘）。
- 短篇/剧本各 proposal lane（plot-structure / character-structure / draft-section 等）同样扩展。
- **保留两道回退**：`impact_mismatch`、版本冲突（expectedImpact / baseRevision 不符）仍回退人工——数据一致性保护不随档位放开。
- Agent 层提示文案三档分支化（新档描述为"已提交全自动保存队列（含删除）"语义）。
- 审计不变：proposal 照常生成、自动接受、历史可查。

### 4.4 批量接受/拒绝
- 长篇 `LongProposalReview.vue` 与短篇/剧本 approval-card-stack（`ConversationMessageItem.vue`）各增加"全部接受 / 全部拒绝"。
- 接受按现有串行队列执行；中途冲突的卡单独回退人工、其余继续；结果以 toast 汇总（`ui-feedback.ts`，不占布局）。
- 全部拒绝复用现有单卡 reject 逻辑串行执行。

### 4.5 streaming 工具卡收起
- 纯函数层 `conversationToolPresentation.ts`：live 块内**已完成**的工具项折叠为"已完成 N 项"汇总行（与 foldWorkGroups 同层实现），运行中卡片保持平铺；**失败与待确认项永不折叠**。
- `conversationDisclosureState.ts`：消息结束 streaming 时重置该消息的手动展开记录。
- `ConversationProcessingTimeline.vue` live 分支消费纯函数输出。
- proposal 决策卡（`AgentEditProposalCard` / `LongProposalReview`）不在折叠范围。

### 4.6 测试与验证
- contracts：三档枚举与默认值不变的单测。
- renderer 纯函数：扩展 `conversationToolPresentation.test.ts` / `conversationWorkGroups.test.ts`（折叠、失败不折、重置）。
- coordinator：新档下删除卡自动入队、冲突回退人工的用例。
- `pnpm lint:i18n` 把关文案；`pnpm verify` 全量；桌面手动验证（设置/会话两处切换、批量按钮、streaming 收起、浅/深色主题与紧凑窗口）。

### 4.7 范围外（后续议题）
- 跨 run 并发去重（team 模式 bookId 级 pending-title 注册表）。
- 标题变体绕过的同卷空卡治理。
- "先建卡后写正文"产生的空文件观感优化。
- proposal 决策卡的折叠/收纳。

## 5. 预期改动面（供实施计划定位，行号为 1186ee2 快照）

- `packages/contracts/src/session/runtime.ts`、general-settings 契约、`renderer.ts` 导出
- `apps/desktop/src/renderer/src/`：`GeneralSettingsPanel.vue`、`ConversationComposer.vue`、`useConversationModelOptions.ts`、`agent-conversation/run-settings.ts`、`useProposalCoordinator.ts`、`useLongWorkspaceProposals.ts`、proposal lanes、`LongProposalReview.vue`、`ConversationMessageItem.vue`、`conversationToolPresentation.ts`、`conversationWorkGroups.ts`、`conversationDisclosureState.ts`、`ConversationProcessingTimeline.vue`
- `packages/pi-runtime-adapter/src/`：`long-agent-tools/context.ts`、`library-agent-tools/mutations.ts`、短篇 `unified-proposal.ts`（仅文案分支）
- i18n 中英文案若干

## 修订（2026-10-04，用户验收反馈）

§4.5 streaming 收起语义升级为**整体收起**：streaming 期间处理块默认收起为一行（运行时钟 + 展开按钮），会话默认只显示 AI 文字回复；点开后展示原 live 列表（内层"已完成 N 项"折叠与单工具详情展开沿用当前设计）。审批待决卡与失败项保留在收起容器外可见。原"仅折叠已完成项"（splitLiveCollapsedItems 顶层语义）由"整体收起"取代，该函数降级为展开视图的内层折叠。消息结束后的"已处理 X 秒"收起与手动展开重置行为不变。
