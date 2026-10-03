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
