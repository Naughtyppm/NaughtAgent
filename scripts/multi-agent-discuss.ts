#!/usr/bin/env npx tsx
// @ts-nocheck - 独立脚本，用 npx tsx 运行，不依赖项目 tsconfig
/**
 * 多角色讨论脚本 v2 - 支持 handoff 机制
 *
 * 三种讨论模式：
 * - round-robin: 固定轮转（默认）
 * - handoff: 角色自主决定下一个发言者
 * - moderated: 主持人（第一个角色）协调讨论
 *
 * 用法：
 *   npx tsx scripts/multi-agent-discuss.ts --config discuss-config.json
 *   npx tsx scripts/multi-agent-discuss.ts --topic "主题" --mode handoff
 *   npx tsx scripts/multi-agent-discuss.ts --topic "重构方案" --mode moderated --rounds 5
 */

import * as fs from "fs"
import * as path from "path"

// ============================================================================
// 配置
// ============================================================================

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/v1"
const API_KEY = process.env.API_KEY || "sk-placeholder"
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514"
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || "3")

// ============================================================================
// 类型定义
// ============================================================================

interface AgentRole {
  name: string
  role: string
}

interface DiscussionMessage {
  agent: string
  role: string
  content: string
  /** 发言序号 */
  turn: number
  /** 该角色指定的下一个发言者（handoff/moderated 模式） */
  nextSpeaker?: string
}

/** 讨论模式 */
type DiscussMode = "round-robin" | "handoff" | "moderated"

interface DiscussConfig {
  topic: string
  mode: DiscussMode
  agents: AgentRole[]
  maxRounds: number
  /** 输出文件路径（可选） */
  outputFile?: string
}

interface LLMResponse {
  content: string
  usage?: { prompt_tokens: number; completion_tokens: number }
}

// ============================================================================
// ANSI 颜色
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
}

/** 每个角色分配不同颜色 */
const AGENT_COLORS = [colors.cyan, colors.green, colors.yellow, colors.magenta, colors.blue]

function agentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

// ============================================================================
// LLM 调用
// ============================================================================

async function callLLM(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  return {
    content: data.choices[0]?.message?.content || "",
    usage: data.usage,
  }
}

// ============================================================================
// Handoff 解析
// ============================================================================

/** 从 LLM 输出中提取 [NEXT: 角色名] 指令 */
function parseNextSpeaker(content: string, agentNames: string[]): string | undefined {
  // 匹配 [NEXT: xxx] 格式
  const match = content.match(/\[NEXT:\s*([^\]]+)\]/i)
  if (!match) return undefined

  const requested = match[1].trim()
  // 模糊匹配：找到最接近的角色名
  const found = agentNames.find(
    (n) => n === requested || n.includes(requested) || requested.includes(n)
  )
  return found
}

/** 从内容中移除 [NEXT: xxx] 标记，保持输出干净 */
function stripNextDirective(content: string): string {
  return content.replace(/\[NEXT:\s*[^\]]+\]/gi, "").trim()
}

/** 检测是否有终止讨论的信号 */
function isEndSignal(content: string): boolean {
  const patterns = [
    /\[END_DISCUSSION\]/i,
    /\[END\]/i,
    /讨论结束/,
    /达成共识/,
    /consensus\s*reached/i,
  ]
  return patterns.some((p) => p.test(content))
}

// ============================================================================
// 系统提示词构建
// ============================================================================

/** round-robin 模式：固定轮转，不需要指定下一个发言者 */
function buildRoundRobinPrompt(agent: AgentRole, allAgents: AgentRole[]): string {
  const others = allAgents
    .filter((a) => a.name !== agent.name)
    .map((a) => `${a.name}（${a.role}）`)
    .join("、")

  return `你是 ${agent.name}。
你的角色定位: ${agent.role}

其他参与者: ${others}

讨论规则:
- 从你的角色视角出发发言，简洁有力
- 可以质疑或补充其他参与者的观点
- 不要重复别人已经说过的内容
- 如果你认为讨论已经充分，在回复末尾加上 [END_DISCUSSION]
- 用中文讨论`
}

