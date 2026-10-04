#!/usr/bin/env node
/**
 * NovelOps skill-library seeder.
 *
 * Seeds the four NovelOps knowledge groups from SEED_MANIFEST.json into the
 * local DeepWrite catalog as skill libraries, following the on-disk layout of
 * `FolderCatalogStore`:
 *
 *   <userData>/catalog-projects/skills/<dir>/deepwrite.json  (manifest)
 *   <userData>/catalog-projects/skills/<dir>/entries/*.md    (entry bodies)
 *   <userData>/catalog-registry.json                         (+ .bak backup)
 *
 * Safety contract:
 * - Run while DeepWrite is closed; the script never races the Core utility.
 * - Registry writes keep Core's conventions: verify shape, back up to
 *   catalog-registry.json.bak, then commit with tmp+rename. The registry
 *   revision/updatedAt stay untouched (they belong to Core).
 * - Idempotent: deterministic library and entry ids mean a second run
 *   detects existing registrations and skips without writing anything.
 * - Generated manifests are validated against the contracts schemas in
 *   seed.test.mjs; the runtime keeps a zero-dependency structural check.
 *
 * Usage: node tools/novelops-seed/seed.mjs [--dry-run] [--userData <path>]
 */

import { randomBytes } from "node:crypto";
import { NOVELOPS_TEAM_ID, planAgentTeam } from "./team.mjs";
import { existsSync } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  rename,
  rm
} from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const SEED_ROOT = fileURLToPath(new URL(".", import.meta.url));
const MANIFEST_FILE = "SEED_MANIFEST.json";
const REGISTRY_FILE = "catalog-registry.json";
const REGISTRY_BACKUP_FILE = "catalog-registry.json.bak";
const AGENT_TEAM_FILE = "agent-team-profiles.json";
const AGENT_TEAM_BACKUP_FILE = "agent-team-profiles.json.bak";
const MAX_ENTRIES_PER_LIBRARY = 4096;

function randomHex8() {
  return randomBytes(4).toString("hex");
}

/** Group profile: catalog skill kind and the default stage for its entries. */
const GROUP_PROFILES = {
  style: {
    skillKind: "style",
    stageId: "draft",
    overview:
      "NovelOps L3 文风层：文风六卡与反 AI 模式清单，逐句执行，来自 novel-system 知识库移植。"
  },
  techniques: {
    skillKind: "general",
    stageId: "draft",
    overview:
      "NovelOps L2 技法卡库：按域组织的写作技法卡与半自动路由，按需加载，来自 novel-system 知识库移植。"
  },
  workflow: {
    skillKind: "general",
    stageId: "outline",
    overview:
      "NovelOps 流程层：主编门禁（G0-G8）、各阶段工作流与质检规范，来自 novel-system 知识库移植。"
  },
  genres: {
    skillKind: "other",
    stageId: "character_design",
    overview:
      "NovelOps 题材宝库：类型套路、人设与世界观素材，来自 novel-system 知识库移植。"
  }
};
const DEFAULT_PROFILE = {
  skillKind: "other",
  stageId: "draft",
  overview: "NovelOps 种子知识，来自 novel-system 知识库移植。"
};

export async function loadSeedManifest(seedRoot = SEED_ROOT) {
  const raw = JSON.parse(await readFile(join(seedRoot, MANIFEST_FILE), "utf8"));
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.groups)) {
    throw new Error("SEED_MANIFEST.json must contain a groups array.");
  }
  const groups = raw.groups.map((group, groupIndex) => {
    if (!group || typeof group !== "object") {
      throw new Error(`Seed group ${groupIndex} must be an object.`);
    }
    if (typeof group.id !== "string" || !group.id.trim()) {
      throw new Error(`Seed group ${groupIndex} needs a non-empty id.`);
    }
    if (typeof group.title !== "string" || !group.title.trim()) {
      throw new Error(`Seed group ${groupIndex} needs a non-empty title.`);
    }
    if (!Array.isArray(group.entries) || group.entries.length === 0) {
      throw new Error(`Seed group ${group.id} needs at least one entry.`);
    }
    if (group.entries.length > MAX_ENTRIES_PER_LIBRARY) {
      throw new Error(
        `Seed group ${group.id} exceeds the ${MAX_ENTRIES_PER_LIBRARY}-entry library limit.`
      );
    }
    const entries = group.entries.map((entry, entryIndex) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.file !== "string" ||
        !entry.file.trim() ||
        typeof entry.title !== "string" ||
        !entry.title.trim()
      ) {
        throw new Error(
          `Seed entry ${group.id}[${entryIndex}] needs file and title strings.`
        );
      }
      return { file: entry.file, title: entry.title };
    });
    return { id: group.id, title: group.title, entries };
  });
  if (new Set(groups.map((group) => group.id)).size !== groups.length) {
    throw new Error("Seed group ids must be unique.");
  }
  return { groups };
}

