<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed, defineAsyncComponent, ref } from "vue";
import {
  type AppLanguage,
  type ContextCompactionSettings,
  type BodyTextFormats,
  type BodyTextFormatChange,
  type CreativePlotStage,
  type GeneralPermissionMode,
  type LibraryAgentDomain,
  type LibraryAgentSettings,
  type LibraryAgentSettingsInput,
  type LongAgentSettings,
  type LongAgentSettingsInput,
  type ModelConfigInput,
  type ModelSettings,
  type ModelSettingsInput,
  type ModelUsageDashboard,
  type ModelUsageQueryInput,
  type TextViewMode,
  type WorkspacePaneLayout,
  type WorkspaceAgentSettings,
  type WorkspaceAgentSettingsInput
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import WorkspaceDirectoryFeature from "./WorkspaceDirectoryFeature.vue";
import AppearanceSettingsPanel from "./AppearanceSettingsPanel.vue";
import BodyTextSettingsPanel from "./BodyTextSettingsPanel.vue";
import ConfigurationSettingsPanel from "./ConfigurationSettingsPanel.vue";
import GeneralSettingsPanel from "./GeneralSettingsPanel.vue";
import StorageSettingsPanel from "./StorageSettingsPanel.vue";
import LibraryAgentSettingsPanel from "./LibraryAgentSettingsPanel.vue";
import ModelSettingsFeature from "./ModelSettingsFeature.vue";
import ModelUsagePanel from "./ModelUsagePanel.vue";
import ShortAgentSettingsPanel from "./ShortAgentSettingsPanel.vue";
import VoiceSettingsPanel from "./VoiceSettingsPanel.vue";

const ArchivedConversationsPanel = defineAsyncComponent(
  () => import("./ArchivedConversationsPanel.vue")
);

const t = createScopedTranslator("components.settingsPage");

interface SettingsCategory {
  id: string;
  label: string;
  keywords?: string;
  icon?:
    | "directory"
    | "sparkles"
    | "globe"
    | "model"
    | "ledger"
    | "brain"
    | "settings"
    | "wand"
    | "archive";
}

interface SettingsSection {
  id: string;
  label: string;
  categories: SettingsCategory[];
}

const props = defineProps<{
  initialCategory?: string;
  workspaceDirectoryPath: string | null;
  workspaceDirectoryLoading: boolean;
  permissionMode: GeneralPermissionMode;
  autoApproveCrossStageOperations: boolean;
  autoSaveEnabled: boolean;
  language: AppLanguage;
  showContextUsage: boolean;
  textAttachmentMaxCharacters: number;
  contextCompaction: ContextCompactionSettings;
  showInMenuBar: boolean;
  useNetworkProxy: boolean;
  workspacePaneLayout: WorkspacePaneLayout;
  defaultTextViewMode: TextViewMode;
  bodyTextFormats: BodyTextFormats;
  workspaceAgentSettings: readonly WorkspaceAgentSettings[];
  creativePlotStages: readonly CreativePlotStage[];
  longAgentSettings: LongAgentSettings | null;
  workspaceAgentLoading: boolean;
  workspaceAgentSaving: boolean;
  longAgentLoading: boolean;
  longAgentSaving: boolean;
  longAgentError: string | null;
  modelUsageDashboard: ModelUsageDashboard | null;
  modelUsageLoading: boolean;
  modelSettings: ModelSettings | null;
  modelLoading: boolean;
  modelSaving: boolean;
  modelError: string | null;
  modelTestMessage: string | null;
  testingModelId: string | null;
  libraryAgentSettings: LibraryAgentSettings | null;
  libraryAgentLoading: boolean;
  libraryAgentSaving: boolean;
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{
  back: [];
  chooseWorkspaceDirectory: [];
  resetWorkspaceDirectory: [];
  updatePermissionMode: [mode: GeneralPermissionMode];
  updateAutoApproveCrossStageOperations: [enabled: boolean];
  updateAutoSave: [enabled: boolean];
  updateLanguage: [language: AppLanguage];
  updateShowContextUsage: [enabled: boolean];
  updateTextAttachmentMaxCharacters: [value: number];
  updateContextCompaction: [settings: ContextCompactionSettings];
  updateShowInMenuBar: [enabled: boolean];
  updateUseNetworkProxy: [enabled: boolean];
  updateWorkspacePaneLayout: [layout: WorkspacePaneLayout];
  updateDefaultTextViewMode: [mode: TextViewMode];
  updateBodyTextFormat: [change: BodyTextFormatChange];
  saveWorkspaceAgents: [settings: WorkspaceAgentSettingsInput];
  retryLongAgents: [];
  saveLongAgents: [settings: LongAgentSettingsInput];
  saveLibraryAgents: [settings: LibraryAgentSettingsInput];
  resetLibraryAgent: [domain: LibraryAgentDomain];
  loadModelUsage: [input?: ModelUsageQueryInput];
  loadModels: [];
  saveModels: [settings: ModelSettingsInput];
  testModel: [model: ModelConfigInput];
}>();
const activeCategory = ref(props.initialCategory ?? "general");
const searchQuery = ref("");

const sections: SettingsSection[] = [
  {
    id: "personal",
    get label() {
      return t("personal");
    },
    categories: [
      {
        id: "general",
        get label() {
          return t("general");
        },
        icon: "settings",
        get keywords() {
          return t("storageUserDataHistoryDefaultLocationWorkspaceFolder");
        }
      },
      {
        id: "directory",
        get label() {
          return t("workspaceFolder");
        },
        icon: "directory"
      },
      {
        id: "body-text",
        get label() {
          return t("manuscriptText");
        },
        icon: "wand"
      },
      {
        id: "appearance",
        get label() {
          return t("appearance");
        },
        icon: "sparkles"
      },
      {
        id: "configuration",
        get label() {
          return t("contextSettings");
        },
        icon: "model"
      }
    ]
  },
  {
    id: "models-and-usage",
    get label() {
      return t("modelsAndUsage");
    },
    categories: [
      {
        id: "usage",
        get label() {
          return t("usage");
        },
        icon: "ledger"
      },
      {
        id: "custom-models",
        get label() {
          return t("customModelSettings");
        },
        icon: "model"
      },
      {
        id: "voice",
        get label() {
          return t("voiceSettings");
        },
        icon: "brain"
      }
    ]
  },
  {
    id: "creation",
    get label() {
      return t("writing");
    },
    categories: [
      {
        id: "short-agents",
        get label() {
          return t("workspaceSettings");
        },
        icon: "brain"
      },
      {
        id: "skill-library-agent",
        get label() {
          return t("skillLibrarySettings");
        },
        icon: "wand"
      },
      {
        id: "material-library-agent",
        get label() {
          return t("materialLibrarySettings");
        },
        icon: "archive"
      }
    ]
  },
  {
    id: "archived",
    get label() {
      return t("archived");
    },
    categories: [
      {
        id: "archived-conversations",
        get label() {
          return t("archivedConversations");
        },
        icon: "archive"
      }
    ]
  }
];

const visibleSections = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return sections;
  return sections
    .map((section) => ({
      ...section,
      categories: section.categories.filter((category) =>
        `${category.label} ${category.keywords ?? ""}`
          .toLocaleLowerCase()
          .includes(query)
      )
    }))
    .filter((section) => section.categories.length);
});

