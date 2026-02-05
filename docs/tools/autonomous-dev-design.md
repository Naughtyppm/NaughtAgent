# Autonomous-Dev 设计文档

## 1. 概述

### 目标
实现一个程序控制的自主开发循环，供 Claude Code 通过 Skill 调用，达到 AutoGPT 级别的自主开发能力。

### 核心原则
- **性能**：并行执行、流式输出、智能缓存
- **准确性**：多重验证、检查点回滚、结构化输出

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│  用户: "实现登录功能"                                             │
│         │                                                        │
│         ▼                                                        │
│  Skill 触发: Bash("node autonomous-dev.js '实现登录功能'")        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     autonomous-dev.js                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    主控制循环                              │   │
│  │                                                           │   │
│  │   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  │   │
│  │   │ Planner │ → │Executor │ → │ Tester  │ → │ Fixer   │  │   │
│  │   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘  │   │
│  │        │             │             │             │        │   │
│  │        ▼             ▼             ▼             ▼        │   │
│  │   规划任务       执行任务       验证结果       修复问题    │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                      支撑层                                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │  │
│  │  │ Claude  │  │  File   │  │  Shell  │  │Checkpoint│       │  │
│  │  │   API   │  │   Ops   │  │  Exec   │  │ Manager │       │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 主控制循环 (MainLoop)

```typescript
interface LoopState {
  goal: string;
  plan: Plan | null;
  currentPhase: 'plan' | 'execute' | 'test' | 'fix' | 'done';
  iteration: number;
  checkpoints: Checkpoint[];
  decisions: Decision[];
  errors: Error[];
}

async function mainLoop(goal: string): Promise<Result> {
  const state: LoopState = initState(goal);

  while (state.currentPhase !== 'done' && state.iteration < MAX_ITERATIONS) {
    state.iteration++;

    // 创建检查点（用于回滚）
    await checkpoint.create(state);

    try {
      switch (state.currentPhase) {
        case 'plan':
          state.plan = await planner.plan(state);
          state.currentPhase = 'execute';
          break;

        case 'execute':
          await executor.execute(state);
          state.currentPhase = 'test';
          break;

        case 'test':
          const testResult = await tester.test(state);
          state.currentPhase = testResult.passed ? 'done' : 'fix';
          break;

        case 'fix':
          const fixed = await fixer.fix(state);
          if (!fixed && state.iteration >= MAX_FIX_ATTEMPTS) {
            // 回滚到上一个检查点
            await checkpoint.rollback(state);
            state.currentPhase = 'plan'; // 重新规划
          } else {
            state.currentPhase = 'test'; // 重新测试
          }
          break;
      }
    } catch (error) {
      state.errors.push(error);
      await checkpoint.rollback(state);
    }

    // 流式输出进度
    await output.progress(state);
  }

  return generateResult(state);
}
```

### 3.2 规划器 (Planner)

**职责**：将模糊目标分解为可执行的任务列表

```typescript
interface Plan {
  goal: string;
  analysis: GoalAnalysis;
  tasks: Task[];
  dependencies: Map<string, string[]>;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

interface Task {
  id: string;
  type: 'explore' | 'design' | 'implement' | 'test' | 'refactor';
  description: string;
  inputs: string[];
  outputs: string[];
  validation: ValidationCriteria;
}

class Planner {
  async plan(state: LoopState): Promise<Plan> {
    // 1. 分析目标
    const analysis = await this.analyzeGoal(state.goal);

    // 2. 收集上下文（并行）
    const [codeContext, projectContext] = await Promise.all([
      this.gatherCodeContext(analysis),
      this.gatherProjectContext()
    ]);

    // 3. 生成任务（结构化输出）
    const tasks = await this.generateTasks(analysis, codeContext, projectContext);

    // 4. 分析依赖
    const dependencies = this.analyzeDependencies(tasks);

    return { goal: state.goal, analysis, tasks, dependencies };
  }

  private async analyzeGoal(goal: string): Promise<GoalAnalysis> {
    // 使用 Claude API，强制结构化输出
    return await claude.call({
      prompt: GOAL_ANALYSIS_PROMPT,
      input: { goal },
      schema: GoalAnalysisSchema, // JSON Schema 强制格式
      temperature: 0.1 // 低温度保证一致性
    });
  }

  private async generateTasks(
    analysis: GoalAnalysis,
    codeContext: CodeContext,
    projectContext: ProjectContext
  ): Promise<Task[]> {
    // 根据任务类型使用不同模板
    const template = TASK_TEMPLATES[analysis.taskType];

    return await claude.call({
      prompt: template,
      input: { analysis, codeContext, projectContext },
      schema: TaskListSchema,
      temperature: 0.2
    });
  }
}
```

