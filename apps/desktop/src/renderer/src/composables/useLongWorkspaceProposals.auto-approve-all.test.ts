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
    const test = harness(true, "auto-approve-all");
    test.previewOperations.mockResolvedValue(previewResult(emptyConfirmation));
    await test.controller.handleEvent(deleteMutationEvent());
    expect(test.applyOperations).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook(proposalBase.bookId)[0]).toMatchObject({
      approvalMode: "auto-approve-all"
    });
  });

  it("still downgrades delete batches under plain auto-approve", async () => {
    const test = harness(true, "auto-approve");
    test.previewOperations.mockResolvedValue(previewResult(emptyConfirmation));
    await test.controller.handleEvent(deleteMutationEvent());
    expect(test.applyOperations).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook(proposalBase.bookId)[0]).toMatchObject({
      approvalMode: "request-approval"
    });
  });
});
