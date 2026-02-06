/**
 * Agent Registry 单元测试
 *
 * 测试 Markdown 解析器功能：
 * - validateAgentDefinition: 验证 frontmatter 必填字段
 * - parseAgentFile: 解析 Markdown 文件
 *
 * @module test/subtask/agent-registry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  validateAgentDefinition,
  parseAgentFile,
  REQUIRED_FIELDS,
  VALID_PERMISSION_MODES,
  type CustomAgentDefinition,
} from "../../src/subtask/agent-registry"

describe("Agent Registry - Markdown Parser", () => {
  // 保存原始 console.warn
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  // ==========================================================================
  // validateAgentDefinition 测试
  // ==========================================================================

  describe("validateAgentDefinition", () => {
    const filePath = "test/agent.md"

    describe("必填字段验证", () => {
      /**
       * **Validates: Requirements 2.6**
       * THE Agent_Registry SHALL validate that required fields (name, description) are present
       */
      it("应该验证通过包含所有必填字段的定义", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it("应该拒绝缺少 name 字段的定义", () => {
        const frontmatter = {
          description: "A test agent",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: missing required field 'name'`)
      })

      it("应该拒绝缺少 description 字段的定义", () => {
        const frontmatter = {
          name: "test-agent",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: missing required field 'description'`)
      })

      it("应该拒绝空的 name 字段", () => {
        const frontmatter = {
          name: "   ",
          description: "A test agent",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: field 'name' cannot be empty`)
      })

      it("应该拒绝空的 description 字段", () => {
        const frontmatter = {
          name: "test-agent",
          description: "",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: field 'description' cannot be empty`)
      })

      it("应该拒绝非字符串类型的必填字段", () => {
        const frontmatter = {
          name: 123,
          description: ["array"],
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: field 'name' must be a string`)
        expect(result.errors).toContain(`${filePath}: field 'description' must be a string`)
      })
    })


    describe("可选字段验证", () => {
      it("应该验证通过包含有效 tools 数组的定义", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          tools: ["read", "write", "glob"],
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it("应该拒绝非数组类型的 tools 字段", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          tools: "read",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: field 'tools' must be an array`)
      })

      it("应该拒绝包含非字符串元素的 tools 数组", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          tools: ["read", 123, "write"],
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: tools[1] must be a string`)
      })

      it("应该验证通过有效的 model 字段", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          model: "claude-sonnet",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(true)
      })

      it("应该拒绝非字符串类型的 model 字段", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          model: 123,
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: field 'model' must be a string`)
      })

      it("应该验证通过有效的 permissionMode 字段", () => {
        for (const mode of VALID_PERMISSION_MODES) {
          const frontmatter = {
            name: "test-agent",
            description: "A test agent",
            permissionMode: mode,
          }

          const result = validateAgentDefinition(frontmatter, filePath)

          expect(result.valid).toBe(true)
        }
      })

      it("应该拒绝无效的 permissionMode 值", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          permissionMode: "invalid",
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(
          `${filePath}: field 'permissionMode' must be one of: ${VALID_PERMISSION_MODES.join(", ")}`
        )
      })
    })

    describe("边界情况", () => {
      it("应该拒绝 null frontmatter", () => {
        const result = validateAgentDefinition(null, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: frontmatter must be an object`)
      })

      it("应该拒绝 undefined frontmatter", () => {
        const result = validateAgentDefinition(undefined, filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: frontmatter must be an object`)
      })

      it("应该拒绝非对象类型的 frontmatter", () => {
        const result = validateAgentDefinition("string", filePath)

        expect(result.valid).toBe(false)
        expect(result.errors).toContain(`${filePath}: frontmatter must be an object`)
      })

      it("应该允许空的 tools 数组", () => {
        const frontmatter = {
          name: "test-agent",
          description: "A test agent",
          tools: [],
        }

        const result = validateAgentDefinition(frontmatter, filePath)

        expect(result.valid).toBe(true)
      })
    })
  })


  // ==========================================================================
  // parseAgentFile 测试
  // ==========================================================================

  describe("parseAgentFile", () => {
    const filePath = ".naughty/agents/test-agent.md"

    describe("有效文件解析", () => {
      /**
       * **Validates: Requirements 2.2, 2.3, 2.4**
       * - 2.2: WHEN a Markdown file is found, THE Agent_Registry SHALL parse its frontmatter
       * - 2.3: THE custom agent definition SHALL support fields: name, description, tools, model, permissionMode
       * - 2.4: THE custom agent definition SHALL use the Markdown body as the system prompt
       */
      it("应该正确解析包含所有字段的 Markdown 文件", () => {
        const content = `---
name: security-reviewer
description: 代码安全审查专家
tools:
  - read
  - glob
  - grep
model: claude-sonnet
permissionMode: plan
---

## 系统提示

你是一位资深的安全审计专家。

### 审查重点

1. 注入漏洞
2. 认证问题`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.name).toBe("security-reviewer")
        expect(result!.description).toBe("代码安全审查专家")
        expect(result!.tools).toEqual(["read", "glob", "grep"])
        expect(result!.model).toBe("claude-sonnet")
        expect(result!.permissionMode).toBe("plan")
        expect(result!.systemPrompt).toContain("你是一位资深的安全审计专家")
        expect(result!.systemPrompt).toContain("注入漏洞")
        expect(result!.filePath).toBe(filePath)
      })

      it("应该正确解析只包含必填字段的 Markdown 文件", () => {
        const content = `---
name: simple-agent
description: 简单的 Agent
---

这是系统提示词。`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.name).toBe("simple-agent")
        expect(result!.description).toBe("简单的 Agent")
        expect(result!.tools).toEqual([])
        expect(result!.model).toBeUndefined()
        expect(result!.permissionMode).toBeUndefined()
        expect(result!.systemPrompt).toBe("这是系统提示词。")
      })

      it("应该正确处理空的 Markdown body", () => {
        const content = `---
name: no-prompt-agent
description: 没有系统提示的 Agent
---
`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.systemPrompt).toBe("")
      })

      it("应该正确 trim 字段值", () => {
        const content = `---
name: "  trimmed-agent  "
description: "  描述带空格  "
model: "  claude-sonnet  "
tools:
  - "  read  "
  - "  write  "
---

  系统提示带空格  `

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.name).toBe("trimmed-agent")
        expect(result!.description).toBe("描述带空格")
        expect(result!.model).toBe("claude-sonnet")
        expect(result!.tools).toEqual(["read", "write"])
        expect(result!.systemPrompt).toBe("系统提示带空格")
      })
    })

    describe("无效文件处理", () => {
      /**
       * **Validates: Requirements 2.6, 2.7**
       * - 2.6: THE Agent_Registry SHALL validate that required fields are present
       * - 2.7: WHEN invalid, THE Agent_Registry SHALL log a warning and skip
       */
      it("应该返回 null 并记录警告当缺少必填字段时", () => {
        const content = `---
description: 缺少 name 字段
---

系统提示`

        const result = parseAgentFile(content, filePath)

        expect(result).toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it("应该返回 null 当 frontmatter 为空时", () => {
        const content = `---
---

只有 body 没有 frontmatter`

        const result = parseAgentFile(content, filePath)

        expect(result).toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it("应该返回 null 当没有 frontmatter 时", () => {
        const content = `# 普通 Markdown 文件

没有 YAML frontmatter`

        const result = parseAgentFile(content, filePath)

        expect(result).toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it("应该返回 null 当 YAML 格式错误时", () => {
        const content = `---
name: test
description: [invalid yaml
  - broken
---

body`

        const result = parseAgentFile(content, filePath)

        expect(result).toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalled()
      })
    })

    describe("permissionMode 处理", () => {
      it("应该正确解析 ask 权限模式", () => {
        const content = `---
name: ask-agent
description: Ask 模式 Agent
permissionMode: ask
---

prompt`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.permissionMode).toBe("ask")
      })

      it("应该正确解析 allow 权限模式", () => {
        const content = `---
name: allow-agent
description: Allow 模式 Agent
permissionMode: allow
---

prompt`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.permissionMode).toBe("allow")
      })

      it("应该正确解析 plan 权限模式", () => {
        const content = `---
name: plan-agent
description: Plan 模式 Agent
permissionMode: plan
---

prompt`

        const result = parseAgentFile(content, filePath)

        expect(result).not.toBeNull()
        expect(result!.permissionMode).toBe("plan")
      })

      it("应该返回 null 当 permissionMode 无效时", () => {
        const content = `---
name: invalid-mode-agent
description: 无效权限模式
permissionMode: invalid
---

prompt`

        const result = parseAgentFile(content, filePath)

        expect(result).toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalled()
      })
    })
  })
})


