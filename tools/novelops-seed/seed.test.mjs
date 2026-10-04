import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SkillLibraryProjectManifestSchema } from "../../packages/contracts/src/index.ts";
import {
  assertRegistryShape,
  defaultUserDataPath,
  buildSkillLibraryManifest,
  loadSeedManifest,
  mergeRegistryProjects,
  planSkillLibrary,
  seedAll
} from "./seed.mjs";
import { NOVELOPS_TEAM_ID } from "./team.mjs";
import { AgentTeamProfileSchema } from "../../packages/contracts/src/index.ts";

const SEED_ROOT = fileURLToPath(new URL(".", import.meta.url));
const temporaryRoots = [];

afterEach(async () => {
  const fs = await import("node:fs/promises");
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) =>
        fs.rm(root, { recursive: true, force: true }).catch(() => {})
      )
  );
});

const EMPTY_REGISTRY = {
  schemaVersion: 1,
  revision: 7,
  updatedAt: "2026-10-04T00:00:00.000Z",
  sourceCatalogMigrated: true,
  creativePlotStages: [],
  projects: [
    {
      id: "skill-user-existing",
      domain: "skill-library",
      projectDirectory: "/somewhere/existing",
      registeredAt: "2026-09-01T00:00:00.000Z"
    }
  ]
};

async function fixtureUserData({ withAgentTeams = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "novelops-seed-test-"));
  temporaryRoots.push(root);
  await writeFile(
    join(root, "catalog-registry.json"),
    JSON.stringify(EMPTY_REGISTRY),
    "utf8"
  );
  if (withAgentTeams) {
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config", "agent-team-profiles.json"),
      JSON.stringify({
        version: 5,
        enabledTeamIds: {},
        builtinSubagents: {},
        teams: [
          {
            id: "team_default_long",
            name: "默认长篇团队",
            workspaceType: "long",
            settings: {
              workspaceType: "long",
              parallelSubagents: false,
              teams: [{ parentAgentId: "long", subagents: [] }]
            }
          }
        ]
      }),
      "utf8"
    );
  }
  return root;
}

