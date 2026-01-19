/**
 * Visual Comparison Module
 * 使用 pixelmatch 进行像素级对比
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import type {
  Viewport,
  PixelComparisonResult,
  LayoutComparisonResult,
  StyleComparisonResult,
  ElementLayout,
  StyleDiff,
  LayoutIssue,
  BoundingBox,
  DIFF_THRESHOLDS,
} from "./types"

/**
 * 比较两张截图的像素差异
 */
export async function comparePixels(
  baselinePath: string,
  candidatePath: string,
  diffOutputPath: string,
  viewport: Viewport,
  threshold: number = 0.1
): Promise<PixelComparisonResult> {
  // 读取图片
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fs.readFile(baselinePath),
    fs.readFile(candidatePath),
  ])

  const baselinePng = PNG.sync.read(baselineBuffer)
  const candidatePng = PNG.sync.read(candidateBuffer)

  // 确保尺寸一致
  const width = Math.max(baselinePng.width, candidatePng.width)
  const height = Math.max(baselinePng.height, candidatePng.height)

  // 如果尺寸不一致，需要调整
  const baseline = ensureSize(baselinePng, width, height)
  const candidate = ensureSize(candidatePng, width, height)

  // 创建差异图
  const diff = new PNG({ width, height })

  // 执行像素对比
  const diffPixels = pixelmatch(baseline.data, candidate.data, diff.data, width, height, {
    threshold,
    includeAA: false, // 忽略抗锯齿差异
    alpha: 0.1,
    diffColor: [255, 0, 0], // 红色标记差异
    diffColorAlt: [0, 255, 0], // 绿色标记抗锯齿差异
  })

  // 保存差异图
  await fs.mkdir(path.dirname(diffOutputPath), { recursive: true })
  await fs.writeFile(diffOutputPath, PNG.sync.write(diff))

  const totalPixels = width * height
  const diffPercentage = (diffPixels / totalPixels) * 100
  const matchPercentage = 100 - diffPercentage

  return {
    viewport,
    totalPixels,
    diffPixels,
    diffPercentage,
    matchPercentage,
    baselineScreenshot: baselinePath,
    candidateScreenshot: candidatePath,
    diffScreenshot: diffOutputPath,
  }
}

/**
 * 确保 PNG 图片具有指定尺寸
 */
function ensureSize(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) {
    return png
  }

  const resized = new PNG({ width, height })

  // 填充白色背景
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      resized.data[idx] = 255 // R
      resized.data[idx + 1] = 255 // G
      resized.data[idx + 2] = 255 // B
      resized.data[idx + 3] = 255 // A
    }
  }

  // 复制原图内容
  for (let y = 0; y < png.height && y < height; y++) {
    for (let x = 0; x < png.width && x < width; x++) {
      const srcIdx = (png.width * y + x) << 2
      const dstIdx = (width * y + x) << 2
      resized.data[dstIdx] = png.data[srcIdx]
      resized.data[dstIdx + 1] = png.data[srcIdx + 1]
      resized.data[dstIdx + 2] = png.data[srcIdx + 2]
      resized.data[dstIdx + 3] = png.data[srcIdx + 3]
    }
  }

  return resized
}

/**
 * 比较元素布局
 */
