/**
 * MCP Server 实现
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type {
  StartParams,
  StatusResponse,
  ReportResponse,
  ProbeConfig,
  ProbeState,
} from "./types.js"
import { WorkflowRunner, createWorkflowRunner } from "./workflow/runner.js"

/**
 * 当前运行的工作流
 */
let currentRunner: WorkflowRunner | null = null
let currentState: ProbeState | null = null
let runningPromise: Promise<ProbeState> | null = null

/**
 * 创建 MCP Server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: "iterative-probe",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // 注册工具列表
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "start",
          description: `启动迭代探测工作流。

程序控制的探测循环：探测 → 分析 → 修复 → 验证 → 循环

特点：
- 程序控制循环，不依赖 LLM 自驱
- 自动持久化状态到文件
- 支持断点续传
- 并行探测和修复`,
          inputSchema: {
            type: "object",
            properties: {
              goal: {
                type: "string",
                description: "探测目标描述，例如：'验证 GAS 系统链路'",
              },
              targets: {
                type: "array",
                description: "探测目标列表",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "目标名称",
                    },
                    description: {
                      type: "string",
                      description: "目标描述",
                    },
                    start: {
                      type: "string",
                      description: "起点（可选）",
                    },
                    end: {
                      type: "string",
                      description: "终点（可选）",
                    },
                  },
                  required: ["name"],
                },
              },
              cwd: {
                type: "string",
                description: "工作目录",
              },
              maxIterations: {
                type: "number",
                description: "最大迭代次数（默认 5）",
                default: 5,
              },
              projectContext: {
                type: "string",
                description: "项目上下文（注入到 prompt）",
              },
            },
            required: ["goal", "targets", "cwd"],
          },
        },
        {
          name: "status",
          description: "查看当前探测状态",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "report",
          description: "获取探测报告",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "stop",
          description: "停止当前探测",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }
  })

  // 处理工具调用
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    switch (name) {
      case "start":
        return handleStart(args as StartParams)
      case "status":
        return handleStatus()
      case "report":
        return handleReport()
      case "stop":
        return handleStop()
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })

  return server
}

/**
 * 处理 start 命令
 */
async function handleStart(params: StartParams) {
  // 检查是否已有运行中的任务
  if (currentRunner && currentState?.status === "running") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "已有运行中的探测任务，请先停止或等待完成",
            sessionId: currentState.sessionId,
          }),
        },
      ],
    }
  }

  // 构建配置
  const config: ProbeConfig = {
    goal: params.goal,
    targets: params.targets.map((t) => ({
      name: t.name,
      description: t.description || t.name,
      start: t.start,
      end: t.end,
    })),
    cwd: params.cwd,
    maxIterations: params.maxIterations || 5,
    projectContext: params.projectContext,
  }

  // 创建运行器
  currentRunner = createWorkflowRunner()

  // 监听事件更新状态
  currentRunner.on((event) => {
    if (event.type === "complete" || event.type === "error") {
      currentState = currentRunner?.getState() || null
    }
  })

  // 启动工作流（异步）
  runningPromise = currentRunner.run(config)

  // 等待初始化完成
  await new Promise((resolve) => setTimeout(resolve, 100))
  currentState = currentRunner.getState()

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: "探测已启动",
          sessionId: currentState?.sessionId,
          outputDir: currentState?.outputDir,
        }),
      },
    ],
  }
}

/**
 * 处理 status 命令
 */
async function handleStatus() {
  if (!currentState) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "idle",
            message: "没有运行中的探测任务",
          }),
        },
      ],
    }
  }

  // 更新状态
  if (currentRunner) {
    currentState = currentRunner.getState() || currentState
  }

  const response: StatusResponse = {
    status: currentState.status,
    phase: currentState.phase,
    iteration: currentState.currentIteration,
    maxIterations: currentState.config.maxIterations,
    problemsFound: currentState.allProblems.length,
    problemsFixed: currentState.allProblems.filter((p) => p.fixed).length,
    progress: calculateProgress(currentState),
    currentAction: getPhaseDescription(currentState.phase),
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  }
}

/**
 * 处理 report 命令
 */
async function handleReport() {
  if (!currentState) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "没有探测记录",
          }),
        },
      ],
    }
  }

  // 如果还在运行，等待完成
  if (currentState.status === "running" && runningPromise) {
    currentState = await runningPromise
  }

  const response: ReportResponse = {
    sessionId: currentState.sessionId,
    status: currentState.status,
    totalIterations: currentState.currentIteration,
    problemsFound: currentState.allProblems.length,
    problemsFixed: currentState.allProblems.filter((p) => p.fixed).length,
    problems: currentState.allProblems,
    summary: generateSummaryText(currentState),
    reportPath: `${currentState.outputDir}/summary.md`,
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  }
}

/**
 * 处理 stop 命令
 */
async function handleStop() {
  if (!currentRunner || !currentState || currentState.status !== "running") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "没有运行中的探测任务",
          }),
        },
      ],
    }
  }

  currentRunner.stop()

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: "已发送停止信号",
        }),
      },
    ],
  }
}

/**
 * 计算进度
 */
function calculateProgress(state: ProbeState): number {
  const phaseWeights: Record<string, number> = {
    init: 0,
    probe: 20,
    analyze: 40,
    plan: 50,
    fix: 70,
    verify: 90,
    done: 100,
  }

  const baseProgress = phaseWeights[state.phase] || 0
  const iterationProgress =
    ((state.currentIteration - 1) / state.config.maxIterations) * 100

  return Math.min(100, Math.max(baseProgress, iterationProgress))
}

/**
 * 获取阶段描述
 */
function getPhaseDescription(phase: string): string {
  const descriptions: Record<string, string> = {
    init: "初始化中...",
    probe: "探测中...",
    analyze: "分析问题...",
    plan: "生成修复计划...",
    fix: "执行修复...",
    verify: "验证修复效果...",
    done: "完成",
  }
  return descriptions[phase] || phase
}

/**
 * 生成摘要文本
 */
function generateSummaryText(state: ProbeState): string {
  const fixed = state.allProblems.filter((p) => p.fixed).length
  const total = state.allProblems.length

  if (total === 0) {
    return "未发现问题"
  }

  if (fixed === total) {
    return `所有 ${total} 个问题已修复`
  }

  return `${fixed}/${total} 个问题已修复，仍有 ${total - fixed} 个问题待处理`
}

/**
 * 启动 MCP Server
 */
export async function startServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("iterative-probe MCP server started")
}