/**
 * Deterministic seeding plan for one group: fixed library/entry ids make the
 * whole run idempotent across machines and repeated executions.
 */
export function planSkillLibrary(group, bodies, now) {
  const knownProfile = Object.hasOwn(GROUP_PROFILES, group.id);
  const profile = knownProfile ? GROUP_PROFILES[group.id] : DEFAULT_PROFILE;
  if (!knownProfile) {
    console.warn(
      `Seed group "${group.id}" has no profile; falling back to defaults.`
    );
  }
  const libraryId = `skill-novelops-${group.id}`;
  const title = `NovelOps·${group.title}`;
  const entries = group.entries.map((entry, index) => {
    const body = bodies.get(entry.file);
    if (body === undefined) {
      throw new Error(`Seed file missing or unreadable: ${entry.file}`);
    }
    if (!body.trim()) {
      throw new Error(`Seed file is empty: ${entry.file}`);
    }
    const entryId = `skill-novelops-${group.id}-e${String(index + 1).padStart(2, "0")}`;
    return {
      id: entryId,
      stageId: profile.stageId,
      title: entry.title,
      fileName: `${sanitizePathSegment(entryId)}.md`,
      body,
      createdAt: now,
      updatedAt: now
    };
  });
  return {
    libraryId,
    title,
    skillType: "long",
    skillKind: profile.skillKind,
    stageId: profile.stageId,
    overview: profile.overview,
    isBuiltin: false,
    directoryName: sanitizePathSegment(title),
    entries
  };
}

/** deepwrite.json payload; validated against contracts schemas in tests. */
export function buildSkillLibraryManifest(plan, revision = 0) {
  return {
    schemaVersion: 1,
    revision,
    kind: "deepwrite.skill-library",
    id: plan.libraryId,
    title: plan.title,
    createdAt: plan.entries[0].createdAt,
    updatedAt: plan.entries[0].updatedAt,
    skillType: plan.skillType,
    skillKind: plan.skillKind,
    overview: plan.overview,
    isBuiltin: plan.isBuiltin,
    entries: plan.entries.map((entry) => ({
      id: entry.id,
      stageId: entry.stageId,
      title: entry.title,
      path: `entries/${entry.fileName}`,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    }))
  };
}

export function assertRegistryShape(registry, source) {
  if (!registry || typeof registry !== "object") {
    throw new Error(`${source} is not a JSON object.`);
  }
  if (registry.schemaVersion !== 1) {
    throw new Error(
      `${source} has unsupported schema version ${String(registry.schemaVersion)}; refusing to write.`
    );
  }
  if (!Array.isArray(registry.projects)) {
    throw new Error(`${source} has no projects array; refusing to write.`);
  }
  for (const [index, project] of registry.projects.entries()) {
    if (
      !project ||
      typeof project !== "object" ||
      typeof project.id !== "string" ||
      !project.id ||
      typeof project.domain !== "string" ||
      !project.domain ||
      typeof project.projectDirectory !== "string" ||
      !project.projectDirectory
    ) {
      throw new Error(
        `${source} project ${index} is malformed; refusing to write.`
      );
    }
  }
}

