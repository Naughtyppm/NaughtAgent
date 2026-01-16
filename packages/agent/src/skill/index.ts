/**
 * Skills 技能系统
 *
 * 提供预定义的快捷命令，基于 Workflow 模式实现
 *
 * 用法：
 * - /commit  生成 commit 消息并提交
 * - /pr      生成 PR 描述
 * - /review  代码审查
 * - /test    运行测试并分析
 */

// Types
export type {
  SkillDefinition,
  SkillParameter,
  SkillResult,
  SkillContext,
  ParsedSkillCommand,
} from "./types"

// Registry
export {
  registerSkill,
  getSkill,
  hasSkill,
  listSkills,
  unregisterSkill,
  clearSkills,
  getSkillCount,
} from "./registry"

// Executor
export {
  parseSkillCommand,
  isSkillCommand,
  executeSkill,
  createSkillExecutor,
  type SkillExecutorRuntime,
} from "./executor"

// Builtin Skills
export {
  builtinSkills,
  commitSkill,
  prSkill,
  reviewSkill,
  testSkill,
} from "./builtin"

// ============================================================================
// Initialization
// ============================================================================

import { registerSkill } from "./registry"
import { builtinSkills } from "./builtin"

/**
 * 注册所有内置 Skills
 */
export function registerBuiltinSkills(): void {
  for (const skill of builtinSkills) {
    registerSkill(skill)
  }
}

/**
 * 初始化 Skills 系统
 *
 * 自动注册所有内置 Skills
 */
export function initSkills(): void {
  registerBuiltinSkills()
}
