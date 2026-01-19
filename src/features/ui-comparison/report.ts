/**
 * Comparison Report Generator
 * 生成详细的对比报告
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import type {
  ComparisonReport,
  ViewportResult,
  Suggestion,
  LayoutIssue,
  StyleDiff,
  ComparisonStatus,
} from "./types"
import { getDiffLevelDescription } from "./compare"

/**
 * 生成对比报告
 */
export function generateReport(
  baselineUrl: string,
  candidateUrl: string,
  viewportResults: ViewportResult[]
): ComparisonReport {
  const suggestions = generateSuggestions(viewportResults)

  // 计算总体匹配度
  const totalMatch =
    viewportResults.reduce((sum, r) => sum + r.pixelComparison.matchPercentage, 0) /
    viewportResults.length

  // 计算总体状态
  const overallStatus = calculateOverallStatus(viewportResults)

  // 统计
  const summary = {
    totalViewports: viewportResults.length,
    passedViewports: viewportResults.filter((r) => r.status === "pass").length,
    warnedViewports: viewportResults.filter((r) => r.status === "warn").length,
    failedViewports: viewportResults.filter((r) => r.status === "fail").length,
    criticalIssues: viewportResults.reduce(
      (sum, r) => sum + r.layoutComparison.issues.filter((i) => i.severity === "critical").length,
      0
    ),
    warnings: viewportResults.reduce(
      (sum, r) => sum + r.layoutComparison.issues.filter((i) => i.severity === "warning").length,
      0
    ),
  }

  return {
    timestamp: new Date().toISOString(),
    baselineUrl,
    candidateUrl,
    overallStatus,
    overallMatchPercentage: totalMatch,
    viewportResults,
    summary,
    suggestions,
  }
}

/**
 * 计算总体状态
 */
function calculateOverallStatus(viewportResults: ViewportResult[]): ComparisonStatus {
  if (viewportResults.some((r) => r.status === "fail")) return "fail"
  if (viewportResults.some((r) => r.status === "warn")) return "warn"
  return "pass"
}

/**
 * 生成优化建议
 */
