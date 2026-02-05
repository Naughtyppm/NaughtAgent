/**
 * iterative-probe-mcp 类型定义
 */

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 探测目标配置
 */
export interface ProbeTarget {
  /** 目标名称 */
  name: string
  /** 目标描述 */
  description: string
  /** 起点 */
  start?: string
  /** 终点 */
  end?: string
  /** 检查点列表 */
  checkpoints?: string[]
}

/**
 * 探测配置
 */
export interface ProbeConfig {
  /** 探测目标描述 */
  goal: string
  /** 探测目标列表 */
  targets: ProbeTarget[]
  /** 工作目录 */
  cwd: string
  /** 最大迭代次数 */
  maxIterations: number
  /** 项目上下文（注入到 prompt） */
  projectContext?: string
  /** 超时时间（毫秒） */
  timeout?: number
}

// ============================================================================
// 状态类型
// ============================================================================

/**
 * 探测状态
 */
export type ProbeStatus =
  | "idle"           // 空闲
  | "running"        // 运行中
  | "completed"      // 完成
  | "failed"         // 失败
  | "stopped"        // 手动停止

/**
 * 当前阶段
 */
export type ProbePhase =
  | "init"           // 初始化
  | "probe"          // 探测中
  | "analyze"        // 分析中
  | "plan"           // 生成计划
  | "fix"            // 修复中
  | "verify"         // 验证中
  | "done"           // 完成

/**
 * 发现的问题
 */
export interface Problem {
  /** 问题 ID */
  id: string
  /** 问题描述 */
  description: string
  /** 位置（文件:行号） */
  location: string
  /** 类型 */
  type: "config" | "code" | "data" | "logic" | "unknown"
  /** 严重程度 */
  severity: "P0" | "P1" | "P2"
  /** 依赖的其他问题 ID */
  dependsOn?: string[]
  /** 是否已修复 */
  fixed: boolean
  /** 修复结果 */
  fixResult?: string
}

/**
 * 探测结果
 */
export interface ProbeResult {
  /** 目标名称 */
  target: string
  /** 检查项 */
  checks: Array<{
    item: string
    passed: boolean
    detail: string
  }>
  /** 发现的问题 */
  problems: Problem[]
  /** 关键代码片段 */
  codeSnippets?: Array<{
    file: string
    line: number
    code: string
    note: string
  }>
}

/**
 * 分析结果
 */
export interface AnalysisResult {
  /** 问题汇总 */
  problems: Problem[]
  /** 根因分析 */
  rootCause: string
  /** 修复建议 */
  suggestions: string[]
  /** 修复顺序（考虑依赖） */
  fixOrder: string[]
}

/**
 * 修复计划
 */
export interface FixPlan {
  /** 问题 ID */
  problemId: string
  /** 修复步骤 */
  steps: string[]
  /** 验证方法 */
  verification: string
  /** 是否可并行 */
  canParallel: boolean
}

/**
 * 修复结果
 */
export interface FixResult {
  /** 问题 ID */
  problemId: string
  /** 是否成功 */
  success: boolean
  /** 修改的文件 */
  modifiedFiles: Array<{
    path: string
    changes: string
  }>
  /** 错误信息 */
  error?: string
}

/**
 * 验证结果
 */
export interface VerificationResult {
  /** 是否全部通过 */
  allPassed: boolean
  /** 验证项 */
  items: Array<{
    description: string
    passed: boolean
    detail: string
  }>
  /** 仍存在的问题 */
  remainingProblems: string[]
}

/**
 * 迭代记录
 */
export interface IterationRecord {
  /** 迭代编号 */
  iteration: number
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** 探测结果 */
  probeResults: ProbeResult[]
  /** 分析结果 */
  analysis?: AnalysisResult
  /** 修复计划 */
  fixPlans?: FixPlan[]
  /** 修复结果 */
  fixResults?: FixResult[]
  /** 验证结果 */
  verification?: VerificationResult
}

/**
 * 探测会话状态
 */
export interface ProbeState {
  /** 会话 ID */
  sessionId: string
  /** 配置 */
  config: ProbeConfig
  /** 状态 */
  status: ProbeStatus
  /** 当前阶段 */
  phase: ProbePhase
  /** 当前迭代 */
  currentIteration: number
  /** 迭代记录 */
  iterations: IterationRecord[]
  /** 所有发现的问题 */
  allProblems: Problem[]
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** 错误信息 */
  error?: string
  /** 输出目录 */
  outputDir: string
}

// ============================================================================
// MCP Tool 参数类型
// ============================================================================

/**
 * start tool 参数
 */
export interface StartParams {
  /** 探测目标描述 */
  goal: string
  /** 探测目标列表 */
  targets: Array<{
    name: string
    description?: string
    start?: string
    end?: string
  }>
  /** 工作目录 */
  cwd: string
  /** 最大迭代次数 */
  maxIterations?: number
  /** 项目上下文 */
  projectContext?: string
}

/**
 * status tool 返回
 */
export interface StatusResponse {
  /** 状态 */
  status: ProbeStatus
  /** 当前阶段 */
  phase: ProbePhase
  /** 当前迭代 */
  iteration: number
  /** 最大迭代 */
  maxIterations: number
  /** 发现问题数 */
  problemsFound: number
  /** 已修复数 */
  problemsFixed: number
  /** 进度百分比 */
  progress: number
  /** 当前操作描述 */
  currentAction: string
}

/**
 * report tool 返回
 */
export interface ReportResponse {
  /** 会话 ID */
  sessionId: string
  /** 状态 */
  status: ProbeStatus
  /** 总迭代数 */
  totalIterations: number
  /** 发现问题数 */
  problemsFound: number
  /** 已修复数 */
  problemsFixed: number
  /** 问题列表 */
  problems: Problem[]
  /** 摘要 */
  summary: string
  /** 报告文件路径 */
  reportPath: string
}
