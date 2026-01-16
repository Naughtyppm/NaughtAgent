/**
 * Daemon 客户端服务
 *
 * 负责管理与 Agent Daemon 的连接：
 * - 自动检测 Daemon 状态
 * - 自动启动 Daemon（如果未运行）
 * - 断线重连
 * - 连接状态管理
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { AgentClient, AgentClientConfig, getDefaultConfig } from './AgentClient';

export type DaemonStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DaemonStatusInfo {
  status: DaemonStatus;
  pid?: number;
  uptime?: number;
  sessions?: number;
  error?: string;
}

type StatusChangeHandler = (status: DaemonStatusInfo) => void;

export class DaemonClient {
  private agentClient: AgentClient;
  private status: DaemonStatus = 'disconnected';
  private statusInfo: DaemonStatusInfo = { status: 'disconnected' };
  private statusHandlers: Set<StatusChangeHandler> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private daemonProcess: ChildProcess | null = null;
  private readonly reconnectInterval = 5000; // 5 秒重连间隔
  private readonly healthCheckInterval = 30000; // 30 秒健康检查间隔

  constructor(config?: AgentClientConfig) {
    this.agentClient = new AgentClient(config || getDefaultConfig());
  }

  /**
   * 获取底层 AgentClient
   */
  getAgentClient(): AgentClient {
    return this.agentClient;
  }

  /**
   * 获取当前状态
   */
  getStatus(): DaemonStatusInfo {
    return this.statusInfo;
  }

  /**
   * 监听状态变化
   */
  onStatusChange(handler: StatusChangeHandler): vscode.Disposable {
    this.statusHandlers.add(handler);
    // 立即通知当前状态
    handler(this.statusInfo);
    return new vscode.Disposable(() => {
      this.statusHandlers.delete(handler);
    });
  }

  /**
   * 更新状态并通知
   */
  private updateStatus(status: DaemonStatus, extra?: Partial<DaemonStatusInfo>): void {
    this.status = status;
    this.statusInfo = { status, ...extra };
    for (const handler of this.statusHandlers) {
      try {
        handler(this.statusInfo);
      } catch (e) {
        console.error('Status handler error:', e);
      }
    }
  }

  /**
   * 初始化连接
   * 检查 Daemon 状态，如果未运行则尝试启动
   */
  async initialize(): Promise<boolean> {
    this.updateStatus('connecting');

    // 检查 Daemon 是否运行
    const isRunning = await this.agentClient.checkDaemonHealth();

    if (isRunning) {
      await this.fetchDaemonStatus();
      this.startHealthCheck();
      return true;
    }

    // 尝试启动 Daemon
    const started = await this.startDaemon();
    if (started) {
      await this.fetchDaemonStatus();
      this.startHealthCheck();
      return true;
    }

    this.updateStatus('error', { error: 'Failed to start daemon' });
    return false;
  }

  /**
   * 获取 Daemon 详细状态
   */
  private async fetchDaemonStatus(): Promise<void> {
    try {
      const config = this.agentClient['config'] as AgentClientConfig;
      const response = await fetch(`${config.baseURL}/daemon/status`, {
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        this.updateStatus('connected', {
          pid: data.pid,
          uptime: data.uptime,
          sessions: data.sessions?.length || 0,
        });
      } else {
        this.updateStatus('connected');
      }
    } catch {
      // /daemon/status 可能不存在，但 /health 通过了
      this.updateStatus('connected');
    }
  }

  /**
   * 启动 Daemon 进程
   */
  private async startDaemon(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // 使用 npx 或全局安装的 naughtagent
        const command = process.platform === 'win32' ? 'naughtagent.cmd' : 'naughtagent';

        this.daemonProcess = spawn(command, ['daemon', 'start'], {
          detached: true,
          stdio: 'ignore',
          shell: true,
        });

        this.daemonProcess.unref();

        // 等待 Daemon 启动
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = setInterval(async () => {
          attempts++;
          const isRunning = await this.agentClient.checkDaemonHealth();

          if (isRunning) {
            clearInterval(checkInterval);
            resolve(true);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            resolve(false);
          }
        }, 500);
      } catch (e) {
        console.error('Failed to start daemon:', e);
        resolve(false);
      }
    });
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.agentClient.checkDaemonHealth();
      if (!isHealthy && this.status === 'connected') {
        this.updateStatus('disconnected');
        this.scheduleReconnect();
      } else if (isHealthy && this.status !== 'connected') {
        await this.fetchDaemonStatus();
      }
    }, this.healthCheckInterval);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.updateStatus('connecting');

      const isRunning = await this.agentClient.checkDaemonHealth();
      if (isRunning) {
        await this.fetchDaemonStatus();
      } else {
        // 尝试重启 Daemon
        const started = await this.startDaemon();
        if (started) {
          await this.fetchDaemonStatus();
        } else {
          this.updateStatus('error', { error: 'Reconnect failed' });
          // 继续尝试重连
          this.scheduleReconnect();
        }
      }
    }, this.reconnectInterval);
  }

  /**
   * 手动重连
   */
  async reconnect(): Promise<boolean> {
    this.stopReconnect();
    return this.initialize();
  }

  /**
   * 停止重连
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 停止 Daemon
   */
  async stopDaemon(): Promise<void> {
    try {
      const config = this.agentClient['config'] as AgentClientConfig;
      await fetch(`${config.baseURL}/daemon/stop`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // 忽略错误
    }
    this.updateStatus('disconnected');
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopHealthCheck();
    this.stopReconnect();
    this.agentClient.dispose();
    this.statusHandlers.clear();
  }
}
