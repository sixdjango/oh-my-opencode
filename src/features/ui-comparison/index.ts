/**
 * UI Comparison Tool
 * 页面视觉还原度对比工具
 *
 * 使用 Playwright 截图 + pixelmatch 进行像素级对比
 */

import * as path from "node:path"
import { ScreenshotCapture, type ScreenshotResult } from "./screenshot"
import {
  comparePixels,
  compareLayouts,
  compareStyles,
  getStatusFromDiffPercentage,
} from "./compare"
import {
  generateReport,
  formatReportForConsole,
  formatReportAsMarkdown,
  saveReport,
} from "./report"
import {
  DEFAULT_VIEWPORTS,
  DEFAULT_KEY_ELEMENTS,
  type ComparisonOptions,
  type ComparisonReport,
  type ViewportResult,
  type Viewport,
} from "./types"

export * from "./types"
export * from "./screenshot"
export * from "./compare"
export * from "./report"

/**
 * UI Comparison 主类
 */
export class UIComparison {
  private options: ComparisonOptions
  private screenshotCapture: ScreenshotCapture

  constructor(options: ComparisonOptions) {
    this.options = {
      ...options,
      viewports: options.viewports || DEFAULT_VIEWPORTS,
      threshold: options.threshold ?? 0.1,
      outputDir: options.outputDir || "./ui-comparison-output",
      waitUntil: options.waitUntil || "networkidle",
      waitAfterLoad: options.waitAfterLoad ?? 1000,
      fullPage: options.fullPage !== false,
      disableAnimations: options.disableAnimations !== false,
      keyElements: options.keyElements || DEFAULT_KEY_ELEMENTS,
    }
    this.screenshotCapture = new ScreenshotCapture()
  }

  /**
   * 执行完整的对比流程
   */
  async run(): Promise<ComparisonReport> {
    console.log("🚀 Starting UI Comparison...")
    console.log(`   Baseline: ${this.options.baselineUrl}`)
    console.log(`   Candidate: ${this.options.candidateUrl}`)
    console.log(`   Viewports: ${this.options.viewports!.length}`)

    await this.screenshotCapture.init()

    try {
      const viewportResults: ViewportResult[] = []

      for (const viewport of this.options.viewports!) {
        console.log(`\n📱 Testing viewport: ${viewport.name || viewport.width + "x" + viewport.height}`)
        const result = await this.compareViewport(viewport)
        viewportResults.push(result)

        const statusEmoji = { pass: "✅", warn: "⚠️", fail: "❌" }
        console.log(
          `   Result: ${statusEmoji[result.status]} ${result.pixelComparison.matchPercentage.toFixed(2)}% match`
        )
      }

      const report = generateReport(
        this.options.baselineUrl,
        this.options.candidateUrl,
        viewportResults
      )

      // 保存报告
      const { jsonPath, markdownPath } = await saveReport(report, this.options.outputDir!)
      console.log(`\n📄 Reports saved:`)
      console.log(`   JSON: ${jsonPath}`)
      console.log(`   Markdown: ${markdownPath}`)

      return report
    } finally {
      await this.screenshotCapture.close()
    }
  }

  /**
   * 对比单个视口
   */
  private async compareViewport(viewport: Viewport): Promise<ViewportResult> {
    const outputDir = this.options.outputDir!
    const viewportId = viewport.name?.replace(/\s+/g, "-").toLowerCase() || `${viewport.width}x${viewport.height}`

    // 截图路径
    const baselinePath = path.join(outputDir, "screenshots", `baseline-${viewportId}.png`)
    const candidatePath = path.join(outputDir, "screenshots", `candidate-${viewportId}.png`)
    const diffPath = path.join(outputDir, "screenshots", `diff-${viewportId}.png`)

    // 截取基准页面
    const baselineResult = await this.screenshotCapture.captureScreenshot(
      this.options.baselineUrl,
      viewport,
      this.options,
      baselinePath
    )

    // 截取对比页面
    const candidateResult = await this.screenshotCapture.captureScreenshot(
      this.options.candidateUrl,
      viewport,
      this.options,
      candidatePath
    )

    // 像素对比
    const pixelComparison = await comparePixels(
      baselinePath,
      candidatePath,
      diffPath,
      viewport,
      this.options.threshold
    )

    // 布局对比
    const layoutComparison = compareLayouts(
      baselineResult.elementLayouts,
      candidateResult.elementLayouts,
      viewport
    )

    // 样式对比
    const styleComparison = compareStyles(
      baselineResult.computedStyles,
      candidateResult.computedStyles,
      viewport
    )

    // 计算状态
    const status = getStatusFromDiffPercentage(pixelComparison.diffPercentage)

    return {
      viewport,
      status,
      pixelComparison,
      layoutComparison,
      styleComparison,
    }
  }

  /**
   * 仅执行像素对比（快速模式）
   */
  async quickCompare(): Promise<ComparisonReport> {
    console.log("⚡ Quick comparison mode (pixels only)...")

    // 只使用第一个视口
    const viewport = this.options.viewports![0]
    const originalViewports = this.options.viewports
    this.options.viewports = [viewport]
    this.options.keyElements = [] // 跳过布局对比

    try {
      return await this.run()
    } finally {
      this.options.viewports = originalViewports
    }
  }
}

/**
 * 便捷函数：执行 UI 对比
 */
export async function compareUI(options: ComparisonOptions): Promise<ComparisonReport> {
  const comparison = new UIComparison(options)
  return comparison.run()
}

/**
 * 便捷函数：快速对比（单视口）
 */
export async function quickCompareUI(
  baselineUrl: string,
  candidateUrl: string,
  outputDir?: string
): Promise<ComparisonReport> {
  const comparison = new UIComparison({
    baselineUrl,
    candidateUrl,
    outputDir,
    viewports: [{ width: 1920, height: 1080, name: "Desktop" }],
    keyElements: [],
  })
  return comparison.run()
}

/**
 * 打印报告到控制台
 */
export function printReport(report: ComparisonReport): void {
  console.log(formatReportForConsole(report))
}

/**
 * 获取 Markdown 格式的报告
 */
export function getMarkdownReport(report: ComparisonReport): string {
  return formatReportAsMarkdown(report)
}