/** Idempotent registry merge: existing (domain, id) rows stay untouched. */
export function mergeRegistryProjects(registry, registrations) {
  const known = new Set(
    registry.projects.map((project) => `${project.domain}:${project.id}`)
  );
  const additions = registrations.filter(
    (registration) => !known.has(`skill-library:${registration.libraryId}`)
  );
  if (additions.length === 0) {
    return { registry, added: [] };
  }
  return {
    registry: {
      ...registry,
      projects: [
        ...registry.projects,
        ...additions.map((addition) => ({
          id: addition.libraryId,
          domain: "skill-library",
          projectDirectory: addition.projectDirectory,
          registeredAt: addition.registeredAt
        }))
      ]
    },
    added: additions
  };
}

/** Executes the seeding against a real userData directory. */
export async function seedAll({
  seedRoot = SEED_ROOT,
  userDataPath,
  dryRun = false,
  now = () => new Date().toISOString()
}) {
  const manifest = await loadSeedManifest(seedRoot);
  const bodies = new Map();
  for (const group of manifest.groups) {
    for (const entry of group.entries) {
      bodies.set(
        entry.file,
        await readFile(join(seedRoot, entry.file), "utf8")
      );
    }
  }
  const registryPath = join(userDataPath, REGISTRY_FILE);
  if (!existsSync(registryPath)) {
    throw new Error(
      `No ${REGISTRY_FILE} under ${userDataPath}. Start DeepWrite once before seeding.`
    );
  }
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  assertRegistryShape(registry, REGISTRY_FILE);

  const skillsRoot = join(userDataPath, "catalog-projects", "skills");
  const timestamp = now();
  const plans = manifest.groups.map((group) =>
    planSkillLibrary(group, bodies, timestamp)
  );
  const registered = new Set(
    registry.projects.map((project) => `${project.domain}:${project.id}`)
  );
  const pending = plans.filter(
    (plan) => !registered.has(`skill-library:${plan.libraryId}`)
  );
  const skipped = plans
    .filter((plan) => registered.has(`skill-library:${plan.libraryId}`))
    .map((plan) => plan.libraryId);

  const registrations = pending.map((plan) => {
    let directoryName = plan.directoryName;
    if (existsSync(join(skillsRoot, directoryName))) {
      directoryName = `${directoryName}-${randomHex8()}`;
    }
    return {
      libraryId: plan.libraryId,
      projectDirectory: resolve(skillsRoot, directoryName),
      registeredAt: timestamp
    };
  });

  if (dryRun) {
    const team = await seedAgentTeam({
      userDataPath,
      bodies,
      timestamp,
      dryRun
    });
    return {
      created: registrations,
      skipped,
      registryUpdated: false,
      plans,
      team
    };
  }

  for (const [index, plan] of pending.entries()) {
    const { projectDirectory } = registrations[index];
    const staging = join(
      skillsRoot,
      `.novelops-seed-${process.pid}-${randomHex8()}.tmp`
    );
    await mkdir(join(staging, "entries"), { recursive: true, mode: 0o700 });
    try {
      for (const entry of plan.entries) {
        await writeFile(
          join(staging, "entries", entry.fileName),
          entry.body,
          "utf8"
        );
      }
      await writeFile(
        join(staging, "deepwrite.json"),
        `${JSON.stringify(buildSkillLibraryManifest(plan), null, 2)}\n`,
        "utf8"
      );
      await rename(staging, projectDirectory);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  let registryUpdated = false;
  if (registrations.length > 0) {
    const merged = mergeRegistryProjects(registry, registrations);
    if (merged.added.length > 0) {
      await copyFile(registryPath, join(userDataPath, REGISTRY_BACKUP_FILE));
      const temporary = `${registryPath}.${randomHex8()}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify(merged.registry, null, 2)}\n`,
        "utf8"
      );
      await rename(temporary, registryPath);
      registryUpdated = true;
    }
  }

  const team = await seedAgentTeam({ userDataPath, bodies, timestamp, dryRun });
  return {
    created: registrations,
    skipped,
    registryUpdated,
    plans,
    team
  };
}

/**
 * Appends the preset NovelOps team to the agent-team catalog. Idempotent by
 * team id; leaves enabledTeamIds and every other team untouched.
 */
async function seedAgentTeam({ userDataPath, bodies, dryRun }) {
  const teamCatalogPath = join(userDataPath, "config", AGENT_TEAM_FILE);
  if (!existsSync(teamCatalogPath)) {
    return { seeded: false, reason: "agent-team catalog not initialised yet" };
  }
  const catalog = JSON.parse(await readFile(teamCatalogPath, "utf8"));
  assertAgentTeamCatalogShape(catalog, AGENT_TEAM_FILE);
  const knownTeam = catalog.teams.some((team) => team.id === NOVELOPS_TEAM_ID);
  if (knownTeam) {
    return { seeded: false, reason: "already present" };
  }
  const team = planAgentTeam(bodies);
  if (dryRun) {
    return { seeded: false, reason: "would create", team };
  }
  await copyFile(
    teamCatalogPath,
    join(userDataPath, "config", AGENT_TEAM_BACKUP_FILE)
  );
  const temporary = `${teamCatalogPath}.${randomHex8()}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify({ ...catalog, teams: [...catalog.teams, team] }, null, 2)}\n`,
    "utf8"
  );
  await rename(temporary, teamCatalogPath);
  return { seeded: true, team };
}

