# AGENT-schema.md — 页面格式规范

## Source 页（wiki/sources/）

```markdown
---
type: source
source: [[../../raw/inbox/{filename}|原始文件]]
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [type/source, topic/{topic}]
---

# {资料标题}

## 一句话总结
{一句话概括核心内容}

## 关键要点
- 要点 1
- 要点 2
- 要点 3

## 关联概念
- [[../concepts/{概念名}]]

## 我的思考
{个人评注、启发、质疑}

## 元信息
- 来源类型：{文章/论文/笔记/会议记录/网页/PDF}
- 作者/来源：{作者或出处}
- 摄入日期：YYYY-MM-DD

## 相关页面
- 待补充

## 原始来源
- [[../../raw/inbox/{filename}|原始文件]]
```

## Concept 页（wiki/concepts/）

```markdown
---
type: concept
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [type/concept, topic/{topic}]
---

# {概念名}

## 定义
{一句话定义}

## 核心内容
{对概念的详细阐述}

## 来源
- [[../sources/{source1}|来源1]] — {简短说明}

## 相关概念
- [[{相关概念}]]

## 我的理解
{个人解读、应用场景、疑问}

## 相关页面
- 待补充

## 原始来源
- 待补充
```

## Comparison 页（wiki/comparisons/）

```markdown
---
type: comparison
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [type/comparison, topic/{topic}]
---

# {A} vs {B}

## 对比结论
{一句话结论}

## 对比表

| 维度 | {A} | {B} |
|------|-----|-----|
| 维度 1 |  |  |

## 适用场景
- {A}: ...
- {B}: ...

## 相关页面
- 待补充

## 原始来源
- 待补充
```

## Map 页（wiki/maps/）

```markdown
---
type: map
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [type/map, topic/{topic}]
---

# {主题} — 导航

## 范围
{这个主题包含什么，不包含什么}

## 核心概念
- [[../concepts/{概念名}]]

## 关键资料
- [[../sources/{资料名}]]

## 相关页面
- 待补充
```
