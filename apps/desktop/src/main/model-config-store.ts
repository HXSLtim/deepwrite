import {
  ModelConfigInputSchema,
  ModelSettingsInputSchema,
  type AgentProviderRuntimeConfig,
  type SyncedModelChange,
  type SyncModelEntry,
  type ModelConfigInput,
  type ModelSettings,
  type ModelSettingsInput
} from "@deepwrite/contracts";
import {
  ModelConfigPersistence,
  type ModelConfigState
} from "./model-config-persistence";
import {
  synchronizeState,
  toPublicSettings,
  type ModelConfigSnapshot
} from "./model-config-state";
import { editModelSettings } from "./model-config-mutations";
import {
  applySyncedModelChanges,
  customSyncEntries
} from "./model-config-sync";
import {
  decryptModelKey,
  resolveDraftModel,
  resolveSavedModel
} from "./model-config-runtime";

export class ModelConfigStore {
  private readonly persistence: ModelConfigPersistence;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.persistence = new ModelConfigPersistence(userDataPath);
  }

  async initialize(): Promise<void> {
    await this.update();
  }

  async list(): Promise<ModelSettings> {
    const { settings, secrets } = await this.update();
    return toPublicSettings(settings, secrets);
  }

  async save(rawInput: ModelSettingsInput): Promise<ModelSettings> {
    const input = ModelSettingsInputSchema.parse(rawInput);
    const { settings, secrets } = await this.update((state) =>
      editModelSettings(input, state)
    );
    return toPublicSettings(settings, secrets);
  }

  async listSyncModels(): Promise<SyncModelEntry[]> {
    const { settings, secrets } = await this.update();
    return customSyncEntries(settings.models, secrets);
  }

  async applySyncedModels(changes: SyncedModelChange[]): Promise<void> {
    await this.update((state) => applySyncedModelChanges(state, changes));
  }

  async resolve(
    modelId?: string
  ): Promise<AgentProviderRuntimeConfig | undefined> {
    return resolveSavedModel(await this.update(), modelId);
  }

  async resolveDraft(
    rawModel: ModelConfigInput
  ): Promise<AgentProviderRuntimeConfig> {
    const model = ModelConfigInputSchema.parse(rawModel);
    return resolveDraftModel(model, await this.update());
  }

  async resolveDraftApiKey(input: {
    id?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }): Promise<string> {
    const provided = input.apiKey?.trim() ?? "";
    if (provided) return provided;
    if (input.clearApiKey || !input.id?.trim()) return "";
    await this.writeChain;
    const { secrets } = await this.persistence.read();
    return decryptModelKey(secrets.encryptedApiKeys[input.id.trim()]);
  }

  private async update(
    mutate?: (state: ModelConfigSnapshot) => ModelConfigState
  ): Promise<ModelConfigSnapshot> {
    const operation = this.writeChain.then(async () => {
      const stored = await this.persistence.read();
      const requested = mutate ? mutate(stored) : stored;
      const [settings, secrets] = synchronizeState(
        requested.settings,
        requested.secrets
      );
      // Every mutation uses the same atomic commit.
      await this.persistence.write({ settings, secrets });
      return { settings, secrets };
    });
    // Failed operations must not poison later saves, and may not publish state.
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    return await operation;
  }
}