function assertAgentTeamCatalogShape(catalog, source) {
  if (!catalog || typeof catalog !== "object") {
    throw new Error(`${source} is not a JSON object.`);
  }
  if (typeof catalog.version !== "number") {
    throw new Error(`${source} has no catalog version; refusing to write.`);
  }
  if (!Array.isArray(catalog.teams) || catalog.teams.length === 0) {
    throw new Error(`${source} has no teams array; refusing to write.`);
  }
  for (const [index, team] of catalog.teams.entries()) {
    if (
      !team ||
      typeof team !== "object" ||
      typeof team.id !== "string" ||
      !team.id
    ) {
      throw new Error(
        `${source} team ${index} is malformed; refusing to write.`
      );
    }
  }
}

function sanitizePathSegment(value) {
  const sanitized = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return sanitized || `seed-${randomHex8()}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const userDataFlag = args.indexOf("--userData");
  const userDataPath =
    userDataFlag >= 0 && args[userDataFlag + 1]
      ? resolve(args[userDataFlag + 1])
      : process.env.DEEPWRITE_USER_DATA
        ? resolve(process.env.DEEPWRITE_USER_DATA)
        : join(homedir(), "Library", "Application Support", "DeepWrite");

  const result = await seedAll({ userDataPath, dryRun });
  console.log(`NovelOps seed target: ${userDataPath}`);
  for (const plan of result.plans) {
    const state = result.skipped.includes(plan.libraryId)
      ? "already present"
      : dryRun
        ? "would create"
        : "created";
    console.log(
      `  [${state}] ${plan.libraryId} — ${plan.title} (${plan.entries.length} entries)`
    );
  }
  if (dryRun) {
    console.log(
      result.created.length > 0
        ? `Dry run: would create ${result.created.length} skill librar${result.created.length === 1 ? "y" : "ies"}; ${result.skipped.length} already present.`
        : "Dry run: nothing to create; all seed libraries already registered."
    );
  } else {
    console.log(
      `Created ${result.created.length}, skipped ${result.skipped.length}; registry ${result.registryUpdated ? "updated" : "unchanged"}.`
    );
  }
  if (result.team) {
    const label = result.team.seeded
      ? "created"
      : result.team.reason === "would create"
        ? "would create"
        : `skipped (${result.team.reason})`;
    console.log(
      `  Agent team ${NOVELOPS_TEAM_ID}: ${label}${result.team.team ? ` — ${result.team.team.settings.teams[0].subagents.length} members` : ""}`
    );
  }
}

const invokedDirectly = (() => {
  try {
    return resolve(process.argv[1] ?? "") === resolve(SEED_ROOT, "seed.mjs");
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      `Seeding failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