/** handoff 模式：角色自主决定下一个发言者 */
function buildHandoffPrompt(agent: AgentRole, allAgents: AgentRole[]): string {
  const others = allAgents
    .filter((a) => a.name !== agent.name)
    .map((a) => `${a.name}（${a.role}）`)
    .join("、")

  const nameList = allAgents
    .filter((a) => a.name !== agent.name)
    .map((a) => a.name)
    .join("、")

  return `你是 ${agent.name}。
你的角色定位: ${agent.role}

其他参与者: ${others}

讨论规则:
- 从你的角色视角出发发言，简洁有力
- 可以质疑或补充其他参与者的观点
- 不要重复别人已经说过的内容
- 发言结束后，你必须指定下一个发言者
- 格式: 在回复末尾加上 [NEXT: 角色名]
- 可选角色: ${nameList}
- 选择你认为最应该接话的人（比如你提出了质疑，让被质疑者回应）
- 如果你认为讨论已经充分，用 [END_DISCUSSION] 代替 [NEXT: ...]
- 用中文讨论`
}

/** moderated 模式：主持人协调讨论 */
function buildModeratorPrompt(moderator: AgentRole, allAgents: AgentRole[]): string {
  const participants = allAgents
    .filter((a) => a.name !== moderator.name)
    .map((a) => `${a.name}（${a.role}）`)
    .join("、")

  const nameList = allAgents
    .filter((a) => a.name !== moderator.name)
    .map((a) => a.name)
    .join("、")

  return `你是 ${moderator.name}，本次讨论的主持人。
你的角色定位: ${moderator.role}

参与者: ${participants}

主持人职责:
- 第一轮: 规划讨论框架，提出需要讨论的关键问题，指定第一个发言者
- 后续轮: 总结上一位发言者的要点，引导讨论方向，指定下一个发言者
- 确保每个参与者都有机会发言
- 当讨论偏题时拉回主线
- 当观点冲突时引导建设性讨论

发言格式:
- 在回复末尾用 [NEXT: 角色名] 指定下一个发言者
- 可选角色: ${nameList}
- 如果讨论充分，用 [END_DISCUSSION] 结束
- 用中文讨论`
}

/** moderated 模式下普通参与者的提示词 */
function buildParticipantPrompt(agent: AgentRole, allAgents: AgentRole[]): string {
  const moderator = allAgents[0]
  const others = allAgents
    .filter((a) => a.name !== agent.name)
    .map((a) => `${a.name}（${a.role}）`)
    .join("、")

  return `你是 ${agent.name}。
你的角色定位: ${agent.role}

主持人: ${moderator.name}（${moderator.role}）
其他参与者: ${others}

讨论规则:
- 从你的角色视角出发发言，简洁有力
- 回应主持人提出的问题
- 可以质疑或补充其他参与者的观点
- 不要重复别人已经说过的内容
- 发言结束后，用 [NEXT: ${moderator.name}] 把控制权交回主持人
- 用中文讨论`
}

// ============================================================================
// 讨论历史格式化
// ============================================================================

function buildDiscussionContext(messages: DiscussionMessage[], topic: string): string {
  if (messages.length === 0) return ""
  const lines = messages.map((m) => `【${m.agent}（${m.role}）- 第${m.turn}轮】:\n${m.content}`)
  return `讨论主题: ${topic}\n\n已有讨论:\n${lines.join("\n\n---\n\n")}`
}

function buildUserPrompt(
  messages: DiscussionMessage[],
  topic: string,
  agent: AgentRole,
): string {
  if (messages.length === 0) {
    return `讨论主题: ${topic}\n\n请从你的角色视角分享初始观点。`
  }
  const context = buildDiscussionContext(messages, topic)
  return `${context}\n\n---\n\n现在轮到你（${agent.name}）发言。`
}

// ============================================================================
// 输出格式化
// ============================================================================

function printHeader(config: DiscussConfig): void {
  const modeLabel = {
    "round-robin": "固定轮转",
    handoff: "自由 Handoff",
    moderated: "主持人协调",
  }
  console.log(`\n${colors.bold}${"═".repeat(60)}${colors.reset}`)
  console.log(`${colors.bold}  多角色讨论${colors.reset}`)
  console.log(`${colors.gray}  主题: ${config.topic}${colors.reset}`)
  console.log(`${colors.gray}  模式: ${modeLabel[config.mode]}${colors.reset}`)
  console.log(`${colors.gray}  角色: ${config.agents.map((a) => a.name).join("、")}${colors.reset}`)
  console.log(`${colors.gray}  最大轮次: ${config.maxRounds}${colors.reset}`)
  console.log(`${colors.bold}${"═".repeat(60)}${colors.reset}\n`)
}

