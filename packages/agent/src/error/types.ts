/**
 * 错误处理类型定义
 * 
 * 提供统一的错误分类和处理机制
 */

/**
 * 错误码枚举
 * 
 * 将错误分为可恢复和不可恢复两大类
 */
export enum ErrorCode {
  // 网络错误（可恢复）
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  
  // API 错误（部分可恢复）
  API_ERROR = 'API_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  
  // 工具错误（可恢复）
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // 系统错误（不可恢复）
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}

/**
 * Agent 错误类
 * 
 * 扩展标准 Error，添加错误码、可恢复性和上下文信息
 */
export class AgentError extends Error {
  /**
   * 创建 Agent 错误
   * 
   * @param message - 错误消息
   * @param code - 错误码
   * @param recoverable - 是否可恢复
   * @param context - 错误上下文（可选）
   */
  constructor(
    message: string,
    public code: ErrorCode,
    public recoverable: boolean,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AgentError'
    
    // 保持正确的原型链（TypeScript 继承 Error 的最佳实践）
    Object.setPrototypeOf(this, AgentError.prototype)
  }
  
  /**
   * 获取恢复建议
   * 
   * 根据错误码返回用户友好的恢复建议
   */
  getRecoverySuggestion(): string {
    switch (this.code) {
      case ErrorCode.RATE_LIMIT:
        return '请稍后重试，或升级到更高的 API 配额'
      case ErrorCode.PERMISSION_DENIED:
        return '请检查权限设置，或手动批准该操作'
      case ErrorCode.TOOL_EXECUTION_ERROR:
        return '工具执行失败，请检查输入参数或工具配置'
      case ErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查网络连接后重试'
      case ErrorCode.TIMEOUT:
        return '操作超时，请稍后重试'
      case ErrorCode.API_ERROR:
        return 'API 调用失败，请检查 API 配置和状态'
      case ErrorCode.INVALID_REQUEST:
        return '请求参数无效，请检查输入参数'
      case ErrorCode.AUTHENTICATION_ERROR:
        return '身份验证失败，请检查 API 密钥或凭证'
      case ErrorCode.INTERNAL_ERROR:
        return '内部错误，请查看错误日志获取更多信息'
      case ErrorCode.CONFIGURATION_ERROR:
        return '配置错误，请检查配置文件'
      default:
        return '请查看错误日志获取更多信息'
    }
  }
  
  /**
   * 转换为 JSON 格式
   * 
   * 便于日志记录和序列化
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack
    }
  }
}
