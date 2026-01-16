/**
 * Chat View Provider
 *
 * 提供聊天 Webview 面板
 */

import * as vscode from 'vscode';
import { AgentClient, AgentMessage } from '../../services/AgentClient';
import { ContextCollector } from '../../services/ContextCollector';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'pending' | 'streaming' | 'done' | 'error';
  toolCalls?: Array<{
    id: string;
    name: string;
    input: unknown;
    output?: string;
    status: 'running' | 'done' | 'error';
  }>;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'naughtagent.chatView';

  private _view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private currentMessageId: string | null = null;
  private unsubscribe?: () => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentClient: AgentClient,
    private readonly contextCollector: ContextCollector
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // 处理来自 Webview 的消息
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.sendMessage(message.text);
          break;
        case 'permissionResponse':
          await this.agentClient.respondPermission(
            message.requestId,
            message.allowed
          );
          break;
        case 'ready':
          // Webview 准备好了，发送现有消息
          this.syncMessages();
          break;
      }
    });

    // 监听 Agent 消息
    this.unsubscribe = this.agentClient.onMessage((msg) => {
      this.handleAgentMessage(msg);
    });

    webviewView.onDidDispose(() => {
      this.unsubscribe?.();
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(text: string): Promise<void> {
    if (!text.trim()) return;

    const workspaceRoot = this.contextCollector.getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }

    // 确保有会话
    if (!this.agentClient.getSessionId()) {
      try {
        const config = vscode.workspace.getConfiguration('naughtagent');
        const agentType = config.get<string>('defaultAgent', 'build');
        await this.agentClient.createSession(workspaceRoot, agentType);
        await this.agentClient.connect();
      } catch (e) {
        vscode.window.showErrorMessage(
          `连接 Agent 服务失败: ${e instanceof Error ? e.message : e}`
        );
        return;
      }
    }

    // 收集上下文
    const context = await this.contextCollector.collect();
    const contextPrompt = this.contextCollector.buildContextPrompt(context);

    // 构建完整消息
    const fullMessage = contextPrompt
      ? `${contextPrompt}\n\n用户问题: ${text}`
      : text;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: text, // 显示原始消息，不包含上下文
      timestamp: Date.now(),
      status: 'done',
    };
    this.messages.push(userMessage);
    this.postMessage({ type: 'addMessage', message: userMessage });

    // 添加助手消息占位
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
      toolCalls: [],
    };
    this.messages.push(assistantMessage);
    this.currentMessageId = assistantMessage.id;
    this.postMessage({ type: 'addMessage', message: assistantMessage });

    // 发送消息
    try {
      await this.agentClient.sendMessage(fullMessage);
    } catch (e) {
      this.updateCurrentMessage({
        status: 'error',
        content: `发送失败: ${e instanceof Error ? e.message : e}`,
      });
    }
  }

  /**
   * 处理 Agent 消息
   */
  private handleAgentMessage(msg: AgentMessage): void {
    if (!this.currentMessageId) return;

    switch (msg.type) {
      case 'text':
        this.updateCurrentMessage({
          status: 'streaming',
          content:
            (this.getCurrentMessage()?.content || '') + (msg.content || ''),
        });
        break;

      case 'tool_start':
        const currentMsg = this.getCurrentMessage();
        if (currentMsg) {
          const toolCalls = currentMsg.toolCalls || [];
          toolCalls.push({
            id: msg.id || this.generateId(),
            name: msg.name || 'unknown',
            input: msg.input,
            status: 'running',
          });
          this.updateCurrentMessage({ toolCalls });
        }
        break;

      case 'tool_end':
        this.updateToolCall(msg.id || '', {
          output: msg.output,
          status: msg.isError ? 'error' : 'done',
        });
        break;

      case 'permission_request':
        this.postMessage({
          type: 'permissionRequest',
          requestId: msg.requestId,
          permissionType: msg.permissionType,
          resource: msg.resource,
          description: msg.description,
        });
        break;

      case 'error':
        this.updateCurrentMessage({
          status: 'error',
          content:
            (this.getCurrentMessage()?.content || '') +
            `\n\n❌ 错误: ${msg.content}`,
        });
        break;

      case 'done':
        this.updateCurrentMessage({ status: 'done' });
        this.currentMessageId = null;
        break;
    }
  }

  /**
   * 新建对话
   */
  async newChat(): Promise<void> {
    await this.agentClient.closeSession();
    this.messages = [];
    this.currentMessageId = null;
    this.postMessage({ type: 'clearMessages' });
  }

  /**
   * 清空对话
   */
  async clearChat(): Promise<void> {
    await this.newChat();
  }

  /**
   * 同步消息到 Webview
   */
  private syncMessages(): void {
    this.postMessage({ type: 'setMessages', messages: this.messages });
  }

  /**
   * 获取当前消息
   */
  private getCurrentMessage(): ChatMessage | undefined {
    return this.messages.find((m) => m.id === this.currentMessageId);
  }

  /**
   * 更新当前消息
   */
  private updateCurrentMessage(updates: Partial<ChatMessage>): void {
    const index = this.messages.findIndex(
      (m) => m.id === this.currentMessageId
    );
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...updates };
      this.postMessage({
        type: 'updateMessage',
        id: this.currentMessageId,
        updates,
      });
    }
  }

  /**
   * 更新工具调用
   */
  private updateToolCall(
    toolId: string,
    updates: Partial<ChatMessage['toolCalls'][0]>
  ): void {
    const msg = this.getCurrentMessage();
    if (msg && msg.toolCalls) {
      const toolIndex = msg.toolCalls.findIndex((t) => t.id === toolId);
      if (toolIndex !== -1) {
        msg.toolCalls[toolIndex] = { ...msg.toolCalls[toolIndex], ...updates };
        this.postMessage({
          type: 'updateMessage',
          id: this.currentMessageId,
          updates: { toolCalls: msg.toolCalls },
        });
      }
    }
  }

  /**
   * 发送消息到 Webview
   */
  private postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取 Webview HTML 内容
   */
  private getHtmlContent(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>NaughtAgent Chat</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .message {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
      max-width: 100%;
    }

    .message.user {
      background-color: var(--vscode-input-background);
      margin-left: 20px;
    }

    .message.assistant {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      margin-right: 20px;
    }

    .message-role {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
    }

    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    .message-content code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
    }

    .message-content pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message-content pre code {
      padding: 0;
      background: none;
    }

    .tool-call {
      margin-top: 8px;
      padding: 8px;
      background-color: var(--vscode-textCodeBlock-background);
      border-radius: 6px;
      font-size: 12px;
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .tool-call-name {
      font-weight: 600;
    }

    .tool-call-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .tool-call-status.running {
      background-color: var(--vscode-inputValidation-infoBackground);
    }

    .tool-call-status.done {
      background-color: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-inputValidation-infoForeground);
    }

    .tool-call-status.error {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .tool-call-output {
      margin-top: 6px;
      padding: 6px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
      max-height: 150px;
      overflow-y: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      white-space: pre-wrap;
    }

    .permission-request {
      margin-top: 12px;
      padding: 12px;
      background-color: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 6px;
    }

    .permission-request-title {
      font-weight: 600;
      margin-bottom: 8px;
    }

    .permission-request-buttons {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .permission-request-buttons button {
      padding: 6px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .permission-request-buttons button.allow {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .permission-request-buttons button.deny {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .input-container {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-editor-background);
    }

    .input-wrapper {
      display: flex;
      gap: 8px;
    }

    #messageInput {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: none;
      min-height: 40px;
      max-height: 150px;
    }

    #messageInput:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    #sendButton {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 500;
    }

    #sendButton:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    #sendButton:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 20px;
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .empty-state-description {
      font-size: 13px;
      max-width: 300px;
    }

    .typing-indicator {
      display: inline-flex;
      gap: 4px;
      padding: 8px 0;
    }

    .typing-indicator span {
      width: 6px;
      height: 6px;
      background-color: var(--vscode-descriptionForeground);
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out;
    }

    .typing-indicator span:nth-child(1) { animation-delay: 0s; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
  </style>
</head>
<body>
  <div class="chat-container" id="chatContainer">
    <div class="empty-state" id="emptyState">
      <div class="empty-state-icon">🤖</div>
      <div class="empty-state-title">NaughtAgent</div>
      <div class="empty-state-description">
        AI 编程助手，可以帮你阅读、编写、修改代码，执行命令等。
        <br><br>
        试试输入你的问题吧！
      </div>
    </div>
  </div>

  <div class="input-container">
    <div class="input-wrapper">
      <textarea
        id="messageInput"
        placeholder="输入消息... (Shift+Enter 换行)"
        rows="1"
      ></textarea>
      <button id="sendButton">发送</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chatContainer');
    const emptyState = document.getElementById('emptyState');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    let messages = [];
    let pendingPermissions = new Map();

    // 发送消息
    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text) return;

      vscode.postMessage({ type: 'sendMessage', text });
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }

    // 渲染消息
    function renderMessages() {
      if (messages.length === 0) {
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';

      // 清除现有消息（保留 emptyState）
      const existingMessages = chatContainer.querySelectorAll('.message');
      existingMessages.forEach(el => el.remove());

      messages.forEach(msg => {
        const el = createMessageElement(msg);
        chatContainer.appendChild(el);
      });

      // 滚动到底部
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // 创建消息元素
    function createMessageElement(msg) {
      const el = document.createElement('div');
      el.className = 'message ' + msg.role;
      el.id = 'msg-' + msg.id;

      const roleLabel = msg.role === 'user' ? '你' : 'AI';

      let content = msg.content || '';

      // 简单的 Markdown 渲染
      content = escapeHtml(content);
      content = content.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, '<pre><code class="language-$1">$2</code></pre>');
      content = content.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      let html = '<div class="message-role">' + roleLabel + '</div>';
      html += '<div class="message-content">' + content + '</div>';

      // 显示加载状态
      if (msg.status === 'pending') {
        html += '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      }

      // 显示工具调用
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(tool => {
          html += '<div class="tool-call">';
          html += '<div class="tool-call-header">';
          html += '<span class="tool-call-name">🔧 ' + escapeHtml(tool.name) + '</span>';
          html += '<span class="tool-call-status ' + tool.status + '">' + getStatusText(tool.status) + '</span>';
          html += '</div>';
          if (tool.output) {
            html += '<div class="tool-call-output">' + escapeHtml(tool.output.substring(0, 500)) + (tool.output.length > 500 ? '...' : '') + '</div>';
          }
          html += '</div>';
        });
      }

      el.innerHTML = html;
      return el;
    }

    // 更新消息
    function updateMessage(id, updates) {
      const index = messages.findIndex(m => m.id === id);
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates };

        const el = document.getElementById('msg-' + id);
        if (el) {
          const newEl = createMessageElement(messages[index]);
          el.replaceWith(newEl);
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    }

    // 显示权限请求
    function showPermissionRequest(data) {
      const el = document.createElement('div');
      el.className = 'permission-request';
      el.id = 'perm-' + data.requestId;

      el.innerHTML =
        '<div class="permission-request-title">⚠️ 需要确认</div>' +
        '<div>' + escapeHtml(data.description || data.permissionType + ': ' + data.resource) + '</div>' +
        '<div class="permission-request-buttons">' +
        '<button class="allow" onclick="respondPermission(\'' + data.requestId + '\', true)">允许</button>' +
        '<button class="deny" onclick="respondPermission(\'' + data.requestId + '\', false)">拒绝</button>' +
        '</div>';

      chatContainer.appendChild(el);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // 响应权限请求
    window.respondPermission = function(requestId, allowed) {
      vscode.postMessage({ type: 'permissionResponse', requestId, allowed });

      const el = document.getElementById('perm-' + requestId);
      if (el) {
        el.remove();
      }
    };

    // 辅助函数
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function getStatusText(status) {
      switch (status) {
        case 'running': return '执行中...';
        case 'done': return '完成';
        case 'error': return '错误';
        default: return status;
      }
    }

    // 事件监听
    sendButton.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    });

    // 接收来自 Extension 的消息
    window.addEventListener('message', (event) => {
      const message = event.data;

      switch (message.type) {
        case 'addMessage':
          messages.push(message.message);
          renderMessages();
          break;

        case 'updateMessage':
          updateMessage(message.id, message.updates);
          break;

        case 'setMessages':
          messages = message.messages;
          renderMessages();
          break;

        case 'clearMessages':
          messages = [];
          renderMessages();
          break;

        case 'permissionRequest':
          showPermissionRequest(message);
          break;
      }
    });

    // 通知 Extension 已准备好
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
