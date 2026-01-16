# Phase 5.4 总结：Rules 索引系统

> 完成时间：2026-01-15

## 做了什么

实现了 Rules 索引系统，包含四个核心模块：

### 1. 类型定义 (`src/rules/types.ts`)
- `RuleMeta`: 规则元数据（id、file、description、triggers、priority、alwaysLoad）
- `RuleTrigger`: 四种触发条件类型
- `LoadedRule`: 加载后的规则（元数据 + 内容）
- `MatchContext`: 匹配上下文
- `ProjectCommand`: 项目指令定义
- `CommandsIndex`: 指令索引

### 2. 触发条件匹配 (`src/rules/matcher.ts`)
- `matchGlob()`: glob 模式匹配，支持 `*` 和 `**` 通配符
- `matchTrigger()`: 匹配单个触发条件
- `matchRules()`: 从索引中匹配规则，按优先级排序
- `extractFilePaths()`: 从用户输入提取文件路径
- `buildMatchContext()`: 构建匹配上下文

### 3. 规则加载器 (`src/rules/loader.ts`)
- `loadRulesIndex()`: 加载规则索引（YAML/JSON/自动生成）
- `loadRule()` / `loadRules()`: 加载规则内容
- `RulesLoader` 类: 带缓存的规则加载器
- `buildRulesPrompt()`: 将规则构建为系统提示

### 4. 动态指令发现 (`src/rules/commands.ts`)
- `parseJustfile()`: 解析 Justfile
- `parseMakefile()`: 解析 Makefile
- `parsePackageScripts()`: 解析 package.json scripts
- `detectPackageManager()`: 检测包管理器
- `CommandsDiscovery` 类: 带缓存的指令发现器
- `buildCommandsPrompt()`: 将指令构建为系统提示

## 能干什么

### 按需加载规则

```typescript
import { RulesLoader, buildMatchContext } from "./rules"

const loader = new RulesLoader()

// 根据用户输入加载相关规则
const context = buildMatchContext("修改 src/index.ts 的代码风格")
const rules = await loader.loadRelevantRules(cwd, context)

// 构建系统提示
const prompt = buildRulesPrompt(rules)
```

### 四种触发条件

| 类型 | 示例 | 说明 |
|------|------|------|
| glob | `*.ts`, `src/**/*.tsx` | 文件路径匹配 |
| command | `/commit`, `git *` | 命令/技能匹配 |
| keyword | `["test", "测试"]` | 用户输入关键词 |
| tool | `["bash", "read"]` | 工具调用匹配 |

### 规则索引格式

```yaml
# .naught/rules/index.yaml
version: 1
rules:
  - id: typescript
    file: typescript.md
    description: TypeScript 代码规范
    triggers:
      - type: glob
        pattern: "*.ts"

  - id: security
    file: security.md
    description: 安全规范
    priority: 100
    alwaysLoad: true
```

### 动态指令发现

```typescript
import { CommandsDiscovery, buildCommandsPrompt } from "./rules"

const discovery = new CommandsDiscovery()
const index = await discovery.discover(cwd)

// 发现的指令
// - just build (from Justfile)
// - pnpm test (from package.json)
// - make deploy (from Makefile)

const prompt = buildCommandsPrompt(index)
```

## 在 Agent 中的作用

```
用户输入
    │
    ▼
┌─────────────────────────────────────┐
│  buildMatchContext()                │
│  - 提取文件路径                      │
│  - 识别命令/技能                     │
│  - 提取关键词                        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  RulesLoader.loadRelevantRules()    │
│  - 加载 alwaysLoad 规则             │
│  - 匹配触发条件                      │
│  - 按优先级排序                      │
│  - 去重和限制数量                    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  CommandsDiscovery.discover()       │
│  - 解析 Justfile/Makefile           │
│  - 解析 package.json scripts        │
│  - 检测包管理器                      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  构建增强系统提示                    │
│  - 项目规则                          │
│  - 可用命令                          │
└─────────────────────────────────────┘
    │
    ▼
Agent Loop（使用增强的系统提示）
```

**核心价值：**
- 减少 Token 消耗：只加载相关规则，而非全部
- 提高响应质量：Agent 获得任务相关的上下文
- 利用现有工具：Agent 优先使用项目已有的命令

## 当前整体能力

**能做：**
- ✅ 读写编辑文件、执行命令、搜索代码
- ✅ 调用 Claude API（流式/非流式）
- ✅ 维护对话上下文、多轮对话
- ✅ Agent Loop（LLM → Tool → LLM）
- ✅ CLI 命令行执行、权限检查
- ✅ 上下文管理（规则、项目结构、Git）
- ✅ Token 管理、安全检查
- ✅ Diff 预览、撤销操作
- ✅ 子任务分解（API/Workflow/Agent 模式）
- ✅ 交互工具（question/todo）
- ✅ Skills 技能系统（/commit /pr /review /test）
- ✅ **按需加载规则**（根据任务上下文）
- ✅ **动态指令发现**（Justfile/Makefile/package.json）

**不能做：**
- ❌ HTTP API 服务
- ❌ WebSocket 实时通信
- ❌ MCP 协议支持

## 测试覆盖

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| matcher.test.ts | 27 | glob 匹配、触发条件、规则匹配、路径提取 |
| loader.test.ts | 16 | 索引加载、规则加载、缓存、提示构建 |
| commands.test.ts | 32 | Justfile/Makefile/package.json 解析、指令发现 |

**覆盖率：** 87.90% 语句 / 79.74% 分支 / 94.54% 函数

## 文件结构

```
packages/agent/src/rules/
├── index.ts      # 模块导出
├── types.ts      # 类型定义
├── matcher.ts    # 触发条件匹配
├── loader.ts     # 规则加载器
└── commands.ts   # 动态指令发现

packages/agent/test/rules/
├── matcher.test.ts
├── loader.test.ts
└── commands.test.ts
```

## 下一步建议

### Phase 5.5: 外部集成

1. **HTTP Server** - VS Code 插件需要通过 HTTP 调用 Agent
2. **WebSocket** - 实时通信，流式输出
3. **MCP Client** - 连接外部 MCP 服务器
4. **MCP Tools** - 动态加载外部工具

### 集成建议

Rules 系统需要与 Agent Loop 集成：

```typescript
// 在 Agent Loop 中使用
async function runWithRules(input: string, cwd: string) {
  const rulesLoader = new RulesLoader()
  const commandsDiscovery = new CommandsDiscovery()

  // 构建上下文
  const context = buildMatchContext(input)

  // 加载规则和指令
  const rules = await rulesLoader.loadRelevantRules(cwd, context)
  const commands = await commandsDiscovery.discover(cwd)

  // 构建增强提示
  const rulesPrompt = buildRulesPrompt(rules)
  const commandsPrompt = buildCommandsPrompt(commands)

  // 注入到系统提示
  const enhancedSystemPrompt = basePrompt + rulesPrompt + commandsPrompt

  // 运行 Agent
  return agent.run(input, { systemPrompt: enhancedSystemPrompt })
}
```
