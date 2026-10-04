import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import type {
  DeepWriteApi,
  ModelConfigInput,
  ModelSettings,
  ModelSettingsInput,
  ModelUsageQueryInput
} from "@deepwrite/contracts";
import { useSettingsStore } from "../stores/settingsStore";
import { selectableModelSettings } from "../utils/selectableModelSettings";

const t = createScopedTranslator("workspace.modelSettingsCoordinator");

export interface ModelSettingsNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface ModelSettingsCoordinatorContext {
  api(): DeepWriteApi | undefined;
  settingsStore: ReturnType<typeof useSettingsStore>;
  notifications: ModelSettingsNotifications;
  onModelsLoaded(settings: ModelSettings): void;
}

function errorMessage(error: unknown, fallback: string): string {
  return formatError(error, fallback);
}

export function useModelSettingsCoordinator(
  context: ModelSettingsCoordinatorContext
) {
  const { settingsStore, notifications: uiMessage } = context;
  let modelUsageRequestSequence = 0;
  let lastPublishedModelSettings: ModelSettings | null = null;

  function applyLoadedModelSettings(settings: ModelSettings): void {
    if (settingsStore.modelSettings !== settings) {
      settingsStore.markLoaded("models", settings);
    }
    if (lastPublishedModelSettings === settings) return;
    lastPublishedModelSettings = settings;
    context.onModelsLoaded(selectableModelSettings(settings));
  }

  async function loadModelSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      const settings = await settingsStore.ensureModelsLoaded(() =>
        api.models.list()
      );
      applyLoadedModelSettings(settings);
    } catch {
      // The store retains a retriable error for the active feature surface.
    }
  }

  async function loadAppAlerts(): Promise<void> {
    const api = context.api()?.appAlerts;
    if (!api) return;
    try {
      const snapshot = await api.get();
      settingsStore.modelAlertMessages = [...snapshot.modelMessages];
      if (snapshot.shouldShowDesktop) {
        settingsStore.startupAlertMessages = [...snapshot.desktopMessages];
        settingsStore.startupAlertRevision = snapshot.desktopRevision;
      }
    } catch (error: unknown) {
      console.warn(
        "DeepWrite app alerts could not be loaded:",
        errorMessage(error, "unknown error")
      );
    }
  }

  function closeStartupAlert(): void {
    const revision = settingsStore.startupAlertRevision;
    settingsStore.startupAlertMessages = [];
    settingsStore.startupAlertRevision = "";
    const api = context.api()?.appAlerts;
    if (!revision || !api) return;
    void api.acknowledgeDesktop(revision).catch((error: unknown) => {
      console.warn(
        "DeepWrite desktop alert acknowledgement could not be saved:",
        errorMessage(error, "unknown error")
      );
    });
  }

  async function loadModelUsage(
    input: ModelUsageQueryInput = settingsStore.modelUsageQuery
  ): Promise<void> {
    const api = context.api()?.modelUsage;
    if (!api) return;
    const query = {
      ...(input.startAt ? { startAt: input.startAt } : {}),
      ...(input.endAt ? { endAt: input.endAt } : {}),
      ...(input.modelConfigIds?.length
        ? { modelConfigIds: [...input.modelConfigIds] }
        : {}),
      ...(input.managedBy ? { managedBy: input.managedBy } : {}),
      ...(input.modules?.length ? { modules: [...input.modules] } : {})
    } satisfies ModelUsageQueryInput;
    const requestSequence = ++modelUsageRequestSequence;
    settingsStore.modelUsageLoading = true;
    settingsStore.modelUsageError = null;
    try {
      const dashboard = await api.query(query);
      if (requestSequence !== modelUsageRequestSequence) return;
      settingsStore.modelUsageDashboard = dashboard;
      settingsStore.modelUsageQuery = query;
    } catch (error: unknown) {
      if (requestSequence !== modelUsageRequestSequence) return;
      settingsStore.modelUsageError = errorMessage(
        error,
        t("failedToLoadModelUsage")
      );
      uiMessage.warning(settingsStore.modelUsageError);
    } finally {
      if (requestSequence === modelUsageRequestSequence) {
        settingsStore.modelUsageLoading = false;
      }
    }
  }

  async function saveModelSettings(
    settings: ModelSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.modelSaving) return;
    settingsStore.modelSaving = true;
    settingsStore.modelError = null;
    settingsStore.modelTestMessage = null;
    try {
      const saved = await api.models.save(settings);
      applyLoadedModelSettings(saved);
      settingsStore.modelTestMessage = t(
        "modelSettingsSavedAndAppliedToSubsequentConversations"
      );
      uiMessage.success(settingsStore.modelTestMessage);
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(
        error,
        t("failedToSaveModelSettings")
      );
      uiMessage.error(settingsStore.modelError);
    } finally {
      settingsStore.modelSaving = false;
    }
  }

  async function testModel(model: ModelConfigInput): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.testingModelId) return;
    settingsStore.testingModelId = model.id;
    settingsStore.modelError = null;
    settingsStore.modelTestMessage = null;
    try {
      const result = await api.models.test(model);
      settingsStore.modelTestMessage = result.message;
      if (
        Number.isInteger(result.contextWindow) &&
        Number.isInteger(result.maxTokens)
      ) {
        settingsStore.lastModelTestCapacity = {
          modelId: result.modelId,
          contextWindow: result.contextWindow,
          maxTokens: result.maxTokens
        };
      }
      uiMessage.success(result.message);
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(
        error,
        t("modelConnectionTestFailed")
      );
      uiMessage.error(settingsStore.modelError);
    } finally {
      settingsStore.testingModelId = null;
    }
  }

  return {
    loadModelSettings,
    loadAppAlerts,
    closeStartupAlert,
    loadModelUsage,
    saveModelSettings,
    testModel
  };
}
