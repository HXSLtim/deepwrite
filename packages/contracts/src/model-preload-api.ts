import type {
  ModelCapacityResult,
  ModelConnectionTestResult,
  ModelConfigInput,
  ModelSettings,
  ModelSettingsInput,
  RemoteModelListInput,
  RemoteModelListResult
} from "./models";

export interface ModelPreloadApi {
  list(): Promise<ModelSettings>;
  save(settings: ModelSettingsInput): Promise<ModelSettings>;
  test(model: ModelConfigInput): Promise<ModelConnectionTestResult>;
  resolveCapacity(model: ModelConfigInput): Promise<ModelCapacityResult>;
  listRemote(input: RemoteModelListInput): Promise<RemoteModelListResult>;
}
