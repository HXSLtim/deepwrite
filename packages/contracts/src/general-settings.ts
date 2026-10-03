import { z } from "zod";
import {
  BodyTextFormatsSchema,
  createDefaultBodyTextFormats
} from "./body-text-format";
import { EnvelopeBaseSchema } from "./envelope";
import { ContextCompactionSettingsSchema } from "./session/context-compaction-state";
import { createDefaultContextCompactionSettings } from "./session/context-compaction-defaults";
import {
  PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH,
  PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH,
  PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH
} from "./session/attachments";

/** Chinese prose is estimated at roughly one token per character. */
export function maxTextAttachmentCharactersForBudget(
  budgetTokens: number
): number {
  return Math.min(
    PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH,
    Math.floor(budgetTokens * 0.9)
  );
}

export const GeneralPermissionModeSchema = z.enum([
  "request-approval",
  "auto-approve",
  "auto-approve-all"
]);
export type GeneralPermissionMode = z.infer<typeof GeneralPermissionModeSchema>;

export const AppLanguageSchema = z.enum(["auto", "zh-CN", "en-US"]);
export type AppLanguage = z.infer<typeof AppLanguageSchema>;

export const WorkspacePaneLayoutSchema = z.enum([
  "agent-editor",
  "editor-agent"
]);
export type WorkspacePaneLayout = z.infer<typeof WorkspacePaneLayoutSchema>;

export const TextViewModeSchema = z.enum(["edit", "preview"]);
export type TextViewMode = z.infer<typeof TextViewModeSchema>;

export const GeneralSettingsSchema = z
  .object({
    permissionMode: GeneralPermissionModeSchema,
    autoApproveCrossStageOperations: z.boolean().default(true),
    autoSave: z.boolean(),
    language: AppLanguageSchema,
    showInMenuBar: z.boolean(),
    showContextUsage: z.boolean().default(true),
    textAttachmentMaxCharacters: z
      .number()
      .int()
      .min(1_000)
      .max(PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH)
      .default(PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH),
    contextCompaction: ContextCompactionSettingsSchema.default(
      createDefaultContextCompactionSettings
    ),
    useNetworkProxy: z.boolean().default(false),
    workspacePaneLayout: WorkspacePaneLayoutSchema.default("agent-editor"),
    defaultTextViewMode: TextViewModeSchema.default("edit"),
    bodyTextFormats: BodyTextFormatsSchema.default(createDefaultBodyTextFormats)
  })
  .transform((settings) => ({
    ...settings,
    textAttachmentMaxCharacters: Math.min(
      settings.textAttachmentMaxCharacters,
      maxTextAttachmentCharactersForBudget(
        settings.contextCompaction.budgetTokens
      )
    )
  }));
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

export const GeneralSettingsSnapshotSchema = z.object({
  persisted: z.boolean(),
  settings: GeneralSettingsSchema
});
export type GeneralSettingsSnapshot = z.infer<
  typeof GeneralSettingsSnapshotSchema
>;

export function createDefaultGeneralSettings(): GeneralSettings {
  return {
    permissionMode: "auto-approve",
    autoApproveCrossStageOperations: true,
    autoSave: true,
    language: "auto",
    showInMenuBar: true,
    showContextUsage: true,
    textAttachmentMaxCharacters: PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH,
    contextCompaction: createDefaultContextCompactionSettings(),
    useNetworkProxy: false,
    workspacePaneLayout: "agent-editor",
    defaultTextViewMode: "edit",
    bodyTextFormats: createDefaultBodyTextFormats()
  };
}

export const GeneralSettingsListCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("generalSettings.list"),
    payload: z.object({})
  });

export const GeneralSettingsSaveCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("generalSettings.save"),
    payload: GeneralSettingsSchema
  });
