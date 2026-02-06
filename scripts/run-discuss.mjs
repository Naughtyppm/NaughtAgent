#!/usr/bin/env node
/**
 * 纯 JS wrapper — 绕过 tsx/npx 在 Windows 终端的输出捕获问题
 * 直接读取 discuss config JSON，调用 LLM API 进行多角色讨论
 */
import * as fs from "node:fs"
import * as path from "node:path"

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/v1"
const API_KEY = process.env.API_KEY || "sk-placeholder"
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514"

// 读取配置
const configPath = process.argv[2] || "scripts/discuss-ui-flicker.json"
const configRaw = fs.readFileSync(path.resolve(configPath), "utf-8")
const config = JSON.parse(configRaw)

const AGENT_COLORS = ["\x1b[36m", "\x1b[32m", "\x1b[33m", "\x1b[35m", "\x1b[34m"]
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const GRAY = "\x1b[90m"

function agentColor(i) { return AGENT_COLORS[i % AGENT_COLORS.length] }

async function callLLM(systemPrompt, userPrompt) {
  const resp = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
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
  if (!resp.ok) throw new Error(`LLM API error ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return { content: data.choices?.[0]?.message?.content || "", usage: data.usage }
}

function parseNextSpeaker(content, names) {
  const m = content.match(/\[NEXT:\s*([^\]]+)\]/i)
  if (!m) return undefined
  const req = m[1].trim()
  return names.find(n => n === req || n.includes(req) || req.includes(n))
}

function stripNext(c) { return c.replace(/\[NEXT:\s*[^\]]+\]/gi, "").trim() }
function isEnd(c) { return /\[END_DISCUSSION\]/i.test(c) || /\[END\]/i.test(c) || /达成共识/.test(c) }

function buildHandoffPrompt(agent, allAgents) {
  const others = allAgents.filter(a => a.name !== agent.name).map(a => `${a.name}（${a.role}）`).join("、")
  const nameList = allAgents.filter(a => a.name !== agent.name).map(a => a.name).join("、")
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
- 选择你认为最应该接话的人
- 如果你认为讨论已经充分，用 [END_DISCUSSION] 代替 [NEXT: ...]
- 用中文讨论`
}

function buildContext(messages, topic) {
  if (!messages.length) return ""
  const lines = messages.map(m => `【${m.agent}（${m.role}）- 第${m.turn}轮】:\n${m.content}`)
  return `讨论主题: ${topic}\n\n已有讨论:\n${lines.join("\n\n---\n\n")}`
}

function buildUserPrompt(messages, topic, agent) {
  if (!messages.length) return `讨论主题: ${topic}\n\n请从你的角色视角分享初始观点。`
  return `${buildContext(messages, topic)}\n\n---\n\n现在轮到你（${agent.name}）发言。`
}

async function runHandoff() {
  const messages = []
  const names = config.agents.map(a => a.name)
  const agentMap = new Map(config.agents.map((a, i) => [a.name, { agent: a, index: i }]))
  const maxTurns = config.maxRounds * config.agents.length

  let currentName = config.agents[0].name
  let turn = 0

  console.log(`\n${BOLD}${"═".repeat(60)}${RESET}`)
  console.log(`${BOLD}  多角色讨论 (handoff)${RESET}`)
  console.log(`${GRAY}  主题: ${config.topic}${RESET}`)
  console.log(`${GRAY}  角色: ${names.join("、")}${RESET}`)
  console.log(`${GRAY}  最大轮次: ${config.maxRounds}${RESET}`)
  console.log(`${BOLD}${"═".repeat(60)}${RESET}\n`)

  while (turn < maxTurns) {
    turn++
    const entry = agentMap.get(currentName)
    if (!entry) { currentName = config.agents[0].name; continue }
    const { agent, index } = entry

    console.log(`${DIM}[第 ${turn} 轮] 等待 ${agent.name} 发言...${RESET}`)

    const sys = buildHandoffPrompt(agent, config.agents)
    const usr = buildUserPrompt(messages, config.topic, agent)
    const resp = await callLLM(sys, usr)
    const next = parseNextSpeaker(resp.content, names)
    const content = stripNext(resp.content)

    const msg = { agent: agent.name, role: agent.role, content, turn, nextSpeaker: next }
    messages.push(msg)

    const color = agentColor(index)
    console.log(`${color}${BOLD}【${msg.agent}】${RESET} ${DIM}(${msg.role}) - 第${msg.turn}轮${RESET}`)
    console.log(msg.content)
    if (msg.nextSpeaker) console.log(`${GRAY}  → 下一位: ${msg.nextSpeaker}${RESET}`)
    console.log(`${GRAY}${"─".repeat(40)}${RESET}`)

    if (isEnd(resp.content)) break
    if (next) { currentName = next } else {
      const ni = (index + 1) % config.agents.length
      currentName = config.agents[ni].name
    }
  }
  return messages
}

function saveOutput(messages) {
  if (!config.outputFile) return
  const lines = [`# 多角色讨论记录\n`, `- 主题: ${config.topic}`, `- 模式: ${config.mode}`,
    `- 角色: ${config.agents.map(a => `${a.name}（${a.role}）`).join("、")}`,
    `- 时间: ${new Date().toISOString()}\n`, `---\n`]
  for (const msg of messages) {
    lines.push(`## 【${msg.agent}】（${msg.role}）- 第${msg.turn}轮\n`)
    lines.push(msg.content)
    if (msg.nextSpeaker) lines.push(`\n> → 下一位: ${msg.nextSpeaker}`)
    lines.push(`\n---\n`)
  }
  const dir = path.dirname(config.outputFile)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(config.outputFile, lines.join("\n"), "utf-8")
  console.log(`\n讨论记录已保存: ${config.outputFile}`)
}

async function main() {
  try {
    const messages = await runHandoff()
    console.log(`\n${BOLD}${"═".repeat(60)}${RESET}`)
    console.log(`${BOLD}  讨论结束${RESET}`)
    console.log(`${GRAY}  总发言数: ${messages.length}${RESET}`)
    const counts = new Map()
    for (const m of messages) counts.set(m.agent, (counts.get(m.agent) || 0) + 1)
    for (const [name, count] of counts) console.log(`${GRAY}    ${name}: ${count} 次${RESET}`)
    console.log(`${BOLD}${"═".repeat(60)}${RESET}\n`)
    saveOutput(messages)
  } catch (e) {
    console.error(`\x1b[31m错误: ${e.message}\x1b[0m`)
    process.exit(1)
  }
}

main()
