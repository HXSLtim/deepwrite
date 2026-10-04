import { formatError } from "../../i18n/errors";
import { localizedMessage } from "../analysis-ui/localized-text";
import { createScopedTranslator } from "../../i18n";
import { computed, ref } from "vue";
import { createId } from "@deepwrite/shared";
import type {
  DeepWriteApi,
  ModelConfig,
  StyleComparisonProfile,
  ThinkingLevel,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import {
  STYLE_COMPARISON_METHOD_LIMIT,
  StyleComparisonInputSchema,
  StyleComparisonRuntimeContextSchema,
  assertExtrasAgentBudget,
  type StyleComparisonResult
} from "@deepwrite/contracts/renderer";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
import type { createPromptProfile } from "../agent-runtime/promptProfile";
import { styleComparisonPreview, styleComparisonPublicOutput } from "./result";
import { createStyleComparisonProcess } from "./process";

const t = createScopedTranslator("extras.styleComparison");

type Status =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "error";
interface Options {
  api(): Pick<DeepWriteApi, "extrasAgents" | "session" | "events"> | undefined;
  /** The saved comparison method; `systemPrompt` is the editable text. */
  method: ReturnType<typeof createPromptProfile>;
  notifyError(message: string): void;
}

export function createStyleComparisonController(options: Options) {
  const referenceText = ref("");
  const comparisonText = ref("");
  const method = options.method.systemPrompt;
  const modelId = ref("");
  const thinkingLevel = ref<ThinkingLevel>("off");
  let thinkingModelId = "";
  const status = ref<Status>("idle");
  const process = createStyleComparisonProcess();
  const { activity, output, error, entries } = process;
  const result = ref<StyleComparisonResult | null>(null);
  const lastInput = ref("");
  const previousResult = ref(false);
  const resultModel = ref("");
  const isBusy = computed(() =>
    ["starting", "running", "stopping"].includes(status.value)
  );
  const preview = computed(() => styleComparisonPreview(output.value));
  const inputSnapshot = () =>
    JSON.stringify({
      referenceText: referenceText.value.trim(),
      comparisonText: comparisonText.value.trim(),
      method: method.value.trim()
    });
  const isStale = computed(() =>
    Boolean(
      result.value &&
      (previousResult.value || lastInput.value !== inputSnapshot())
    )
  );
  let task: ExtrasAgentTaskHandle | null = null;
  let stopRequested = false;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;

  function fail(cause: unknown): void {
    status.value = "error";
    activity.value = localizedMessage(
      "extras.styleComparison.comparisonIncomplete"
    );
    const message = () => formatError(cause, t("comparisonFailed"));
    error.value = message;
    process.record(
      localizedMessage("extras.styleComparison.comparisonIncomplete"),
      message,
      "error"
    );
    options.notifyError(message());
  }

  function markStopped(): void {
    status.value = "stopped";
    activity.value = localizedMessage(
      "extras.styleComparison.comparisonStopped"
    );
    process.record(
      localizedMessage("extras.styleComparison.comparisonStopped")
    );
  }

  function handleEvent(event: SystemEventEnvelope): void {
    task?.handleEvent(event);
  }

  async function start(model: ModelConfig | undefined): Promise<void> {
    if (disposed || isBusy.value) return;
    const api = options.api();
    if (!api) {
      options.notifyError(t("agentUnavailable"));
      return;
    }
    if (!model) {
      options.notifyError(t("configureAvailableModel"));
      return;
    }
    syncThinkingModel(model);
    const parsed = StyleComparisonInputSchema.safeParse({
      referenceText: referenceText.value,
      comparisonText: comparisonText.value
    });
    if (
      !parsed.success ||
      method.value.length > STYLE_COMPARISON_METHOD_LIMIT
    ) {
      options.notifyError(t("comparisonInputLimits"));
      return;
    }
    const input = StyleComparisonRuntimeContextSchema.parse({
      ...parsed.data,
      jobId: createId("style_comparison_job")
    });
    try {
      assertExtrasAgentBudget(
        {
          agentId: "style-comparison",
          profile: {
            id: "pending",
            name: t("styleComparison"),
            description: t("styleComparison"),
            systemPrompt: method.value.trim()
          },
          input
        },
        model
      );
    } catch (error) {
      options.notifyError(formatError(error, t("comparisonFailed")));
      return;
    }
    unsubscribe ??= api.events.subscribe(handleEvent);
    stopRequested = false;
    status.value = "starting";
    process.reset(model.label);
    previousResult.value = Boolean(result.value);
    let profile: StyleComparisonProfile;
    try {
      profile = (await options.method.ensureSaved()) as StyleComparisonProfile;
    } catch (error) {
      if (!disposed) fail(error);
      return;
    }
    if (disposed) return;
    if (stopRequested) {
      markStopped();
      return;
    }
    const submittedInput = inputSnapshot();
    let submitted: StyleComparisonResult | undefined;
    const running = startExtrasAgentTask(
      api,
      {
        modelId: model.id,
        thinkingLevel: thinkingLevel.value,
        task: { agentId: "style-comparison", profileId: profile.id, input }
      },
      {
        ...process.callbacks,
        onAccepted() {
          // Terminal events can arrive before the run acceptance.
          if (status.value === "starting") status.value = "running";
        },
        onTurnStarted(attempt) {
          status.value = "running";
          submitted = undefined;
          process.callbacks.onTurnStarted?.(attempt);
        },
        onOutput(next) {
          if (next.kind === "style-comparison-result") {
            submitted = next.result;
            process.record(
              localizedMessage(
                "extras.styleComparison.completeConclusionReceived"
              ),
              undefined,
              "success"
            );
          }
        }
      }
    );
    task = running;
    void running.outcome.then(
      (outcome) => {
        if (task !== running) return;
        task = null;
        if (outcome.status === "stopped") {
          markStopped();
          return;
        }
        output.value = outcome.content;
        if (!submitted) {
          fail(new Error(t("incompleteConclusion")));
          return;
        }
        result.value = submitted;
        lastInput.value = submittedInput;
        resultModel.value = model.label;
        previousResult.value = false;
        status.value = "completed";
        activity.value = localizedMessage(
          "extras.styleComparison.comparisonComplete"
        );
        process.record(
          localizedMessage("extras.styleComparison.comparisonComplete"),
          localizedMessage("extras.styleComparison.resultRetainedBelow"),
          "success"
        );
      },
      (error: unknown) => {
        if (task !== running) return;
        task = null;
        if (!disposed) fail(error);
      }
    );
  }

  async function stop(): Promise<void> {
    if (!isBusy.value || stopRequested) return;
    stopRequested = true;
    status.value = "stopping";
    process.updateActivity(
      localizedMessage("extras.revisionAnalysis.stoppingEllipsis")
    );
    if (!task) return; // start() stops once the method is saved.
    try {
      await task.stop();
    } catch (error) {
      stopRequested = false;
      status.value = "running";
      activity.value = localizedMessage(
        "extras.styleComparison.comparisonStillRunning"
      );
      options.notifyError(formatError(error, t("stopComparisonFailed")));
    }
  }

  function dispose(): void {
    disposed = true;
    unsubscribe?.();
    const current = task;
    task = null;
    current?.dispose();
  }

  function resetWorkspace(): void {
    if (isBusy.value || disposed) throw new Error(t("comparisonStillRunning"));
    referenceText.value = "";
    comparisonText.value = "";
    status.value = "idle";
    process.clear();
    result.value = null;
    lastInput.value = "";
    previousResult.value = false;
    resultModel.value = "";
  }

  function syncThinkingModel(model: ModelConfig | undefined): void {
    if (isBusy.value) return;
    if (
      thinkingModelId !== (model?.id ?? "") ||
      (thinkingLevel.value !== "off" &&
        !model?.thinkingLevelOptions.includes(thinkingLevel.value))
    ) {
      thinkingLevel.value = model?.defaultThinkingLevel ?? "off";
    }
    thinkingModelId = model?.id ?? "";
  }

  return {
    referenceText,
    comparisonText,
    method,
    modelId,
    thinkingLevel,
    syncThinkingModel,
    status,
    activity,
    error,
    entries,
    liveOutput: computed(() => styleComparisonPublicOutput(output.value)),
    result,
    resultModel,
    preview,
    isBusy,
    isStale,
    start,
    stop,
    resetWorkspace,
    dispose,
    handleEvent
  };
}