### 3.3 执行器 (Executor)

**职责**：按依赖顺序执行任务，支持并行

```typescript
class Executor {
  async execute(state: LoopState): Promise<void> {
    const { tasks, dependencies } = state.plan!;

    // 拓扑排序，找出可并行的任务组
    const taskGroups = this.topologicalSort(tasks, dependencies);

    for (const group of taskGroups) {
      // 同一组内的任务并行执行
      const results = await Promise.all(
        group.map(task => this.executeTask(task, state))
      );

      // 检查结果，决定是否继续
      for (const result of results) {
        if (result.needsDecision) {
          // 自主决策
          const decision = await this.makeDecision(result);
          state.decisions.push(decision);
        }
      }
    }
  }

  private async executeTask(task: Task, state: LoopState): Promise<TaskResult> {
    switch (task.type) {
      case 'explore':
        return await this.explore(task);
      case 'implement':
        return await this.implement(task, state);
      case 'refactor':
        return await this.refactor(task, state);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async implement(task: Task, state: LoopState): Promise<TaskResult> {
    // 1. 生成代码
    const code = await claude.call({
      prompt: IMPLEMENT_PROMPT,
      input: { task, context: state },
      schema: CodeGenerationSchema,
      temperature: 0.3
    });

    // 2. 验证代码（语法检查）
    const syntaxValid = await this.validateSyntax(code);
    if (!syntaxValid) {
      return { success: false, error: 'syntax_error', code };
    }

    // 3. 写入文件
    await fileOps.write(code.filePath, code.content);

    return { success: true, code };
  }

  private async makeDecision(result: TaskResult): Promise<Decision> {
    // 自主决策逻辑
    const decision = await claude.call({
      prompt: DECISION_PROMPT,
      input: {
        situation: result,
        criteria: DECISION_CRITERIA
      },
      schema: DecisionSchema,
      temperature: 0.1 // 决策要稳定
    });

    return decision;
  }
}
```

### 3.4 测试器 (Tester)

**职责**：验证执行结果的正确性

```typescript
class Tester {
  async test(state: LoopState): Promise<TestResult> {
    const results: TestResult[] = [];

    // 1. 语法/类型检查（快速）
    const syntaxResult = await this.syntaxCheck(state);
    results.push(syntaxResult);
    if (!syntaxResult.passed) {
      return this.aggregate(results);
    }

    // 2. 单元测试（如果有）
    const unitResult = await this.runUnitTests(state);
    results.push(unitResult);

    // 3. 集成验证（Claude 评估）
    const integrationResult = await this.verifyIntegration(state);
    results.push(integrationResult);

    // 4. 目标达成检查
    const goalResult = await this.verifyGoal(state);
    results.push(goalResult);

    return this.aggregate(results);
  }

  private async syntaxCheck(state: LoopState): Promise<TestResult> {
    const changedFiles = state.plan!.tasks
      .filter(t => t.type === 'implement')
      .flatMap(t => t.outputs);

    // 并行检查所有文件
    const checks = await Promise.all(
      changedFiles.map(file => this.checkFile(file))
    );

    return {
      type: 'syntax',
      passed: checks.every(c => c.passed),
      details: checks
    };
  }

  private async verifyGoal(state: LoopState): Promise<TestResult> {
    // 让 Claude 评估目标是否达成
    const evaluation = await claude.call({
      prompt: GOAL_VERIFICATION_PROMPT,
      input: {
        goal: state.goal,
        plan: state.plan,
        executionResults: state.executionResults
      },
      schema: GoalVerificationSchema,
      temperature: 0.1
    });

    return {
      type: 'goal',
      passed: evaluation.achieved,
      details: evaluation
    };
  }
}
```

### 3.5 修复器 (Fixer)

