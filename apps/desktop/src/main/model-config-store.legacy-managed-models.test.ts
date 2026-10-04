import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8")
  }
}));

const { ModelConfigStore } = await import("./model-config-store");

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) =>
        rm(root, { force: true, recursive: true }).catch(() => undefined)
      )
  );
});

function legacyModel(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    label: id,
    provider: "custom",
    modelId: `${id}-model`,
    api: "openai-completions",
    baseUrl: "https://example.test/v1",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
    temperatureOptions: [0.1, 0.7, 1],
    ...extra
  };
}

interface LegacySettings {
  defaultModelId: string;
  models: unknown[];
  encryptedApiKeys?: Record<string, string>;
}

async function writeLegacySettings(
  root: string,
  settings: LegacySettings
): Promise<void> {
  await mkdir(join(root, "config"), { recursive: true });
  await writeFile(
    join(root, "config", "models.json"),
    `${JSON.stringify(
      {
        version: 3,
        defaultModelId: settings.defaultModelId,
        disabledOfficialModelIds: ["deepwrite-official-flash"],
        enabledFreeModelIds: ["deepwrite-free-writer"],
        knownFreeModels: [
          legacyModel("deepwrite-free-writer", {
            managedBy: "deepwrite-free"
          })
        ],
        deprecatedFreeModels: [],
        models: settings.models,
        encryptedApiKeys: settings.encryptedApiKeys ?? {}
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function readStoredSettings(root: string): Promise<{
  defaultModelId: string;
  models: unknown[];
  encryptedApiKeys: Record<string, string>;
}> {
  const raw = JSON.parse(
    await readFile(join(root, "config", "models.json"), "utf8")
  ) as Record<string, unknown>;
  return raw as unknown as {
    defaultModelId: string;
    models: unknown[];
    encryptedApiKeys: Record<string, string>;
  };
}

describe("ModelConfigStore legacy managed models", () => {
  it("drops managed and site-official entries, falls back the dangling default, and drops their secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-legacy-models-"));
    roots.push(root);
    await writeLegacySettings(root, {
      defaultModelId: "deepwrite-official-flash",
      models: [
        legacyModel("deepwrite-official-flash", {
          managedBy: "deepwrite-official"
        }),
        legacyModel("deepwrite-free-writer", { managedBy: "deepwrite-free" }),
        legacyModel("deepwrite-site-official-deepseek-v4-flash"),
        legacyModel("custom-writer")
      ],
      encryptedApiKeys: {
        "deepwrite-official-token": "b2ZmaWNpYWw=",
        "deepwrite-free-writer": "ZnJlZQ==",
        "deepwrite-site-official-deepseek-v4-flash": "c2l0ZQ==",
        "custom-writer": "Y3VzdG9tLWtleQ=="
      }
    });

    const store = new ModelConfigStore(root);
    const settings = await store.list();

    expect(settings.models.map((model) => model.id)).toEqual(["custom-writer"]);
    expect(settings.defaultModelId).toBe("custom-writer");
    expect(settings.models[0]).not.toHaveProperty("managedBy");

    const stored = await readStoredSettings(root);
    expect(stored.defaultModelId).toBe("custom-writer");
    expect(Object.keys(stored.encryptedApiKeys)).toEqual(["custom-writer"]);
    expect(stored.models).toHaveLength(1);
  });

  it("clears the default when only managed models remain", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-legacy-models-"));
    roots.push(root);
    await writeLegacySettings(root, {
      defaultModelId: "deepwrite-free-writer",
      models: [
        legacyModel("deepwrite-free-writer", { managedBy: "deepwrite-free" })
      ]
    });

    const store = new ModelConfigStore(root);
    const settings = await store.list();

    expect(settings.models).toEqual([]);
    expect(settings.defaultModelId).toBe("");
  });

  it("resolves stale run preferences to the effective default instead of failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-legacy-models-"));
    roots.push(root);
    await writeLegacySettings(root, {
      defaultModelId: "custom-second",
      models: [legacyModel("custom-writer"), legacyModel("custom-second")]
    });

    const store = new ModelConfigStore(root);

    const stale = await store.resolve("deepwrite-official-flash");
    expect(stale?.id).toBe("custom-second");

    const fallback = await store.resolve();
    expect(fallback?.id).toBe("custom-second");

    const explicit = await store.resolve("custom-writer");
    expect(explicit?.id).toBe("custom-writer");
  });

  it("resolves to undefined when no models remain at all", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-legacy-models-"));
    roots.push(root);
    await writeLegacySettings(root, {
      defaultModelId: "deepwrite-free-writer",
      models: [
        legacyModel("deepwrite-free-writer", { managedBy: "deepwrite-free" })
      ]
    });

    const store = new ModelConfigStore(root);

    expect(await store.resolve("deepwrite-free-writer")).toBeUndefined();
    expect(await store.resolve()).toBeUndefined();
  });
});