describe("novelops skill seeding", () => {
  it("plans every manifest group with deterministic ids", async () => {
    const manifest = await loadSeedManifest(SEED_ROOT);
    expect(manifest.groups.map((group) => group.id)).toEqual([
      "style",
      "techniques",
      "workflow",
      "genres"
    ]);
    const bodies = new Map(
      await Promise.all(
        manifest.groups.flatMap((group) =>
          group.entries.map(async (entry) => [
            entry.file,
            await readFile(join(SEED_ROOT, entry.file), "utf8")
          ])
        )
      )
    );
    const plan = planSkillLibrary(
      manifest.groups[0],
      bodies,
      "2026-10-04T01:00:00.000Z"
    );
    expect(plan.libraryId).toBe("skill-novelops-style");
    expect(plan.entries.map((entry) => entry.id)).toEqual([
      "skill-novelops-style-e01",
      "skill-novelops-style-e02"
    ]);
    // Deterministic ids: the same input plans the same output.
    expect(
      planSkillLibrary(manifest.groups[0], bodies, "2026-10-04T01:00:00.000Z")
    ).toEqual(plan);
  });

  it("generates manifests that satisfy the contracts schema", async () => {
    const manifest = await loadSeedManifest(SEED_ROOT);
    const bodies = new Map(
      await Promise.all(
        manifest.groups.flatMap((group) =>
          group.entries.map(async (entry) => [
            entry.file,
            await readFile(join(SEED_ROOT, entry.file), "utf8")
          ])
        )
      )
    );
    for (const group of manifest.groups) {
      const plan = planSkillLibrary(group, bodies, "2026-10-04T01:00:00.000Z");
      const parsed = SkillLibraryProjectManifestSchema.parse(
        buildSkillLibraryManifest(plan)
      );
      expect(parsed.kind).toBe("deepwrite.skill-library");
      expect(parsed.entries).toHaveLength(group.entries.length);
      expect(
        parsed.entries.every((entry) => entry.path.startsWith("entries/"))
      ).toBe(true);
    }
  });

  it("seeds skill libraries into a prepared userData directory", async () => {
    const root = await fixtureUserData();
    const result = await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });

    expect(result.created).toHaveLength(4);
    expect(result.skipped).toEqual([]);
    expect(result.registryUpdated).toBe(true);

    const registry = JSON.parse(
      await readFile(join(root, "catalog-registry.json"), "utf8")
    );
    const seeded = registry.projects.filter((project) =>
      project.id.startsWith("skill-novelops-")
    );
    expect(seeded).toHaveLength(4);
    // Existing rows and registry bookkeeping stay untouched.
    expect(registry.revision).toBe(EMPTY_REGISTRY.revision);
    expect(registry.projects).toContainEqual(EMPTY_REGISTRY.projects[0]);

    for (const project of seeded) {
      const stored = JSON.parse(
        await readFile(join(project.projectDirectory, "deepwrite.json"), "utf8")
      );
      expect(() =>
        SkillLibraryProjectManifestSchema.parse(stored)
      ).not.toThrow();
      const firstEntry = stored.entries[0];
      const body = await readFile(
        join(project.projectDirectory, firstEntry.path),
        "utf8"
      );
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });

  it("is idempotent: a second run registers and writes nothing", async () => {
    const root = await fixtureUserData();
    await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });
    const registryAfterFirst = await readFile(
      join(root, "catalog-registry.json"),
      "utf8"
    );

    const second = await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });

    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(4);
    expect(second.registryUpdated).toBe(false);
    expect(await readFile(join(root, "catalog-registry.json"), "utf8")).toBe(
      registryAfterFirst
    );
  });

  it("reports the plan without touching disk on --dry-run", async () => {
    const root = await fixtureUserData();
    const before = await readFile(join(root, "catalog-registry.json"), "utf8");
    const result = await seedAll({
      seedRoot: SEED_ROOT,
      userDataPath: root,
      dryRun: true
    });
    expect(result.created).toHaveLength(4);
    expect(result.registryUpdated).toBe(false);
    expect(await readFile(join(root, "catalog-registry.json"), "utf8")).toBe(
      before
    );
    expect(await dirExists(join(root, "catalog-projects"))).toBe(false);
  });

  it("refuses to run without an existing registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "novelops-seed-empty-"));
    temporaryRoots.push(root);
    await expect(
      seedAll({ seedRoot: SEED_ROOT, userDataPath: root })
    ).rejects.toThrow("Start DeepWrite once before seeding");
  });

  it("refuses registries with an unsupported schema version", () => {
    expect(() =>
      assertRegistryShape(
        { schemaVersion: 2, projects: [] },
        "catalog-registry.json"
      )
    ).toThrow("unsupported schema version 2");
    expect(() =>
      assertRegistryShape(
        { schemaVersion: 1, projects: [{ id: 1 }] },
        "catalog-registry.json"
      )
    ).toThrow("malformed");
  });

  it("appends the preset team to an existing agent-team catalog", async () => {
    const root = await fixtureUserData({ withAgentTeams: true });
    const catalogPath = join(root, "config", "agent-team-profiles.json");
    const result = await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });

    expect(result.team.seeded).toBe(true);
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog.version).toBe(5);
    expect(catalog.enabledTeamIds).toEqual({});
    const seeded = catalog.teams.find((team) => team.id === NOVELOPS_TEAM_ID);
    expect(() => AgentTeamProfileSchema.parse(seeded)).not.toThrow();
    expect(catalog.teams.some((team) => team.id === "team_default_long")).toBe(
      true
    );
    expect(seeded.settings.teams[0].subagents).toHaveLength(16);
  });

  it("seeds the team idempotently and leaves the catalog untouched on reruns", async () => {
    const root = await fixtureUserData({ withAgentTeams: true });
    const catalogPath = join(root, "config", "agent-team-profiles.json");
    await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });
    const afterFirst = await readFile(catalogPath, "utf8");

    const second = await seedAll({ seedRoot: SEED_ROOT, userDataPath: root });
    expect(second.team.seeded).toBe(false);
    expect(second.team.reason).toBe("already present");
    expect(await readFile(catalogPath, "utf8")).toBe(afterFirst);
  });

  it("plans the team on dry-run without writing the catalog", async () => {
    const root = await fixtureUserData({ withAgentTeams: true });
    const catalogPath = join(root, "config", "agent-team-profiles.json");
    const before = await readFile(catalogPath, "utf8");
    const result = await seedAll({
      seedRoot: SEED_ROOT,
      userDataPath: root,
      dryRun: true
    });
    expect(result.team.reason).toBe("would create");
    expect(result.team.team.id).toBe(NOVELOPS_TEAM_ID);
    expect(await readFile(catalogPath, "utf8")).toBe(before);
  });

  it("defaults to the app's real user data directory", () => {
    expect(defaultUserDataPath({}, "/Users/demo")).toBe(
      "/Users/demo/Library/Application Support/@deepwrite/desktop"
    );
    expect(
      defaultUserDataPath(
        { DEEPWRITE_USER_DATA: "/tmp/alt-user-data" },
        "/Users/demo"
      )
    ).toBe("/tmp/alt-user-data");
  });

  it("merges registry projects without duplicating known rows", () => {
    const registration = {
      libraryId: "skill-novelops-style",
      projectDirectory: "/x/style",
      registeredAt: "2026-10-04T01:00:00.000Z"
    };
    const first = mergeRegistryProjects(EMPTY_REGISTRY, [registration]);
    expect(first.added).toHaveLength(1);
    const second = mergeRegistryProjects(first.registry, [registration]);
    expect(second.added).toHaveLength(0);
    expect(second.registry).toBe(first.registry);
  });
});

async function dirExists(path) {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
