<script setup lang="ts">
import { createScopedTranslator, locale } from "../../i18n";
import { computed, ref, watch } from "vue";
import type { ModelConfig } from "@deepwrite/contracts";
import { STYLE_COMPARISON_TEXT_LIMIT } from "@deepwrite/contracts/renderer";
import AppIcon from "../../components/AppIcon.vue";
import { useStyleComparisonStore } from "./store";
import StyleComparisonResult from "./StyleComparisonResult.vue";
import AnalysisPageShell from "../analysis-ui/AnalysisPageShell.vue";
import AnalysisModelSettings from "../analysis-ui/AnalysisModelSettings.vue";
import AnalysisRefreshButton from "../analysis-ui/AnalysisRefreshButton.vue";
import AnalysisRunStatus from "../analysis-ui/AnalysisRunStatus.vue";
import "./style-comparison.css";

const t = createScopedTranslator("extras");

const props = defineProps<{
  models: readonly ModelConfig[];
  preferredModelId: string | null;
}>();
const comparison = useStyleComparisonStore();
const materialsOpen = ref(!comparison.isBusy && !comparison.result);
function clearWorkspace(): void {
  comparison.resetWorkspace();
  materialsOpen.value = true;
}
watch(
  () => comparison.isBusy,
  (busy) => {
    if (busy) materialsOpen.value = false;
  }
);
const availableModels = computed(() => [...props.models]);
watch(
  () =>
    [availableModels.value, props.preferredModelId, comparison.isBusy] as const,
  () => {
    if (
      comparison.isBusy ||
      availableModels.value.some((model) => model.id === comparison.modelId)
    )
      return;
    comparison.modelId =
      availableModels.value.find((model) => model.id === props.preferredModelId)
        ?.id ??
      availableModels.value[0]?.id ??
      "";
  },
  { immediate: true }
);
const selectedModel = computed(() =>
  availableModels.value.find((model) => model.id === comparison.modelId)
);
watch(
  () => [selectedModel.value, comparison.isBusy] as const,
  () => comparison.syncThinkingModel(selectedModel.value),
  { immediate: true, flush: "sync" }
);
const canStart = computed(() =>
  Boolean(
    comparison.referenceText.trim() &&
    comparison.comparisonText.trim() &&
    selectedModel.value
  )
);
function start(): void {
  void comparison.start(selectedModel.value);
}
</script>

<template>
  <AnalysisPageShell
    class="style-comparison-page"
    :title="t('styleComparison.styleComparison')"
    :description="t('styleComparison.comparisonDescription')"
  >
    <template #header-actions>
      <div class="analysis-header-actions">
        <AnalysisModelSettings
          v-model:model-id="comparison.modelId"
          v-model:thinking-level="comparison.thinkingLevel"
          :models="availableModels"
          :disabled="comparison.isBusy"
        />
        <AnalysisRefreshButton
          :busy="comparison.isBusy"
          :status="comparison.status"
          :stop="comparison.stop"
          :clear="clearWorkspace"
        />
      </div>
    </template>
    <details
      class="analysis-card analysis-materials comparison-materials"
      :open="materialsOpen"
      @toggle="materialsOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary>
        <strong>{{ t("revisionAnalysis.prepareMaterials") }}</strong
        ><span>{{
          t("styleComparison.comparisonLengths", {
            reference: comparison.referenceText.length.toLocaleString(locale),
            comparison: comparison.comparisonText.length.toLocaleString(locale)
          })
        }}</span>
      </summary>
      <div class="comparison-inputs">
        <label class="comparison-text-card" for="style-reference">
          {{ t("styleComparison.referenceText") }}
          <textarea
            id="style-reference"
            v-model="comparison.referenceText"
            :maxlength="STYLE_COMPARISON_TEXT_LIMIT"
            :disabled="comparison.isBusy"
            :placeholder="t('styleComparison.referencePlaceholder')"
            spellcheck="false"
          />
        </label>
        <label class="comparison-text-card" for="style-target">
          {{ t("styleComparison.comparisonText") }}
          <textarea
            id="style-target"
            v-model="comparison.comparisonText"
            :maxlength="STYLE_COMPARISON_TEXT_LIMIT"
            :disabled="comparison.isBusy"
            :placeholder="t('styleComparison.comparisonPlaceholder')"
            spellcheck="false"
          />
        </label>
      </div>
    </details>
    <section class="analysis-run-bar">
      <AnalysisRunStatus
        :status="comparison.status"
        :entries="comparison.entries"
        :current-activity="comparison.activity"
        :live-output="comparison.liveOutput"
        :error="comparison.error"
        :title="t('styleComparison.comparisonProcess')"
      />
      <p v-if="comparison.status === 'idle'" class="comparison-input-note">
        {{
          availableModels.length
            ? t("styleComparison.comparisonHelp")
            : t("styleComparison.configureAnalysisModel")
        }}
      </p>
      <div class="analysis-run-actions">
        <button
          v-if="comparison.isBusy"
          class="analysis-primary-button"
          type="button"
          :disabled="comparison.status === 'stopping'"
          @click="comparison.stop()"
        >
          <AppIcon name="stop" :size="15" />
          {{
            comparison.status === "stopping"
              ? t("revisionAnalysis.stoppingEllipsis")
              : t("revisionAnalysis.stopAnalysis")
          }}
        </button>
        <button
          v-else
          class="analysis-primary-button"
          type="button"
          :disabled="!canStart"
          @click="start"
        >
          <AppIcon name="wand" :size="16" />
          {{
            comparison.status === "idle"
              ? t("longBookAnalysis.startAnalysis")
              : t("longBookAnalysis.analyzeAgain")
          }}
        </button>
      </div>
    </section>
    <section
      class="analysis-card comparison-result-card"
      :aria-label="t('styleComparison.comparisonResult')"
    >
      <StyleComparisonResult
        :result="comparison.result"
        :preview="comparison.preview"
        :status="comparison.status"
        :is-stale="comparison.isStale"
        :model-label="comparison.resultModel"
      />
    </section>
  </AnalysisPageShell>
</template>
