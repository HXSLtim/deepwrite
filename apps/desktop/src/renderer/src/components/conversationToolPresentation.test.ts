import { describe, expect, it } from "vitest";
import type {
  AgentEditProposal,
  AgentToolTrace,
  ChatMessage
} from "../types/conversation";
import {
  actionableApprovalItems,
  approvalItemsForMessage,
  processingDisplayItems,
  processingItems,
  processingLabel,
  visibleResponse,
  workspaceToolLabel
} from "./conversationToolPresentation";
import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";

const startedAt = "2026-01-01T00:00:00.000Z";

function tool(
  id: string,
  status: AgentToolTrace["status"] = "completed"
): AgentToolTrace {
  return {
    id,
    name: id === "search" ? "web_search" : "read_workspace_content",
    args: { query: id },
    status,
    requestedAt: startedAt,
    ...(status === "completed" ? { resultSummary: `${id} 完成` } : {})
  };
}

function orderedMessage(
  status: NonNullable<ChatMessage["status"]>
): ChatMessage {
  return {
    id: "message_ordered",
    role: "assistant",
    content: status === "completed" ? "最终回复" : "阶段回答 A阶段回答 B",
    createdAt: startedAt,
    processingStartedAt: startedAt,
    ...(status === "completed"
      ? { processingCompletedAt: "2026-01-01T00:00:06.000Z" }
      : {}),
    status,
    toolCalls: [tool("read"), tool("search")],
    processingSteps: [
      {
        id: "thinking-a",
        type: "thinking",
        content: "思考 A",
        createdAt: "2026-01-01T00:00:01.000Z"
      },
      {
        id: "response-a",
        type: "response",
        content: "阶段回答 A",
        createdAt: "2026-01-01T00:00:02.000Z"
      },
      {
        id: "tool-a",
        type: "tool",
        toolCallId: "read",
        createdAt: "2026-01-01T00:00:03.000Z"
      },
      {
        id: "thinking-b",
        type: "thinking",
        content: "思考 B",
        createdAt: "2026-01-01T00:00:04.000Z"
      },
      {
        id: "response-b",
        type: "response",
        content: "阶段回答 B",
        createdAt: "2026-01-01T00:00:05.000Z"
      },
      {
        id: "tool-b",
        type: "tool",
        toolCallId: "search",
        createdAt: "2026-01-01T00:00:05.500Z"
      },
      ...(status === "completed"
        ? [
            {
              id: "response-final",
              type: "response" as const,
              content: "最终回复",
              createdAt: "2026-01-01T00:00:06.000Z"
            }
          ]
        : [])
    ]
  };
}