function printTurn(msg: DiscussionMessage, agentIndex: number): void {
  const color = agentColor(agentIndex)
  console.log(`${color}${colors.bold}【${msg.agent}】${colors.reset} ${colors.dim}(${msg.role}) - 第${msg.turn}轮${colors.reset}`)
  console.log(`${msg.content}`)
  if (msg.nextSpeaker) {
    console.log(`${colors.gray}  → 下一位: ${msg.nextSpeaker}${colors.reset}`)
  }
  console.log(`${colors.gray}${"─".repeat(40)}${colors.reset}`)
}

function printSummary(messages: DiscussionMessage[], endReason: string): void {
  console.log(`\n${colors.bold}${"═".repeat(60)}${colors.reset}`)
  console.log(`${colors.bold}  讨论结束${colors.reset}`)
  console.log(`${colors.gray}  原因: ${endReason}${colors.reset}`)
  console.log(`${colors.gray}  总发言数: ${messages.length}${colors.reset}`)

  // 统计每个角色的发言次数
  const counts = new Map<string, number>()
  for (const m of messages) {
    counts.set(m.agent, (counts.get(m.agent) || 0) + 1)
  }
  for (const [name, count] of counts) {
    console.log(`${colors.gray}    ${name}: ${count} 次${colors.reset}`)
  }
  console.log(`${colors.bold}${"═".repeat(60)}${colors.reset}\n`)
}

// ============================================================================
// 输出保存
// ============================================================================

function saveOutput(config: DiscussConfig, messages: DiscussionMessage[]): void {
  if (!config.outputFile) return

  const lines: string[] = []
  lines.push(`# 多角色讨论记录\n`)
  lines.push(`- 主题: ${config.topic}`)
  lines.push(`- 模式: ${config.mode}`)
  lines.push(`- 角色: ${config.agents.map((a) => `${a.name}（${a.role}）`).join("、")}`)
  lines.push(`- 时间: ${new Date().toISOString()}\n`)
  lines.push(`---\n`)

  for (const msg of messages) {
    lines.push(`## 【${msg.agent}】（${msg.role}）- 第${msg.turn}轮\n`)
    lines.push(msg.content)
    if (msg.nextSpeaker) {
      lines.push(`\n> → 下一位: ${msg.nextSpeaker}`)
    }
    lines.push(`\n---\n`)
  }

  const dir = path.dirname(config.outputFile)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(config.outputFile, lines.join("\n"), "utf-8")
  console.log(`${colors.green}讨论记录已保存: ${config.outputFile}${colors.reset}`)
}

// ============================================================================
// 讨论引擎：round-robin 模式
// ============================================================================

async function runRoundRobin(config: DiscussConfig): Promise<DiscussionMessage[]> {
  const messages: DiscussionMessage[] = []
  let turn = 0

  for (let round = 1; round <= config.maxRounds; round++) {
    for (let i = 0; i < config.agents.length; i++) {
      turn++
      const agent = config.agents[i]
      const systemPrompt = buildRoundRobinPrompt(agent, config.agents)
      const userPrompt = buildUserPrompt(messages, config.topic, agent)

      console.log(`${colors.dim}[轮次 ${round}/${config.maxRounds}] 等待 ${agent.name} 发言...${colors.reset}`)

      const response = await callLLM(systemPrompt, userPrompt)
      const content = stripNextDirective(response.content)

      const msg: DiscussionMessage = {
        agent: agent.name,
        role: agent.role,
        content,
        turn,
      }
      messages.push(msg)
      printTurn(msg, i)

      // 检测终止信号
      if (isEndSignal(response.content)) {
        return messages
      }
    }
  }

  return messages
}

// ============================================================================
// 讨论引擎：handoff 模式
// ============================================================================

