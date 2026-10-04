import { z } from "zod";
import { BookSchema, CatalogIndexSnapshotSchema } from "./catalog";
import { LongBookSummarySchema } from "./long-workspace";
import { ModelUsageDashboardSchema } from "./model-usage";
import {
  ModelApiSchema,
  TemperatureOptionsSchema,
  ThinkingLevelOptionsSchema,
  ThinkingLevelSchema
} from "./models";

export * from "./chat-assistant-base";

export const ChatAssistantSoftwareContextSchema = z
  .object({
    name: z.literal("DeepWrite"),
    version: z.string().trim().min(1).max(64),
    platform: z.string().trim().min(1).max(64),
    arch: z.string().trim().min(1).max(64),
    currentTime: z.string().datetime(),
    timezone: z.string().trim().min(1).max(120)
  })
  .strict();
export type ChatAssistantSoftwareContext = z.infer<
  typeof ChatAssistantSoftwareContextSchema
>;

/** A deliberately redacted model descriptor exposed to the assistant. */
export const ChatAssistantModelConfigSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    provider: z.string().trim().min(1).max(120),
    modelId: z.string().trim().min(1).max(240),
    api: ModelApiSchema,
    reasoning: z.boolean(),
    defaultThinkingLevel: ThinkingLevelSchema,
    thinkingLevelOptions: ThinkingLevelOptionsSchema,
    temperatureOptions: TemperatureOptionsSchema,
    credentialConfigured: z.boolean()
  })
  .strict();
export type ChatAssistantModelConfig = z.infer<
  typeof ChatAssistantModelConfigSchema
>;

export const ChatAssistantUsagePeriodSchema = z.enum([
  "today",
  "7d",
  "30d",
  "all"
]);
export type ChatAssistantUsagePeriod = z.infer<
  typeof ChatAssistantUsagePeriodSchema
>;

/**
 * What the chat agents may know about the app: software facts, catalog and
 * usage summaries and redacted model descriptors. Main builds and fully
 * parses it for every chat turn; the Agent Utility trusts that parse.
 */
export const ChatAssistantRuntimeSnapshotSchema = z
  .object({
    software: ChatAssistantSoftwareContextSchema,
    catalog: CatalogIndexSnapshotSchema,
    longBooks: z.array(LongBookSummarySchema).max(100_000),
    models: z.array(ChatAssistantModelConfigSchema).max(100),
    defaultModelId: z.string().max(120),
    usage: z.record(ChatAssistantUsagePeriodSchema, ModelUsageDashboardSchema)
  })
  .strict();
export type ChatAssistantRuntimeSnapshot = z.infer<
  typeof ChatAssistantRuntimeSnapshotSchema
>;

/** The snapshot plus the structure of the project a project chat is about. */
export const ChatAssistantProjectRuntimeSnapshotSchema =
  ChatAssistantRuntimeSnapshotSchema.extend({
    projectBook: z.union([BookSchema, LongBookSummarySchema])
  }).strict();
export type ChatAssistantProjectRuntimeSnapshot = z.infer<
  typeof ChatAssistantProjectRuntimeSnapshotSchema
>;
