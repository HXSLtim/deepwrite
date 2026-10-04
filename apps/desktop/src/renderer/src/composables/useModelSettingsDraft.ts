import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { computed, ref, watch } from "vue";
import { BUILT_IN_REASONING_LEVELS } from "@deepwrite/contracts";
import type {
  ModelConfigInput,
  ModelSettings,
  ModelSettingsInput
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import { useSettingsStore } from "../stores/settingsStore";
import { uiMessage } from "../ui-feedback";
import { applyBatchModelSettings } from "../utils/batchModelSettings";
import { resolveSavedModelLabel } from "../utils/customModelLabel";
import { mergeCustomModelSettings } from "../utils/customModelSettings";
import {
  cloneDraftModel,
  findCustomThinkingLevel,
  toModelInput,
  type DraftModel,
  type ModelConfigRow
} from "../components/modelSettingsDraft";
import type { ModelEditorSavePayload } from "./useModelEditor";

const t = createScopedTranslator("workspace");

export interface ModelSettingsDraftProps {
  active: boolean;
  modelScope: "all" | "custom";
  modelSettings: ModelSettings | null;
  modelLoading: boolean;
  modelSaving: boolean;
  modelError: string | null;
  modelTestMessage: string | null;
  testingModelId: string | null;
}

export interface ModelSettingsDraftActions {
  saveModels(settings: ModelSettingsInput): void;
  testModel(model: ModelConfigInput): void;
  editorOpened(): void;
}

export function useModelSettingsDraft(
  props: ModelSettingsDraftProps,
  actions: ModelSettingsDraftActions
) {
  const settingsStore = useSettingsStore();
  const draftModels = ref<DraftModel[]>([]);
  const draftDefaultModelId = ref("");
  const modelEditor = ref<DraftModel | null>(null);
  const advancedConfigModel = ref<DraftModel | null>(null);
  const modelConfigRows = computed<ModelConfigRow[]>(() => {
    const rows: ModelConfigRow[] = [];
    const editedModelId = modelEditor.value?.originalId;
    for (const model of draftModels.value) {
      rows.push({ key: `model:${model.id}`, type: "model", model });
      if (editedModelId === model.id) {
        rows.push({ key: `editor:${model.id}`, type: "editor" });
      }
    }
    if (modelEditor.value && !editedModelId) {
      rows.push({ key: `editor:${modelEditor.value.id}`, type: "editor" });
    }
    return rows;
  });

  function resetModelDraft(settings: ModelSettings | null): void {
    draftModels.value = (settings?.models ?? []).map((model) =>
      cloneDraftModel({
        ...model,
        customThinkingLevel: findCustomThinkingLevel(model.thinkingLevelOptions)
      })
    );
    draftDefaultModelId.value = settings?.defaultModelId ?? "";
    modelEditor.value = null;
    advancedConfigModel.value = null;
  }

  function applyCapacityDefaults(capacity: {
    modelId: string;
    contextWindow: number;
    maxTokens: number;
  }): void {
    const apply = (model: DraftModel): DraftModel => {
      if (model.id !== capacity.modelId) return model;
      if (model.contextWindow !== undefined && model.maxTokens !== undefined) {
        return model;
      }
      return {
        ...model,
        contextWindow: capacity.contextWindow,
        maxTokens: capacity.maxTokens
      };
    };
    draftModels.value = draftModels.value.map(apply);
    if (modelEditor.value) {
      modelEditor.value = apply(modelEditor.value);
    }
    if (advancedConfigModel.value) {
      advancedConfigModel.value = apply(advancedConfigModel.value);
    }
  }

  watch(
    () => props.active,
    (active) => {
      if (active) resetModelDraft(props.modelSettings);
    },
    { immediate: true }
  );

  watch(
    () => [props.modelSettings, props.modelSaving] as const,
    ([settings, saving]) => {
      if (props.active && !saving && !(props.modelError && modelEditor.value)) {
        resetModelDraft(settings);
      }
    }
  );

  watch(
    () => settingsStore.lastModelTestCapacity,
    (capacity) => {
      if (!props.active || !capacity) return;
      applyCapacityDefaults(capacity);
    }
  );

  function createModel(): void {
    if (props.modelSaving) return;
    modelEditor.value = {
      id: createId("model"),
      label: "",
      provider: "deepseek",
      modelId: "",
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
      reasoning: true,
      defaultThinkingLevel: "medium",
      thinkingLevelOptions: [...BUILT_IN_REASONING_LEVELS],
      temperatureOptions: [0.1, 0.7, 1],
      hasApiKey: false,
      apiKey: "",
      customThinkingLevel: ""
    };
    actions.editorOpened();
  }

  function editModel(model: DraftModel): void {
    if (props.modelSaving) return;
    modelEditor.value = {
      ...cloneDraftModel(model),
      apiKey: "",
      clearApiKey: false,
      originalId: model.id
    };
    actions.editorOpened();
  }

  function saveModelEditor(payload: ModelEditorSavePayload): void {
    if (props.modelSaving) return;
    try {
      const models = applyBatchModelSettings(draftModels.value, payload);
      submitModelSettings(
        models,
        draftDefaultModelId.value || models[0]?.id || ""
      );
    } catch (error) {
      uiMessage.warning(
        formatError(error, t("modelSettingsDraft.invalidModelConfiguration"))
      );
    }
  }

  function testDraftModel(model: DraftModel): void {
    if (!model.provider.trim() || !model.modelId.trim()) {
      uiMessage.warning(
        t("modelEditor.enterTheProviderAndModelIdBeforeTestingThe")
      );
      return;
    }
    actions.testModel(
      toModelInput({
        ...model,
        label: resolveSavedModelLabel(model.label, model.modelId)
      })
    );
  }

  function removeModel(modelId: string): void {
    if (props.modelSaving || modelEditor.value) return;
    draftModels.value = draftModels.value.filter(
      (model) => model.id !== modelId
    );
    if (draftDefaultModelId.value === modelId) {
      draftDefaultModelId.value = draftModels.value[0]?.id ?? "";
    }
    if (advancedConfigModel.value?.id === modelId) {
      advancedConfigModel.value = null;
    }
    submitModelSettings();
  }

  function openAdvancedConfig(model: DraftModel): void {
    if (modelEditor.value) return;
    const cloned = cloneDraftModel(model);
    const tested = settingsStore.lastModelTestCapacity;
    if (
      (cloned.contextWindow === undefined || cloned.maxTokens === undefined) &&
      tested &&
      tested.modelId === cloned.id
    ) {
      cloned.contextWindow = tested.contextWindow;
      cloned.maxTokens = tested.maxTokens;
    }
    advancedConfigModel.value = cloned;
  }

  function closeAdvancedConfig(): void {
    if (props.modelSaving) return;
    advancedConfigModel.value = null;
  }

  function saveAdvancedConfig(capacity: {
    contextWindow: number;
    maxTokens: number;
  }): void {
    const target = advancedConfigModel.value;
    if (!target) return;
    const index = draftModels.value.findIndex(
      (model) => model.id === target.id
    );
    if (index < 0) return;
    draftModels.value[index] = {
      ...draftModels.value[index]!,
      contextWindow: capacity.contextWindow,
      maxTokens: capacity.maxTokens
    };
    advancedConfigModel.value = null;
    submitModelSettings();
  }

  function submitModelSettings(
    models = draftModels.value,
    defaultModelId = draftDefaultModelId.value
  ): void {
    const draftInputs = models.map(toModelInput);
    actions.saveModels(
      mergeCustomModelSettings(
        (props.modelSettings?.models ?? []).map((model) =>
          toModelInput(cloneDraftModel(model))
        ),
        draftInputs,
        defaultModelId || draftInputs[0]?.id || ""
      )
    );
  }

  function setDefaultModel(modelId: string): void {
    if (
      props.modelSaving ||
      modelEditor.value ||
      draftDefaultModelId.value === modelId
    ) {
      return;
    }
    draftDefaultModelId.value = modelId;
    submitModelSettings();
  }

  return {
    draftModels,
    draftDefaultModelId,
    modelEditor,
    advancedConfigModel,
    modelConfigRows,
    createModel,
    editModel,
    saveModelEditor,
    testDraftModel,
    removeModel,
    openAdvancedConfig,
    closeAdvancedConfig,
    saveAdvancedConfig,
    setDefaultModel
  };
}
