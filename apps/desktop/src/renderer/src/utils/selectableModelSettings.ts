import type { ModelConfig, ModelSettings } from "@deepwrite/contracts";

/** Every configured model is selectable now that managed catalogs are gone. */
export function selectableModels(
  models: readonly ModelConfig[]
): ModelConfig[] {
  return [...models];
}

export function selectableModelSettings(
  settings: ModelSettings
): ModelSettings {
  return settings;
}
