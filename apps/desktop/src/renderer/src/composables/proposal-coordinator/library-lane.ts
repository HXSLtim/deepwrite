import { formatError } from "../../i18n/errors";
import { isAutoApprovalMode } from "../../utils/approvalMode";
import { createScopedTranslator } from "../../i18n";
import {
  MaterialStageIdSchema,
  SkillStageIdSchema,
  createShortWorkspaceContentRevision
} from "@deepwrite/contracts";
import type { AgentEditProposal } from "../../types/conversation";
import type { WorkspaceDocument } from "../../types/workspace";
import {
  agentEditProposalId,
  expectedMutationBaseRevision
} from "../../utils/agentEditReview";
import { buildAgentTextDiff } from "../../utils/agentTextDiff";
import type { AgentConversationController } from "../useAgentConversation";
import type {
  AgentEditReviewRequest,
  LibraryEditorMutationEvent,
  ProposalLaneContext
} from "./types";

const t = createScopedTranslator("workspace");

export function createLibraryLane(ctx: ProposalLaneContext) {
  const {
    api,
    uiMessage,
    findCatalogLibrary,
    loadCatalogSnapshot,
    applyCreatedLibraryEntry,
    isCatalogConflict,
    documents,
    liveWorkspaceDocuments,
    acceptingAgentEditWorkspaceIds,
    rememberWorkspaceMutationEvent,
    setAgentEditWorkspaceAccepting,
    allConversations,
    selectedResourceId,
    rightCollapsed
  } = ctx;

  const queueAgentEdit: ProposalLaneContext["queueAgentEdit"] = (...args) =>
    ctx.queueAgentEdit(...args);

  const acceptedLibraryMutationCounts = new Map<string, number>();
  ctx.acceptedLibraryMutationCounts = acceptedLibraryMutationCounts;

  function libraryMutationCountKey(proposal: AgentEditProposal): string {
    const target = proposal.libraryTarget!;
    return `${proposal.runId}\u0000${target.domain}\u0000${target.libraryId}`;
  }

  function currentLibraryProjectRevisionMatches(
    proposal: AgentEditProposal,
    currentRevision: number | undefined
  ): boolean {
    const baseRevision = proposal.libraryTarget?.baseProjectRevision;
    if (baseRevision === undefined || currentRevision === undefined) {
      return baseRevision === currentRevision;
    }
    const acceptedCount =
      acceptedLibraryMutationCounts.get(libraryMutationCountKey(proposal)) ?? 0;
    return currentRevision === baseRevision + acceptedCount;
  }

  function rememberAcceptedLibraryMutation(proposal: AgentEditProposal): void {
    const key = libraryMutationCountKey(proposal);
    acceptedLibraryMutationCounts.set(
      key,
      (acceptedLibraryMutationCounts.get(key) ?? 0) + 1
    );
    while (acceptedLibraryMutationCounts.size > 2_000) {
      const oldest = acceptedLibraryMutationCounts.keys().next().value as
        string | undefined;
      if (!oldest) break;
      acceptedLibraryMutationCounts.delete(oldest);
    }
  }

  async function acceptLibraryCreationProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.libraryTarget;
    if (
      !target ||
      target.operation !== "create" ||
      typeof proposal.proposedText !== "string"
    ) {
      const message = t(
        "proposalCoordinator.thePendingNewEntryIsMissingCompleteContentGenerate"
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const currentApi = api();
    if (!currentApi) {
      const message = t("short.theDesktopFileServiceIsUnavailable");
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const library = findCatalogLibrary(target.domain, target.libraryId);
    const readOnly =
      !library ||
      (target.domain === "skill" &&
        "isBuiltin" in library &&
        library.isBuiltin);
    if (readOnly) {
      const message = t(
        "proposalCoordinator.theDestinationLibraryIsUnavailableOrReadOnlyThe"
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (
      !currentLibraryProjectRevisionMatches(proposal, library.projectRevision)
    ) {
      const message = t(
        "proposalCoordinator.theLibraryDirectoryChangedNoEntryWasCreatedGenerate"
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      uiMessage.info(
        t("proposalCoordinator.otherEditsToThisLibraryAreBeingSavedWait")
      );
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? t(
            "proposalCoordinator.automaticallyApprovingAndCreatingTheLibraryEntry"
          )
        : t("proposalCoordinator.checkingTheLibraryVersionAndCreatingTheEntry")
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    try {
      const commonInput = {
        libraryId: target.libraryId,
        title: proposal.title,
        content: proposal.proposedText,
        ...(library.projectRevision === undefined
          ? {}
          : { baseProjectRevision: library.projectRevision })
      };
      const created =
        target.domain === "material"
          ? await currentApi.catalog.createLibraryEntry({
              ...commonInput,
              domain: "material",
              stageId: MaterialStageIdSchema.parse(target.stageId)
            })
          : await currentApi.catalog.createLibraryEntry({
              ...commonInput,
              domain: "skill",
              stageId: SkillStageIdSchema.parse(target.stageId)
            });
      const nextProjectRevision =
        library.projectRevision === undefined
          ? undefined
          : library.projectRevision + 1;
      await applyCreatedLibraryEntry(
        target.domain,
        target.libraryId,
        created,
        nextProjectRevision
      );
      rememberAcceptedLibraryMutation(proposal);
      const createdDocument = documents.value.find(
        (document) =>
          document.domain === target.domain &&
          document.libraryId === target.libraryId &&
          document.catalogEntryId === created.id
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        ...(createdDocument ? { documentId: createdDocument.id } : {}),
        libraryTarget: {
          ...target,
          entryId: created.id
        },
        statusMessage: automatic
          ? t("proposalCoordinator.libraryEntryAutomaticallyApprovedAndCreated")
          : t("proposalCoordinator.createdAndSavedToLocalMarkdown")
      });
      if (createdDocument) {
        selectedResourceId.value = createdDocument.id;
        rightCollapsed.value = false;
      }
      uiMessage.success(
        automatic
          ? t(
              "proposalCoordinator.libraryEntryAutomaticallyApprovedAndCreated2"
            )
          : t("proposalCoordinator.libraryEntryCreated")
      );
    } catch (error: unknown) {
      const message = isCatalogConflict(error)
        ? t(
            "proposalCoordinator.theLibraryWasUpdatedExternallyNoEntryWasCreated"
          )
        : formatError(
            error,
            t(
              "catalogLibraryTransactionsCoordinator.failedToCreateLibraryEntry"
            )
          );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: isCatalogConflict(error) ? "conflict" : "error",
        statusMessage: message
      });
      if (isCatalogConflict(error)) {
        await loadCatalogSnapshot();
        uiMessage.warning(message);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  function stageLibraryEditProposal(event: LibraryEditorMutationEvent): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = allConversations().find((conversation) =>
      conversation.acceptsRunEvent(event.payload.sessionId, event.payload.runId)
    );
    if (!sourceConversation) return;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";

    const library = findCatalogLibrary(
      event.payload.domain,
      event.payload.libraryId
    );
    const libraryReadOnly =
      !library ||
      (event.payload.domain === "skill" &&
        "isBuiltin" in library &&
        library.isBuiltin);
    let target: WorkspaceDocument | undefined;
    if (event.payload.operation === "edit") {
      const editPayload = event.payload;
      target = liveWorkspaceDocuments.value.find(
        (document) =>
          document.id === editPayload.documentId &&
          document.domain === editPayload.domain &&
          document.libraryId === editPayload.libraryId &&
          document.catalogEntryId === editPayload.entryId
      );
    } else if (event.payload.operation === "edit-overview") {
      const overviewPayload = event.payload;
      target = liveWorkspaceDocuments.value.find(
        (document) =>
          document.id === overviewPayload.documentId &&
          document.domain === overviewPayload.domain &&
          document.libraryId === overviewPayload.libraryId &&
          document.catalogLibraryField === "overview"
      );
    }
    if (
      libraryReadOnly ||
      (event.payload.operation !== "create" && (!target || target.readOnly))
    ) {
      const message = t(
        "libraryLane.theTargetLibraryOrEntryIsNotWritableThese"
      );
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const scopeId = `library:${event.payload.domain}:${event.payload.libraryId}`;
    const documentId =
      event.payload.operation !== "create"
        ? event.payload.documentId
        : `library-create:${event.payload.toolCallId}`;
    const proposalId = agentEditProposalId(
      event.payload.runId,
      scopeId,
      "library",
      documentId
    );
    const existing = sourceConversation.getEditProposal(
      event.payload.runId,
      proposalId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;

    const currentText = target?.content ?? "";
    const currentRevision = createShortWorkspaceContentRevision(currentText);
    const expectedBaseRevision = expectedMutationBaseRevision(
      existing,
      currentText
    );
    if (
      event.payload.baseRevision !== expectedBaseRevision ||
      (existing !== undefined && currentRevision !== existing.baseRevision)
    ) {
      const message = t(
        "libraryLane.theLibraryContentVersionChangedTheseAgentChangesWere"
      );
      if (existing) {
        sourceConversation.updateEditProposal(event.payload.runId, proposalId, {
          status: "conflict",
          statusMessage: message,
          updatedAt: event.timestamp
        });
      }
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const proposedText = event.payload.text;
    const proposedRevision = createShortWorkspaceContentRevision(proposedText);
    const diff = buildAgentTextDiff(currentText, proposedText);
    const noChanges =
      event.payload.operation !== "create" &&
      proposedRevision === (existing?.baseRevision ?? currentRevision) &&
      event.payload.title === target?.title;
    const proposal: AgentEditProposal = {
      id: proposalId,
      approvalMode: runApprovalMode,
      runId: event.payload.runId,
      workspaceId: scopeId,
      stageId: "library",
      documentId,
      title: event.payload.title,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: existing?.baseRevision ?? event.payload.baseRevision,
      proposedRevision,
      ...(noChanges ? {} : { proposedText }),
      toolCallIds: [
        ...new Set([...(existing?.toolCallIds ?? []), event.payload.toolCallId])
      ],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges
        ? {
            statusMessage: t(
              "libraryLane.theLibraryContentHasNotChangedNoSaveIs"
            )
          }
        : {}),
      createdAt: existing?.createdAt ?? event.timestamp,
      updatedAt: event.timestamp,
      libraryTarget: {
        operation: event.payload.operation,
        domain: event.payload.domain,
        libraryId: event.payload.libraryId,
        ...(event.payload.operation === "edit-overview"
          ? {}
          : { stageId: event.payload.stageId }),
        ...(event.payload.baseProjectRevision === undefined
          ? {}
          : { baseProjectRevision: event.payload.baseProjectRevision }),
        ...(event.payload.operation === "edit"
          ? { entryId: event.payload.entryId }
          : {})
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && isAutoApprovalMode(runApprovalMode)) {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposalId,
        true,
        true
      );
    }
  }

  return {
    libraryMutationCountKey,
    currentLibraryProjectRevisionMatches,
    rememberAcceptedLibraryMutation,
    acceptLibraryCreationProposal,
    stageLibraryEditProposal
  };
}
