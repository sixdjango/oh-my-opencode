/**
 * UI Comparison Types
 * 页面视觉对比工具的类型定义
 */

export interface Viewport {
  width: number
  height: number
  name?: string
}

export interface ComparisonOptions {
  /** 原始页面 URL */
  baselineUrl: string
  /** 待对比页面 URL */
  candidateUrl: string
  /** 视口尺寸列表 */
  viewports?: Viewport[]
  /** 像素对比阈值 (0-1)，默认 0.1 */
  threshold?: number
  /** 输出目录 */
  outputDir?: string
  /** 等待页面加载的策略 */
  waitUntil?: "load" | "domcontentloaded" | "networkidle"
  /** 额外等待时间 (ms) */
  waitAfterLoad?: number
  /** 是否截取全页面 */
  fullPage?: boolean
  /** 要忽略的选择器列表 */
  ignoreSelectors?: string[]
  /** 是否禁用动画 */
  disableAnimations?: boolean
  /** 需要对比的关键元素选择器 */
  keyElements?: string[]
  /** 是否对比交互状态 */
  compareInteractions?: boolean
  /** 登录或其他前置操作 */
  beforeScreenshot?: (page: import("playwright").Page) => Promise<void>
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementLayout {
  selector: string
  baseline: BoundingBox | null
  candidate: BoundingBox | null
  diff: {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export interface StyleDiff {
  selector: string
  property: string
  baseline: string
  candidate: string
}

export interface PixelComparisonResult {
  viewport: Viewport
  totalPixels: number
  diffPixels: number
  diffPercentage: number
  matchPercentage: number
  baselineScreenshot: string
  candidateScreenshot: string
  diffScreenshot: string
}

export interface LayoutComparisonResult {
  viewport: Viewport
  elements: ElementLayout[]
  issues: LayoutIssue[]
}

export interface StyleComparisonResult {
  viewport: Viewport
  diffs: StyleDiff[]
}

export interface LayoutIssue {
  element: string
  type: "position" | "size" | "missing"
  severity: "critical" | "warning" | "info"
  description: string
  baseline?: string
  candidate?: string
  suggestion?: string
}

export interface InteractionState {
  name: string
  selector: string
  action: "hover" | "focus" | "click"
}

export interface InteractionComparisonResult {
  state: InteractionState
  viewport: Viewport
  diffPixels: number
  diffPercentage: number
  screenshot?: string
}

export type ComparisonStatus = "pass" | "warn" | "fail"

export interface ViewportResult {
  viewport: Viewport
  status: ComparisonStatus
  pixelComparison: PixelComparisonResult
  layoutComparison: LayoutComparisonResult
  styleComparison: StyleComparisonResult
  interactionComparisons?: InteractionComparisonResult[]
}

export interface ComparisonReport {
  timestamp: string
  baselineUrl: string
  candidateUrl: string
  overallStatus: ComparisonStatus
  overallMatchPercentage: number
  viewportResults: ViewportResult[]
  summary: {
    totalViewports: number
    passedViewports: number
    warnedViewports: number
    failedViewports: number
    criticalIssues: number
    warnings: number
  }
  suggestions: Suggestion[]
}

export interface Suggestion {
  priority: "high" | "medium" | "low"
  category: "layout" | "style" | "responsive" | "interaction"
  element?: string
  issue: string
  suggestion: string
  code?: string
}

/** 默认视口配置 */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 1920, height: 1080, name: "Desktop FHD" },
  { width: 1366, height: 768, name: "Desktop HD" },
  { width: 1024, height: 768, name: "Tablet Landscape" },
  { width: 768, height: 1024, name: "Tablet Portrait" },
  { width: 375, height: 667, name: "Mobile iPhone SE" },
  { width: 390, height: 844, name: "Mobile iPhone 14" },
]

/** 默认关键元素选择器 */
export const DEFAULT_KEY_ELEMENTS = [
  "header",
  "nav",
  "main",
  "footer",
  "aside",
  ".hero",
  ".sidebar",
  ".container",
  ".content",
]

/** 关键 CSS 属性 */
export const CRITICAL_CSS_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "background-image",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border",
  "border-radius",
  "box-shadow",
  "display",
  "flex-direction",
  "align-items",
  "justify-content",
  "gap",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "width",
  "height",
  "max-width",
  "min-width",
  "opacity",
  "transform",
  "transition",
]

/** 差异阈值配置 */
export const DIFF_THRESHOLDS = {
  /** 完美匹配 */
  perfect: 0.001,
  /** 轻微差异 (可能是抗锯齿) */
  minor: 0.01,
  /** 中等差异 */
  moderate: 0.05,
  /** 明显差异 */
  significant: 0.15,
} as const
