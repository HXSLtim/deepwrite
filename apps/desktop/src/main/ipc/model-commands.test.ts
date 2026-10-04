import { describe, expect, it, vi } from "vitest";
import {
  CommandEnvelopeSchema,
  createEnvelope,
  type ModelConfig
} from "@deepwrite/contracts";
import type { IpcCommandContext } from "./command-types";
import { handleModelCommands } from "./model-commands";

const writerModel: ModelConfig = {
  id: "custom-writer",
  label: "Custom Writer",
  provider: "deepwrite",
  modelId: "writer-v1",
  api: "openai-completions",
  baseUrl: "https://models.example.test/v1",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
  temperatureOptions: [0.1, 0.7, 1],
  hasApiKey: true
};

describe("model commands", () => {
  it("resolves model capacity without loading stored API credentials", async () => {
    const resolveDraft = vi.fn(async () => {
      throw new Error("API Key 解密失败");
    });
    const requestCommand = vi.fn(async () => ({
      status: "accepted" as const,
      requestId: "cmd_capacity",
      payload: {
        modelId: writerModel.modelId,
        contextWindow: 456_000,
        maxTokens: 32_000
      }
    }));
    const ctx = {
      requireModelConfigStore: () => ({ resolveDraft }),
      supervisor: { requestCommand }
    } as unknown as IpcCommandContext;
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "models.resolveCapacity",
        {
          model: {
            ...writerModel,
            contextWindow: 456_000,
            maxTokens: 32_000
          }
        },
        { id: "cmd_capacity" }
      )
    );

    await expect(handleModelCommands(ctx, command)).resolves.toMatchObject({
      status: "accepted",
      payload: { contextWindow: 456_000, maxTokens: 32_000 }
    });
    expect(resolveDraft).not.toHaveBeenCalled();
    expect(requestCommand).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        type: "agent.model_capacity",
        payload: {
          runtimeConfig: expect.objectContaining({
            apiKey: "",
            contextWindow: 456_000,
            maxTokens: 32_000
          })
        }
      }),
      10_000
    );
  });
});
