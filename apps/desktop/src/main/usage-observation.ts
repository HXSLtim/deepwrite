import { createHash } from "node:crypto";
import type {
  AgentProviderRuntimeConfig,
  AgentRuntimeRef,
  ModelUsageModelSnapshot,
  ModelUsageModule,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import {
  createModelUsageRevisionId,
  type ModelUsageStore
} from "./model-usage-store";

export interface UsageRunContext {
  module: ModelUsageModule;
  snapshotsByConfigId: ReadonlyMap<string, ModelUsageModelSnapshot>;
  snapshotsByRuntime: ReadonlyMap<string, ModelUsageModelSnapshot>;
}

export function recordUsageObservation(
  event: Extract<SystemEventEnvelope, { type: "agent.usage_observed" }>,
  modelUsageStore: ModelUsageStore | undefined,
  activeRuns: ReadonlyMap<string, { usageContext?: UsageRunContext }>,
  pendingUsageContexts: ReadonlyMap<string, UsageRunContext>
): void {
  if (!modelUsageStore || event.payload.runtime.mode === "local-faux") return;
  const activeRun = activeRuns.get(event.payload.runId);
  const usageContext =
    activeRun?.usageContext ??
    pendingUsageContexts.get(event.context.correlationId);
  const snapshot = usageSnapshotForRuntime(usageContext, event.payload.runtime);
  void modelUsageStore
    .record({
      id: `v2:${event.payload.observationId}`,
      occurredAt: event.payload.observedAt,
      model: snapshot,
      module: usageContext?.module ?? "unknown",
      actor: event.payload.subagentRunId ? "subagent" : "main-agent",
      status: event.payload.status,
      usage: event.payload.usage
    })
    .catch((error: unknown) => {
      console.warn(
        "DeepWrite model usage record was not persisted:",
        error instanceof Error ? error.message : "unknown error"
      );
    });
}

export function usageRuntimeKey(
  runtime: Pick<AgentRuntimeRef, "provider" | "model">
): string {
  return `${runtime.provider}\u0000${runtime.model}`;
}

export function usageEndpointOrigin(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
}

export function createUsageModelSnapshot(
  runtime: AgentRuntimeRef,
  config?: AgentProviderRuntimeConfig
): ModelUsageModelSnapshot {
  const provider = config?.provider ?? runtime.provider;
  const modelId = config?.modelId ?? runtime.model;
  const api = config?.api;
  const endpointOrigin = config ? usageEndpointOrigin(config.baseUrl) : "";
  const revisionId = config
    ? createModelUsageRevisionId(config)
    : createHash("sha256")
        .update(
          JSON.stringify({ provider, modelId, api: api ?? "", endpointOrigin })
        )
        .digest("hex");
  const configId =
    config?.id ?? runtime.configId ?? `runtime:${provider}:${modelId}`;
  return {
    configId,
    revisionId,
    label: config?.label ?? modelId,
    provider,
    modelId,
    ...(api ? { api } : {})
  };
}

export function createUsageRunContext(
  module: ModelUsageModule,
  runtimeConfig: AgentProviderRuntimeConfig | undefined,
  subagentRuntimeConfigs: Readonly<
    Record<string, AgentProviderRuntimeConfig>
  > = {}
): UsageRunContext {
  const snapshotsByConfigId = new Map<string, ModelUsageModelSnapshot>();
  const snapshotsByRuntime = new Map<string, ModelUsageModelSnapshot>();
  const add = (config: AgentProviderRuntimeConfig | undefined): void => {
    if (!config) return;
    const runtime: AgentRuntimeRef = {
      provider: config.provider,
      model: config.modelId,
      mode: "provider",
      configId: config.id
    };
    const snapshot = createUsageModelSnapshot(runtime, config);
    snapshotsByConfigId.set(config.id, snapshot);
    snapshotsByRuntime.set(usageRuntimeKey(runtime), snapshot);
  };
  add(runtimeConfig);
  for (const config of Object.values(subagentRuntimeConfigs)) {
    add(config);
  }
  return {
    module,
    snapshotsByConfigId,
    snapshotsByRuntime
  };
}

export function usageSnapshotForRuntime(
  context: UsageRunContext | undefined,
  runtime: AgentRuntimeRef
): ModelUsageModelSnapshot {
  const byConfigId = runtime.configId
    ? context?.snapshotsByConfigId.get(runtime.configId)
    : undefined;
  return (
    byConfigId ??
    context?.snapshotsByRuntime.get(usageRuntimeKey(runtime)) ??
    createUsageModelSnapshot(runtime)
  );
}
