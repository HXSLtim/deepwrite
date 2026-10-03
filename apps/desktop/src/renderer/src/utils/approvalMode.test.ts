import { describe, expect, it } from "vitest";
import { isAutoApprovalMode, shouldForceManualReview } from "./approvalMode";

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
    expect(shouldForceManualReview(undefined, true)).toBe(true);
  });

  it("lets auto-approve-all skip impact confirmation", () => {
    expect(shouldForceManualReview("auto-approve-all", true)).toBe(false);
  });

  it("never forces review without impact confirmation", () => {
    expect(shouldForceManualReview("request-approval", false)).toBe(false);
  });
});
