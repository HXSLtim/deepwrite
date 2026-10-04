import { ModelSettingsSchema, type ModelSettings } from "@deepwrite/contracts";
import {
  isLegacyManagedModelEntry,
  toDiskModel,
  type DiskModelConfig,
  type DiskModelSecrets,
  type DiskModelSettings,
  type ModelConfigState
} from "./model-config-persistence";

export type ModelConfigSnapshot = ModelConfigState;

export function toPublicSettings(
  settings: DiskModelSettings,
  secrets: DiskModelSecrets
): ModelSettings {
  return ModelSettingsSchema.parse({
    defaultModelId: settings.defaultModelId,
    models: settings.models.map((model) => ({
      ...model,
      hasApiKey: Boolean(secrets.encryptedApiKeys[model.id])
    }))
  });
}

function customModels(models: DiskModelConfig[]): DiskModelConfig[] {
  // Disk normalization already drops managed entries; this second filter
  // guards direct-write paths such as device-sync reconciliation.
  return models
    .filter((model) => !isLegacyManagedModelEntry(model))
    .map(toDiskModel);
}

/**
 * Keeps every commit canonical: only surviving custom models, a default model
 * id that references one of them (or empty when none remain), and secrets
 * pruned to exactly those model ids.
 */
export function synchronizeState(
  settings: DiskModelSettings,
  secrets: DiskModelSecrets
): [DiskModelSettings, DiskModelSecrets] {
  const models = customModels(settings.models);
  const defaultModelId = models.some(
    (model) => model.id === settings.defaultModelId
  )
    ? settings.defaultModelId
    : (models[0]?.id ?? "");
  const knownIds = new Set(models.map((model) => model.id));
  const encryptedApiKeys = Object.fromEntries(
    Object.entries(secrets.encryptedApiKeys).filter(([id]) => knownIds.has(id))
  );
  return [
    { version: 2, defaultModelId, models },
    { version: 1, encryptedApiKeys }
  ];
}
