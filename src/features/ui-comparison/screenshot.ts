/**
 * Screenshot Capture Utility
 * 使用 Playwright 进行页面截图
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Viewport, ComparisonOptions, BoundingBox } from "./types"

/** 禁用动画的 CSS */
const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
`

export interface ScreenshotResult {
  viewport: Viewport
  screenshotPath: string
  elementLayouts: Map<string, BoundingBox | null>
  computedStyles: Map<string, Record<string, string>>
}

export class ScreenshotCapture {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
    })
    this.context = await this.browser.newContext()
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  /**
   * 截取页面截图并收集布局信息
   */
  async captureScreenshot(
    url: string,
    viewport: Viewport,
    options: Partial<ComparisonOptions>,
    outputPath: string
  ): Promise<ScreenshotResult> {
    if (!this.context) {
      throw new Error("Browser not initialized. Call init() first.")
    }

    const page = await this.context.newPage()

    try {
      // 设置视口大小
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      // 禁用动画
      if (options.disableAnimations !== false) {
        await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS })
      }

      // 导航到页面
      await page.goto(url, {
        waitUntil: options.waitUntil || "networkidle",
        timeout: 30000,
      })

      // 执行前置操作
      if (options.beforeScreenshot) {
        await options.beforeScreenshot(page)
      }

      // 额外等待时间
      if (options.waitAfterLoad) {
        await page.waitForTimeout(options.waitAfterLoad)
      } else {
        // 默认等待 1 秒确保页面稳定
        await page.waitForTimeout(1000)
      }

      // 隐藏要忽略的元素
      if (options.ignoreSelectors && options.ignoreSelectors.length > 0) {
        await this.hideElements(page, options.ignoreSelectors)
      }

      // 确保输出目录存在
      await fs.mkdir(path.dirname(outputPath), { recursive: true })

      // 截图
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage !== false,
      })

      // 收集元素布局信息
      const keyElements = options.keyElements || []
      const elementLayouts = await this.collectElementLayouts(page, keyElements)

      // 收集计算样式
      const computedStyles = await this.collectComputedStyles(page, keyElements)

      return {
        viewport,
        screenshotPath: outputPath,
        elementLayouts,
        computedStyles,
      }
    } finally {
      await page.close()
    }
  }

  /**
   * 截取交互状态的截图
   */
  async captureInteractionState(
    url: string,
    viewport: Viewport,
    selector: string,
    action: "hover" | "focus" | "click",
    options: Partial<ComparisonOptions>,
    outputPath: string
  ): Promise<string> {
    if (!this.context) {
      throw new Error("Browser not initialized. Call init() first.")
    }

    const page = await this.context.newPage()

    try {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      if (options.disableAnimations !== false) {
        await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS })
      }

      await page.goto(url, {
        waitUntil: options.waitUntil || "networkidle",
        timeout: 30000,
      })

      if (options.beforeScreenshot) {
        await options.beforeScreenshot(page)
      }

      await page.waitForTimeout(options.waitAfterLoad || 1000)

      // 执行交互操作
      const element = page.locator(selector).first()

      if (await element.count() === 0) {
        throw new Error(`Element not found: ${selector}`)
      }

      switch (action) {
        case "hover":
          await element.hover()
          break
        case "focus":
          await element.focus()
          break
        case "click":
          await element.click()
          break
      }

      // 等待交互效果
      await page.waitForTimeout(300)

      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage !== false,
      })

      return outputPath
    } finally {
      await page.close()
    }
  }

  /**
   * 隐藏指定元素
   */
  private async hideElements(page: Page, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
      await page.locator(selector).evaluateAll((elements) => {
        elements.forEach((el) => {
          ;(el as HTMLElement).style.visibility = "hidden"
        })
      })
    }
  }

  /**
   * 收集元素布局信息
   */
  private async collectElementLayouts(
    page: Page,
    selectors: string[]
  ): Promise<Map<string, BoundingBox | null>> {
    const layouts = new Map<string, BoundingBox | null>()

    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first()
        if ((await element.count()) > 0) {
          const box = await element.boundingBox()
          layouts.set(selector, box)
        } else {
          layouts.set(selector, null)
        }
      } catch {
        layouts.set(selector, null)
      }
    }

    return layouts
  }

  /**
   * 收集计算样式
   */
  private async collectComputedStyles(
    page: Page,
    selectors: string[]
  ): Promise<Map<string, Record<string, string>>> {
    const styles = new Map<string, Record<string, string>>()

    const properties = [
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "color",
      "background-color",
      "padding",
      "margin",
      "border",
      "border-radius",
      "display",
      "flex-direction",
      "align-items",
      "justify-content",
      "position",
      "width",
      "height",
      "opacity",
      "transform",
    ]

    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first()
        if ((await element.count()) === 0) continue

        const elementStyles = await element.evaluate((el, props) => {
          const computed = window.getComputedStyle(el)
          const result: Record<string, string> = {}
          for (const prop of props) {
            result[prop] = computed.getPropertyValue(prop)
          }
          return result
        }, properties)

        if (elementStyles) {
          styles.set(selector, elementStyles)
        }
      } catch {
        // 忽略错误
      }
    }

    return styles
  }
}

/**
 * 便捷函数：截取单个页面的截图
 */
export async function capturePageScreenshot(
  url: string,
  viewport: Viewport,
  options: Partial<ComparisonOptions>,
  outputPath: string
): Promise<ScreenshotResult> {
  const capture = new ScreenshotCapture()
  await capture.init()

  try {
    return await capture.captureScreenshot(url, viewport, options, outputPath)
  } finally {
    await capture.close()
  }
}