async function runHandoff(config: DiscussConfig): Promise<DiscussionMessage[]> {
  const messages: DiscussionMessage[] = []
  const agentNames = config.agents.map((a) => a.name)
  const agentMap = new Map(config.agents.map((a, i) => [a.name, { agent: a, index: i }]))
  const maxTurns = config.maxRounds * config.agents.length // 总发言次数上限

  // 从第一个角色开始
  let currentName = config.agents[0].name
  let turn = 0

  while (turn < maxTurns) {
    turn++
    const entry = agentMap.get(currentName)
    if (!entry) {
      console.log(`${colors.red}错误: 找不到角色 "${currentName}"，回退到第一个角色${colors.reset}`)
      currentName = config.agents[0].name
      continue
    }

    const { agent, index } = entry
    const systemPrompt = buildHandoffPrompt(agent, config.agents)
    const userPrompt = buildUserPrompt(messages, config.topic, agent)

    console.log(`${colors.dim}[第 ${turn} 轮] 等待 ${agent.name} 发言...${colors.reset}`)

    const response = await callLLM(systemPrompt, userPrompt)
    const nextSpeaker = parseNextSpeaker(response.content, agentNames)
    const content = stripNextDirective(response.content)

    const msg: DiscussionMessage = {
      agent: agent.name,
      role: agent.role,
      content,
      turn,
      nextSpeaker,
    }
    messages.push(msg)
    printTurn(msg, index)

    // 检测终止信号
    if (isEndSignal(response.content)) {
      return messages
    }

    // 决定下一个发言者
    if (nextSpeaker) {
      currentName = nextSpeaker
    } else {
      // 没有指定 → 轮转到下一个
      const nextIndex = (index + 1) % config.agents.length
      currentName = config.agents[nextIndex].name
      console.log(`${colors.yellow}  (未指定下一位，自动轮转到 ${currentName})${colors.reset}`)
    }
  }

  return messages
}

// ============================================================================
// 讨论引擎：moderated 模式
// ============================================================================

async function runModerated(config: DiscussConfig): Promise<DiscussionMessage[]> {
  const messages: DiscussionMessage[] = []
  const agentNames = config.agents.map((a) => a.name)
  const agentMap = new Map(config.agents.map((a, i) => [a.name, { agent: a, index: i }]))
  const moderator = config.agents[0] // 第一个角色是主持人
  const maxTurns = config.maxRounds * config.agents.length

  // 主持人先发言，规划讨论
  let currentName = moderator.name
  let turn = 0

  while (turn < maxTurns) {
    turn++
    const entry = agentMap.get(currentName)
    if (!entry) {
      console.log(`${colors.red}错误: 找不到角色 "${currentName}"，交回主持人${colors.reset}`)
      currentName = moderator.name
      continue
    }

    const { agent, index } = entry
    const isModerator = agent.name === moderator.name

    // 主持人和参与者使用不同的系统提示词
    const systemPrompt = isModerator
      ? buildModeratorPrompt(agent, config.agents)
      : buildParticipantPrompt(agent, config.agents)

    const userPrompt = buildUserPrompt(messages, config.topic, agent)
    const label = isModerator ? "🎙️ 主持人" : "💬 参与者"

    console.log(`${colors.dim}[第 ${turn} 轮] ${label} ${agent.name} 发言中...${colors.reset}`)

    const response = await callLLM(systemPrompt, userPrompt)
    const nextSpeaker = parseNextSpeaker(response.content, agentNames)
    const content = stripNextDirective(response.content)

    const msg: DiscussionMessage = {
      agent: agent.name,
      role: agent.role,
      content,
      turn,
      nextSpeaker,
    }
    messages.push(msg)
    printTurn(msg, index)

    // 检测终止信号
    if (isEndSignal(response.content)) {
      return messages
    }

    // 决定下一个发言者
    if (nextSpeaker) {
      currentName = nextSpeaker
    } else if (!isModerator) {
      // 参与者没指定 → 交回主持人
      currentName = moderator.name
      console.log(`${colors.yellow}  (交回主持人 ${moderator.name})${colors.reset}`)
    } else {
      // 主持人没指定 → 按顺序选下一个参与者
      const lastSpeakers = messages.slice(-config.agents.length).map((m) => m.agent)
      const next = config.agents.find(
        (a) => a.name !== moderator.name && !lastSpeakers.includes(a.name)
      )
      currentName = next?.name || config.agents[1].name
      console.log(`${colors.yellow}  (主持人未指定，自动选择 ${currentName})${colors.reset}`)
    }
  }

  return messages
}

// ============================================================================
// CLI 参数解析
// ============================================================================