**职责**：分析失败原因并修复

```typescript
class Fixer {
  async fix(state: LoopState): Promise<boolean> {
    const failures = state.testResults.filter(r => !r.passed);

    for (const failure of failures) {
      // 1. 分析失败原因
      const analysis = await this.analyzeFailure(failure, state);

      // 2. 生成修复方案
      const fixPlan = await this.generateFixPlan(analysis);

      // 3. 执行修复
      const fixed = await this.applyFix(fixPlan, state);

      if (!fixed) {
        // 记录失败，可能需要回滚重新规划
        state.errors.push({
          type: 'fix_failed',
          failure,
          analysis,
          fixPlan
        });
        return false;
      }
    }

    return true;
  }

  private async analyzeFailure(
    failure: TestResult,
    state: LoopState
  ): Promise<FailureAnalysis> {
    return await claude.call({
      prompt: FAILURE_ANALYSIS_PROMPT,
      input: { failure, context: state },
      schema: FailureAnalysisSchema,
      temperature: 0.2
    });
  }
}
```

---

## 4. 性能优化策略

### 4.1 并行执行

```typescript
// 任务级并行
const taskGroups = topologicalSort(tasks, dependencies);
for (const group of taskGroups) {
  await Promise.all(group.map(task => execute(task)));
}

// API 调用并行
const [analysis, context, history] = await Promise.all([
  claude.analyze(goal),
  gatherContext(),
  loadHistory()
]);
```

### 4.2 流式输出

```typescript
// 实时输出进度，不等待完成
class StreamOutput {
  private stream: WriteStream;

  progress(state: LoopState) {
    const status = {
      phase: state.currentPhase,
      iteration: state.iteration,
      currentTask: state.currentTask,
      progress: this.calculateProgress(state)
    };

    // 立即输出，用户可以看到进度
    this.stream.write(JSON.stringify(status) + '\n');
  }
}
```

### 4.3 智能缓存

```typescript
class ContextCache {
  private cache: Map<string, CacheEntry> = new Map();

  async getContext(key: string, fetcher: () => Promise<any>): Promise<any> {
    const cached = this.cache.get(key);

    if (cached && !this.isStale(cached)) {
      return cached.value;
    }

    const value = await fetcher();
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }

  // 文件变更时失效相关缓存
  invalidateOnFileChange(filePath: string) {
    for (const [key, entry] of this.cache) {
      if (entry.dependsOn?.includes(filePath)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 4.4 增量处理

```typescript
// 只处理变更的部分
class IncrementalProcessor {
  async process(state: LoopState): Promise<void> {
    const changedFiles = await this.detectChanges(state);

    // 只重新分析变更的文件
    for (const file of changedFiles) {
      await this.processFile(file);
    }

    // 只重新运行受影响的测试
    const affectedTests = this.findAffectedTests(changedFiles);
    await this.runTests(affectedTests);
  }
}
```

---

## 5. 准确性保障机制

### 5.1 结构化输出（强制格式）

```typescript
// 使用 JSON Schema 强制输出格式
const GoalAnalysisSchema = {
  type: 'object',
  required: ['taskType', 'components', 'dependencies', 'risks'],
  properties: {
    taskType: {
      type: 'string',
      enum: ['new_feature', 'bug_fix', 'refactor', 'integration']
    },
    components: {
      type: 'array',
      items: { type: 'string' }
    },
    dependencies: {
      type: 'array',
      items: { type: 'string' }
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          mitigation: { type: 'string' }
        }
      }
    }
  }
};

// Claude API 调用时强制 schema
const result = await claude.call({
  prompt: ANALYSIS_PROMPT,
  input: { goal },
  schema: GoalAnalysisSchema,  // 强制格式
  temperature: 0.1             // 低温度
});
```

### 5.2 多重验证

```typescript
class MultiValidator {
  async validate(code: GeneratedCode): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    // 1. 语法验证（AST 解析）
    results.push(await this.syntaxValidate(code));

    // 2. 类型验证（TypeScript 编译）
    results.push(await this.typeValidate(code));

    // 3. 风格验证（ESLint）
    results.push(await this.styleValidate(code));

    // 4. 逻辑验证（Claude 审查）
    results.push(await this.logicValidate(code));

