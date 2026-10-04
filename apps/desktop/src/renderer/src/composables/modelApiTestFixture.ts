import { t } from "../i18n";
import type { DeepWriteApi } from "@deepwrite/contracts";

export function createModelApiTestFixture(): DeepWriteApi["models"] {
  return {
    async list() {
      return { models: [], defaultModelId: "" };
    },
    async save(settings) {
      return {
        defaultModelId: settings.defaultModelId,
        models: settings.models.map((model) => ({
          id: model.id,
          label: model.label,
          provider: model.provider,
          modelId: model.modelId,
          api: model.api,
          baseUrl: model.baseUrl,
          reasoning: model.reasoning,
          defaultThinkingLevel: model.defaultThinkingLevel,
          thinkingLevelOptions: model.thinkingLevelOptions,
          temperatureOptions: model.temperatureOptions,
          hasApiKey: Boolean(model.apiKey)
        }))
      };
    },
    async test(model) {
      return {
        modelId: model.id,
        ok: true,
        message: t("workspace.modelApiTestFixture.connectionSuccessful"),
        testedAt: new Date().toISOString(),
        contextWindow: 272_000,
        maxTokens: 128_000
      };
    },
    async resolveCapacity(model) {
      return {
        modelId: model.id,
        contextWindow: 272_000,
        maxTokens: 128_000
      };
    },
    async listRemote() {
      return { models: [] };
    }
  };
}
