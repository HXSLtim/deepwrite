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
