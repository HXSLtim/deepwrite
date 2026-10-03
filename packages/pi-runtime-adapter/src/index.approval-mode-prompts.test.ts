import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  type Api,
  type Context,
  type Model
} from "@earendil-works/pi-ai";
import { vi } from "vitest";
import {
  DEFAULT_LIBRARY_AGENT_PROFILES,
  DEFAULT_LONG_AGENT_PROFILES,
  buildEffectiveSystemPrompt,
  createShortWorkspaceContentRevision,
  describe,
  expect,
  it,
  type LongWorkspaceRuntimeContext
} from "./index.test-support";
import { shortRuntimeSystemRequirements } from "./prompts-writing";
import { resolvePortableToolSchemaProfile } from "./portable-tool-schema";
import { buildRunTools } from "./run-tools";
import { shortProfile, shortWorkspace } from "./short-agent-tools.test-support";

const subagentDefinition = {
  id: "writer",
  name: "写手",
  description: "写作",
  systemPrompt: "完成委派",
  enabled: true,
  modelMode: "inherit" as const
};

describe("DeepWrite Pi runtime adapter: approval-mode prompts", () => {
  it("applies the auto-save library write boundary under auto-approve-all", () => {
    const profile = DEFAULT_LIBRARY_AGENT_PROFILES.find(
      ({ domain }) => domain === "skill"
    )!;

    const prompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_lib_auto_all",
      sessionId: "session_lib_auto_all",
      prompt: "整理条目",
      writeApprovalMode: "auto-approve-all",
      libraryAgentProfile: profile,
      workspaceContext: {
        libraryWorkspace: {
          domain: "skill",
          libraryId: "skill-library-auto-all",
          title: "悬疑写作技能",
          libraryType: "short",
          kind: "general",
          overviewDocumentId: "overview-auto-all",
          overview: "沉淀方法",
          overviewRevision: createShortWorkspaceContentRevision("沉淀方法"),
          readOnly: false,
          projectRevision: 1,
          entries: []
        }
      }
    });

    expect(prompt).toContain("自动批准并尝试保存");
    expect(prompt).not.toContain("待用户审阅的资料库条目");
  });

  it("applies the auto-save short write boundary under auto-approve-all", () => {
    const requirements = shortRuntimeSystemRequirements({
      runId: "run_short_auto_all",
      sessionId: "session_short_auto_all",
      prompt: "修改正文",
      writeApprovalMode: "auto-approve-all",
      agentProfile: shortProfile(),
      workspaceContext: { shortWorkspace: shortWorkspace("character_design") }
    });

    expect(requirements).toContain("后台自动保存队列");
    expect(requirements).not.toContain("待用户审阅的文本变更提案");
  });

  it("tells long subagents proposals enter the auto-save queue under auto-approve-all", async () => {
    const faux = fauxProvider({
      api: "approval-mode-prompts-test",
      provider: "approval-mode-prompts-test",
      tokensPerSecond: 0,
      models: [{ id: "test-model", name: "Test", reasoning: true }]
    });
    faux.setResponses([fauxAssistantMessage("完成")]);
    const models = createModels();
    models.setProvider(faux.provider);
    const contexts: Context[] = [];
    const streamFn: StreamFn = (model, context, options) => {
      contexts.push(context);
      return models.streamSimple(model, context, options);
    };

    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "long"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_auto_all",
      title: "雾港长篇",
      activeRoot: "draft",
      activeAgentId: profile.id,
      activeChapterCardId: "chapter_auto_all",
      navigation: {
        schemaVersion: 1,
        bookId: "longbook_auto_all",
        updatedAt: "2026-10-04T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 1,
          chapterCards: 1,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_auto_all", title: "第一卷", order: 1 }],
        arcs: [
          {
            id: "arc_auto_all",
            volumeId: "volume_auto_all",
            title: "主线",
            order: 1
          }
        ],
        chapterCards: [
          {
            id: "chapter_auto_all",
            volumeId: "volume_auto_all",
            primaryArcId: "arc_auto_all",
            title: "第一章",
            narrativeOrder: 1,
            bodyStatus: "empty"
          }
        ],
        committedThroughChapterId: null
      }
    };

    const tools = buildRunTools(
      {
        runId: "run_long_sub_auto_all",
        sessionId: "session_long_sub_auto_all",
        prompt: "委派整理设定",
        writeApprovalMode: "auto-approve-all",
        longAgentProfile: profile,
        subagentDefinitions: [subagentDefinition],
        workspaceContext: { longWorkspace }
      },
      {
        model: faux.getModel("test-model") as Model<Api>,
        streamFn,
        parentRuntime: {
          provider: "approval-mode-prompts-test",
          model: "test-model",
          mode: "provider"
        },
        thinkingLevel: "off",
        toolExecutionHooks: {},
        requestUserInput: vi.fn(),
        getParentMessages: () => [
          { role: "user", content: "父对话私有内容", timestamp: 1 }
        ],
        portableToolSchemaProfile: resolvePortableToolSchemaProfile({
          longWorkspace
        })
      }
    );

    await tools
      .find((tool) => tool.name === "spawn_subagent")!
      .execute("call", {
        subagent_id: "writer",
        task: "整理设定"
      } as never);

    const text = JSON.stringify(contexts[0]);
    expect(text).toContain("实时自动保存队列");
    expect(text).not.toContain("任何写入仍须形成可审阅提案");
  });
});
