import type {
  AppLanguage,
  BodyTextFormats,
  AgentTeamCatalogSnapshot,
  CatalogSnapshot,
  ContextCompactionSettings,
  CreativePlotStage,
  GeneralPermissionMode,
  LibraryAgentSettings,
  LongAgentSettings,
  ModelConfig,
  MarketplaceSession,
  ModelSettings,
  ModelUsageDashboard,
  SkillLibrary,
  TextViewMode,
  WorkspacePaneLayout,
  WorkspaceAgentSettings
} from "@deepwrite/contracts";
import type { LongBookAnalysisController } from "../extras/long-book-analysis/useLongBookAnalysis";
import type { SubagentAuthoringController } from "../composables/useSubagentAuthoring";

export interface SettingsFeatureModule {
  kind: "settings";
  initialCategory: string;
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
  libraryAgentSettings: LibraryAgentSettings | null;
  libraryAgentLoading: boolean;
  libraryAgentSaving: boolean;
  modelUsageDashboard: ModelUsageDashboard | null;
  modelUsageLoading: boolean;
  modelSettings: ModelSettings | null;
  modelLoading: boolean;
  modelSaving: boolean;
  modelError: string | null;
  modelTestMessage: string | null;
  testingModelId: string | null;
  runtimeAvailable: boolean;
}

export interface AgentTeamFeatureModule {
  kind: "agent-team";
  navigationEpoch: number;
  catalog: AgentTeamCatalogSnapshot | null;
  models: readonly ModelConfig[];
  skills: readonly SkillLibrary[];
  preferredModelId: string | null;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  runtimeAvailable: boolean;
  authoring: SubagentAuthoringController | null;
}

export interface DirectoryFeatureModule {
  kind: "directory";
  path: string | null;
  loading: boolean;
}

export interface LongBookAnalysisFeatureModule {
  kind: "long-book-analysis";
  controller: LongBookAnalysisController | null;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
}

export interface MarketplaceFeatureModule {
  kind: "marketplace";
  catalogSnapshot: CatalogSnapshot | null;
  session: MarketplaceSession | null;
}

export interface DeviceSyncFeatureModule {
  kind: "device-sync";
  prepareSync(): Promise<boolean>;
  refreshSync(): Promise<void>;
}

export interface CloudBackupFeatureModule {
  kind: "cloud-backup";
}

export interface ZhuqueDetectionFeatureModule {
  kind: "zhuque-detection";
}

export type WorkspaceFeatureModule =
  | {
      kind: "revision-analysis";
      controller:
        | import("../extras/revision-analysis/useRevisionAnalysis").RevisionAnalysisController
        | null;
      models: readonly ModelConfig[];
      catalogSnapshot: CatalogSnapshot | null;
    }
  | {
      kind: "short-book-analysis";
      controller:
        | import("../extras/short-book-analysis/useShortBookAnalysis").ShortBookAnalysisController
        | null;
      models: readonly ModelConfig[];
      catalogSnapshot: CatalogSnapshot | null;
    }
  | SettingsFeatureModule
  | AgentTeamFeatureModule
  | DirectoryFeatureModule
  | {
      kind: "style-comparison";
      models: readonly ModelConfig[];
      preferredModelId: string | null;
    }
  | LongBookAnalysisFeatureModule
  | MarketplaceFeatureModule
  | DeviceSyncFeatureModule
  | CloudBackupFeatureModule
  | ZhuqueDetectionFeatureModule;