function parseArgs(): DiscussConfig {
  const args = process.argv.slice(2)
  let topic = ""
  let mode: DiscussMode = "round-robin"
  let maxRounds = MAX_ROUNDS
  let configFile = ""
  let outputFile: string | undefined

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--config":
      case "-c":
        configFile = args[++i]
        break
      case "--topic":
      case "-t":
        topic = args[++i]
        break
      case "--mode":
      case "-m":
        mode = args[++i] as DiscussMode
        break
      case "--rounds":
      case "-r":
        maxRounds = parseInt(args[++i])
        break
      case "--output":
      case "-o":
        outputFile = args[++i]
        break
      case "--help":
      case "-h":
        printUsage()
        process.exit(0)
    }
  }

  // 从配置文件加载
  if (configFile) {
    const raw = fs.readFileSync(configFile, "utf-8")
    const cfg = JSON.parse(raw) as Partial<DiscussConfig>
    return {
      topic: cfg.topic || topic || "未指定主题",
      mode: cfg.mode || mode,
      agents: cfg.agents || getDefaultAgents(),
      maxRounds: cfg.maxRounds || maxRounds,
      outputFile: cfg.outputFile || outputFile,
    }
  }

  if (!topic) {
    console.log(`${colors.red}错误: 请指定讨论主题 --topic "..."${colors.reset}`)
    printUsage()
    process.exit(1)
  }

  return {
    topic,
    mode,
    agents: getDefaultAgents(),
    maxRounds,
    outputFile,
  }
}

// ============================================================================
// 默认角色 & 帮助
// ============================================================================

function getDefaultAgents(): AgentRole[] {
  return [
    { name: "架构师", role: "关注系统设计、可扩展性、技术选型" },
    { name: "开发者", role: "关注实现细节、代码质量、开发效率" },
    { name: "审查员", role: "关注潜在风险、边界情况、最佳实践" },
  ]
}

function printUsage(): void {
  console.log(`
${colors.bold}多角色讨论脚本 v2${colors.reset}

${colors.cyan}用法:${colors.reset}
  npx tsx scripts/multi-agent-discuss.ts [选项]

${colors.cyan}选项:${colors.reset}
  -t, --topic <主题>     讨论主题（必需，除非用 --config）
  -m, --mode <模式>      讨论模式: round-robin | handoff | moderated
                         默认: round-robin
  -r, --rounds <轮次>    最大讨论轮次（默认: ${MAX_ROUNDS}）
  -c, --config <文件>    从 JSON 配置文件加载
  -o, --output <文件>    保存讨论记录到文件
  -h, --help             显示帮助

${colors.cyan}模式说明:${colors.reset}
  round-robin   固定轮转，每个角色按顺序发言
  handoff       角色自主决定下一个发言者（[NEXT: 角色名]）
  moderated     第一个角色作为主持人，协调讨论流程

${colors.cyan}环境变量:${colors.reset}
  API_BASE_URL  LLM API 地址（默认: http://localhost:8080/v1）
  API_KEY       API 密钥
  MODEL         模型名称（默认: claude-sonnet-4-20250514）
  MAX_ROUNDS    最大轮次（默认: 3）

${colors.cyan}示例:${colors.reset}
  npx tsx scripts/multi-agent-discuss.ts -t "微服务 vs 单体" -m handoff
  npx tsx scripts/multi-agent-discuss.ts -t "重构方案" -m moderated -r 5
  npx tsx scripts/multi-agent-discuss.ts -c discuss-config.json
`)
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs()

  // 验证模式
  if (!["round-robin", "handoff", "moderated"].includes(config.mode)) {
    console.log(`${colors.red}错误: 无效模式 "${config.mode}"，可选: round-robin, handoff, moderated${colors.reset}`)
    process.exit(1)
  }

  // moderated 模式至少需要 2 个角色（1 主持人 + 1 参与者）
  if (config.mode === "moderated" && config.agents.length < 2) {
    console.log(`${colors.red}错误: moderated 模式至少需要 2 个角色${colors.reset}`)
    process.exit(1)
  }

  printHeader(config)

  let messages: DiscussionMessage[]
  let endReason: string

  try {
    switch (config.mode) {
      case "round-robin":
        messages = await runRoundRobin(config)
        endReason = isEndSignal(messages[messages.length - 1]?.content || "")
          ? "角色发出终止信号"
          : "达到最大轮次"
        break

      case "handoff":
        messages = await runHandoff(config)
        endReason = isEndSignal(messages[messages.length - 1]?.content || "")
          ? "角色发出终止信号"
          : "达到最大发言次数"
        break

      case "moderated":
        messages = await runModerated(config)
        endReason = isEndSignal(messages[messages.length - 1]?.content || "")
          ? "主持人/角色发出终止信号"
          : "达到最大发言次数"
        break

      default:
        throw new Error(`未知模式: ${config.mode}`)
    }

    printSummary(messages, endReason)
    saveOutput(config, messages)
  } catch (error) {
    console.error(`${colors.red}讨论出错: ${error instanceof Error ? error.message : String(error)}${colors.reset}`)
    process.exit(1)
  }
}

main()
