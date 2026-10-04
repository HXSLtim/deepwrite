import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AgentTeamCatalogSnapshotSchema,
  AgentTeamProfileSchema,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS
} from "../../packages/contracts/src/index.ts";
import {
  NOVELOPS_TEAM_ID,
  buildOrchestratorPrompt,
  planAgentTeam
} from "./team.mjs";

const SEED_ROOT = fileURLToPath(new URL(".", import.meta.url));

async function seedBodies() {
  const files = [
    "workflow/ORCHESTRATOR.md",
    "workflow/writer-prompt.md",
    "workflow/editor-prompt.md",
    "workflow/humanizer-prompt.md",
    "workflow/imitate-prompt.md",
    "workflow/continue-prompt.md",
    "workflow/topic.md",
    "workflow/topic-market.md",
    "workflow/characters.md",
    "workflow/outline.md",
    "workflow/pacing.md",
    "workflow/material-prep.md",
    "workflow/operations.md",
    "workflow/creative-disruption.md",
    "workflow/qc.md",
    "workflow/writer.md"
  ];
  return new Map(
    await Promise.all(
      files.map(async (file) => [
        file,
        await readFile(join(SEED_ROOT, file), "utf8")
      ])
    )
  );
}

describe("novelops serialization team", () => {
  it("plans a contracts-valid long team with 16 members", async () => {
    const team = planAgentTeam(await seedBodies());
    expect(team.id).toBe(NOVELOPS_TEAM_ID);
    expect(team.workspaceType).toBe("long");
    expect(() => AgentTeamProfileSchema.parse(team)).not.toThrow();

    const members = team.settings.teams[0].subagents;
    expect(members).toHaveLength(16);
    expect(members[0]).toMatchObject({ id: "novelops_orchestrator" });
    expect(members.every((member) => member.enabled)).toBe(true);
    expect(members.every((member) => member.modelMode === "inherit")).toBe(
      true
    );
    // Deterministic planning: same inputs, same profile.
    expect(planAgentTeam(await seedBodies())).toEqual(team);
  });

  it("keeps every member prompt inside the subagent budget", async () => {
    const team = planAgentTeam(await seedBodies());
    for (const member of team.settings.teams[0].subagents) {
      expect(member.systemPrompt.length).toBeLessThanOrEqual(20_000);
      expect(member.systemPrompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("builds the orchestrator prompt from the applicable sections only", async () => {
    const bodies = await seedBodies();
    const prompt = buildOrchestratorPrompt(
      bodies.get("workflow/ORCHESTRATOR.md")
    );
    expect(prompt.length).toBeLessThanOrEqual(20_000);
    for (const gate of ["G1", "G2", "G3", "G4", "G5", "G6", "G7"]) {
      expect(prompt).toContain(gate);
    }
    expect(prompt).toContain("DeepWrite 长篇工作台");
    // novel-system repo-specific sections are dropped.
    expect(prompt).not.toContain("### 3.4 文件目录结构");
    expect(prompt).not.toContain("### 1.2 项目背景说明");
  });

  it("fits alongside the default team in a catalog snapshot", async () => {
    const team = planAgentTeam(await seedBodies());
    const snapshot = AgentTeamCatalogSnapshotSchema.parse({
      enabledTeamIds: {},
      teams: [
        {
          id: "team_default_long",
          name: "默认长篇团队",
          workspaceType: "long",
          settings: DEFAULT_LONG_AGENT_TEAM_SETTINGS
        },
        team
      ]
    });
    expect(snapshot.teams.map((entry) => entry.id)).toContain(NOVELOPS_TEAM_ID);
  });

  it("fails loudly when a member file is missing", async () => {
    const bodies = await seedBodies();
    bodies.delete("workflow/qc.md");
    expect(() => planAgentTeam(bodies)).toThrow("workflow/qc.md");
  });
});
