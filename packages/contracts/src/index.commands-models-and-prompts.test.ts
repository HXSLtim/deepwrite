import {
  AgentMessageCompletedEventEnvelopeSchema,
  AgentMessageDeltaEventEnvelopeSchema,
  CommandEnvelopeSchema,
  ExportShortManuscriptResultSchema,
  ModelSettingsInputSchema,
  ModelSettingsSchema,
  PROMPT_IMAGE_ATTACHMENT_MAX_BYTES,
  PROTOCOL_VERSION,
  SessionPromptAcceptedPayloadSchema,
  SystemEventEnvelopeSchema,
  SystemHealthPayloadSchema,
  UserPromptAttachmentsSchema,
  createEnvelope,
  describe,
  expect,
  it,
  runtime,
  shortWorkspaceRuntimeFixture
} from "./index.test-support";
import {
  isDeepSeekWebSearchCompatible,
  ModelConnectionTestResultSchema
} from "./models";
import { SessionPromptCommandPayloadSchema } from "./session/commands";

describe("DeepWrite desktop contracts: commands-models-and-prompts", () => {
  it("creates a versioned command envelope with a correlation id", () => {
    const envelope = createEnvelope("system.health", {}, { id: "cmd_health" });

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      id: "cmd_health",
      type: "system.health",
      context: { correlationId: "cmd_health" }
    });
  });

  it("rejects unknown protocol versions", () => {
    const envelope = createEnvelope("system.health", {}, { id: "cmd_health" });

    expect(() =>
      CommandEnvelopeSchema.parse({ ...envelope, protocolVersion: 2 })
    ).toThrow();
  });

  it("accepts a validated short manuscript export command and result", () => {
    const envelope = createEnvelope(
      "manuscript.exportShort",
      {
        title: "雨夜来信",
        format: "epub" as const,
        sections: [
          { title: "导语", content: "雨落下来。" },
          { title: "第一节", content: "她打开了门。" }
        ]
      },
      { id: "cmd_export_short" }
    );

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      type: "manuscript.exportShort",
      payload: { format: "epub" }
    });
    expect(
      ExportShortManuscriptResultSchema.parse({
        status: "saved",
        filePath: "/tmp/雨夜来信.epub"
      })
    ).toMatchObject({ status: "saved" });
  });

  it("accepts three healthy utility workers", () => {
    const workers = ["core", "agent", "tool"].map((name, index) => ({
      name,
      status: "ok",
      pid: 1000 + index,
      details: {}
    }));

    expect(
      SystemHealthPayloadSchema.parse({
        status: "ok",
        checkedAt: new Date().toISOString(),
        workers
      }).workers
    ).toHaveLength(3);
  });

  it("accepts a prompt with a matching session and live editor snapshot", () => {
    const envelope = createEnvelope(
      "session.prompt",
      {
        sessionId: "session_1",
        message: "续写这一段",
        conversationHistory: [
          {
            role: "user" as const,
            content: "先写一个雨夜开场。",
            createdAt: "2026-08-17T07:58:00.000Z"
          },
          {
            role: "assistant" as const,
            content: "雨水沿着旧站台的铁轨漫开。",
            createdAt: "2026-08-17T07:59:00.000Z"
          }
        ],
        conversationHistoryMode: "replace" as const,
        thinkingLevel: "medium" as const,
        writeApprovalMode: "auto-approve" as const,
        workspaceContext: {
          activeResource: {
            id: "chapter_1",
            domain: "creation" as const,
            title: "第一章",
            path: ["长篇小说", "第一章"],
            format: "markdown",
            source: "live-editor" as const,
            content: "窗外正在下雨。"
          }
        }
      },
      {
        id: "cmd_prompt",
        context: { sessionId: "session_1", resourceId: "chapter_1" }
      }
    );

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      type: "session.prompt",
      payload: {
        conversationHistory: [
          { role: "user", content: "先写一个雨夜开场。" },
          { role: "assistant", content: "雨水沿着旧站台的铁轨漫开。" }
        ],
        conversationHistoryMode: "replace",
        writeApprovalMode: "auto-approve"
      }
    });
  });

  it("accepts only the explicit replace conversation-history mode", () => {
    expect(
      SessionPromptCommandPayloadSchema.parse({
        sessionId: "session_replace",
        message: "从这里重新执行",
        conversationHistoryMode: "replace"
      }).conversationHistoryMode
    ).toBe("replace");
    expect(() =>
      SessionPromptCommandPayloadSchema.parse({
        sessionId: "session_replace",
        message: "从这里重新执行",
        conversationHistoryMode: "append"
      })
    ).toThrow();
  });

  it("accepts agent team mode only for creative workspace prompts", () => {
    for (const agentTeamMode of ["normal", "team"] as const) {
      expect(
        SessionPromptCommandPayloadSchema.parse({
          sessionId: `session_${agentTeamMode}`,
          message: "继续创作",
          agentTeamMode,
          workspaceContext: {
            shortWorkspace: shortWorkspaceRuntimeFixture()
          }
        }).agentTeamMode
      ).toBe(agentTeamMode);
    }
    expect(
      SessionPromptCommandPayloadSchema.parse({
        sessionId: "session_default_mode",
        message: "使用缺省模式"
      }).agentTeamMode
    ).toBeUndefined();
    expect(() =>
      SessionPromptCommandPayloadSchema.parse({
        sessionId: "session_invalid_mode",
        message: "非法模式",
        agentTeamMode: "automatic"
      })
    ).toThrow();
    expect(() =>
      SessionPromptCommandPayloadSchema.parse({
        sessionId: "session_non_creative_mode",
        message: "非创作工作区",
        agentTeamMode: "team"
      })
    ).toThrow();
  });

  it("keeps chat out of session.prompt and allows workspace web search", () => {
    // Chat runs as a "更多功能" agent through extrasAgent.run now.
    const legacyChat = createEnvelope(
      "session.prompt",
      {
        sessionId: "session_chat_1",
        message: "聊聊今天的计划",
        mode: "chat-assistant",
        chatAssistant: { mode: "normal", webSearchEnabled: true }
      },
      { id: "cmd_chat", context: { sessionId: "session_chat_1" } }
    );
    const parsed = CommandEnvelopeSchema.parse(legacyChat) as {
      payload: Record<string, unknown>;
    };
    expect(parsed.payload).not.toHaveProperty("mode");
    expect(parsed.payload).not.toHaveProperty("chatAssistant");

    const workspaceSearch = createEnvelope(
      "session.prompt",
      {
        sessionId: "session_workspace_search",
        message: "查一下近期同类题材",
        thinkingLevel: "medium" as const,
        webSearchEnabled: true
      },
      {
        id: "cmd_workspace_search",
        context: { sessionId: "session_workspace_search" }
      }
    );
    expect(CommandEnvelopeSchema.parse(workspaceSearch)).toMatchObject({
      payload: { webSearchEnabled: true }
    });
  });

  it("restricts DeepSeek web search to the two server-tool APIs", () => {
    expect(
      isDeepSeekWebSearchCompatible({
        provider: " DeepSeek ",
        api: "openai-responses"
      })
    ).toBe(true);
    expect(
      isDeepSeekWebSearchCompatible({
        provider: "DEEPSEEK",
        api: "anthropic-messages"
      })
    ).toBe(true);
    expect(
      isDeepSeekWebSearchCompatible({
        provider: "deepseek",
        api: "openai-completions"
      })
    ).toBe(false);
    expect(
      isDeepSeekWebSearchCompatible({
        provider: "deepseek-official",
        api: "openai-responses"
      })
    ).toBe(false);
  });

  it("accepts extracted text and base64 image prompt attachments", () => {
    const attachments = UserPromptAttachmentsSchema.parse([
      {
        id: "attachment_notes",
        kind: "text",
        name: "notes.md",
        mediaType: "text/markdown",
        size: 18,
        content: "雨夜场景需要更压抑。"
      },
      {
        id: "attachment_reference",
        kind: "image",
        name: "reference.png",
        mediaType: "image/png",
        size: 3,
        data: "AQID"
      }
    ]);

    expect(attachments.map((attachment) => attachment.kind)).toEqual([
      "text",
      "image"
    ]);
    expect(() =>
      UserPromptAttachmentsSchema.parse([
        {
          id: "too_large",
          kind: "image",
          name: "too-large.png",
          mediaType: "image/png",
          size: PROMPT_IMAGE_ATTACHMENT_MAX_BYTES + 1,
          data: "AQID"
        }
      ])
    ).toThrow();
    expect(() =>
      UserPromptAttachmentsSchema.parse([
        {
          id: "forged_size",
          kind: "image",
          name: "forged.png",
          mediaType: "image/png",
          size: 1,
          data: "AQID"
        }
      ])
    ).toThrow();
  });

  it("normalizes public model settings without exposing API keys", () => {
    const settings = ModelSettingsSchema.parse({
      defaultModelId: "deepseek",
      models: [
        {
          id: "deepseek",
          label: "DeepSeek",
          provider: "deepseek",
          modelId: "deepseek-chat",
          api: "openai-completions",
          baseUrl: "https://api.deepseek.com.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "xhigh",
          hasApiKey: true,
          apiKey: "must-not-cross-the-boundary"
        }
      ]
    });

    expect(settings.models[0]?.defaultThinkingLevel).toBe("xhigh");
    expect(settings.models[0]?.thinkingLevelOptions).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]);
    expect(settings.models[0]?.temperatureOptions).toEqual([0.1, 0.7, 1]);
    expect("apiKey" in (settings.models[0] ?? {})).toBe(false);
  });

  it("accepts max and one custom provider thinking level", () => {
    const settings = ModelSettingsInputSchema.parse({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "custom",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://ollama.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "ultra",
          thinkingLevelOptions: [
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
            "ultra"
          ],
          temperatureOptions: [0.1, 0.7, 1]
        }
      ]
    });

    expect(settings.models[0]?.thinkingLevelOptions).toContain("max");
    expect(settings.models[0]?.defaultThinkingLevel).toBe("ultra");
  });

  it("accepts optional custom model context window and max output tokens together", () => {
    const settings = ModelSettingsInputSchema.parse({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "custom",
          modelId: "writer-model",
          api: "openai-completions",
          baseUrl: "https://ollama.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off",
          contextWindow: 32_000,
          maxTokens: 4_096
        }
      ]
    });

    expect(settings.models[0]).toMatchObject({
      contextWindow: 32_000,
      maxTokens: 4_096
    });
  });

  it("rejects incomplete or inverted custom model capacity", () => {
    const model = {
      id: "writer",
      label: "Writer",
      provider: "custom",
      modelId: "writer-model",
      api: "openai-completions" as const,
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off" as const
    };

    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, contextWindow: 32_000 }],
        defaultModelId: "writer"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, maxTokens: 4_096 }],
        defaultModelId: "writer"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, contextWindow: 4_096, maxTokens: 32_000 }],
        defaultModelId: "writer"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, contextWindow: 10, maxTokens: 8 }],
        defaultModelId: "writer"
      })
    ).toThrow();
  });

  it("requires resolved capacity on a successful model connection test", () => {
    const result = ModelConnectionTestResultSchema.parse({
      modelId: "writer",
      ok: true,
      message: "连接成功，模型已返回有效响应。",
      testedAt: "2026-08-25T00:00:00.000Z",
      contextWindow: 272_000,
      maxTokens: 128_000
    });

    expect(result).toMatchObject({
      contextWindow: 272_000,
      maxTokens: 128_000
    });
    expect(() =>
      ModelConnectionTestResultSchema.parse({
        modelId: "writer",
        ok: true,
        message: "连接成功，模型已返回有效响应。",
        testedAt: "2026-08-25T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("rejects invalid model defaults and reasoning defaults", () => {
    const model = {
      id: "plain",
      label: "Plain model",
      provider: "custom",
      modelId: "plain-model",
      api: "openai-completions" as const,
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "high" as const
    };

    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [model],
        defaultModelId: "plain"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, reasoning: true, defaultThinkingLevel: "medium" }],
        defaultModelId: "missing"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [
          {
            ...model,
            reasoning: true,
            defaultThinkingLevel: "high",
            thinkingLevelOptions: ["low", "medium"]
          }
        ],
        defaultModelId: "plain"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [
          {
            ...model,
            defaultThinkingLevel: "off",
            temperatureOptions: [0.7, 0.7, 1]
          }
        ],
        defaultModelId: "plain"
      })
    ).toThrow();
  });

  it("accepts an unsaved model draft for a connection test", () => {
    const envelope = createEnvelope(
      "models.test",
      {
        model: {
          id: "draft-model",
          label: "Draft model",
          provider: "custom",
          modelId: "draft-v1",
          api: "openai-completions" as const,
          baseUrl: "https://ollama.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off" as const,
          apiKey: "not-yet-saved"
        }
      },
      { id: "cmd_test_draft" }
    );

    expect(CommandEnvelopeSchema.parse(envelope).type).toBe("models.test");
  });

  it("accepts a model capacity lookup for an unsaved draft", () => {
    const envelope = createEnvelope(
      "models.resolveCapacity",
      {
        model: {
          id: "draft-model",
          label: "Draft model",
          provider: "custom",
          modelId: "draft-v1",
          api: "openai-completions" as const,
          baseUrl: "https://ollama.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off" as const,
          apiKey: "not-yet-saved"
        }
      },
      { id: "cmd_resolve_capacity" }
    );

    expect(CommandEnvelopeSchema.parse(envelope).type).toBe(
      "models.resolveCapacity"
    );
  });

  it("accepts a remote model list request from an unsaved draft", () => {
    const envelope = createEnvelope(
      "models.listRemote",
      {
        id: "draft-model",
        provider: "custom",
        api: "openai-completions" as const,
        baseUrl: "https://api.example.test/v1",
        apiKey: "not-a-real-key"
      },
      { id: "cmd_list_remote" }
    );

    expect(CommandEnvelopeSchema.parse(envelope).type).toBe(
      "models.listRemote"
    );
  });

  it("rejects blank prompts and mismatched session context", () => {
    const blank = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "   " },
      { id: "cmd_blank", context: { sessionId: "session_1" } }
    );
    const mismatch = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "继续" },
      { id: "cmd_mismatch", context: { sessionId: "session_2" } }
    );

    expect(() => CommandEnvelopeSchema.parse(blank)).toThrow();
    expect(() => CommandEnvelopeSchema.parse(mismatch)).toThrow();
  });

  it("validates a session abort against its session and run context", () => {
    const abort = createEnvelope(
      "session.abort",
      { sessionId: "session_1", runId: "run_1" },
      {
        id: "cmd_abort",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );
    const mismatch = createEnvelope(
      "session.abort",
      { sessionId: "session_1", runId: "run_1" },
      {
        id: "cmd_abort_mismatch",
        context: { sessionId: "session_1", runId: "run_2" }
      }
    );

    expect(CommandEnvelopeSchema.parse(abort).type).toBe("session.abort");
    expect(() => CommandEnvelopeSchema.parse(mismatch)).toThrow();
  });

  it("validates quick acceptance independently from streamed events", () => {
    expect(
      SessionPromptAcceptedPayloadSchema.parse({
        sessionId: "session_1",
        runId: "run_1",
        acceptedAt: new Date().toISOString(),
        runtime
      })
    ).toMatchObject({ runId: "run_1", runtime });
  });

  it("accepts delta and completion events with consistent envelope identity", () => {
    const delta = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "第一段",
        runtime
      },
      {
        id: "event_delta",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );
    const completed = createEnvelope(
      "agent.message_completed",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        role: "assistant" as const,
        content: "第一段",
        thinking: "先理解上下文。",
        stopReason: "stop",
        runtime
      },
      {
        id: "event_completed",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );

    expect(
      AgentMessageDeltaEventEnvelopeSchema.parse(delta).payload.delta
    ).toBe("第一段");
    expect(
      AgentMessageCompletedEventEnvelopeSchema.parse(completed).payload.content
    ).toBe("第一段");
    expect(SystemEventEnvelopeSchema.parse(completed).type).toBe(
      "agent.message_completed"
    );
  });
});
