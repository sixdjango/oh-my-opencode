#!/usr/bin/env bun
/**
 * UI Comparison CLI
 * 命令行工具入口
 *
 * 用法:
 *   bun run src/features/ui-comparison/cli.ts --baseline https://example.com/old --candidate https://example.com/new
 *   bun run src/features/ui-comparison/cli.ts -b http://localhost:3000 -c http://localhost:3001 -o ./output
 */

import { Command } from "commander"
import { UIComparison, printReport, DEFAULT_VIEWPORTS, type Viewport } from "./index"

const program = new Command()

program
  .name("ui-comparison")
  .description("页面视觉还原度对比工具 - Compare two web pages for visual differences")
  .version("1.0.0")
  .requiredOption("-b, --baseline <url>", "基准页面 URL (Baseline URL)")
  .requiredOption("-c, --candidate <url>", "对比页面 URL (Candidate URL)")
  .option("-o, --output <dir>", "输出目录 (Output directory)", "./ui-comparison-output")
  .option("-t, --threshold <number>", "像素对比阈值 0-1 (Pixel comparison threshold)", "0.1")
  .option("-v, --viewports <viewports>", "视口列表，用逗号分隔 (Viewport list, comma-separated)", "1920x1080,375x667")
  .option("--full-page", "截取完整页面 (Capture full page)", true)
  .option("--no-full-page", "只截取可见区域 (Capture viewport only)")
  .option("--disable-animations", "禁用动画 (Disable animations)", true)
  .option("--no-disable-animations", "保留动画 (Keep animations)")
  .option("-w, --wait <ms>", "页面加载后等待时间 (Wait time after load in ms)", "1000")
  .option("--wait-until <state>", "等待策略: load, domcontentloaded, networkidle", "networkidle")
  .option("-e, --elements <selectors>", "要对比的关键元素选择器，用逗号分隔 (Key element selectors)")
  .option("-i, --ignore <selectors>", "要忽略的元素选择器，用逗号分隔 (Selectors to ignore)")
  .option("-q, --quick", "快速模式：只对比单个视口 (Quick mode: single viewport only)")
  .option("--json", "只输出 JSON 格式 (Output JSON only)")
  .action(async (options) => {
    try {
      // 解析视口
      let viewports: Viewport[]
      if (options.quick) {
        viewports = [{ width: 1920, height: 1080, name: "Desktop" }]
      } else {
        viewports = parseViewports(options.viewports)
      }

      // 解析选择器列表
      const keyElements = options.elements ? options.elements.split(",").map((s: string) => s.trim()) : undefined
      const ignoreSelectors = options.ignore ? options.ignore.split(",").map((s: string) => s.trim()) : undefined

      const comparison = new UIComparison({
        baselineUrl: options.baseline,
        candidateUrl: options.candidate,
        outputDir: options.output,
        threshold: parseFloat(options.threshold),
        viewports,
        fullPage: options.fullPage,
        disableAnimations: options.disableAnimations,
        waitAfterLoad: parseInt(options.wait, 10),
        waitUntil: options.waitUntil as "load" | "domcontentloaded" | "networkidle",
        keyElements,
        ignoreSelectors,
      })

      const report = await comparison.run()

      if (options.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        printReport(report)
      }

      // 根据结果设置退出码
      if (report.overallStatus === "fail") {
        process.exit(1)
      } else if (report.overallStatus === "warn") {
        process.exit(0) // 警告不算失败
      }
    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : error)
      process.exit(2)
    }
  })

/**
 * 解析视口字符串
 * 格式: "1920x1080,375x667" 或 "1920x1080:Desktop,375x667:Mobile"
 */
function parseViewports(input: string): Viewport[] {
  if (!input || input.trim() === "") {
    return DEFAULT_VIEWPORTS.slice(0, 3) // 默认使用前三个视口
  }

  return input.split(",").map((v) => {
    const [size, name] = v.trim().split(":")
    const [width, height] = size.split("x").map(Number)

    if (isNaN(width) || isNaN(height)) {
      throw new Error(`Invalid viewport format: ${v}. Expected format: WIDTHxHEIGHT or WIDTHxHEIGHT:Name`)
    }

    return {
      width,
      height,
      name: name || `${width}x${height}`,
    }
  })
}

// 运行 CLI
program.parse()