// ==========================================================================
// Agent Registry Core Functions 测试
// ==========================================================================

import {
  createAgentRegistry,
  getAgentRegistry,
  resetAgentRegistry,
  DEFAULT_CUSTOM_AGENTS_DIR,
  type AgentRegistry,
} from "../../src/subtask/agent-registry"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

describe("Agent Registry - Core Functions", () => {
  // 临时测试目录
  let tempDir: string
  let agentsDir: string
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // 创建临时目录
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-registry-test-"))
    agentsDir = path.join(tempDir, ".naughty", "agents")
    fs.mkdirSync(agentsDir, { recursive: true })

    // Mock console.warn
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    // 重置全局注册表
    resetAgentRegistry()
  })

  afterEach(() => {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true })
    consoleWarnSpy.mockRestore()
    resetAgentRegistry()
  })

  // ==========================================================================
  // createAgentRegistry 测试
  // ==========================================================================

  describe("createAgentRegistry", () => {
    it("应该创建一个空的注册表实例", () => {
      const registry = createAgentRegistry({ cwd: tempDir })

      expect(registry).toBeDefined()
      expect(registry.listAgents()).toHaveLength(0)
    })

    it("应该使用默认配置当没有提供配置时", () => {
      const registry = createAgentRegistry()

      expect(registry).toBeDefined()
      expect(registry.listAgents()).toHaveLength(0)
    })
  })

  // ==========================================================================
  // loadCustomAgents 测试
  // ==========================================================================

  describe("loadCustomAgents", () => {
    /**
     * **Validates: Requirements 2.1**
     * THE Agent_Registry SHALL scan the `.naughty/agents/` directory for custom agent definitions on startup
     */
    it("应该扫描目录并加载有效的 Agent 定义", async () => {
      // 创建有效的 Agent 定义文件
      const agentContent = `---
name: test-agent
description: 测试 Agent
tools:
  - read
  - glob
---

这是系统提示词。`

      fs.writeFileSync(path.join(agentsDir, "test-agent.md"), agentContent)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toHaveLength(1)
      expect(registry.getAgent("test-agent")).toBeDefined()
    })

    it("应该加载多个 Agent 定义", async () => {
      // 创建多个 Agent 定义文件
      const agent1 = `---
name: agent-one
description: 第一个 Agent
---

提示词 1`

      const agent2 = `---
name: agent-two
description: 第二个 Agent
---

提示词 2`

      fs.writeFileSync(path.join(agentsDir, "agent-one.md"), agent1)
      fs.writeFileSync(path.join(agentsDir, "agent-two.md"), agent2)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toHaveLength(2)
      expect(registry.hasAgent("agent-one")).toBe(true)
      expect(registry.hasAgent("agent-two")).toBe(true)
    })

    /**
     * **Validates: Requirements 2.7**
     * WHEN a custom agent definition is invalid, THE Agent_Registry SHALL log a warning and skip the invalid definition
     */
    it("应该跳过无效的 Agent 定义并记录警告", async () => {
      // 创建无效的 Agent 定义（缺少 name）
      const invalidAgent = `---
description: 缺少 name 字段
---

提示词`

      // 创建有效的 Agent 定义
      const validAgent = `---
name: valid-agent
description: 有效的 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "invalid.md"), invalidAgent)
      fs.writeFileSync(path.join(agentsDir, "valid.md"), validAgent)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      // 只有有效的 Agent 被加载
      expect(registry.listAgents()).toHaveLength(1)
      expect(registry.hasAgent("valid-agent")).toBe(true)

      // 应该记录警告
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it("应该处理重名的 Agent 定义（跳过后者）", async () => {
      // 创建两个同名的 Agent 定义
      const agent1 = `---
name: duplicate-agent
description: 第一个定义
---

提示词 1`

      const agent2 = `---
name: duplicate-agent
description: 第二个定义
---

提示词 2`

      fs.writeFileSync(path.join(agentsDir, "agent-a.md"), agent1)
      fs.writeFileSync(path.join(agentsDir, "agent-b.md"), agent2)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      // 只有一个被加载
      expect(registry.listAgents()).toHaveLength(1)

      // 应该记录重名警告
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Duplicate agent name")
      )
    })

    it("应该静默处理不存在的目录", async () => {
      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents("non-existent-dir")

      expect(registry.listAgents()).toHaveLength(0)
      // 不应该有警告
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it("应该只加载 .md 文件", async () => {
      // 创建 .md 文件
      const mdAgent = `---
name: md-agent
description: Markdown Agent
---

提示词`

      // 创建非 .md 文件
      const txtContent = `---
name: txt-agent
description: Text Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "agent.md"), mdAgent)
      fs.writeFileSync(path.join(agentsDir, "agent.txt"), txtContent)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toHaveLength(1)
      expect(registry.hasAgent("md-agent")).toBe(true)
      expect(registry.hasAgent("txt-agent")).toBe(false)
    })

    it("应该清空之前加载的 Agent 当重新加载时", async () => {
      // 创建第一个 Agent
      const agent1 = `---
name: first-agent
description: 第一个 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "first.md"), agent1)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toHaveLength(1)

      // 删除第一个，创建第二个
      fs.unlinkSync(path.join(agentsDir, "first.md"))

      const agent2 = `---
name: second-agent
description: 第二个 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "second.md"), agent2)

      // 重新加载
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toHaveLength(1)
      expect(registry.hasAgent("first-agent")).toBe(false)
      expect(registry.hasAgent("second-agent")).toBe(true)
    })
  })

  // ==========================================================================
  // getAgent 测试
  // ==========================================================================

  describe("getAgent", () => {
    /**
     * **Validates: Requirements 2.5**
     * WHEN a custom agent is requested, THE Agent_Registry SHALL return the parsed configuration or an error if not found
     */
    it("应该返回存在的 Agent 定义", async () => {
      const agentContent = `---
name: my-agent
description: 我的 Agent
tools:
  - read
  - write
model: claude-sonnet
permissionMode: plan
---

系统提示词内容`

      fs.writeFileSync(path.join(agentsDir, "my-agent.md"), agentContent)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      const agent = registry.getAgent("my-agent")

      expect(agent).toBeDefined()
      expect(agent!.name).toBe("my-agent")
      expect(agent!.description).toBe("我的 Agent")
      expect(agent!.tools).toEqual(["read", "write"])
      expect(agent!.model).toBe("claude-sonnet")
      expect(agent!.permissionMode).toBe("plan")
      expect(agent!.systemPrompt).toBe("系统提示词内容")
    })

    it("应该返回 undefined 当 Agent 不存在时", async () => {
      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      const agent = registry.getAgent("non-existent")

      expect(agent).toBeUndefined()
    })
  })

  // ==========================================================================
  // listAgents 测试
  // ==========================================================================

  describe("listAgents", () => {
    it("应该返回所有已注册的 Agent", async () => {
      const agent1 = `---
name: agent-alpha
description: Alpha Agent
---

提示词`

      const agent2 = `---
name: agent-beta
description: Beta Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "alpha.md"), agent1)
      fs.writeFileSync(path.join(agentsDir, "beta.md"), agent2)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      const agents = registry.listAgents()

      expect(agents).toHaveLength(2)
      expect(agents.map((a) => a.name).sort()).toEqual(["agent-alpha", "agent-beta"])
    })

    it("应该返回空数组当没有 Agent 时", async () => {
      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.listAgents()).toEqual([])
    })
  })

  // ==========================================================================
  // hasAgent 测试
  // ==========================================================================

  describe("hasAgent", () => {
    it("应该返回 true 当 Agent 存在时", async () => {
      const agentContent = `---
name: existing-agent
description: 存在的 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "existing.md"), agentContent)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.hasAgent("existing-agent")).toBe(true)
    })

    it("应该返回 false 当 Agent 不存在时", async () => {
      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.hasAgent("non-existent")).toBe(false)
    })
  })

  // ==========================================================================
  // refresh 测试
  // ==========================================================================

  describe("refresh", () => {
    it("应该重新加载 Agent 定义", async () => {
      const agent1 = `---
name: original-agent
description: 原始 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "original.md"), agent1)

      const registry = createAgentRegistry({ cwd: tempDir })
      await registry.loadCustomAgents(".naughty/agents")

      expect(registry.hasAgent("original-agent")).toBe(true)

      // 修改文件
      fs.unlinkSync(path.join(agentsDir, "original.md"))

      const agent2 = `---
name: new-agent
description: 新 Agent
---

提示词`

      fs.writeFileSync(path.join(agentsDir, "new.md"), agent2)

      // 刷新
      await registry.refresh()

      expect(registry.hasAgent("original-agent")).toBe(false)
      expect(registry.hasAgent("new-agent")).toBe(true)
    })

    it("应该使用默认目录当没有调用过 loadCustomAgents 时", async () => {
      // 在默认目录创建 Agent
      const defaultAgentsDir = path.join(tempDir, DEFAULT_CUSTOM_AGENTS_DIR)
      fs.mkdirSync(defaultAgentsDir, { recursive: true })

      const agentContent = `---
name: default-dir-agent
description: 默认目录 Agent
---

提示词`

      fs.writeFileSync(path.join(defaultAgentsDir, "agent.md"), agentContent)

      const registry = createAgentRegistry({ cwd: tempDir })

      // 直接调用 refresh（没有先调用 loadCustomAgents）
      await registry.refresh()

      expect(registry.hasAgent("default-dir-agent")).toBe(true)
    })
  })

  // ==========================================================================
  // Global Singleton 测试
  // ==========================================================================

  describe("Global Singleton", () => {
    describe("getAgentRegistry", () => {
      it("应该返回全局单例实例", () => {
        const registry1 = getAgentRegistry()
        const registry2 = getAgentRegistry()

        expect(registry1).toBe(registry2)
      })

      it("应该在首次调用时使用提供的配置", async () => {
        const agentContent = `---
name: singleton-agent
description: 单例 Agent
---

提示词`

        fs.writeFileSync(path.join(agentsDir, "singleton.md"), agentContent)

        const registry = getAgentRegistry({ cwd: tempDir })
        await registry.loadCustomAgents(".naughty/agents")

        expect(registry.hasAgent("singleton-agent")).toBe(true)
      })
    })

    describe("resetAgentRegistry", () => {
      it("应该重置全局单例", () => {
        const registry1 = getAgentRegistry()
        resetAgentRegistry()
        const registry2 = getAgentRegistry()

        expect(registry1).not.toBe(registry2)
      })
    })
  })
})