const activeLabel = computed(() => {
  for (const section of sections) {
    const found = section.categories.find(
      (category) => category.id === activeCategory.value
    );
    if (found) return found.label;
  }
  return t("general");
});

async function selectCategory(id: string): Promise<void> {
  if (id === "custom-models") {
    emit("loadModels");
  }
  activeCategory.value = id;
}
</script>

<template>
  <div class="settings-page">
    <aside class="settings-sidebar">
      <button class="settings-back" type="button" @click="emit('back')">
        <AppIcon name="chevron" :size="14" />
        <span>{{ t("backToApp") }}</span>
      </button>

      <div class="settings-search">
        <AppIcon name="search" :size="14" />
        <input
          v-model="searchQuery"
          type="search"
          :placeholder="t('searchSettings')"
        />
      </div>

      <nav class="settings-nav" :aria-label="t('settingsCategories')">
        <div
          v-for="section in visibleSections"
          :key="section.id"
          class="settings-section"
        >
          <strong class="settings-section-label">{{ section.label }}</strong>
          <button
            v-for="category in section.categories"
            :key="category.id"
            class="settings-category"
            :class="{ 'is-active': activeCategory === category.id }"
            type="button"
            @click="selectCategory(category.id)"
          >
            <AppIcon v-if="category.icon" :name="category.icon" :size="15" />
            <span v-else class="settings-category-spacer" />
            <span>{{ category.label }}</span>
          </button>
        </div>
        <p v-if="!visibleSections.length" class="settings-search-empty">
          {{ t("noMatchingSettings") }}
        </p>
      </nav>
    </aside>

    <main class="settings-content">
      <div class="settings-content-inner">
        <h1 class="settings-title">{{ activeLabel }}</h1>

        <WorkspaceDirectoryFeature
          v-if="activeCategory === 'directory'"
          embedded
          :path="workspaceDirectoryPath"
          :loading="workspaceDirectoryLoading"
          :runtime-available="runtimeAvailable"
          @choose="emit('chooseWorkspaceDirectory')"
        />

        <ShortAgentSettingsPanel
          v-else-if="activeCategory === 'short-agents'"
          :settings="workspaceAgentSettings"
          :creative-plot-stages="creativePlotStages"
          :long-settings="longAgentSettings"
          :loading="workspaceAgentLoading"
          :saving="workspaceAgentSaving"
          :long-loading="longAgentLoading"
          :long-saving="longAgentSaving"
          :long-error-message="longAgentError"
          :runtime-available="runtimeAvailable"
          @save="emit('saveWorkspaceAgents', $event)"
          @retry-long="emit('retryLongAgents')"
          @save-long="emit('saveLongAgents', $event)"
        />

        <LibraryAgentSettingsPanel
          v-else-if="activeCategory === 'skill-library-agent'"
          domain="skill"
          :settings="libraryAgentSettings"
          :loading="libraryAgentLoading"
          :saving="libraryAgentSaving"
          :runtime-available="runtimeAvailable"
          @save="emit('saveLibraryAgents', $event)"
          @reset="emit('resetLibraryAgent', $event)"
        />

        <LibraryAgentSettingsPanel
          v-else-if="activeCategory === 'material-library-agent'"
          domain="material"
          :settings="libraryAgentSettings"
          :loading="libraryAgentLoading"
          :saving="libraryAgentSaving"
          :runtime-available="runtimeAvailable"
          @save="emit('saveLibraryAgents', $event)"
          @reset="emit('resetLibraryAgent', $event)"
        />

        <ModelUsagePanel
          v-else-if="activeCategory === 'usage'"
          :dashboard="modelUsageDashboard"
          :loading="modelUsageLoading"
          @query="emit('loadModelUsage', $event)"
        />

        <ModelSettingsFeature
          v-else-if="activeCategory === 'custom-models'"
          model-scope="custom"
          embedded
          active
          :model-settings="modelSettings"
          :model-loading="modelLoading"
          :model-saving="modelSaving"
          :model-error="modelError"
          :model-test-message="modelTestMessage"
          :testing-model-id="testingModelId"
          :model-alert-messages="[]"
          @save-models="emit('saveModels', $event)"
          @test-model="emit('testModel', $event)"
        />

        <template v-else-if="activeCategory === 'general'">
          <GeneralSettingsPanel
            :permission-mode="permissionMode"
            :auto-approve-cross-stage-operations="
              autoApproveCrossStageOperations
            "
            :auto-save-enabled="autoSaveEnabled"
            :language="language"
            :show-in-menu-bar="showInMenuBar"
            :use-network-proxy="useNetworkProxy"
            :workspace-pane-layout="workspacePaneLayout"
            @update-permission-mode="emit('updatePermissionMode', $event)"
            @update-auto-approve-cross-stage-operations="
              emit('updateAutoApproveCrossStageOperations', $event)
            "
            @update-auto-save="emit('updateAutoSave', $event)"
            @update-language="emit('updateLanguage', $event)"
            @update-show-in-menu-bar="emit('updateShowInMenuBar', $event)"
            @update-use-network-proxy="emit('updateUseNetworkProxy', $event)"
            @update-workspace-pane-layout="
              emit('updateWorkspacePaneLayout', $event)
            "
          />
          <StorageSettingsPanel
            :workspace-directory-path="workspaceDirectoryPath"
            :workspace-directory-loading="workspaceDirectoryLoading"
            :runtime-available="runtimeAvailable"
            @choose-workspace-directory="emit('chooseWorkspaceDirectory')"
            @reset-workspace-directory="emit('resetWorkspaceDirectory')"
          />
        </template>

        <BodyTextSettingsPanel
          v-else-if="activeCategory === 'body-text'"
          :default-text-view-mode="defaultTextViewMode"
          :body-text-formats="bodyTextFormats"
          @update-default-text-view-mode="
            emit('updateDefaultTextViewMode', $event)
          "
          @update-body-text-format="emit('updateBodyTextFormat', $event)"
        />

        <ConfigurationSettingsPanel
          v-else-if="activeCategory === 'configuration'"
          :show-context-usage="showContextUsage"
          :text-attachment-max-characters="textAttachmentMaxCharacters"
          :context-compaction="contextCompaction"
          :model-settings="modelSettings"
          @update-show-context-usage="emit('updateShowContextUsage', $event)"
          @update-text-attachment-max-characters="
            emit('updateTextAttachmentMaxCharacters', $event)
          "
          @update-context-compaction="emit('updateContextCompaction', $event)"
        />

        <AppearanceSettingsPanel v-else-if="activeCategory === 'appearance'" />

        <ArchivedConversationsPanel
          v-else-if="activeCategory === 'archived-conversations'"
        />

        <VoiceSettingsPanel
          v-else-if="activeCategory === 'voice'"
          :runtime-available="runtimeAvailable"
        />

        <section v-else class="settings-group">
          <div class="settings-card">
            <p class="settings-placeholder">
              {{
                t("settingsAreNotConfiguredMessage", {
                  arg0: activeLabel ?? ""
                })
              }}
            </p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped src="./settings-page.css"></style>
