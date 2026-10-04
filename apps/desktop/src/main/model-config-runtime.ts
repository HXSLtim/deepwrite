import { safeStorage } from "electron";
import {
  AgentProviderRuntimeConfigSchema,
  type AgentProviderRuntimeConfig,
  type ModelConfigInput
} from "@deepwrite/contracts";
import type { ModelConfigSnapshot } from "./model-config-state";

export function decryptModelKey(encrypted: string | undefined): string {
  if (!encrypted) return "";
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储当前不可用，无法解密这个模型的 API Key。");
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    throw new Error("模型 API Key 解密失败，请在模型配置中重新填写并保存。");
  }
}

/**
 * Resolves the runtime config for a run. A stale `modelId` (for example a
 * session preference that still points at a removed managed model) falls back
 * to the effective default instead of failing the run.
 */
export function resolveSavedModel(
  state: ModelConfigSnapshot,
  modelId?: string
): AgentProviderRuntimeConfig | undefined {
  const models = state.settings.models;
  if (models.length === 0) return undefined;
  const requested = modelId
    ? models.find((model) => model.id === modelId)
    : undefined;
  const model =
    requested ??
    models.find((entry) => entry.id === state.settings.defaultModelId) ??
    models[0]!;
  return AgentProviderRuntimeConfigSchema.parse({
    ...model,
    apiKey: decryptModelKey(state.secrets.encryptedApiKeys[model.id])
  });
}

export function resolveDraftModel(
  parsedModel: ModelConfigInput,
  state: ModelConfigSnapshot
): AgentProviderRuntimeConfig {
  let apiKey = parsedModel.apiKey ?? "";
  if (!apiKey && !parsedModel.clearApiKey) {
    apiKey = decryptModelKey(
      state.secrets.encryptedApiKeys[
        parsedModel.sourceApiKeyId ?? parsedModel.id
      ]
    );
  }
  const {
    apiKey: _apiKey,
    clearApiKey: _clearApiKey,
    ...identity
  } = parsedModel;
  return AgentProviderRuntimeConfigSchema.parse({ ...identity, apiKey });
}