    // 5. 安全验证（常见漏洞检查）
    results.push(await this.securityValidate(code));

    return this.aggregate(results);
  }

  private async logicValidate(code: GeneratedCode): Promise<ValidationResult> {
    // 让另一个 Claude 调用审查代码
    return await claude.call({
      prompt: CODE_REVIEW_PROMPT,
      input: { code, requirements: code.task.description },
      schema: CodeReviewSchema,
      temperature: 0.1
    });
  }
}
```

### 5.3 检查点与回滚

```typescript
class CheckpointManager {
  private checkpoints: Checkpoint[] = [];

  async create(state: LoopState): Promise<string> {
    const id = generateId();

    // 保存当前状态
    const checkpoint: Checkpoint = {
      id,
      timestamp: Date.now(),
      state: deepClone(state),
      files: await this.snapshotFiles(state)
    };

    this.checkpoints.push(checkpoint);
    return id;
  }

  async rollback(state: LoopState, checkpointId?: string): Promise<void> {
    const checkpoint = checkpointId
      ? this.checkpoints.find(c => c.id === checkpointId)
      : this.checkpoints[this.checkpoints.length - 1];

    if (!checkpoint) {
      throw new Error('No checkpoint to rollback to');
    }

    // 恢复文件
    await this.restoreFiles(checkpoint.files);

    // 恢复状态
    Object.assign(state, checkpoint.state);

    // 清理后续检查点
    const index = this.checkpoints.indexOf(checkpoint);
    this.checkpoints = this.checkpoints.slice(0, index + 1);
  }

  private async snapshotFiles(state: LoopState): Promise<FileSnapshot[]> {
    const files = this.getAffectedFiles(state);

    return Promise.all(files.map(async file => ({
      path: file,
      content: await fs.readFile(file, 'utf-8'),
      exists: true
    })));
  }
}
```

### 5.4 自我验证循环

```typescript
// 生成后立即验证，不通过则重试
async function generateWithValidation<T>(
  generator: () => Promise<T>,
  validator: (result: T) => Promise<boolean>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await generator();

    if (await validator(result)) {
      return result;
    }

    // 记录失败原因，下次生成时参考
    console.log(`Attempt ${i + 1} failed, retrying...`);
  }

  throw new Error('Max retries exceeded');
}

// 使用
const code = await generateWithValidation(
  () => claude.generateCode(task),
  async (code) => {
    const syntaxOk = await checkSyntax(code);
    const typeOk = await checkTypes(code);
    return syntaxOk && typeOk;
  }
);
```

### 5.5 决策审计

```typescript
interface Decision {
  id: string;
  timestamp: number;
  situation: string;
  options: string[];
  chosen: string;
  reasoning: string;
  confidence: number;
}

class DecisionAuditor {
  private decisions: Decision[] = [];

  record(decision: Decision) {
    this.decisions.push(decision);

    // 低置信度决策标记，最终报告中高亮
    if (decision.confidence < 0.7) {
      this.flagForReview(decision);
    }
  }

