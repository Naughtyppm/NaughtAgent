/**
 * 会话列表 TreeView Provider
 *
 * 在侧边栏显示所有会话，支持：
 * - 查看会话列表（按时间倒序）
 * - 点击切换到某个会话
 * - 新建会话
 * - 删除会话
 * - 刷新列表
 */

import * as vscode from 'vscode';
import { AgentClient, SessionInfo } from '../services/AgentClient';

export class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionInfo,
    public readonly isActive: boolean
  ) {
    const label = session.cwd.split(/[\\/]/).pop() || session.cwd;
    super(label, vscode.TreeItemCollapsibleState.None);

    const date = new Date(session.createdAt);
    const timeStr = formatRelativeTime(date);
    const msgCount = session.messageCount ?? 0;

    this.description = `${session.agentType} · ${msgCount} 条 · ${timeStr}`;
    this.tooltip = new vscode.MarkdownString(
      `**会话 ID**: ${session.id}\n\n` +
      `**工作目录**: ${session.cwd}\n\n` +
      `**模式**: ${session.agentType}\n\n` +
      `**消息数**: ${msgCount}\n\n` +
      `**创建时间**: ${date.toLocaleString()}`
    );

    this.iconPath = new vscode.ThemeIcon(
      isActive ? 'comment-discussion' : 'comment',
      isActive ? new vscode.ThemeColor('charts.green') : undefined
    );

    this.contextValue = isActive ? 'activeSession' : 'session';

    // 不在 TreeItem 上设 command — 由 TreeView.onDidChangeSelection 处理
    // 避免 auto-refresh 时误触发 switchToSession
  }
}

export class SessionListProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: SessionInfo[] = [];
  private activeSessionId: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly agentClient: AgentClient) {}

  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 启动自动刷新（每 10 秒拉取会话列表）
   */
  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this._onDidChangeTreeData.fire();
    }, 10000);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SessionItem[]> {
    try {
      this.sessions = await this.agentClient.listSessions();
    } catch {
      // Daemon 未连接时返回空列表
      this.sessions = [];
    }

    // 按创建时间倒序
    const sorted = [...this.sessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return sorted.map(
      (s) => new SessionItem(s, s.id === this.activeSessionId)
    );
  }

  dispose(): void {
    this.stopAutoRefresh();
    this._onDidChangeTreeData.dispose();
  }
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString();
}
