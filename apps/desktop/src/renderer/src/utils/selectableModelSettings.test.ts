import { describe, expect, it } from "vitest";
import type { ModelConfig, ModelSettings } from "@deepwrite/contracts";
import {
  selectableModelSettings,
  selectableModels
} from "./selectableModelSettings";

function model(id: string): ModelConfig {
  return {
    id,
    label: id,
    provider: "example",
    modelId: id,
    api: "openai-completions",
    baseUrl: "https://models.example.test/v1",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["low"],
    temperatureOptions: [0.1, 0.7, 1],
    hasApiKey: true
  };
}

describe("selectableModelSettings", () => {
  it("keeps every configured model selectable", () => {
    const settings: ModelSettings = {
      models: [model("custom-a"), model("custom-b")],
      defaultModelId: "custom-b"
    };

    expect(selectableModels(settings.models).map((entry) => entry.id)).toEqual([
      "custom-a",
      "custom-b"
    ]);
    expect(selectableModelSettings(settings)).toBe(settings);
  });
});
