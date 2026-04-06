/**
 * Agent 服务客户端
 *
 * 负责与 Agent Daemon HTTP/WebSocket 服务通信
 */

import WebSocket from 'ws';

// Daemon 默认端口
const DEFAULT_DAEMON_PORT = 31415;

export interface AgentClientConfig {
  baseURL: string;
  wsURL: string;
}

export interface AgentMessage {
  type:
    | 'text'
    | 'text_delta'
    | 'thinking'
    | 'thinking_end'
    | 'tool_start'
    | 'tool_end'
    | 'permission_request'
    | 'question_request'
    | 'snapshot_request'
    | 'todo_updated'
    | 'subagent_start'
    | 'subagent_end'
    | 'error'
    | 'done'
    | 'pong';
  content?: string;
  id?: string;
  name?: string;
  input?: unknown;
  output?: string;
  isError?: boolean;
  requestId?: string;
  permissionType?: string;
  resource?: string;
  description?: string;
  message?: string;  // error message
  usage?: { inputTokens: number; outputTokens: number };
  delta?: string;
  questionType?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  default?: unknown;
  todoList?: Array<{ id: string; title: string; status: string }>;
  // SubAgent 事件字段
  parentId?: string;
  childId?: string;
  childName?: string;
  prompt?: string;
  success?: boolean;
  error?: string;
}

export interface SendOptions {
  model?: string;
  thinking?: { enabled: boolean; budgetTokens?: number };
  autoConfirm?: boolean;
  attachments?: Array<{ type: string; data: string; mimeType: string }>;
}

export interface SessionInfo {
  id: string;
  agentType: string;
  cwd: string;
  createdAt: string;
  messageCount?: number;
}

type MessageHandler = (message: AgentMessage) => void;

/**
 * 获取默认配置
 */
export function getDefaultConfig(): AgentClientConfig {
  const baseURL = `http://127.0.0.1:${DEFAULT_DAEMON_PORT}`;
  return {
    baseURL,
    wsURL: baseURL.replace('http', 'ws'),
  };
}

export class AgentClient {
  private config: AgentClientConfig;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private cwd: string | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(config?: AgentClientConfig) {
    this.config = config || getDefaultConfig();
  }

  /**
   * 更新配置
   */
  updateConfig(config: AgentClientConfig): void {
    this.config = config;
    // 如果已连接，重新连接
    if (this.ws) {
      this.disconnect();
    }
  }

  /**
   * 检查 Daemon 是否运行
   */
  async checkDaemonHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseURL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 查找或创建会话（按 cwd）
   */
  async findOrCreateSession(cwd: string, agentType = 'build'): Promise<SessionInfo> {
    const response = await fetch(`${this.config.baseURL}/sessions/find-or-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, agentType }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to find or create session: ${error}`);
    }

    const data = await response.json();
    this.sessionId = data.id;
    this.cwd = cwd;
    return data;
  }

  /**
   * 创建会话（新建）
   */
  async createSession(cwd: string, agentType = 'build'): Promise<SessionInfo> {
    const response = await fetch(`${this.config.baseURL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentType, cwd }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create session: ${error}`);
    }

    const data = await response.json();
    this.sessionId = data.id;
    this.cwd = cwd;
    return data;
  }

  /**
   * 列出会话
   */
  async listSessions(cwd?: string): Promise<SessionInfo[]> {
    const url = cwd
      ? `${this.config.baseURL}/sessions?cwd=${encodeURIComponent(cwd)}`
      : `${this.config.baseURL}/sessions`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to list sessions');
    }

    const data = await response.json();
    return data.sessions || [];
  }

  /**
   * 连接 WebSocket
   */
  async connect(sessionId?: string): Promise<void> {
    const sid = sessionId || this.sessionId;
    if (!sid) {
      throw new Error('No session ID. Create a session first.');
    }

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams();
      params.set('sessionId', sid);
      if (this.cwd) {
        params.set('cwd', this.cwd);
      }

      const wsUrl = `${this.config.wsURL}/ws?${params.toString()}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPing();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const raw = JSON.parse(data.toString()) as AgentMessage;

          // 统一 text_delta 事件为可渲染文本内容。
          const message: AgentMessage =
            raw.type === 'text_delta'
              ? {
                  ...raw,
                  content: raw.delta || raw.content || '',
                }
              : raw;

          this.notifyHandlers(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('WebSocket disconnected');
        this.stopPing();
        this.ws = null;
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
    });
  }

  /**
   * 断开 WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 启动心跳
   */
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  /**
   * 停止心跳
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * 发送消息（WebSocket）
   */
  async sendMessage(message: string, options?: SendOptions): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // 尝试重连
      if (this.sessionId) {
        await this.connect();
      } else {
        throw new Error('Not connected. Create a session and connect first.');
      }
    }

    // 使用正确的消息格式
    const payload: Record<string, unknown> = {
      type: 'send',
      message: message,
      model: options?.model,
      thinking: options?.thinking,
      autoConfirm: options?.autoConfirm,
    };
    if (options?.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments;
    }
    this.ws!.send(JSON.stringify(payload));
  }

  /**
   * 发送消息（HTTP SSE 方式，用于流式响应）
   */
  async *sendMessageSSE(message: string): AsyncGenerator<AgentMessage> {
    if (!this.sessionId) {
      throw new Error('No session. Create a session first.');
    }

    const response = await fetch(
      `${this.config.baseURL}/sessions/${this.sessionId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message, stream: true }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const raw = JSON.parse(data) as AgentMessage;

            // Daemon SSE 主要返回 text_delta，这里统一映射为 text，便于上层渲染。
            if (raw.type === 'text_delta') {
              yield {
                ...raw,
                type: 'text',
                content: raw.delta || raw.content || '',
              };
              continue;
            }

            yield raw;
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }

  /**
   * 响应权限请求
   */
  async respondPermission(requestId: string, allowed: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    this.ws.send(
      JSON.stringify({
        type: 'permission_response',
        requestId,
        allowed,
      })
    );
  }

  /**
   * 响应 Question 工具提问
   */
  respondQuestion(requestId: string, value: unknown, cancelled?: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('respondQuestion called but not connected, ignoring');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'question_response',
        requestId,
        value,
        cancelled: !!cancelled,
      })
    );
  }

  /**
   * 响应 Snapshot 请求（发送 DOM 快照回 Daemon）
   */
  respondSnapshot(requestId: string, snapshot: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('respondSnapshot called but not connected, ignoring');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'snapshot_response',
        requestId,
        snapshot,
      })
    );
  }

  /**
   * 取消当前任务
   */
  async cancelTask(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ type: 'cancel' }));
  }

  /**
   * 关闭会话
   */
  async closeSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(`${this.config.baseURL}/sessions/${this.sessionId}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.error('Failed to close session:', e);
      }
      this.sessionId = null;
      this.cwd = null;
    }
    this.disconnect();
  }

  /**
   * 添加消息处理器
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * 通知所有处理器
   */
  private notifyHandlers(message: AgentMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (e) {
        console.error('Message handler error:', e);
      }
    }
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 获取当前工作目录
   */
  getCwd(): string | null {
    return this.cwd;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.closeSession();
    this.messageHandlers.clear();
  }
}
