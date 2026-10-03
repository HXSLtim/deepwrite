export default {
  permissions: "Permissions",
  approvalLabel: "Default agent approval mode",
  requestApproval: "Ask for approval",
  requestApprovalDescription:
    "Review and approve changes before the agent edits or writes your manuscript.",
  autoApproval: "Approve automatically",
  autoApprovalDescription:
    "Automatically approve agent edits and save them sequentially in the background. Automatic approval can make mistakes.",
  fullAutoApproval: "Full auto (incl. delete)",
  fullAutoApprovalDescription:
    "Automatically approve every write, including irreversible deletions of chapters and materials, and save immediately.",
  crossStageApproval: "Automatically approve cross-stage actions",
  crossStageApprovalDescription:
    "Allow main agents and subagents to work across stages without asking each time. Edit proposals still use the approval mode above.",
  general: "General",
  autoSave: "Auto-save",
  autoSaveDescription:
    "Save your manuscript locally after you stop typing for a moment",
  layout: "Page layout",
  layoutDescription:
    "Choose the order of the agent and text panels in your writing workspace",
  layoutLabel: "Choose workspace layout",
  agentFirst: "Contents · Agent · Text",
  editorFirst: "Contents · Text · Agent",
  language: "Language",
  languageDescription:
    "Choose the interface language. Manuscripts and custom content stay unchanged.",
  languageLabel: "Choose application language",
  systemLanguage: "Follow system",
  simplifiedChinese: "简体中文",
  english: "English",
  menuBar: "Show in menu bar",
  menuBarDescription:
    "Keep the app icon in the menu bar after closing the main window",
  network: "Network settings",
  proxy: "Network proxy",
  proxyDescription:
    "Connect directly to model services by default. Enable this to use the HTTP proxy from your system or environment, including services that require a VPN.",
  saveFailedDetail:
    "General settings are active for this session, but could not be saved locally: {message}",
  saveFailed:
    "General settings are active for this session, but could not be saved locally.",
  loadFailed: "Could not load general settings. Using defaults.",
  autoSaveFailed:
    "Auto-save is active, but its preference could not be saved locally.",
  catalogConflict:
    "The local file changed elsewhere. Reload it and review your changes.",
  impactChanged:
    "Relationships or deletion impact have changed. Review the latest impact and confirm again.",
  targetNotFound: "The target item no longer exists. Refresh and try again.",
  targetExists: "The target already exists. Review it and try again.",
  invalidReference:
    "A referenced item changed or is no longer available. Refresh and try again.",
  invalidOrder: "The item order is no longer valid. Refresh and try again.",
  invalidDocumentWrite:
    "The manuscript edit is no longer valid. Generate it again from the latest version.",
  invalidOperationResult:
    "The structure operation returned an invalid result. Refresh and try again.",
  ledgerAuditFailed:
    "The continuity ledger does not match the current chapters. Refresh the workspace and review it before retrying.",
  settingsStillLoading:
    "General settings are still loading. Wait before closing or moving data.",
  settingsNotSaved:
    "General settings have not been saved. Closing or migration was canceled. Try again.",
  languageResourcesFailed:
    "Application language resources could not be loaded. Retry, or reinstall the app if the problem continues.",
  retryStartup: "Reload"
};
