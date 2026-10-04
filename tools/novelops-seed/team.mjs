/**
 * Builds the preset NovelOps serialization team (a long-workspace
 * AgentTeamProfile) from the workflow seed documents.
 *
 * The orchestrator prompt is assembled from ORCHESTRATOR.md sections: the
 * novel-system project background (1.2) and file-layout section (3.4) are
 * dropped because they describe the source repo, not DeepWrite; everything
 * else (G1-G7 gates, quality modes, execution principles) is kept verbatim
 * so the gate semantics stay single-sourced from the seed tree.
 */

const ORCHESTRATOR_PROMPT_BUDGET = 20_000;

const ADAPTATION_HEADER = [
  "【NovelOps 主编 · DeepWrite 适配说明】",
  "本指令运行在 DeepWrite 长篇工作台的子代理位置：你没有文件系统访问权，也不要引用任何 novel-system 路径。",
  "状态以当前作品上下文、连续性账本与委派任务附带的材料为准；产出以文本回复主智能体，不落盘。",
  "完整模式（新书协议、独立流程、参考附录）位于 NovelOps 技能库 workflow 组，可请主对话读取后转达。",
  ""
].join("\n");

/** ORCHESTRATOR.md sections that do not apply inside DeepWrite. */
/**
 * ORCHESTRATOR.md sections that describe the novel-system repo rather than
 * DeepWrite, plus gate sections replaced by an adaptation note.
 */
const DROPPED_SECTIONS = [
  "### 1.1 设计目标",
  "### 1.2 项目背景说明",
  "### 3.4 文件目录结构"
];

/** Sections whose body is replaced by a DeepWrite adaptation note. */
const SECTION_NOTES = new Map([
  [
    "### G5：metrics指标门",
    "（DeepWrite 环境没有 metrics.py 量化工具；以连续性账本核对、质检报告结论与文风六卡达标情况替代本门的量化检查。）"
  ]
]);

export const NOVELOPS_TEAM_ID = "team_novelops_serialization";
export const NOVELOPS_TEAM_NAME = "NovelOps 连载团队";

const MEMBERS = [
  {
    id: "writer",
    name: "NovelOps·写手",
    description: "按大纲与门禁要求产出章节正文。",
    file: "workflow/writer-prompt.md"
  },
  {
    id: "editor",
    name: "NovelOps·编辑",
    description: "审校成稿的结构、逻辑与文笔问题并给出修改意见。",
    file: "workflow/editor-prompt.md"
  },
  {
    id: "humanizer",
    name: "NovelOps·去AI化",
    description: "单遍去AI化润色，消除模板腔与高频AI用词。",
    file: "workflow/humanizer-prompt.md"
  },
  {
    id: "imitate",
    name: "NovelOps·仿写",
    description: "对照标杆文本仿写，迁移句式与节奏。",
    file: "workflow/imitate-prompt.md"
  },
  {
    id: "continue_agent",
    name: "NovelOps·续写",
    description: "按既有文风与伏笔续写后续章节。",
    file: "workflow/continue-prompt.md"
  },
  {
    id: "topic",
    name: "NovelOps·选题卡",
    description: "阶段0：产出选题卡（题材、卖点、钩子）。",
    file: "workflow/topic.md"
  },
  {
    id: "topic_market",
    name: "NovelOps·市场调研",
    description: "阶段0：市场调研报告与对标分析。",
    file: "workflow/topic-market.md"
  },
  {
    id: "characters",
    name: "NovelOps·人物档案",
    description: "阶段0：人物档案与关系网设计。",
    file: "workflow/characters.md"
  },
  {
    id: "outline",
    name: "NovelOps·三幕大纲",
    description: "阶段0：三幕结构大纲与卷纲拆解。",
    file: "workflow/outline.md"
  },
  {
    id: "pacing",
    name: "NovelOps·节奏规划",
    description: "阶段0：节奏规划卡与信息释放节奏。",
    file: "workflow/pacing.md"
  },
  {
    id: "material_prep",
    name: "NovelOps·素材报告",
    description: "阶段0：素材报告与资料整备。",
    file: "workflow/material-prep.md"
  },
  {
    id: "operations",
    name: "NovelOps·运营包装",
    description: "阶段0：书名、简介与运营包装方案。",
    file: "workflow/operations.md"
  },
  {
    id: "creative_disruption",
    name: "NovelOps·创意扰动",
    description: "阶段0：创意扰动提案，打破套路化设计。",
    file: "workflow/creative-disruption.md"
  },
  {
    id: "qc",
    name: "NovelOps·质检报告",
    description: "产出章节质检（QA）报告。",
    file: "workflow/qc.md"
  },
  {
    id: "chapter_writer",
    name: "NovelOps·章节写手模板",
    description: "单章产出的执行模板与交付格式。",
    file: "workflow/writer.md"
  }
];

