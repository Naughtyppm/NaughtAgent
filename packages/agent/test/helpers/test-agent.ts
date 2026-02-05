/**
 * 测试 Agent 工厂
 *
 * 创建用于集成测试的 Agent 实例
 *
 * @module test/helpers/test-agent
 */

import type { LLMProvider } from '../../src/provider/types.js'
import type { UnifiedRegistry } from '../../src/command/registry.js'
import type { CommandRouter } from '../../src/command/router.js'
import type { CommandDispatcher, DispatchContext } from '../../src/command/dispatcher.js'
import type { ExecutionResult, UnifiedCommand } from '../../src/command/types.js'
import type { AppState } from '../../src/command/builtin/types.js'
import type { SkillExecutorRuntime } from '../../src/skill/executor.js'

import { createMockProvider, MockLLMProvider } from './mock-provider.js'
import { createUnifiedRegistry, createSyncRegistry } from '../../src/command/registry.js'
import { createCommandRouter } from '../../src/command/router.js'
import { createCommandDispatcher } from '../../src/command/dispatcher.js'
import { createCompletionProvider } from '../../src/command/completion.js'
import { createErrorDiagnostics } from '../../src/command/diagnostics.js'

/**
 * 测试 Agent 配置
 */
export interface TestAgentConfig {
  /** LLM Provider（默认使用 MockProvider） */
  provider?: LLMProvider
  /** 工作目录 */
  cwd?: string
  /** 初始状态 */
  initialState?: Partial<AppState>
  /** 是否使用异步注册表（加载 justfile） */
  asyncRegistry?: boolean
}

/**
 * 测试 Agent 实例
 *
 * 封装命令系统的完整功能，用于集成测试
 */
export class TestAgent {
  readonly provider: LLMProvider
  readonly cwd: string

  private registry: UnifiedRegistry
  private router: CommandRouter
  private dispatcher: CommandDispatcher
  private state: AppState
  private messages: Array<{ type: string; message: string }> = []

  constructor(
    provider: LLMProvider,
    registry: UnifiedRegistry,
    cwd: string,
    initialState?: Partial<AppState>
  ) {
    this.provider = provider
    this.registry = registry
    this.cwd = cwd
    this.router = createCommandRouter(registry)
    this.dispatcher = createCommandDispatcher()

    // 初始化状态
    this.state = {
      currentModel: initialState?.currentModel ?? 'claude-sonnet-4-20250514',
      permissionMode: initialState?.permissionMode ?? 'ask',
      commandHistory: initialState?.commandHistory ?? [],
      conversationHistory: initialState?.conversationHistory ?? [],
      cwd: cwd,
    }
  }

  /**
   * 获取命令注册表
   */
  getRegistry(): UnifiedRegistry {
    return this.registry
  }

  /**
   * 获取当前模型
   */
  getCurrentModel(): string {
    return this.state.currentModel
  }

  /**
   * 获取权限模式
   */
  getPermissionMode(): string {
    return this.state.permissionMode
  }

  /**
   * 获取命令历史
   */
  getCommandHistory(): string[] {
    return this.state.commandHistory
  }

  /**
   * 获取消息记录
   */
  getMessages(): Array<{ type: string; message: string }> {
    return [...this.messages]
  }

  /**
   * 清空消息记录
   */
  clearMessages(): void {
    this.messages = []
  }

