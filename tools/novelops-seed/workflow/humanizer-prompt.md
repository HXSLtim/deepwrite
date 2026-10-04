<!-- 来源：NovelOps v2.10（prompts/humanizer-prompt.md）。移植入 DeepWrite 种子树（tools/novelops-seed/workflow/humanizer-prompt.md），路径引用已重写为 DeepWrite 原生结构名；原始版权/作者声明见本文件其余部分。 -->

# Humanizer 去AI化Prompt

> novelOps 原创化内容，无外部来源引用。
> 用途：G3草稿生成后的去AI化处理、G5参考指标
> 集成位置：指标自检（文风六卡·卡6 体检清单） calc_ai_pattern_density + G3写作约束

---

## 概述

Humanizer 去AI化**收敛为单 pass**（原 3-Pass 已合并为一次执行）：
1. **检测+改写合并** — 单次扫描 AI 典型模式并当场改写，保留作者 voice
2. **复核交 指标自检（文风六卡·卡6 体检清单）** — 去AI效果由 `指标自检（文风六卡·卡6 体检清单） --aitext`（`AI_PATTERN_REGEXES` + `calc_ai_pattern_density` + AITextDetector）一次自动验证，替代原单独 Audit

> 下方 Pass 1 / Pass 2 / Pass 3 的规则**全部保留**，仅执行时合并到单次处理，不再串行跑三遍。

---

## Pass 1: Detection 检测规则

### 1. AI Vocabulary（AI词汇）

> 禁词/严控词黑名单以 `anti-ai-patterns.md` 一、词汇层面为准（单一真相源），本文件不重复罗列。检测时按该黑名单逐一扫，命中即按下方 Pass 2 改写方向处理。

### 2. Significance Inflation（夸张抬高）

- "a pivotal moment" → 直接描述时刻本身
- "deeply meaningful" → 通过动作展示意义
- "a testament to" → 删除或改写成具体表达
- "巨大的、恐怖的、令人窒息的" → 选一个

### 3. Synonym Cycling（同义词循环）

- 同一段落内用2-3种说法重复同一意思
- 选择最强版本，删除其余重复

### 4. Hedging in Narrative Voice（叙事犹豫）

- "seemed to" → 删除，改为直接陈述
- "appeared to" → 删除
- "could potentially" → 删除"potentially"
- 例外：对话或不可靠叙述者的犹豫是可以的

### 5. Mechanical Rule of Three（机械排比）

- "X, Y, and Z"三词结构，且三项并不真正不同
- 改为更自然的结构：pair + single，或四项列表

### 6. Generic Descriptions（泛化描述）

- "The sun dipped below the horizon" → 说明颜色、照亮了什么
- "A chill ran down her spine" → 说明具体身体感受
- "His heart raced" → 说明肾上腺素具体是什么感觉

### 7. Dialogue Tag Abuse（对话标签滥用）

- 避免：exclaimed, mused, retorted, quipped, declared, proclaimed
- 替换为：said（80%情况）或删除标签，改用动作节拍

### 8. Emotional Labeling（情感标签）

- "He felt sad" → 通过动作展示悲伤
- "She was angry" → 通过身体反应展示愤怒
- "They were happy" → 通过行为展示快乐

### 9. Purple Prose Inflation（华丽堆砌）

- 每个名词带2+形容词
- 过度隐喻叠加
- 不推进人物或情节的描述

### 10. Copula Avoidance（系动词回避）

- "serves as" → "is"或"was"
- "features" → "has"或"had"
- "boasts" → 直接描述

---

## Pass 2: Rewrite 重写规则

重写时需保留：
- 作者已建立的voice
- 角色特定的对话模式
- 有意的文学手法（如deliberate tricolon、unreliable narrator hedging）
- 作者对em dash的偏好（如果规则启用）

### 通用改写原则

| AI模式 | 改写方向 |
|--------|---------|
| "不禁皱眉" | "眉头拧在一起" |
| "一股暖流涌上心头" | "眼眶微热" |
| "嘴角微微上扬" | "挑了挑眉" |
| "他感到非常愤怒" | "手指陷进掌心的肉里，指节发白" |
| "她不禁想起了" | "她皱起眉头，回想起" |
| "随着修炼的深入" | "又一个月过去了。当他再次凝聚灵力时" |
| "他不知道的是" | 直接切换视角或用环境暗示 |
| "仿佛...一般" | 直接描写结果或用暗喻 |

---

## Pass 3: Audit 审计

最终扫描重写文本，确保没有遗漏的AI-isms。

### 写法级体检（补 指标自检（文风六卡·卡6 体检清单） 正则死角）

正则只能抓「禁词出现几次」，下面这些活问题需提示词级自检（详细见 `文风六卡.md` 卡6）：

1. 破折号「——」每章 ≤ 3 处，超出删。
2. 感叹号每段 ≤ 1 个。
3. 主谓小句内部硬插逗号（"像干涸的河床，涨满了水"）→ 删逗号连写。
4. 连续 3+ 排比 → 拆成叙述式。
5. 每段开头「XX 是…」定义句 → 改提问或场景开头。
6. 情绪标签「感到/觉得/无比/深深/心中涌起」→ 换行为描写。
7. 至少 2 处口语化表达（说白了 / 有个坑 / 坦白说）。
8. **大声读一遍**：别扭、喘不上气处 = AI 味最重处，重点改。

---

## 输出格式

```markdown
## Humanizer Report
### Patterns Found: [count]
| Pattern | Count | Severity |
|---------|-------|----------|
| [pattern type] | [N] | [High/Medium/Low] |

### Changes Made
- **[Pattern]**: "[original text]" → "[rewritten text]"

### Humanized Text
[Full rewritten passage]

### Notes
[Any patterns that were intentionally preserved and why]
```

---

## 量化指标

去AI化效果的量化验证统一由 `指标自检（文风六卡·卡6 体检清单）` 完成（σ²/TTR/Pσ²/BurstCV/ParaCV/3gramRep/3gramUniq 七项硬门禁 + `--aitext` 的 AITextDetector），详见 `ORCHESTRATOR-reference.md` 二、质量标准。本文件不再单独定义英文写作指标。

---

## 集成到指标自检（文风六卡·卡6 体检清单）的规则

以下规则可直接用正则实现自动检测：

```python
AI_PATTERN_WORDS = {
    # 词汇层面
    "不禁", "竟然", "居然",  # 限用词
    "一股.*涌上心头",  # 情感过度
    "心中暗道", "暗自想道",  # 心理旁白
    "嘴角微微上扬",  # AI万能公式
    "目光如炬", "浑身一震", "倒吸一口凉气",  # 早年网文滥用
    "在这个世界上", "命运的齿轮", "在历史的长河中",  # 哲学废话
    "总而言之", "综上所述", "不得不说", "值得一提的是",  # 过度总结
    "百感交集", "复杂的情感在心中交织",  # 情感标签
}

AI_SENTENCE_PATTERNS = {
    r"随着.+的.+,.+也",  # 万能开头
    r"他不知道的是",  # 上帝视角插话
    r"如果.+知道.+的话",  # 假设句式
    r".+看着.+,嘴角微微上扬",  # AI最爱
    r"仿佛.+一般",  # 模板比喻
    r".+的.+，如同.+一般",  # 过度比喻
}

AI_NARRATIVE_PATTERNS = {
    r"经过.+的(苦修|努力|修炼).+,有了很大提升",  # 总结式叙事
    r"他感到(非常)?(愤怒|开心|悲伤|害怕)",  # 情感宣告
    r"这就是.+的世界吗",  # 万能感叹
    r"时光飞逝",  # 总结性时间过渡
}
```