/** Splits a markdown document into (heading, body) sections at `## ` level. */
function splitTopLevelSections(document) {
  const lines = document.split("\n");
  const sections = [];
  let currentHeading = null;
  let currentLines = [];
  const flush = () => {
    if (currentHeading !== null || currentLines.length > 0) {
      sections.push({
        heading: currentHeading,
        text: currentLines.join("\n")
      });
    }
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeading = line;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

function withoutSubsections(sectionText, droppedHeadings) {
  const lines = sectionText.split("\n");
  const kept = [];
  let dropping = false;
  for (const line of lines) {
    if (line.startsWith("### ")) {
      const heading = line.trim();
      const note = SECTION_NOTES.get(heading);
      if (note !== undefined) {
        kept.push(line, note);
        dropping = true;
        continue;
      }
      dropping = droppedHeadings.includes(heading);
    }
    if (!dropping) kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\n{3,}$/u, "\n");
}

/** Deterministic orchestrator prompt within the subagent budget. */
export function buildOrchestratorPrompt(orchestratorDocument) {
  const sections = splitTopLevelSections(orchestratorDocument);
  const kept = sections
    .map((section) => withoutSubsections(section.text, DROPPED_SECTIONS))
    .filter((text) => text.trim().length > 0);
  const prompt = `${ADAPTATION_HEADER}${kept.join("\n")}`.trim();
  if (prompt.length > ORCHESTRATOR_PROMPT_BUDGET) {
    throw new Error(
      `Orchestrator prompt is ${prompt.length} chars, over the ${ORCHESTRATOR_PROMPT_BUDGET} subagent limit; prune the seed document.`
    );
  }
  return prompt;
}

/**
 * Deterministic AgentTeamProfile (long workspace) for the NovelOps team.
 * Validated against the contracts schemas in team.test.mjs.
 */
export function planAgentTeam(bodies) {
  const orchestratorPrompt = buildOrchestratorPrompt(
    bodies.get("workflow/ORCHESTRATOR.md")
  );
  const memberDefinitions = MEMBERS.map((member) => {
    const body = bodies.get(member.file);
    if (body === undefined || !body.trim()) {
      throw new Error(`Team member file missing or empty: ${member.file}`);
    }
    return {
      id: `novelops_${member.id}`,
      name: member.name,
      description: member.description,
      systemPrompt: body.trim(),
      enabled: true,
      modelMode: "inherit"
    };
  });
  const subagents = [
    {
      id: "novelops_orchestrator",
      name: "NovelOps·主编（G0-G8 门禁）",
      description:
        "总编审：按 G0-G8 门禁审查章稿与规划产物，输出门禁判定与修改指令。",
      systemPrompt: orchestratorPrompt,
      enabled: true,
      modelMode: "inherit"
    },
    ...memberDefinitions
  ];
  return {
    id: NOVELOPS_TEAM_ID,
    name: NOVELOPS_TEAM_NAME,
    workspaceType: "long",
    settings: {
      workspaceType: "long",
      parallelSubagents: false,
      teams: [
        {
          parentAgentId: "long",
          subagents
        }
      ]
    }
  };
}