  /**
   * 创建 AI 运行时（用于 Skill 执行）
   */
  private createAIRuntime(): SkillExecutorRuntime | undefined {
    if (!(this.provider instanceof MockLLMProvider)) {
      return undefined
    }

    const mockProvider = this.provider

    // 创建 SubTaskProvider 适配器
    const provider = {
      chat: async (options: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
        model?: string
        temperature?: number
        maxTokens?: number
      }) => {
        const result = await mockProvider.chat({
          model: { provider: 'anthropic', model: options.model ?? 'claude-sonnet-4-20250514' },
          messages: options.messages.map(m => ({
            role: m.role as any,
            content: m.content,
          })),
        })
        return {
          content: result.text,
          usage: result.usage,
        }
      },
      chatWithSchema: async <T>(options: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
        schema: any
        model?: string
        temperature?: number
        maxTokens?: number
      }): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }> => {
        const result = await mockProvider.chat({
          model: { provider: 'anthropic', model: options.model ?? 'claude-sonnet-4-20250514' },
          messages: options.messages.map(m => ({
            role: m.role as any,
            content: m.content,
          })),
        })
        // 尝试解析 JSON 响应
        let data: T
        try {
          data = JSON.parse(result.text) as T
        } catch {
          data = result.text as unknown as T
        }
        return {
          data,
          usage: result.usage,
        }
      },
    }

    // 创建工具执行器
    const toolExecutor = {
      execute: async (
        toolName: string,
        params: Record<string, unknown>,
        ctx: { cwd: string }
      ) => {
        return {
          output: `Mock tool ${toolName} executed with params: ${JSON.stringify(params)}`,
        }
      },
    }

    return {
      provider,
      toolExecutor,
    }
  }

  /**
   * 执行命令
   */
  async executeCommand(
    input: string,
    options: { abort?: AbortSignal } = {}
  ): Promise<ExecutionResult> {
    // 路由输入
    const routingResult = this.router.route(input)

    // 如果不是命令
    if (routingResult.type !== 'command') {
      return {
        success: false,
        output: '',
        error: '输入不是命令',
        duration: 0,
        layer: 'builtin',
      }
    }

    // 如果命令未找到
    if (!routingResult.found || !routingResult.command) {
      const diagnostics = createErrorDiagnostics()
      const diagnostic = diagnostics.diagnose('not_found', {
        command: routingResult.commandName,
      })

      return {
        success: false,
        output: '',
        error: `命令未找到: ${routingResult.commandName}\n${diagnostic.suggestions.join('\n')}`,
        duration: 0,
        layer: 'builtin',
      }
    }

    // 记录命令历史
    this.state.commandHistory.push(input)

    // 构建调度上下文
    const context: DispatchContext = {
      cwd: this.cwd,
      abort: options.abort,
      addMessage: (type, message) => {
        this.messages.push({ type, message })
      },
      getState: () => this.state,
      setState: (updates) => {
        this.state = { ...this.state, ...updates }
      },
      getRegistry: () => this.registry,
      reloadRegistry: async () => {
        await this.registry.reload()
      },
      aiRuntime: this.createAIRuntime(),
    }

    // 执行命令
    return this.dispatcher.dispatch(
      routingResult.command,
      routingResult.args,
      routingResult.namedArgs,
      context
    )
  }

  /**
   * 检查输入是否是命令
   */
  isCommand(input: string): boolean {
    return this.router.isCommand(input)
  }

  /**
   * 获取命令补全建议
   */
  getCompletions(input: string): Array<{ name: string; description: string }> {
    const provider = createCompletionProvider()
    return provider.getSuggestions(input, this.registry)
  }

  /**
   * 重新加载命令源
   */
  async reload(): Promise<void> {
    await this.registry.reload()
    this.router = createCommandRouter(this.registry)
  }

  /**
   * 关闭 Agent
   */
  async shutdown(): Promise<void> {
    // 清理资源
    this.messages = []
    this.state.commandHistory = []
    this.state.conversationHistory = []
  }
}

/**
 * 创建测试 Agent
 */
export async function createTestAgent(
  config: TestAgentConfig = {}
): Promise<TestAgent> {
  const provider = config.provider ?? createMockProvider()
  const cwd = config.cwd ?? process.cwd()

  // 创建注册表
  const registry = config.asyncRegistry
    ? await createUnifiedRegistry()
    : createSyncRegistry()

  return new TestAgent(provider, registry, cwd, config.initialState)
}

/**
 * 创建带临时目录的测试 Agent
 */
export async function createTestAgentWithTempDir(
  config: Omit<TestAgentConfig, 'cwd'> = {}
): Promise<{
  agent: TestAgent
  tempDir: string
  cleanup: () => Promise<void>
}> {
  const { createTempDir, cleanupTempDir } = await import('./context.js')
  const tempDir = await createTempDir('command-test-')

  const agent = await createTestAgent({
    ...config,
    cwd: tempDir,
  })

  return {
    agent,
    tempDir,
    cleanup: async () => {
      await agent.shutdown()
      await cleanupTempDir(tempDir)
    },
  }
}
