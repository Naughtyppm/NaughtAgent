/**
 * API 模式 - 单次 LLM 调用
 *
 * @deprecated 此文件已重命名为 ask-llm.ts，请使用新的导入路径
 *
 * 最简单的子任务模式：
 * - 单次 LLM 调用
 * - 无工具
 * - 支持结构化输出
 * - 最低 Token 消耗
 */

// 重新导出新模块的内容，保持向后兼容
export { runAskLlm as runAPITask } from "./ask-llm"
export type { AskLlmConfig as APITaskConfig } from "./types"