function generateSuggestions(viewportResults: ViewportResult[]): Suggestion[] {
  const suggestions: Suggestion[] = []
  const seenIssues = new Set<string>()

  for (const result of viewportResults) {
    // 布局问题建议
    for (const issue of result.layoutComparison.issues) {
      const key = `layout:${issue.element}:${issue.type}`
      if (!seenIssues.has(key)) {
        seenIssues.add(key)
        suggestions.push(layoutIssueToSuggestion(issue, result.viewport.name || ""))
      }
    }

    // 样式差异建议
    for (const diff of result.styleComparison.diffs) {
      const key = `style:${diff.selector}:${diff.property}`
      if (!seenIssues.has(key)) {
        seenIssues.add(key)
        suggestions.push(styleDiffToSuggestion(diff))
      }
    }

    // 响应式问题建议
    if (result.status === "fail" && result.viewport.width <= 768) {
      const key = `responsive:${result.viewport.name}`
      if (!seenIssues.has(key)) {
        seenIssues.add(key)
        suggestions.push({
          priority: "high",
          category: "responsive",
          issue: `移动端视口 ${result.viewport.name} (${result.viewport.width}x${result.viewport.height}) 存在明显差异`,
          suggestion: "检查响应式断点的媒体查询，确保移动端样式正确应用",
        })
      }
    }
  }

  // 按优先级排序
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

/**
 * 将布局问题转换为建议
 */
function layoutIssueToSuggestion(issue: LayoutIssue, viewportName: string): Suggestion {
  const priority = issue.severity === "critical" ? "high" : issue.severity === "warning" ? "medium" : "low"

  let suggestion = issue.suggestion || ""
  let code: string | undefined

  switch (issue.type) {
    case "position":
      suggestion = `检查 ${issue.element} 的定位属性 (margin, padding, position) 是否发生变化`
      code = `/* 建议检查 */
${issue.element} {
  /* 检查这些属性 */
  margin: ...;
  padding: ...;
  position: ...;
  top/left/right/bottom: ...;
}`
      break
    case "size":
      suggestion = `检查 ${issue.element} 的尺寸属性 (width, height, box-sizing) 是否发生变化`
      code = `/* 建议检查 */
${issue.element} {
  /* 检查这些属性 */
  width: ...;
  height: ...;
  max-width: ...;
  box-sizing: ...;
}`
      break
    case "missing":
      suggestion = `元素 ${issue.element} 可能被删除或选择器发生变化，请确认是否预期`
      break
  }

  return {
    priority,
    category: "layout",
    element: issue.element,
    issue: `[${viewportName}] ${issue.description}`,
    suggestion,
    code,
  }
}

/**
 * 将样式差异转换为建议
 */
function styleDiffToSuggestion(diff: StyleDiff): Suggestion {
  const isCritical = ["font-family", "font-size", "color", "display", "position"].includes(diff.property)

  return {
    priority: isCritical ? "medium" : "low",
    category: "style",
    element: diff.selector,
    issue: `${diff.selector} 的 ${diff.property} 属性发生变化`,
    suggestion: `将 ${diff.property} 从 "${diff.candidate}" 改回 "${diff.baseline}"`,
    code: `${diff.selector} {
  ${diff.property}: ${diff.baseline}; /* 原始值 */
  /* 当前值: ${diff.candidate} */
}`,
  }
}

/**
 * 格式化报告为 Markdown
 */
export function formatReportAsMarkdown(report: ComparisonReport): string {
  const statusEmoji = {
    pass: "✅",
    warn: "⚠️",
    fail: "❌",
  }

  const diffLevel = getDiffLevelDescription(100 - report.overallMatchPercentage)

  let md = `# UI Comparison Report

## 概览

| 项目 | 值 |
|------|-----|
| 基准页面 | ${report.baselineUrl} |
| 对比页面 | ${report.candidateUrl} |
| 测试时间 | ${report.timestamp} |
| 总体状态 | ${statusEmoji[report.overallStatus]} ${report.overallStatus.toUpperCase()} |
| 匹配度 | ${report.overallMatchPercentage.toFixed(2)}% |
| 差异等级 | ${diffLevel.emoji} ${diffLevel.level} |

## 统计

- 测试视口: ${report.summary.totalViewports}
- 通过: ${report.summary.passedViewports}
- 警告: ${report.summary.warnedViewports}
- 失败: ${report.summary.failedViewports}
- 严重问题: ${report.summary.criticalIssues}
- 警告数: ${report.summary.warnings}

## 视口详情

| 视口 | 尺寸 | 匹配度 | 状态 | 问题数 |
|------|------|--------|------|--------|
`

  for (const result of report.viewportResults) {
    const vp = result.viewport
    md += `| ${vp.name || "Unknown"} | ${vp.width}x${vp.height} | ${result.pixelComparison.matchPercentage.toFixed(2)}% | ${statusEmoji[result.status]} | ${result.layoutComparison.issues.length} |\n`
  }

  // 详细差异
  md += `\n## 检测到的差异\n\n`

  for (const result of report.viewportResults) {
    if (result.layoutComparison.issues.length === 0 && result.styleComparison.diffs.length === 0) {
      continue
    }

    md += `### ${result.viewport.name || result.viewport.width + "x" + result.viewport.height}\n\n`

    // 布局问题
    if (result.layoutComparison.issues.length > 0) {
      md += `#### 布局问题\n\n`
      for (const issue of result.layoutComparison.issues) {
        const severityEmoji = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"
        md += `${severityEmoji} **${issue.type.toUpperCase()}** - \`${issue.element}\`\n`
        md += `- 问题: ${issue.description}\n`
        if (issue.baseline) md += `- 基准: ${issue.baseline}\n`
        if (issue.candidate) md += `- 当前: ${issue.candidate}\n`
        if (issue.suggestion) md += `- 建议: ${issue.suggestion}\n`
        md += `\n`
      }
    }

    // 样式差异
    if (result.styleComparison.diffs.length > 0) {
      md += `#### 样式差异\n\n`
      md += `| 选择器 | 属性 | 基准值 | 当前值 |\n`
      md += `|--------|------|--------|--------|\n`
      for (const diff of result.styleComparison.diffs) {
        md += `| \`${diff.selector}\` | ${diff.property} | ${diff.baseline} | ${diff.candidate} |\n`
      }
      md += `\n`
    }
  }

  // 截图路径
  md += `## 截图\n\n`
  for (const result of report.viewportResults) {
    const vp = result.viewport
    md += `### ${vp.name || vp.width + "x" + vp.height}\n\n`
    md += `- 基准: \`${result.pixelComparison.baselineScreenshot}\`\n`
    md += `- 当前: \`${result.pixelComparison.candidateScreenshot}\`\n`
    md += `- 差异: \`${result.pixelComparison.diffScreenshot}\`\n\n`
  }

  // 优化建议
  if (report.suggestions.length > 0) {
    md += `## 优化建议\n\n`

    const priorityLabels = { high: "🔴 高优先级", medium: "🟡 中优先级", low: "🟢 低优先级" }

    for (const suggestion of report.suggestions) {
      md += `### ${priorityLabels[suggestion.priority]}\n\n`
      if (suggestion.element) md += `**元素**: \`${suggestion.element}\`\n\n`
      md += `**问题**: ${suggestion.issue}\n\n`
      md += `**建议**: ${suggestion.suggestion}\n\n`
      if (suggestion.code) {
        md += `**参考代码**:\n\`\`\`css\n${suggestion.code}\n\`\`\`\n\n`
      }
    }
  }

  return md
}

/**
 * 格式化报告为控制台输出
 */
export function formatReportForConsole(report: ComparisonReport): string {
  const statusEmoji = {
    pass: "✅",
    warn: "⚠️",
    fail: "❌",
  }

  const diffLevel = getDiffLevelDescription(100 - report.overallMatchPercentage)

  let output = `
╔════════════════════════════════════════════════════════════╗
║               UI COMPARISON REPORT                         ║
╠════════════════════════════════════════════════════════════╣
║ Baseline URL:  ${report.baselineUrl.padEnd(42)} ║
║ Candidate URL: ${report.candidateUrl.padEnd(42)} ║
║ Test Time:     ${report.timestamp.padEnd(42)} ║
╚════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────┐
│ OVERALL RESULT: ${statusEmoji[report.overallStatus]} ${report.overallStatus.toUpperCase().padEnd(16)} │
│ Visual Match Score: ${report.overallMatchPercentage.toFixed(2).padEnd(14)}% │
│ Diff Level: ${diffLevel.emoji} ${diffLevel.level.padEnd(20)} │
└─────────────────────────────────────┘

📊 VIEWPORT BREAKDOWN
─────────────────────
| Viewport           | Match %  | Status | Issues |
|--------------------|----------|--------|--------|
`

  for (const result of report.viewportResults) {
    const vp = result.viewport
    const name = (vp.name || `${vp.width}x${vp.height}`).padEnd(18)
    const match = result.pixelComparison.matchPercentage.toFixed(2).padStart(6) + "%"
    const status = statusEmoji[result.status].padEnd(5)
    const issues = result.layoutComparison.issues.length.toString().padStart(6)
    output += `| ${name} | ${match} | ${status} | ${issues} |\n`
  }

  // 问题列表
  const allIssues = report.viewportResults.flatMap((r) =>
    r.layoutComparison.issues.map((i) => ({ ...i, viewport: r.viewport }))
  )

  if (allIssues.length > 0) {
    output += `\n🔍 DETECTED DIFFERENCES\n───────────────────────\n`

    for (const issue of allIssues.filter((i) => i.severity === "critical")) {
      output += `\n[CRITICAL] ${issue.type.toUpperCase()}\n`
      output += `  - Element: ${issue.element}\n`
      output += `  - Viewport: ${issue.viewport.name || issue.viewport.width + "x" + issue.viewport.height}\n`
      output += `  - Issue: ${issue.description}\n`
      if (issue.baseline) output += `  - Baseline: ${issue.baseline}\n`
      if (issue.candidate) output += `  - Candidate: ${issue.candidate}\n`
      if (issue.suggestion) output += `  - Suggestion: ${issue.suggestion}\n`
    }

    for (const issue of allIssues.filter((i) => i.severity === "warning")) {
      output += `\n[WARNING] ${issue.type.toUpperCase()}\n`
      output += `  - Element: ${issue.element}\n`
      output += `  - Issue: ${issue.description}\n`
      if (issue.suggestion) output += `  - Suggestion: ${issue.suggestion}\n`
    }
  }

  // 建议
  if (report.suggestions.length > 0) {
    output += `\n💡 OPTIMIZATION SUGGESTIONS\n───────────────────────────\n`

    let idx = 1
    for (const suggestion of report.suggestions.slice(0, 5)) {
      const priorityLabel = { high: "HIGH PRIORITY", medium: "MEDIUM", low: "LOW" }[suggestion.priority]
      output += `\n${idx}. [${priorityLabel}] ${suggestion.issue}\n`
      output += `   建议: ${suggestion.suggestion}\n`
      idx++
    }

    if (report.suggestions.length > 5) {
      output += `\n   ... 还有 ${report.suggestions.length - 5} 条建议\n`
    }
  }

  return output
}

/**
 * 保存报告到文件
 */
export async function saveReport(
  report: ComparisonReport,
  outputDir: string
): Promise<{ jsonPath: string; markdownPath: string }> {
  await fs.mkdir(outputDir, { recursive: true })

  const timestamp = report.timestamp.replace(/[:.]/g, "-")
  const jsonPath = path.join(outputDir, `report-${timestamp}.json`)
  const markdownPath = path.join(outputDir, `report-${timestamp}.md`)

  await Promise.all([
    fs.writeFile(jsonPath, JSON.stringify(report, null, 2)),
    fs.writeFile(markdownPath, formatReportAsMarkdown(report)),
  ])

  return { jsonPath, markdownPath }
}
