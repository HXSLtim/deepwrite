import { describe, expect, it } from "vitest";
import type { ModelConfigInput } from "@deepwrite/contracts";
import { mergeCustomModelSettings } from "./customModelSettings";

function model(id: string, label = id): ModelConfigInput {
  return {
    id,
    label,
    provider: "custom",
    modelId: id,
    api: "openai-completions",
    baseUrl: "",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["medium"],
    temperatureOptions: [0.1, 0.7, 1]
  };
}

describe("mergeCustomModelSettings", () => {
  it("updates edited models in place and appends new ones", () => {
    const custom = model("custom-old");
    const edited = { ...custom, label: "edited" };
    const added = model("custom-new");

    const result = mergeCustomModelSettings(
      [custom],
      [edited, added],
      "custom-old"
    );

    expect(result.models).toEqual([edited, added]);
    expect(result.defaultModelId).toBe("custom-old");
  });

  it("removes models that are no longer part of the custom draft", () => {
    const result = mergeCustomModelSettings(
      [model("deleted"), model("kept")],
      [model("kept")],
      "deleted"
    );

    expect(result.models).toEqual([model("kept")]);
    expect(result.defaultModelId).toBe("kept");
  });

  it("accepts a custom model as the new global default", () => {
    const custom = model("custom");
    const result = mergeCustomModelSettings(
      [model("old")],
      [custom],
      custom.id
    );

    expect(result.defaultModelId).toBe(custom.id);
  });
});
