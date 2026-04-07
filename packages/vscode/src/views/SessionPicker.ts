/**
 * 会话选择器
 *
 * 提供会话选择、创建、切换功能
 */

import * as vscode from 'vscode';
import { AgentClient, SessionInfo } from '../services/AgentClient';

export interface SessionPickerOptions {
  /** 是否允许创建新会话 */
  allowCreate?: boolean;
  /** 是否按当前工作区过滤 */
  filterByCwd?: boolean;
  /** 占位符文本 */
  placeholder?: string;
}

export class SessionPicker {
  constructor(private readonly agentClient: AgentClient) {}

  /**
   * 显示会话选择器
   */
  async pick(options: SessionPickerOptions = {}): Promise<SessionInfo | null> {
    const {
      allowCreate = true,
      filterByCwd = false,
      placeholder = '选择会话',
    } = options;

    const cwd = filterByCwd
      ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      : undefined;

    // 获取会话列表
    let sessions: SessionInfo[] = [];
    try {
      sessions = await this.agentClient.listSessions(cwd);
    } catch (e) {
      vscode.window.showErrorMessage(
        `获取会话列表失败: ${e instanceof Error ? e.message : e}`
      );
      return null;
    }

    // 构建选项
    const items: (vscode.QuickPickItem & { session?: SessionInfo })[] = [];

    if (allowCreate) {
      items.push({
        label: '$(add) 新建会话',
        description: '创建一个新的对话会话',
        alwaysShow: true,
      });
    }

    for (const session of sessions) {
      const date = new Date(session.createdAt);
      const timeStr = this.formatTime(date);

      items.push({
        label: `$(comment-discussion) ${session.agentType}`,
        description: session.cwd,
        detail: `创建于 ${timeStr}${session.messageCount ? ` · ${session.messageCount} 条消息` : ''}`,
        session,
      });
    }

    if (items.length === 0 || (items.length === 1 && allowCreate)) {
      if (!allowCreate) {
        vscode.window.showInformationMessage('没有可用的会话');
        return null;
      }
    }

    // 显示选择器
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: placeholder,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return null;
    }

    // 新建会话
    if (!selected.session) {
      return this.createNewSession();
    }

    return selected.session;
  }

  /**
   * 创建新会话
   */
  async createNewSession(): Promise<SessionInfo | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return null;
    }

    // 选择 Agent 类型
    const agentType = await this.pickAgentType();
    if (!agentType) {
      return null;
    }

    try {
      const session = await this.agentClient.createSession(
        workspaceFolder.uri.fsPath,
        agentType
      );
      vscode.window.showInformationMessage(`已创建新会话: ${session.id}`);
      return session;
    } catch (e) {
      vscode.window.showErrorMessage(
        `创建会话失败: ${e instanceof Error ? e.message : e}`
      );
      return null;
    }
  }

  /**
   * 选择 Agent 类型
   */
  async pickAgentType(): Promise<string | null> {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(tools) build',
        description: '全功能 Agent',
        detail: '可以读写文件、执行命令、搜索代码等',
      },
      {
        label: '$(search) explore',
        description: '只读探索 Agent',
        detail: '只能读取文件和搜索，不能修改',
      },
      {
        label: '$(note) plan',
        description: '规划 Agent',
        detail: '用于分析和规划，不执行操作',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择 Agent 类型',
    });

    if (!selected) {
      return null;
    }

    // 从 label 中提取类型
    const match = selected.label.match(/\$\([^)]+\)\s+(\w+)/);
    return match ? match[1] : 'build';
  }

  /**
   * 清除所有非活动会话
   */
  async clearAllSessions(): Promise<void> {
    const config = this.agentClient['config'];
    const resp = await fetch(`${config.baseURL}/sessions`);
    if (!resp.ok) {
      vscode.window.showErrorMessage('获取会话列表失败');
      return;
    }
    const data: { sessions: { id: string }[] } = await resp.json();
    const sessions = data.sessions;
    const activeId = this.agentClient.sessionId;
    const toDelete = sessions.filter(s => s.id !== activeId);

    if (toDelete.length === 0) {
      vscode.window.showInformationMessage('没有可清除的会话');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `确定清除 ${toDelete.length} 个非活动会话？`,
      { modal: true },
      '清除'
    );
    if (confirm !== '清除') return;

    let deleted = 0;
    for (const s of toDelete) {
      try {
        const r = await fetch(`${config.baseURL}/sessions/${s.id}`, { method: 'DELETE' });
        if (r.ok) deleted++;
      } catch { /* skip */ }
    }
    vscode.window.showInformationMessage(`已清除 ${deleted} 个会话`);
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId?: string): Promise<boolean> {
    // 如果没有指定 ID，先选择
    if (!sessionId) {
      const session = await this.pick({
        allowCreate: false,
        placeholder: '选择要删除的会话',
      });
      if (!session) {
        return false;
      }
      sessionId = session.id;
    }

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除会话 ${sessionId} 吗？`,
      { modal: true },
      '删除'
    );

    if (confirm !== '删除') {
      return false;
    }

    try {
      const config = this.agentClient['config'];
      const response = await fetch(`${config.baseURL}/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        vscode.window.showInformationMessage('会话已删除');
        return true;
      } else {
        throw new Error(await response.text());
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `删除会话失败: ${e instanceof Error ? e.message : e}`
      );
      return false;
    }
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // 小于 1 分钟
    if (diff < 60 * 1000) {
      return '刚刚';
    }

    // 小于 1 小时
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes} 分钟前`;
    }

    // 小于 24 小时
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours} 小时前`;
    }

    // 同一年
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    // 不同年
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
}