  generateReport(): DecisionReport {
    return {
      total: this.decisions.length,
      highConfidence: this.decisions.filter(d => d.confidence >= 0.8).length,
      lowConfidence: this.decisions.filter(d => d.confidence < 0.7).length,
      flaggedForReview: this.flagged,
      details: this.decisions
    };
  }
}
```

---

## 6. 输出格式

### 6.1 进度输出（流式）

```json
{"phase":"plan","iteration":1,"progress":10,"message":"分析目标..."}
{"phase":"plan","iteration":1,"progress":20,"message":"收集上下文..."}
{"phase":"plan","iteration":1,"progress":30,"message":"生成任务计划..."}
{"phase":"execute","iteration":1,"progress":40,"task":"探索代码结构"}
{"phase":"execute","iteration":1,"progress":50,"task":"实现登录接口"}
{"phase":"execute","iteration":1,"progress":60,"task":"实现前端表单"}
{"phase":"test","iteration":1,"progress":70,"message":"运行测试..."}
{"phase":"fix","iteration":1,"progress":80,"message":"修复类型错误..."}
{"phase":"test","iteration":2,"progress":90,"message":"重新测试..."}
{"phase":"done","iteration":2,"progress":100,"message":"完成"}
```

### 6.2 最终报告

```json
{
  "success": true,
  "goal": "实现用户登录功能",
  "summary": "成功实现登录功能，包括后端 API 和前端表单",
  "iterations": 2,
  "changes": [
    {
      "file": "src/api/auth.ts",
      "action": "create",
      "description": "登录 API 接口"
    },
    {
      "file": "src/components/LoginForm.tsx",
      "action": "create",
      "description": "登录表单组件"
    }
  ],
  "decisions": [
    {
      "situation": "选择认证方式",
      "chosen": "JWT",
      "reasoning": "项目已使用 JWT，保持一致",
      "confidence": 0.9
    }
  ],
  "tests": {
    "passed": 5,
    "failed": 0
  },
  "warnings": [],
  "nextSteps": [
    "添加密码重置功能",
    "添加 OAuth 登录"
  ]
}
```

---

## 7. 文件结构

```
~/.claude/scripts/autonomous-dev/
├── index.js                 # 入口
├── core/
│   ├── loop.js             # 主控制循环
│   ├── planner.js          # 规划器
│   ├── executor.js         # 执行器
│   ├── tester.js           # 测试器
│   └── fixer.js            # 修复器
├── support/
│   ├── claude-api.js       # Claude API 封装
│   ├── file-ops.js         # 文件操作
│   ├── shell.js            # Shell 执行
│   ├── checkpoint.js       # 检查点管理
│   └── cache.js            # 缓存管理
├── prompts/
│   ├── goal-analysis.md    # 目标分析 prompt
│   ├── task-generation.md  # 任务生成 prompt
│   ├── code-generation.md  # 代码生成 prompt
│   ├── code-review.md      # 代码审查 prompt
│   └── decision.md         # 决策 prompt
├── schemas/
│   ├── goal-analysis.json  # 目标分析 schema
│   ├── task.json           # 任务 schema
│   ├── code.json           # 代码 schema
│   └── decision.json       # 决策 schema
└── templates/
    ├── new-feature.js      # 新功能模板
    ├── bug-fix.js          # Bug 修复模板
    └── refactor.js         # 重构模板
```

---

## 8. 使用方式

### Skill 中调用

```markdown
# autonomous-dev skill

当用户给出开发任务时，调用自主开发脚本：

```bash
node ~/.claude/scripts/autonomous-dev/index.js \
  --goal "实现登录功能" \
  --project "$(pwd)" \
  --output json
```

脚本会：
1. 自动分析目标
2. 生成执行计划
3. 逐步执行任务
4. 验证并修复问题
5. 输出最终报告

**不需要中途确认，完全自主执行。**
```

### 命令行参数

```
--goal <string>      开发目标（必需）
--project <path>     项目路径（默认当前目录）
--output <format>    输出格式：json | text | stream（默认 stream）
--max-iterations <n> 最大迭代次数（默认 10）
--dry-run            只规划不执行
--verbose            详细输出
```

---

## 9. 与现有系统集成

### 9.1 复用 NaughtAgent 组件

```typescript
// 复用 NaughtAgent 的 Claude API 封装
import { ClaudeClient } from '@naughtagent/agent';

// 复用 MCP 工具
import { MCPPool } from '@naughtagent/agent/mcp';
```

### 9.2 Skill 触发条件

```markdown
## 触发条件

当用户输入符合以下模式时自动触发：

- "实现 XXX 功能"
- "开发 XXX"
- "添加 XXX 特性"
- "修复 XXX bug"
- "重构 XXX"

## 不触发

- 简单问答
- 代码解释
- 单文件修改
```

---

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| API 调用过多 | 缓存 + 批量处理 + 增量更新 |
| 生成代码错误 | 多重验证 + 检查点回滚 |
| 无限循环 | 迭代上限 + 超时机制 |
| 破坏现有代码 | 检查点 + 文件快照 + 回滚 |
| 决策错误 | 决策审计 + 低置信度标记 |

---

## 11. 下一步

1. **实现核心模块**：loop.js, planner.js, executor.js
2. **编写 prompts**：目标分析、任务生成、代码生成
3. **定义 schemas**：强制结构化输出
4. **集成测试**：用实际开发任务验证
5. **更新 Skill**：添加触发条件和调用方式