describe("conversation tool presentation", () => {
  it("offers undo for a saved short-story edit even when its tool trace is absent", () => {
    const proposal: AgentEditProposal = {
      id: "plot-edit",
      runId: "run-1",
      workspaceId: "short-book-1",
      stageId: "plot_design",
      documentId: "plot_design",
      title: "剧情设计",
      summary: "调整剧情设计",
      status: "accepted",
      baseRevision: "before",
      proposedRevision: "after",
      toolCallIds: ["edit-tool-1"],
      additions: 2,
      deletions: 1,
      hunks: [],
      createdAt: startedAt,
      updatedAt: startedAt,
      discardSnapshot: { beforeText: "修改前", beforeTitle: "剧情设计" }
    };
    const message: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "已调整",
      createdAt: startedAt,
      status: "completed",
      editProposals: [proposal]
    };

    expect(approvalItemsForMessage(message, [])).toMatchObject([
      { type: "edit-proposal", canDiscard: true }
    ]);
  });

  it("preserves interleaved thinking, responses and tools while streaming", () => {
    const message = orderedMessage("streaming");

    expect(processingItems(message).map((item) => item.type)).toEqual([
      "thinking",
      "response",
      "tool",
      "thinking",
      "response",
      "tool"
    ]);
    expect(processingDisplayItems(message).map((item) => item.type)).toEqual([
      "work-group",
      "response",
      "work-group",
      "response",
      "work-group"
    ]);
    const groups = processingDisplayItems(message).filter(
      (item) => item.type === "work-group"
    );
    expect(groups.map((item) => item.running)).toEqual([false, false, true]);
    expect(visibleResponse(message)).toBe("");
  });

  it("moves only the final completed response outside the processing history", () => {
    const message = orderedMessage("completed");

    expect(
      processingItems(message)
        .filter((item) => item.type === "response")
        .map((item) => item.content)
    ).toEqual(["阶段回答 A", "阶段回答 B"]);
    expect(visibleResponse(message)).toBe("最终回复");
    expect(processingLabel(message, Date.parse(startedAt))).toBe("已处理 6秒");
    expect(
      processingLabel(
        orderedMessage("streaming"),
        Date.parse(startedAt) + 3_000
      )
    ).toBe("已处理 3秒");
    expect(
      processingDisplayItems(message)
        .filter((item) => item.type === "work-group")
        .every((item) => item.type === "work-group" && !item.running)
    ).toBe(true);
  });

  it("advances processed time from seconds to minutes and seconds", () => {
    const message = orderedMessage("completed");
    for (const [durationSeconds, label] of [
      [59, "已处理 59秒"],
      [60, "已处理 1分0秒"],
      [61, "已处理 1分1秒"],
      [125, "已处理 2分5秒"]
    ] as const) {
      message.processingCompletedAt = new Date(
        Date.parse(startedAt) + durationSeconds * 1_000
      ).toISOString();
      expect(processingLabel(message, Date.parse(startedAt))).toBe(label);
    }
  });

  it("supports legacy thinking and tool fields", () => {
    const message: ChatMessage = {
      id: "message_legacy",
      role: "assistant",
      content: "旧回复",
      createdAt: startedAt,
      thinking: "旧思考",
      toolCalls: [tool("read")],
      status: "completed"
    };

    expect(processingItems(message).map((item) => item.type)).toEqual([
      "thinking",
      "tool"
    ]);
    expect(processingDisplayItems(message).map((item) => item.type)).toEqual([
      "work-group"
    ]);
    expect(visibleResponse(message)).toBe("旧回复");
  });

  it("provides Chinese labels for chat-assistant tools", () => {
    expect(workspaceToolLabel("list_creation_projects")).toBe("列出创作项目");
    expect(workspaceToolLabel("query_model_usage")).toBe("查询模型用量");
    expect(workspaceToolLabel("list")).toBe("列出范围细节");
    expect(workspaceToolLabel("search_continuity_files")).toBe(
      "搜索连续性文件"
    );
    expect(workspaceToolLabel("web_search")).toBe("智能搜索");
  });
});

describe("actionableApprovalItems", () => {
  function editProposal(
    id: string,
    status: AgentEditProposal["status"],
    createdAt: string
  ): AgentEditProposal {
    return {
      id,
      runId: "run-approve",
      workspaceId: "short-book-1",
      stageId: "plot_design",
      documentId: "plot_design",
      title: "剧情设计",
      summary: "调整剧情设计",
      status,
      baseRevision: "before",
      proposedRevision: "after",
      toolCallIds: ["edit-tool-1"],
      additions: 2,
      deletions: 1,
      hunks: [],
      createdAt,
      updatedAt: createdAt,
      discardSnapshot: { beforeText: "修改前", beforeTitle: "剧情设计" }
    };
  }

  function longItem(
    eventId: string,
    status: LongWorkspaceProposalItem["status"],
    timestamp: string
  ): LongWorkspaceProposalItem {
    return {
      event: {
        id: eventId,
        type: "long.mutation_proposal",
        timestamp,
        payload: {
          sessionId: "session-1",
          runId: "run-approve",
          toolCallId: "tool-long",
          bookId: "longbook_test",
          agentId: "long",
          summary: "结构调整",
          batch: { updatedAt: timestamp, operations: [], documentWrites: [] }
        }
      },
      approvalMode: "request-approval",
      status
    } as unknown as LongWorkspaceProposalItem;
  }

  it("returns pending edit proposals and ready long proposals only", () => {
    const message: ChatMessage = {
      id: "assistant-batch",
      role: "assistant",
      content: "已生成提案",
      createdAt: startedAt,
      status: "completed",
      runId: "run-approve",
      editProposals: [
        editProposal("pending-edit", "pending", "2026-01-01T00:00:01.000Z"),
        editProposal("accepted-edit", "accepted", "2026-01-01T00:00:04.000Z")
      ]
    };
    const longItems = [
      longItem("event_ready", "ready", "2026-01-01T00:00:02.000Z"),
      longItem("event_accepted", "accepted", "2026-01-01T00:00:05.000Z")
    ];

    const items = actionableApprovalItems(message, longItems);
    expect(items.map((item) => item.id)).toEqual([
      "edit:pending-edit",
      "long:event_ready"
    ]);
  });

  it("returns empty when nothing is actionable", () => {
    const emptyMessage: ChatMessage = {
      id: "assistant-empty",
      role: "assistant",
      content: "无需审批",
      createdAt: startedAt,
      status: "completed"
    };
    expect(actionableApprovalItems(emptyMessage, [])).toEqual([]);
  });
});