export function compareLayouts(
  baselineLayouts: Map<string, BoundingBox | null>,
  candidateLayouts: Map<string, BoundingBox | null>,
  viewport: Viewport
): LayoutComparisonResult {
  const elements: ElementLayout[] = []
  const issues: LayoutIssue[] = []

  // 获取所有选择器
  const allSelectors = new Set([...baselineLayouts.keys(), ...candidateLayouts.keys()])

  for (const selector of allSelectors) {
    const baseline = baselineLayouts.get(selector) || null
    const candidate = candidateLayouts.get(selector) || null

    let diff: ElementLayout["diff"] = null

    if (baseline && candidate) {
      diff = {
        x: Math.abs(baseline.x - candidate.x),
        y: Math.abs(baseline.y - candidate.y),
        width: Math.abs(baseline.width - candidate.width),
        height: Math.abs(baseline.height - candidate.height),
      }

      // 检查位置偏移
      if (diff.x > 5 || diff.y > 5) {
        issues.push({
          element: selector,
          type: "position",
          severity: diff.x > 20 || diff.y > 20 ? "critical" : "warning",
          description: `位置偏移 (x: ${diff.x}px, y: ${diff.y}px)`,
          baseline: `x: ${baseline.x}px, y: ${baseline.y}px`,
          candidate: `x: ${candidate.x}px, y: ${candidate.y}px`,
          suggestion: "检查 margin、padding 或 position 属性的变化",
        })
      }

      // 检查尺寸变化
      if (diff.width > 5 || diff.height > 5) {
        issues.push({
          element: selector,
          type: "size",
          severity: diff.width > 20 || diff.height > 20 ? "critical" : "warning",
          description: `尺寸变化 (宽: ${diff.width}px, 高: ${diff.height}px)`,
          baseline: `${baseline.width}x${baseline.height}px`,
          candidate: `${candidate.width}x${candidate.height}px`,
          suggestion: "检查 width、height、max-width 或 box-sizing 属性",
        })
      }
    } else if (baseline && !candidate) {
      issues.push({
        element: selector,
        type: "missing",
        severity: "critical",
        description: "元素在优化后的页面中缺失",
        baseline: `存在 (${baseline.width}x${baseline.height}px)`,
        candidate: "不存在",
        suggestion: "检查元素是否被错误删除或选择器是否变更",
      })
    } else if (!baseline && candidate) {
      issues.push({
        element: selector,
        type: "missing",
        severity: "info",
        description: "元素在原始页面中不存在",
        baseline: "不存在",
        candidate: `存在 (${candidate.width}x${candidate.height}px)`,
        suggestion: "这可能是新增元素，请确认是否预期",
      })
    }

    elements.push({ selector, baseline, candidate, diff })
  }

  return { viewport, elements, issues }
}

/**
 * 比较计算样式
 */
export function compareStyles(
  baselineStyles: Map<string, Record<string, string>>,
  candidateStyles: Map<string, Record<string, string>>,
  viewport: Viewport
): StyleComparisonResult {
  const diffs: StyleDiff[] = []

  for (const [selector, baselineProps] of baselineStyles) {
    const candidateProps = candidateStyles.get(selector)

    if (!candidateProps) {
      continue
    }

    for (const [property, baselineValue] of Object.entries(baselineProps)) {
      const candidateValue = candidateProps[property]

      if (candidateValue && !isStyleEqual(baselineValue, candidateValue, property)) {
        diffs.push({
          selector,
          property,
          baseline: baselineValue,
          candidate: candidateValue,
        })
      }
    }
  }

  return { viewport, diffs }
}

/**
 * 判断两个样式值是否相等
 * 处理一些等效表示的情况
 */
function isStyleEqual(a: string, b: string, property: string): boolean {
  // 直接相等
  if (a === b) return true

  // 标准化后比较
  const normalizedA = normalizeStyleValue(a, property)
  const normalizedB = normalizeStyleValue(b, property)

  return normalizedA === normalizedB
}

/**
 * 标准化样式值
 */
function normalizeStyleValue(value: string, property: string): string {
  let normalized = value.trim().toLowerCase()

  // 处理颜色值
  if (property.includes("color") || property === "background-color") {
    normalized = normalizeColor(normalized)
  }

  // 处理数值（移除小数点后的 0）
  normalized = normalized.replace(/(\d+)\.0+(?=px|em|rem|%|$)/g, "$1")

  // 处理 0 值
  normalized = normalized.replace(/\b0(px|em|rem|%)/g, "0")

  return normalized
}

/**
 * 标准化颜色值
 */
function normalizeColor(color: string): string {
  // rgb(r, g, b) -> 标准化
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    return `rgb(${r}, ${g}, ${b})`
  }

  // rgba(r, g, b, a) -> 标准化
  const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  return color
}

/**
 * 根据差异百分比获取状态
 */
export function getStatusFromDiffPercentage(
  diffPercentage: number
): "pass" | "warn" | "fail" {
  if (diffPercentage <= 0.1) return "pass"
  if (diffPercentage <= 5) return "warn"
  return "fail"
}

/**
 * 获取差异等级描述
 */
export function getDiffLevelDescription(diffPercentage: number): {
  level: string
  emoji: string
  description: string
} {
  if (diffPercentage <= 0.1) {
    return { level: "完美", emoji: "✅", description: "无需修改" }
  }
  if (diffPercentage <= 1) {
    return { level: "轻微", emoji: "⚠️", description: "检查是否为抗锯齿差异" }
  }
  if (diffPercentage <= 5) {
    return { level: "中等", emoji: "⚠️", description: "需要人工审核具体差异区域" }
  }
  if (diffPercentage <= 15) {
    return { level: "明显", emoji: "❌", description: "必须修复，存在视觉回归" }
  }
  return { level: "严重", emoji: "❌", description: "重大问题，需要重新检查优化代码" }
}
