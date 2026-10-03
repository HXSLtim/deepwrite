import type { AgentApprovalMode } from "../types/conversation";

export function isAgentApprovalModeValue(
  value: unknown
): value is AgentApprovalMode {
  return (
    value === "request-approval" ||
    value === "auto-approve" ||
    value === "auto-approve-all"
  );
}

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
