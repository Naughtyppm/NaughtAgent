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
    | 'questionResponse'
    | 'openFile'
    | 'fileSearch'
    | 'webviewError'
    | 'snapshotResult';
  text?: string;
  enabled?: boolean;
  budget?: number;
  agentType?: 'build' | 'plan' | 'explore';
  model?: string;
  requestId?: string;
  value?: unknown;
  cancelled?: boolean;
  attachments?: Array<{ type: string; data: string; mimeType: string }>;
  filePath?: string;
  query?: string;
  error?: string;
  source?: string;
  line?: number;
  col?: number;
  snapshot?: Record<string, unknown>;
}

interface SessionUsage {
  totalInput: number;
  totalOutput: number;
  requestCount: number;
}

interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
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
  usage?: SessionUsage;
  todoList?: TodoItem[];
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
  private sessionUsage: SessionUsage = { totalInput: 0, totalOutput: 0, requestCount: 0 };
  private todoList: TodoItem[] = [];
  private webviewErrors: string[] = [];
  /** 每个 session 的聊天消息缓存 */
  private readonly sessionMessages = new Map<string, ChatMessage[]>();
  /** 当前活动的 sessionId（用于消息缓存切换） */
  private activeSessionId: string | null = null;
  /** 是否已注册持久消息处理器 */
  private persistentHandlerRegistered = false;
  /** 当前 sendMessage 调用的运行状态（持久 handler 引用） */
  private currentAssistantMessage: ChatMessage | null = null;
  private currentRunState: { thinkingMessage?: ChatMessage; activeTextMessage?: ChatMessage } = {};
  /** 用于取消 waitForRunCompletion 的 abort controller（切换 session 时触发） */
  private runCompletionAbort: AbortController | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentClient: AgentClient,
    private readonly contextCollector: ContextCollector,
    private readonly output?: vscode.OutputChannel
  ) {}

  /**
   * 注册持久消息处理器（只注册一次，不随 session 切换而取消）
   * 消息路由到当前活动 session 的 UI 状态
   */
  private ensurePersistentHandler(): void {
    if (this.persistentHandlerRegistered) return;
    this.persistentHandlerRegistered = true;
    this.agentClient.onMessage(async (event) => {
      this.logEvent(event);
      if (this.currentAssistantMessage) {
        this.log(`persistent: routing ${event.type} to session=${this.activeSessionId} msgCount=${this.messages.length}`);
        await this.handleAgentMessage(event, this.currentAssistantMessage, this.currentRunState);
      } else if (event.type === 'error') {
        this.log(`persistent: error without activeMsg, session=${this.activeSessionId}`);
        // 没有活跃的 send 但收到 error，显示出来
        this.messages.push({
          role: 'error',
          content: event.message || event.content || 'Agent 返回错误',
          timestamp: Date.now(),
        });
        this.postState();
      } else {
        this.log(`persistent: DROPPED ${event.type} (no currentAssistantMessage) session=${this.activeSessionId}`);
      }
    });
  }

  private log(message: string): void {
    this.output?.appendLine(`[chat] ${message}`);
  }

  private textDeltaCharCount = 0;

  private logEvent(event: AgentMessage): void {
    switch (event.type) {
      case 'text_delta':
        // 降频：每 200 字符打印一次，避免刷屏
        this.textDeltaCharCount += (event.content || event.delta || '').length;
        if (this.textDeltaCharCount >= 200) {
          this.log(`text_delta: +${this.textDeltaCharCount} chars`);
          this.textDeltaCharCount = 0;
        }
        break;
      case 'text':
        this.log(`text: "${(event.content || '').substring(0, 80)}${(event.content || '').length > 80 ? '...' : ''}"`);
        break;
      case 'thinking':
        this.log(`thinking: +${(event.content || '').length} chars`);
        break;
      case 'thinking_end':
        this.log('thinking_end');
        break;
      case 'tool_start':
        this.log(`tool_start: ${event.name || 'unknown'} (id=${event.id || '?'}) input=${this.summarizeUnknown(event.input, 100)}`);
        break;
      case 'tool_end':
        this.log(`tool_end: ${event.name || event.id || 'unknown'} ${event.isError ? '❌' : '✅'} output=${this.summarizeUnknown(event.output || '', 100)}`);
        break;
      case 'tool_output_stream':
        // 不对每个 chunk 都 log（太频繁），只在 debug 时有意义
        break;
      case 'error':
        this.log(`error: ${event.message || event.content || 'unknown error'}`);
        break;
      case 'done':
        this.log(`done: usage=${JSON.stringify(event.usage || {})}`);
        this.textDeltaCharCount = 0;
        break;
      case 'question_request':
        this.log(`question_request: type=${event.questionType} msg="${(event.message || '').substring(0, 80)}"`);
        break;
      case 'subagent_start':
        this.log(`subagent_start: [${event.childName}] id=${event.childId}`);
        break;
      case 'subagent_end':
        this.log(`subagent_end: [${event.childName}] ${event.success ? '✅' : '❌'} ${event.error || ''}`);
        break;
      case 'pong':
        break; // 静默
      default:
        this.log(`ws event: ${event.type}`);
        break;
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewInboundMessage) => {
      await this.handleWebviewMessage(message);
    });

    // 当 webview 重新可见时，重发完整状态（恢复 pendingQuestion 等）
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.log('webview became visible, re-posting state');
        this.postState();
      }
    });
  }

  /**
   * 在编辑器区域的 WebviewPanel 中打开 Chat（多窗口支持）
   */
  resolveWebviewPanel(panel: vscode.WebviewPanel): void {
    const webview = panel.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webview.html = this.getHtml(webview);

    // 使用一个独立引用来 postMessage（panel 没有 this.view）
    const panelRef = { webview };
    const origPostState = this.postState.bind(this);

    // 覆盖 postState 使其发送到 panel
    this.view = { webview } as unknown as vscode.WebviewView;

    webview.onDidReceiveMessage(async (message: WebviewInboundMessage) => {
      await this.handleWebviewMessage(message);
    });
  }

  private async handleWebviewMessage(message: WebviewInboundMessage): Promise<void> {
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
        this.log(`newSession: activeSessionId=${this.activeSessionId} messages.length=${this.messages.length} agentSessionId=${this.agentClient.getSessionId()}`);
        // 保存旧会话消息
        if (this.activeSessionId) {
          this.sessionMessages.set(this.activeSessionId, [...this.messages]);
          this.log(`newSession: saved ${this.messages.length} messages for ${this.activeSessionId}`);
        }

        // 直接创建新 session（不复用旧的）
        const cwd = this.contextCollector.getWorkspaceRoot();
        if (!cwd) {
          this.messages.push({
            role: 'error',
            content: '请先打开一个工作区后再新建会话。',
            timestamp: Date.now(),
          });
          this.postState();
          return;
        }
        const newSession = await this.agentClient.createSession(cwd, this.agentType);
        this.log(`newSession: created ${newSession.id}`);
        // 使用 subscribe 切换到新 session（不断开 WS）
        if (this.agentClient.isConnected()) {
          this.agentClient.subscribeToSession(newSession.id);
        } else {
          await this.agentClient.connect(newSession.id);
          this.persistentHandlerRegistered = false;
        }
        this.ensurePersistentHandler();
        this.log(`newSession: subscribed to ${newSession.id}`);
        this.activeSessionId = newSession.id;

        this.messages.length = 0;
        this.pending = false;
        this.runStatus = 'idle';
        this.pendingQuestion = null;
        this.currentAssistantMessage = null;
        this.currentRunState = {};
        this.sessionUsage = { totalInput: 0, totalOutput: 0, requestCount: 0 };
        this.todoList = [];
        // 取消旧 session 的 waitForRunCompletion
        if (this.runCompletionAbort) {
          this.runCompletionAbort.abort();
          this.runCompletionAbort = null;
        }
        this.messages.push({
          role: 'system',
          content: `已新建会话 ${newSession.id.slice(0, 8)}（模式: ${this.agentType}, 模型: ${this.model}）。`,
          timestamp: Date.now(),
        });
        this.log(`newSession: done, messages=[${this.messages.map(m => m.role + ':' + m.content.slice(0, 20)).join(', ')}]`);
        this.postState();
        return;
      }

      if (message.type === 'send' && typeof message.text === 'string') {
        this.log(`send requested: ${message.text.slice(0, 80)}`);
        await this.sendMessage(message.text, message.attachments);
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


      if (message.type === 'openFile' && message.filePath) {
        try {
          const uri = vscode.Uri.file(message.filePath);
          await vscode.window.showTextDocument(uri, { preview: true });
        } catch (e) {
          this.log('openFile error: ' + String(e));
        }
        return;
      }

      if (message.type === 'fileSearch' && typeof message.query === 'string') {
        try {
          const query = message.query || '**/*';
          const pattern = query.includes('*') ? query : '**/*' + query + '*';
          const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 20);
          const files = uris.map(u => ({
            name: u.path.split('/').pop() || u.fsPath,
            path: u.fsPath,
          }));
          this.view?.webview.postMessage({ type: 'fileSearchResults', files });
        } catch (e) {
          this.log('fileSearch error: ' + String(e));
          this.view?.webview.postMessage({ type: 'fileSearchResults', files: [] });
        }
        return;
      }

      if (message.type === 'webviewError') {
        const errMsg = `[Webview] ${message.error || 'Unknown error'}${message.line ? ` (line ${message.line})` : ''}`;
        this.log(errMsg);
        this.webviewErrors.push(errMsg);
        // 最多保留 20 条避免累积过多
        if (this.webviewErrors.length > 20) this.webviewErrors.shift();
        return;
      }

      if (message.type === 'questionResponse') {
        const requestId = message.requestId as string;
        const value = message.value;
        const cancelled = message.cancelled as boolean | undefined;
        this.pendingQuestion = null;
        // 恢复 running 状态 — question 回答后 Agent 会继续工作
        this.pending = true;
        this.runStatus = 'running';
        this.agentClient.respondQuestion(requestId, value, cancelled);
        this.postState();
      }

      if (message.type === 'snapshotResult') {
        const requestId = message.requestId as string;
        const snapshot = message.snapshot as Record<string, unknown>;
        this.log(`snapshotResult received: ${requestId}`);
        this.agentClient.respondSnapshot(requestId, snapshot);
      }
    } catch (error) {
      this.log(`handleWebviewMessage error: ${error instanceof Error ? error.message : String(error)}`);
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
  }

  async newChat(): Promise<void> {
    // 保存当前会话的消息
    if (this.activeSessionId) {
      this.sessionMessages.set(this.activeSessionId, [...this.messages]);
    }
    this.messages.length = 0;
    this.currentAssistantMessage = null;
    this.currentRunState = {};
    this.agentClient.disconnect();
    await this.agentClient.closeSession();
    this.persistentHandlerRegistered = false; // WS 断开后需重新注册
    this.runStatus = 'idle';
    this.pending = false;
    this.pendingQuestion = null;
    this.sessionUsage = { totalInput: 0, totalOutput: 0, requestCount: 0 };
    this.todoList = [];
    this.activeSessionId = null;
    this.postState();
  }

  async clearChat(): Promise<void> {
    this.messages.length = 0;
    this.postState();
  }

  /**
   * 当前是否有消息正在处理中
   */
  isPending(): boolean {
    return this.pending;
  }

  /**
   * 切换到指定会话：保存当前消息 → 恢复目标会话消息
   * 不断开 WS、不取消消息处理器 — 使用 subscribe 切换
   */
  switchSession(sessionId: string): void {
    this.log(`switchSession: from=${this.activeSessionId} to=${sessionId} messages.length=${this.messages.length}`);
    // 0. 取消旧 session 的 waitForRunCompletion（防止 done 事件串到新 session）
    if (this.runCompletionAbort) {
      this.runCompletionAbort.abort();
      this.runCompletionAbort = null;
    }
    // 1. 保存当前会话的消息
    if (this.activeSessionId) {
      this.sessionMessages.set(this.activeSessionId, [...this.messages]);
      this.log(`switchSession: saved ${this.messages.length} messages for ${this.activeSessionId}`);
    }

    // 2. 重置运行状态（切换后当前 session 不在运行中）
    this.pending = false;
    this.runStatus = 'idle';
    this.pendingQuestion = null;
    this.currentAssistantMessage = null;
    this.currentRunState = {};
    this.sessionUsage = { totalInput: 0, totalOutput: 0, requestCount: 0 };
    this.todoList = [];

    // 3. 恢复目标会话的消息（如果有缓存）
    this.messages.length = 0;
    const cached = this.sessionMessages.get(sessionId);
    if (cached) {
      cached.forEach((msg) => this.messages.push(msg));
      this.log(`switchSession: restored ${cached.length} cached messages for ${sessionId}`);
    } else {
      this.log(`switchSession: no cached messages for ${sessionId}`);
    }

    // 4. 更新活动 sessionId
    this.activeSessionId = sessionId;

    this.postState();

    // 5. 异步同步后端消息（后台 session 可能有新回复）
    this.syncMessagesFromBackend(sessionId);
  }

  /**
   * 从后端获取 session 最新消息，补充到前端缓存
   */
  private async syncMessagesFromBackend(sessionId: string): Promise<void> {
    try {
      const config = (this.agentClient as any).config;
      if (!config?.baseURL) return;

      const resp = await fetch(`${config.baseURL}/sessions/${sessionId}/messages`);
      if (!resp.ok) return;

      const data = await resp.json() as { messages: Array<{ role: string; text: string; toolUses?: Array<{ id: string; name: string }>; toolResults?: Array<{ toolUseId: string; content: string }>; timestamp: number }> };
      if (!data.messages || data.messages.length === 0) return;

      // 只关心最后一条 assistant 消息的文本
      const backendAssistantMsgs = data.messages.filter(m => m.role === 'assistant' && m.text);
      if (backendAssistantMsgs.length === 0) return;

      // 检查前端缓存是否已有所有 assistant 消息
      const cachedAssistantCount = this.messages.filter(m => m.role === 'assistant').length;
      const backendAssistantCount = backendAssistantMsgs.length;

      if (backendAssistantCount > cachedAssistantCount && this.activeSessionId === sessionId) {
        // 后端有新的 assistant 回复（在后台完成的），追加到前端
        const newMsgs = backendAssistantMsgs.slice(cachedAssistantCount);
        for (const msg of newMsgs) {
          this.messages.push({
            role: 'assistant',
            content: msg.text,
            timestamp: msg.timestamp || Date.now(),
          });
          this.log(`syncMessages: added backend assistant msg (${msg.text.length} chars) for ${sessionId}`);
        }
        this.sessionMessages.set(sessionId, [...this.messages]);
        this.postState();
      }
    } catch (e) {
      this.log(`syncMessages: error ${e}`);
    }
  }

  async sendMessage(text: string, attachments?: Array<{ type: string; data: string; mimeType: string }>): Promise<void> {
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

    this.log(`send start session=${this.activeSessionId} agentSession=${this.agentClient.getSessionId()}`);

    // 记住本次 send 对应的 sessionId，用于 finally 中判断是否被切走
    const sendSessionId = this.activeSessionId;

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
      this.ensurePersistentHandler();
      const prompt = await this.buildPrompt(trimmed);
      this.log(`prompt prepared len=${prompt.length}`);

      // 更新持久 handler 引用的运行状态
      this.currentAssistantMessage = assistantMessage;
      this.currentRunState = {};

      try {
        await this.agentClient.sendMessage(prompt, {
          model: this.model,
          thinking: this.thinkingEnabled
            ? { enabled: true, budgetTokens: this.thinkingBudget }
            : undefined,
          autoConfirm: true,
          attachments,
        });

        await this.waitForRunCompletion();
        this.log('run completed');
      } catch (e) {
        throw e;
      }
      // 不在这里 unsubscribe — 持久 handler 始终活跃

      if (!assistantMessage.content.trim() && !this.currentRunState.activeTextMessage) {
        assistantMessage.content = '未收到有效回复。';
      }
      // 清理空的 assistant 占位消息（如果文本被追加到了后面的新消息中）
      if (!assistantMessage.content.trim() && this.currentRunState.activeTextMessage) {
        const idx = this.messages.indexOf(assistantMessage);
        if (idx !== -1) {
          this.messages.splice(idx, 1);
        }
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
      // 只有当前仍在本次 send 对应的 session 时才重置状态
      // 如果 session 已被切走，状态由 switchSession 管理
      if (this.activeSessionId === sendSessionId) {
        this.pending = false;
        this.runStatus = 'idle';
        this.currentAssistantMessage = null;
        this.currentRunState = {};
        this.postState();
      }
      this.log(`send finally pending=${this.pending} status=${this.runStatus} switched=${this.activeSessionId !== sendSessionId}`);
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
    // 同步 activeSessionId
    this.activeSessionId = this.agentClient.getSessionId();
    this.log(`session ready: ${this.activeSessionId || 'none'}`);
  }

  private async ensureConnected(): Promise<void> {
    if (this.agentClient.isConnected()) {
      return;
    }

    await this.agentClient.connect();
    this.log('ws connected');
  }

  private waitForRunCompletion(): Promise<void> {
    const abort = new AbortController();
    this.runCompletionAbort = abort;
    return new Promise((resolve) => {
      let runStarted = false;
      const dispose = this.agentClient.onMessage((event) => {
        if (abort.signal.aborted) {
          dispose();
          resolve();
          return;
        }
        // 等 run_start 事件后才开始处理 done
        if ((event as any).type === 'run_start') {
          runStarted = true;
          return;
        }
        if (event.type === 'done') {
          if (!runStarted) {
            // 旧 loop 残余的 done 事件，忽略
            this.log('done event ignored: run_start not received yet');
            return;
          }
          // 如果有 pendingQuestion，说明 Agent 在等用户回答
          // 此时 done 是中间状态（来自 onAwaitInput），不应结束
          if (this.pendingQuestion) {
            this.log('done event ignored: pendingQuestion active');
            return;
          }
          dispose();
          this.runCompletionAbort = null;
          resolve();
        }
        // question_request 到达时不 resolve — 需要等用户回答后继续
        // error 事件不再 reject — 持久循环模式下中间错误是正常的
      });
      // 如果在注册后立即被 abort，立即清理
      abort.signal.addEventListener('abort', () => {
        dispose();
        resolve();
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

    // 注入 Webview 运行时错误（如果有）
    let errorSection = '';
    if (this.webviewErrors.length > 0) {
      errorSection = `\n\n<webview-errors>\n以下是 Webview 前端运行时捕获的错误，请在修改代码时修复：\n${this.webviewErrors.join('\n')}\n</webview-errors>`;
      this.webviewErrors.length = 0; // 消费后清空
    }

    if (!contextPrompt.trim() && !errorSection) {
      return userText;
    }

    return `${contextPrompt}${errorSection}\n\n用户问题:\n${userText}`;
  }

  private async handleAgentMessage(
    event: AgentMessage,
    assistantMessage: ChatMessage,
    runState: { thinkingMessage?: ChatMessage; activeTextMessage?: ChatMessage }
  ): Promise<void> {
    switch (event.type) {
      case 'text':
      case 'text_delta':
        {
          // 确定当前文本目标消息
          const currentTarget = runState.activeTextMessage || assistantMessage;
          const targetIdx = this.messages.indexOf(currentTarget);
          // 如果目标消息不在列表末尾（后面有 thinking/tool/question 等），
          // 则在底部创建新消息，确保文本紧跟最新内容，用户能看到
          if (targetIdx !== -1 && targetIdx < this.messages.length - 1) {
            const newMsg: ChatMessage = {
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            };
            this.messages.push(newMsg);
            runState.activeTextMessage = newMsg;
            runState.thinkingMessage = undefined;
          }
          const target = runState.activeTextMessage || assistantMessage;
          target.content += event.content || '';
          this.postState();
        }
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
      case 'tool_output_stream':
        {
          const msgIdx = event.id ? this.activeTools.get(event.id) : undefined;
          if (msgIdx !== undefined && msgIdx < this.messages.length) {
            const existing = this.messages[msgIdx];
            // 首次收到流式输出时，添加 "输出:" 前缀
            if (!existing.content.includes('\n输出:')) {
              existing.content += `\n输出: ${event.chunk || ''}`;
            } else {
              existing.content += event.chunk || '';
            }
            // 截断过长的流式输出（防止 UI 爆掉）
            const maxStreamLen = 3000;
            const outputStart = existing.content.indexOf('\n输出:');
            if (outputStart >= 0 && existing.content.length - outputStart > maxStreamLen) {
              existing.content = existing.content.substring(0, outputStart + maxStreamLen) + '\n... (输出截断)';
            }
          }
        }
        this.postState();
        break;
      case 'subagent_start':
        {
          const agentMsg: ChatMessage = {
            role: 'system',
            content: `⚡ 子Agent启动: ${event.childName || 'unknown'}`,
            timestamp: Date.now(),
            kind: 'tool',
          };
          this.messages.push(agentMsg);
          if (event.childId) {
            this.activeTools.set(event.childId, this.messages.length - 1);
          }
        }
        this.postState();
        break;
      case 'subagent_end':
        {
          const msgIdx = event.childId ? this.activeTools.get(event.childId) : undefined;
          const status = event.success ? ' ✅' : ' ❌';
          const errorInfo = event.error ? ` (${event.error.slice(0, 100)})` : '';
          if (msgIdx !== undefined && msgIdx < this.messages.length) {
            this.messages[msgIdx].content += status + errorInfo;
            if (event.childId) this.activeTools.delete(event.childId);
          } else {
            this.messages.push({
              role: 'system',
              content: `⚡ 子Agent结束: ${event.childName || 'unknown'}${status}${errorInfo}`,
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
        // question 到达时确保 running 状态（可能在 done 之后到达）
        this.pending = true;
        this.runStatus = 'running';
        this.postState();
        break;
      case 'done':
        this.runStatus = 'idle';
        this.log(`done event, usage=${JSON.stringify(event.usage)}`);
        if (event.usage) {
          this.sessionUsage.totalInput += event.usage.inputTokens || 0;
          this.sessionUsage.totalOutput += event.usage.outputTokens || 0;
          this.sessionUsage.requestCount += 1;
        }
        this.log(`sessionUsage after done: ${JSON.stringify(this.sessionUsage)}`);
        this.postState();
        break;
      case 'todo_updated' as AgentMessage['type']:
        if (event.todoList) {
          this.todoList = (event.todoList as TodoItem[]);
        }
        this.postState();
        break;
      case 'pong':
      default:
        // 处理 snapshot_request（daemon 请求 webview 快照）
        if ((event as any).type === 'snapshot_request' && (event as any).requestId) {
          const requestId = (event as any).requestId as string;
          this.log(`snapshot_request received: ${requestId}`);
          // 发送到 Webview，让 chat.js 捕获 DOM 快照
          this.view?.webview.postMessage({ type: 'captureSnapshot', requestId });
        }
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
      usage: this.sessionUsage,
      todoList: this.todoList.length > 0 ? this.todoList : undefined,
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NaughtyAgent Chat</title>
  <style>
    :root {
      --bg: #0a0e1a;
      --panel: #0d1225;
      --line: rgba(100,140,220,0.15);
      --text: #e0e8ff;
      --muted: #7b8fbb;
      --accent: #6c8cff;
      --accent-fg: #fff;
      --user-bg: rgba(60,80,160,0.18);
      --assistant-bg: rgba(10,16,35,0.7);
      --error-bg: rgba(120,30,30,0.4);
      --code-bg: rgba(40,50,90,0.3);
      --input-bg: rgba(12,18,36,0.9);
      --input-border: rgba(80,110,200,0.3);
      --link: #7ba4ff;
      --focus-border: #5580dd;
      --warning: #d4a74c;
      --star-1: #ffffff;
      --star-2: #c8d8ff;
      --star-3: #8ba4e0;
      --nebula-1: rgba(60,40,140,0.08);
      --nebula-2: rgba(30,60,160,0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
      background: var(--bg);
      background-image:
        radial-gradient(1px 1px at 10% 15%, var(--star-1) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 25% 35%, var(--star-2) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 40% 8%, var(--star-1) 0.3px, transparent 1px),
        radial-gradient(1px 1px at 55% 52%, var(--star-3) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 70% 22%, var(--star-2) 0.3px, transparent 1px),
        radial-gradient(1px 1px at 85% 68%, var(--star-1) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 15% 78%, var(--star-3) 0.3px, transparent 1px),
        radial-gradient(1px 1px at 95% 42%, var(--star-2) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 35% 92%, var(--star-1) 0.3px, transparent 1px),
        radial-gradient(1px 1px at 60% 88%, var(--star-3) 0.5px, transparent 1px),
        radial-gradient(1px 1px at 5% 55%, var(--star-2) 0.3px, transparent 1px),
        radial-gradient(1px 1px at 78% 95%, var(--star-1) 0.5px, transparent 1px),
        radial-gradient(80px 80px at 20% 30%, var(--nebula-1), transparent),
        radial-gradient(120px 120px at 75% 65%, var(--nebula-2), transparent);
      color: var(--text);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      font-weight: 600;
      background: linear-gradient(135deg, var(--panel) 0%, rgba(30,40,80,0.6) 100%);
      backdrop-filter: blur(4px);
      flex-shrink: 0;
    }
    .subheader {
      padding: 6px 12px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      background: rgba(10,14,26,0.5);
      flex-shrink: 0;
    }
    .messages {
      flex: 1;
      min-height: 0;
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
    .msg.user { background: var(--user-bg); border-radius: 10px; padding: 10px 12px; margin-top: 8px; border: 1px solid rgba(80,120,220,0.15); }
    .msg.assistant { background: var(--assistant-bg); border-radius: 10px; padding: 10px 12px; backdrop-filter: blur(2px); border: 1px solid rgba(60,80,160,0.1); }
    .msg.error { background: var(--error-bg); border-radius: 10px; padding: 10px 12px; border: 1px solid rgba(180,40,40,0.3); }
    .msg.system { background: transparent; padding: 2px 10px; }
    .msg.thinking {
      background: transparent;
      padding: 2px 10px;
      font-size: 13px;
      color: var(--muted);
    }
    .msg.tool { background: transparent; padding: 2px 10px; font-size: 13px; }
    .msg.status { color: var(--warning); padding: 2px 10px; }
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
    .tool-input-box {
      padding: 4px 8px;
      margin: 2px 0;
      background: rgba(40,50,90,0.2);
      border-left: 2px solid var(--accent);
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      line-height: 1.6;
      word-break: break-word;
    }
    .tool-param-key {
      color: var(--accent);
      font-weight: 500;
    }
    .tool-param-val {
      color: var(--text);
      opacity: 0.85;
    }
    .tool-output-box {
      padding: 4px 8px;
      margin: 2px 0;
      background: rgba(30,60,40,0.15);
      border-left: 2px solid rgba(60,180,100,0.5);
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }
    code {
      background: var(--code-bg);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.92em;
    }
    .footer {
      border-top: 1px solid var(--line);
      padding: 10px;
      background: linear-gradient(0deg, var(--panel) 0%, rgba(13,18,37,0.8) 100%);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    textarea {
      width: 100%;
      min-height: 84px;
      max-height: 200px;
      resize: vertical;
      overflow-y: auto;
      border-radius: 8px;
      border: 1px solid var(--input-border);
      background: var(--input-bg);
      color: var(--text);
      padding: 10px;
      outline: none;
      transition: border-color 0.2s;
    }
    textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 8px rgba(108,140,255,0.15);
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
      border: 1px solid rgba(80,110,200,0.25);
      background: rgba(20,30,60,0.7);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover:not(:disabled) {
      background: rgba(40,55,100,0.6);
      border-color: var(--accent);
    }
    button.primary {
      background: linear-gradient(135deg, var(--accent) 0%, #5070dd 100%);
      color: var(--accent-fg);
      border: 1px solid var(--accent);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(108,140,255,0.2);
    }
    button.primary:hover:not(:disabled) {
      box-shadow: 0 3px 12px rgba(108,140,255,0.35);
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
      color: var(--accent-fg);
      border: 1px solid var(--accent);
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
      background: var(--code-bg);
    }
    .question-option-primary {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-fg);
      font-weight: 700;
    }
    .question-option-primary:hover {
      opacity: 0.9;
    }
    .question-option-selected {
      border-color: var(--accent);
      background: var(--code-bg);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .question-free-input {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      align-items: center;
    }
    .question-input-inline {
      flex: 1;
      border: 1px solid var(--line);
      background: var(--input-bg);
      color: var(--text);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    .question-input-inline:focus {
      border-color: var(--accent);
    }
    .question-input {
      width: 100%;
      min-height: 60px;
      resize: vertical;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--input-bg);
      color: var(--text);
      padding: 8px;
      font-size: 13px;
      outline: none;
    }
    .todo-panel {
      border-top: 1px solid var(--line);
      padding: 8px 12px;
      background: var(--panel);
      font-size: 12px;
      flex-shrink: 0;
    }
    .todo-panel-header {
      color: var(--muted);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
    }
    .todo-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      color: var(--text);
    }
    .todo-item.done { color: var(--muted); text-decoration: line-through; }
    .todo-item.in_progress { color: var(--accent); }
    .todo-icon { font-size: 11px; }
    .usage-bar {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--muted);
    }
    .attachment-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding: 4px 0;
      min-height: 0;
    }
    .attachment-bar:not(:empty) {
      padding: 6px 0;
      border-bottom: 1px solid var(--line);
      margin-bottom: 4px;
    }
    .attachment-item {
      position: relative;
      border: 1px solid var(--accent);
      border-radius: 4px;
      overflow: hidden;
      width: 56px;
      height: 56px;
      background: var(--code-bg);
    }
    .attachment-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .attachment-remove {
      position: absolute;
      top: -2px;
      right: -2px;
      background: var(--error-bg);
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      font-size: 10px;
      cursor: pointer;
      line-height: 16px;
      text-align: center;
      padding: 0;
    }
    .drop-zone-active textarea {
      border-color: var(--accent);
      background: var(--code-bg);
    }

    .header { position: relative; }
    .progress-bar {
      position: absolute; bottom: 0; left: 0; height: 2px;
      background: var(--accent); width: 0; opacity: 0; transition: opacity 0.3s;
    }
    .progress-bar.active { opacity: 1; animation: progress-slide 2s ease-in-out infinite; }
    @keyframes progress-slide {
      0% { width: 0; left: 0; } 50% { width: 45%; left: 30%; } 100% { width: 0; left: 100%; }
    }
    .code-block-wrapper {
      position: relative; margin: 8px 0; border-radius: 6px; overflow: hidden; border: 1px solid var(--line);
    }
    .code-block-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 10px; background: var(--panel); font-size: 11px; color: var(--muted);
    }
    .code-block-copy {
      background: transparent; border: 1px solid var(--line); color: var(--muted);
      padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.15s;
    }
    .code-block-copy:hover { color: var(--text); border-color: var(--accent); }
    .code-block-copy.copied { color: var(--accent); border-color: var(--accent); }
    pre.code-block {
      margin: 0; padding: 10px 12px; background: var(--code-bg); overflow-x: auto; font-size: 12.5px; line-height: 1.5;
      font-family: var(--vscode-editor-font-family, "Cascadia Code", Consolas, monospace);
    }
    pre.code-block code { background: transparent; padding: 0; font-size: inherit; }
    .msg h2, .msg h3, .msg h4 { margin: 10px 0 6px; }
    .msg h2 { font-size: 1.2em; } .msg h3 { font-size: 1.1em; }
    .msg h4 { font-size: 1.0em; color: var(--muted); }
    .msg ul, .msg ol { margin: 4px 0; padding-left: 24px; }
    .msg li { margin: 2px 0; line-height: 1.5; }
    .msg hr { border: none; border-top: 1px solid var(--line); margin: 10px 0; }
    .msg table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 12.5px; }
    .msg th, .msg td { border: 1px solid var(--line); padding: 5px 10px; text-align: left; }
    .msg th { background: var(--panel); font-weight: 600; }
    .msg a.md-link { color: var(--link); text-decoration: none; }
    .msg a.md-link:hover { text-decoration: underline; }
    .msg blockquote { border-left: 3px solid var(--accent); margin: 6px 0; padding: 4px 12px; color: var(--muted); background: var(--code-bg); border-radius: 0 4px 4px 0; }
    .tool-file-link { color: var(--link); cursor: pointer; text-decoration: underline; font-size: 12px; margin-left: 4px; padding: 1px 4px; border-radius: 3px; background: rgba(60,80,160,0.12); }
    .tool-file-link:hover { opacity: 0.8; background: rgba(60,80,160,0.25); }
    .typing-cursor::after { content: '▮'; color: var(--accent); animation: blink-cursor 1s step-end infinite; }
    @keyframes blink-cursor { 50% { opacity: 0; } }
    @keyframes twinkle { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
    .popup-panel {
      position: absolute; bottom: 100%; left: 10px; right: 10px; background: var(--panel);
      border: 1px solid var(--line); border-radius: 6px; max-height: 220px; overflow-y: auto;
      z-index: 10; display: none; box-shadow: 0 -4px 12px rgba(0,0,0,0.25);
    }
    .popup-panel.visible { display: block; }
    .popup-item { padding: 6px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; border-bottom: 1px solid var(--line); }
    .popup-item:last-child { border-bottom: none; }
    .popup-item:hover, .popup-item.active { background: var(--code-bg); }
    .popup-item-label { font-weight: 500; }
    .popup-item-desc { color: var(--muted); font-size: 11px; }
    .popup-item-icon { font-size: 14px; width: 18px; text-align: center; }
    .footer { position: relative; }
  </style>
</head>
<body>
  <div class="header">NaughtyAgent</div>
  <div id="subheader" class="subheader">
    <span id="subheader-info">等待脚本初始化...</span>
    <span id="usage-bar" class="usage-bar"></span>
  </div>
  <div id="messages" class="messages"></div>
  <div id="todoPanel" class="todo-panel" style="display:none;"></div>
  <div class="footer">
    <div id="popupPanel" class="popup-panel"></div>
      <div id="attachmentBar" class="attachment-bar"></div>
    <textarea id="input" placeholder="输入问题，支持 @file 相对路径。可拖拽/粘贴图片。"></textarea>
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
