import { safeStorage } from "electron";
import type { ModelSettingsInput } from "@deepwrite/contracts";
import { toDiskModel } from "./model-config-persistence";
import type { ModelConfigState } from "./model-config-persistence";
import type { ModelConfigSnapshot } from "./model-config-state";

export function editModelSettings(
  input: ModelSettingsInput,
  { settings, secrets }: ModelConfigSnapshot
): ModelConfigState {
  const encryptedApiKeys: Record<string, string> = {};
  for (const model of input.models) {
    const apiKey = model.apiKey?.trim();
    if (apiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "当前系统安全存储不可用，DeepWrite 不会把 API Key 以明文写入磁盘。"
        );
      }
      encryptedApiKeys[model.id] = safeStorage
        .encryptString(apiKey)
        .toString("base64");
    } else if (!model.clearApiKey && model.sourceApiKeyId) {
      const source = settings.models.find(
        (entry) => entry.id === model.sourceApiKeyId
      );
      if (
        !source ||
        source.provider !== model.provider ||
        source.api !== model.api ||
        source.baseUrl !== model.baseUrl ||
        !secrets.encryptedApiKeys[source.id]
      ) {
        throw new Error("无法复用原模型密钥，请重新填写 API Key 后批量保存。");
      }
      encryptedApiKeys[model.id] = secrets.encryptedApiKeys[source.id]!;
    } else if (!model.clearApiKey && secrets.encryptedApiKeys[model.id]) {
      encryptedApiKeys[model.id] = secrets.encryptedApiKeys[model.id]!;
    }
  }
  return {
    settings: {
      ...settings,
      defaultModelId: input.defaultModelId,
      models: input.models.map(toDiskModel)
    },
    secrets: { version: 1, encryptedApiKeys }
  };
}
