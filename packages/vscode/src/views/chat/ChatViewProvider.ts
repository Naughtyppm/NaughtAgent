import * as vscode from 'vscode';
import { AgentClient, AgentMessage } from '../../services/AgentClient';
import { ContextCollector } from '../../services/ContextCollector';

type ChatRole = 'user' | 'assistant' | 'system' | 'error';
type ChatKind = 'normal' | 'thinking' | 'tool' | 'status';

interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp: number;
  kind?: ChatKind;
}

interface WebviewInboundMessage {
  type:
    | 'ready'
    | 'send'
    | 'clear'
    | 'cancel'
    | 'newSession'
    | 'updateThinking'
    | 'updateRuntime'
    | 'questionResponse';
  text?: string;
  enabled?: boolean;
  budget?: number;
  agentType?: 'build' | 'plan' | 'explore';
  model?: string;
  requestId?: string;
  value?: unknown;
  cancelled?: boolean;
}

interface WebviewOutboundMessage {
  type: 'state';
  messages: ChatMessage[];
  pending: boolean;
  thinkingEnabled: boolean;
  thinkingBudget: number;
  agentType: 'build' | 'plan' | 'explore';
  model: string;
  runStatus: string;
  sessionId?: string;
  pendingQuestion?: {
    requestId: string;
    questionType: string;
    message: string;
    options?: Array<{ value: string; label: string; description?: string }>;
    default?: unknown;
  } | null;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'naughtyagent.chatView';

  private view?: vscode.WebviewView;
  private readonly messages: ChatMessage[] = [];
  private pending = false;
  private thinkingEnabled = false;
  private thinkingBudget = 16000;
  private readonly activeTools = new Map<string, number>(); // toolId -> message index
  private agentType: 'build' | 'plan' | 'explore' = 'build';
  private model = 'sonnet';
  private runStatus = 'idle';
  private pendingQuestion: {
    requestId: string;
    questionType: string;
    message: string;
    options?: Array<{ value: string; label: string; description?: string }>;
    default?: unknown;
  } | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentClient: AgentClient,
    private readonly contextCollector: ContextCollector,
    private readonly output?: vscode.OutputChannel
  ) {}

  private log(message: string): void {
    this.output?.appendLine(`[chat] ${message}`);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewInboundMessage) => {
      try {
      this.log(`webview message: ${message.type}`);
      if (message.type === 'ready') {
        const config = vscode.workspace.getConfiguration('naughtyagent');
        const defaultAgent = config.get<'build' | 'plan' | 'explore'>('defaultAgent', 'build');
        this.agentType = defaultAgent;
        this.postState();
        return;
      }

      if (message.type === 'clear') {
        await this.clearChat();
        return;
      }

      if (message.type === 'cancel') {
        await this.agentClient.cancelTask();
        this.pending = false;
        this.runStatus = 'cancelled';
        this.messages.push({
          role: 'system',
          content: '已请求取消当前任务。',
          timestamp: Date.now(),
        });
        this.postState();
        return;
      }

      if (message.type === 'newSession') {
        await this.newChat();
        this.messages.push({
          role: 'system',
          content: `已新建会话（模式: ${this.agentType}, 模型: ${this.model}）。`,
          timestamp: Date.now(),
        });
        this.postState();
        return;
      }

      if (message.type === 'send' && typeof message.text === 'string') {
        this.log(`send requested: ${message.text.slice(0, 80)}`);
        await this.sendMessage(message.text);
        return;
      }

      if (message.type === 'updateThinking') {
        this.thinkingEnabled = Boolean(message.enabled);
        if (typeof message.budget === 'number' && Number.isFinite(message.budget)) {
          this.thinkingBudget = Math.max(1024, Math.floor(message.budget));
        }
        this.postState();
        return;
      }

      if (message.type === 'updateRuntime') {
        let sessionNeedsReset = false;

        if (message.agentType && message.agentType !== this.agentType) {
          this.agentType = message.agentType;
          sessionNeedsReset = true;
        }

        if (message.model && message.model.trim()) {
          this.model = message.model.trim();
        }

        if (sessionNeedsReset) {
          await this.agentClient.closeSession();
          this.messages.push({
            role: 'system',
            content: `已切换模式为 ${this.agentType}，将创建新会话。`,
            timestamp: Date.now(),
          });
        }

        this.postState();
      }

      if (message.type === 'questionResponse') {
        const requestId = message.requestId as string;
        const value = message.value;
        const cancelled = message.cancelled as boolean | undefined;
        this.pendingQuestion = null;
        this.agentClient.respondQuestion(requestId, value, cancelled);
        this.postState();
      }
      } catch (error) {
        this.log(`onDidReceiveMessage error: ${error instanceof Error ? error.message : String(error)}`);
        this.pending = false;
        this.runStatus = 'error';
        this.messages.push({
          role: 'error',
          content: `处理消息失败: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now(),
          kind: 'status',
        });
        this.postState();
      }
    });
  }

  async newChat(): Promise<void> {
    this.messages.length = 0;
    this.agentClient.disconnect();
    await this.agentClient.closeSession();
    this.runStatus = 'idle';
    this.postState();
  }

  async clearChat(): Promise<void> {
    this.messages.length = 0;
    this.postState();
  }

  async sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.pending) {
      this.log(`send ignored: empty=${!trimmed} pending=${this.pending}`);
      return;
    }

    // /quit 命令：取消当前运行并重置会话
    if (trimmed === '/quit') {
      this.log('quit command received');
      if (this.pending) {
        this.agentClient.cancelTask();
      }
      this.messages.push({
        role: 'system',
        content: '会话已终止。',
        timestamp: Date.now(),
        kind: 'status',
      });
      this.pending = false;
      this.runStatus = 'idle';
      this.postState();
      return;
    }

    this.log('send start');

    this.messages.push({
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });
    this.pending = true;
    this.runStatus = 'running';
    this.postState();

    let assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    this.messages.push(assistantMessage);
    this.postState();

    try {
      await this.ensureSession();
      await this.ensureConnected();
      const prompt = await this.buildPrompt(trimmed);
      this.log(`prompt prepared len=${prompt.length}`);

      const runState: { thinkingMessage?: ChatMessage; activeTextMessage?: ChatMessage; hadToolSinceText?: boolean } = {};

      const unsubscribe = this.agentClient.onMessage(async (event) => {
        this.log(`ws event: ${event.type}`);
        await this.handleAgentMessage(event, assistantMessage, runState);
      });
      try {
        await this.agentClient.sendMessage(prompt, {
          model: this.model,
          thinking: this.thinkingEnabled
            ? { enabled: true, budgetTokens: this.thinkingBudget }
            : undefined,
          autoConfirm: true,
        });

        await this.waitForRunCompletion();
        this.log('run completed');
      } finally {
        unsubscribe();
      }

      if (!assistantMessage.content.trim() && !runState.activeTextMessage) {
        assistantMessage.content = '未收到有效回复。';
      }
    } catch (error) {
      this.log(`send error: ${error instanceof Error ? error.message : String(error)}`);
      // 错误作为独立消息
      this.messages.push({
        role: 'error',
        content: `发送失败: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    } finally {
      this.pending = false;
      this.runStatus = 'idle';
      this.postState();
      this.log(`send finally pending=${this.pending} status=${this.runStatus}`);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.agentClient.getSessionId()) {
      return;
    }

    const cwd = this.contextCollector.getWorkspaceRoot();
    if (!cwd) {
      throw new Error('请先打开一个工作区后再使用聊天。');
    }

    const config = vscode.workspace.getConfiguration('naughtyagent');
    await this.agentClient.findOrCreateSession(cwd, this.agentType);
    this.log(`session ready: ${this.agentClient.getSessionId() || 'none'}`);
  }

  private async ensureConnected(): Promise<void> {
    if (this.agentClient.isConnected()) {
      return;
    }

    await this.agentClient.connect();
    this.log('ws connected');
  }

  private waitForRunCompletion(timeoutMs = 600000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        dispose();
        reject(new Error('等待 Agent 响应超时'));
      }, timeoutMs);

      const dispose = this.agentClient.onMessage((event) => {
        if (event.type === 'done') {
          clearTimeout(timer);
          dispose();
          resolve();
        }
        // error 事件不再 reject — 持久循环模式下中间错误是正常的
      });
    });
  }

  private async buildPrompt(userText: string): Promise<string> {
    const context = await this.contextCollector.collect();
    const references = await this.contextCollector.resolveAllFileReferences(userText);
    if (references.length > 0) {
      context.referencedFiles = references;
    }

    const contextPrompt = this.contextCollector.buildContextPrompt(context);
    if (!contextPrompt.trim()) {
      return userText;
    }

    return `${contextPrompt}\n\n用户问题:\n${userText}`;
  }

  private async handleAgentMessage(
    event: AgentMessage,
    assistantMessage: ChatMessage,
    runState: { thinkingMessage?: ChatMessage; activeTextMessage?: ChatMessage; hadToolSinceText?: boolean }
  ): Promise<void> {
    switch (event.type) {
      case 'text':
      case 'text_delta':
        // 如果工具执行后有新文本，创建新的 assistant message 放在底部
        if (runState.hadToolSinceText) {
          const newMsg: ChatMessage = {
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          };
          this.messages.push(newMsg);
          runState.activeTextMessage = newMsg;
          runState.hadToolSinceText = false;
          runState.thinkingMessage = undefined; // 重置 thinking 状态
        }
        const target = runState.activeTextMessage || assistantMessage;
        target.content += event.content || '';
        this.postState();
        break;
      case 'thinking':
        if (!runState.thinkingMessage) {
          runState.thinkingMessage = {
            role: 'system',
            content: '思考过程\n',
            timestamp: Date.now(),
            kind: 'thinking',
          };
          this.messages.push(runState.thinkingMessage);
        }
        runState.thinkingMessage.content += event.content || '';
        this.postState();
        break;
      case 'thinking_end':
        if (runState.thinkingMessage) {
          runState.thinkingMessage.content += '\n思考结束';
        }
        this.postState();
        break;
      case 'tool_start':
        {
          runState.hadToolSinceText = true;
          const inputSummary = this.summarizeUnknown(event.input, 180);
          const toolMsg: ChatMessage = {
            role: 'system',
            content: `🛠️ ${event.name || 'unknown'}${inputSummary ? `\n输入: ${inputSummary}` : ''}`,
            timestamp: Date.now(),
            kind: 'tool',
          };
          this.messages.push(toolMsg);
          if (event.id) {
            this.activeTools.set(event.id, this.messages.length - 1);
          }
        }
        this.postState();
        break;
      case 'tool_end':
        {
          const outputSummary = this.summarizeUnknown(event.output || '', 500);
          const msgIdx = event.id ? this.activeTools.get(event.id) : undefined;
          if (msgIdx !== undefined && msgIdx < this.messages.length) {
            // 合并到 tool_start 消息
            const existing = this.messages[msgIdx];
            const status = event.isError ? ' ❌' : ' ✅';
            existing.content += status;
            if (outputSummary) {
              existing.content += `\n输出: ${outputSummary}`;
            }
            if (event.id) {
              this.activeTools.delete(event.id);
            }
          } else {
            // 找不到对应 start，单独添加
            this.messages.push({
              role: 'system',
              content: `🛠️ 工具结束: ${event.id || 'unknown'}${event.isError ? ' ❌' : ' ✅'}${outputSummary ? `\n输出: ${outputSummary}` : ''}`,
              timestamp: Date.now(),
              kind: 'tool',
            });
          }
        }
        this.postState();
        break;
      case 'error':
        {
          // 错误作为独立消息追加到消息流底部
          const errorMsg: ChatMessage = {
            role: 'error',
            content: event.message || event.content || 'Agent 返回错误',
            timestamp: Date.now(),
          };
          this.messages.push(errorMsg);
          this.runStatus = 'error';
        }
        this.postState();
        break;
      case 'permission_request':
        // 权限已全部自动批准，忽略
        break;
      case 'question_request':
        // Agent 调用了 question 工具，显示提问 UI
        this.pendingQuestion = {
          requestId: event.requestId || '',
          questionType: event.questionType || 'confirm',
          message: event.message || '',
          options: event.options,
          default: event.default,
        };
        this.postState();
        break;
      case 'done':
        this.runStatus = 'idle';
      case 'pong':
      default:
        break;
    }
  }

  // askPermissionInChat removed - all permissions auto-approved
  private postState(): void {
    if (!this.view) {
      return;
    }

    const payload: WebviewOutboundMessage = {
      type: 'state',
      messages: this.messages,
      pending: this.pending,
      thinkingEnabled: this.thinkingEnabled,
      thinkingBudget: this.thinkingBudget,
      agentType: this.agentType,
      model: this.model,
      runStatus: this.runStatus,
      sessionId: this.agentClient.getSessionId() || undefined,
      pendingQuestion: this.pendingQuestion,
    };

    this.view.webview.postMessage(payload);
  }

  private summarizeUnknown(value: unknown, limit: number): string {
    if (value === undefined || value === null) {
      return '';
    }

    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return str.length > limit ? `${str.slice(0, limit)}...` : str;
    } catch {
      const str = String(value);
      return str.length > limit ? `${str.slice(0, limit)}...` : str;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js')
    );

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NaughtyAgent Chat</title>
  <style>
    :root {
      --bg: #111826;
      --panel: #182233;
      --line: #2f3f58;
      --text: #e9f0ff;
      --muted: #9fb2d1;
      --accent: #3ecf8e;
      --user: #244a7a;
      --assistant: #1f2b42;
      --error: #5d2222;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      background: radial-gradient(circle at 15% 10%, #1f3656 0%, #111826 50%);
      color: var(--text);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      font-weight: 600;
      background: rgba(0, 0, 0, 0.25);
    }
    .subheader {
      padding: 6px 12px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .msg {
      border-radius: 6px;
      padding: 6px 10px;
      white-space: pre-wrap;
      line-height: 1.4;
    }
    .msg.user { background: var(--user); border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
    .msg.assistant { background: var(--assistant); border-radius: 10px; padding: 10px 12px; }
    .msg.error { background: var(--error); border-radius: 10px; padding: 10px 12px; }
    .msg.system { background: transparent; padding: 2px 10px; }
    .msg.thinking {
      background: transparent;
      padding: 2px 10px;
      font-size: 13px;
      color: var(--muted);
    }
    .msg.tool { background: transparent; padding: 2px 10px; font-size: 13px; }
    .msg.status { color: #c9a84c; padding: 2px 10px; }
    .meta {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 6px;
    }
    details.tool-details summary {
      cursor: pointer;
      user-select: none;
      font-size: 13px;
      line-height: 1.5;
      list-style: none;
    }
    details.tool-details summary::-webkit-details-marker { display: none; }
    details.tool-details summary::before {
      content: '▶ ';
      font-size: 10px;
      color: var(--muted);
    }
    details.tool-details[open] summary::before {
      content: '▼ ';
    }
    details.tool-details .tool-body {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--line);
      font-size: 12px;
      color: var(--muted);
      max-height: 300px;
      overflow-y: auto;
    }
    code {
      background: rgba(255,255,255,0.08);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.92em;
    }
    .footer {
      border-top: 1px solid var(--line);
      padding: 10px;
      background: rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    textarea {
      width: 100%;
      min-height: 84px;
      resize: vertical;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      padding: 10px;
      outline: none;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .options {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .options select {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      border-radius: 6px;
      padding: 2px 6px;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      color: #032514;
      border: 1px solid #1aa96f;
      font-weight: 700;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .empty {
      color: var(--muted);
      text-align: center;
      margin-top: 18px;
    }
    .question-panel {
      background: var(--panel);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      margin: 8px 4px;
    }
    .question-message {
      font-size: 13px;
      margin-bottom: 10px;
      color: var(--text);
    }
    .question-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .question-btn {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .question-btn-primary {
      background: var(--accent);
      color: #032514;
      border: 1px solid #1aa96f;
      font-weight: 700;
    }
    .question-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .question-option {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      font-size: 13px;
    }
    .question-option:hover {
      border-color: var(--accent);
      background: rgba(26, 169, 111, 0.1);
    }
    .question-input {
      width: 100%;
      min-height: 60px;
      resize: vertical;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--bg);
      color: var(--text);
      padding: 8px;
      font-size: 13px;
      outline: none;
    }
  </style>
</head>
<body>
  <div class="header">NaughtyAgent</div>
  <div id="subheader" class="subheader">等待脚本初始化...</div>
  <div id="messages" class="messages"></div>
  <div class="footer">
    <textarea id="input" placeholder="输入问题，支持 @file 相对路径"></textarea>
    <div class="options">
      <span>模式</span>
      <select id="agentType">
        <option value="build">build</option>
        <option value="plan">plan</option>
        <option value="explore">explore</option>
      </select>
      <span>模型</span>
      <select id="modelSelect">
        <option value="haiku">Haiku 4</option>
        <option value="sonnet">Sonnet 4</option>
        <option value="sonnet-4.5">Sonnet 4.5</option>
        <option value="sonnet-4.6">Sonnet 4.6</option>
        <option value="opus">Opus 4</option>
        <option value="opus-4.5">Opus 4.5</option>
        <option value="opus-4.6">Opus 4.6</option>
      </select>
      <label><input type="checkbox" id="thinkingToggle"> 深度思考</label>
      <span>强度</span>
      <select id="thinkingBudget">
        <option value="4096">低 (4K)</option>
        <option value="8000">中 (8K)</option>
        <option value="16000" selected>高 (16K)</option>
        <option value="32000">极限 (32K)</option>
      </select>
    </div>
    <div class="actions">
      <button id="newSession">新会话</button>
      <button id="cancel">中断</button>
      <button id="clear">清空</button>
      <button id="send" class="primary">发送</button>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 16; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }
}
