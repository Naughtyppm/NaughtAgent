/**
 * NaughtAgent VS Code Extension
 *
 * 入口文件
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './views/chat/ChatViewProvider';
import { DaemonClient } from './services/DaemonClient';
import { AgentClient, getDefaultConfig } from './services/AgentClient';
import { ContextCollector } from './services/ContextCollector';
import { SessionPicker } from './views/SessionPicker';
import { DiffProvider } from './services/DiffProvider';
import { FileReferenceProvider } from './services/FileReferenceProvider';
import { registerCommands } from './commands';

let daemonClient: DaemonClient | undefined;
let agentClient: AgentClient | undefined;
let diffProvider: DiffProvider | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('NaughtAgent is now active!');

  // 获取配置
  const config = vscode.workspace.getConfiguration('naughtagent');
  const serverUrl = config.get<string>('serverUrl', '');

  // 创建服务实例
  const clientConfig = serverUrl
    ? {
        baseURL: serverUrl,
        wsURL: serverUrl.replace('http', 'ws'),
      }
    : getDefaultConfig();

  // 创建 DaemonClient（管理连接）
  daemonClient = new DaemonClient(clientConfig);
  agentClient = daemonClient.getAgentClient();

  // 创建其他服务
  const contextCollector = new ContextCollector();
  const sessionPicker = new SessionPicker(agentClient);
  diffProvider = new DiffProvider();
  const fileReferenceProvider = new FileReferenceProvider();

  // 注册 Chat View
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    agentClient,
    contextCollector
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // 注册命令
  registerCommands(context, chatViewProvider, agentClient, contextCollector);

  // 注册会话相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.selectSession', async () => {
      const session = await sessionPicker.pick({
        allowCreate: true,
        filterByCwd: true,
      });
      if (session) {
        // 连接到选中的会话
        try {
          await agentClient!.connect(session.id);
          vscode.window.showInformationMessage(`已切换到会话: ${session.id}`);
        } catch (e) {
          vscode.window.showErrorMessage(
            `连接会话失败: ${e instanceof Error ? e.message : e}`
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.newSession', async () => {
      const session = await sessionPicker.createNewSession();
      if (session) {
        try {
          await agentClient!.connect(session.id);
        } catch (e) {
          vscode.window.showErrorMessage(
            `连接会话失败: ${e instanceof Error ? e.message : e}`
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.deleteSession', async () => {
      await sessionPicker.deleteSession();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.reconnect', async () => {
      const success = await daemonClient!.reconnect();
      if (success) {
        vscode.window.showInformationMessage('已重新连接到 Daemon');
      } else {
        vscode.window.showErrorMessage('重新连接失败');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.showDaemonStatus', async () => {
      const status = daemonClient!.getStatus();
      const message = `Daemon 状态: ${status.status}${
        status.pid ? ` (PID: ${status.pid})` : ''
      }${status.sessions !== undefined ? ` · ${status.sessions} 个会话` : ''}`;
      vscode.window.showInformationMessage(message);
    })
  );

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('naughtagent.serverUrl')) {
        const newUrl = vscode.workspace
          .getConfiguration('naughtagent')
          .get<string>('serverUrl', '');

        const newConfig = newUrl
          ? {
              baseURL: newUrl,
              wsURL: newUrl.replace('http', 'ws'),
            }
          : getDefaultConfig();

        agentClient?.updateConfig(newConfig);

        vscode.window.showInformationMessage(
          `NaughtAgent: 服务地址已更新为 ${newConfig.baseURL}`
        );
      }
    })
  );

  // 状态栏
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'naughtagent.showDaemonStatus';
  context.subscriptions.push(statusBarItem);

  // 监听 Daemon 状态变化
  context.subscriptions.push(
    daemonClient.onStatusChange((status) => {
      updateStatusBar(status.status);
    })
  );

  // 初始化连接
  initializeDaemon();

  // 清理资源
  context.subscriptions.push(
    new vscode.Disposable(() => {
      daemonClient?.dispose();
      diffProvider?.dispose();
    })
  );
}

/**
 * 初始化 Daemon 连接
 */
async function initializeDaemon(): Promise<void> {
  if (!daemonClient) return;

  updateStatusBar('connecting');

  const success = await daemonClient.initialize();
  if (!success) {
    vscode.window.showWarningMessage(
      'NaughtAgent: 无法连接到 Daemon 服务。请确保已安装 naughtagent CLI。',
      '重试',
      '忽略'
    ).then((action) => {
      if (action === '重试') {
        initializeDaemon();
      }
    });
  }
}

/**
 * 更新状态栏
 */
function updateStatusBar(status: string): void {
  if (!statusBarItem) return;

  switch (status) {
    case 'connected':
      statusBarItem.text = '$(check) NaughtAgent';
      statusBarItem.tooltip = 'NaughtAgent: 已连接';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'connecting':
      statusBarItem.text = '$(sync~spin) NaughtAgent';
      statusBarItem.tooltip = 'NaughtAgent: 连接中...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'disconnected':
      statusBarItem.text = '$(debug-disconnect) NaughtAgent';
      statusBarItem.tooltip = 'NaughtAgent: 未连接 (点击查看状态)';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      break;
    case 'error':
      statusBarItem.text = '$(error) NaughtAgent';
      statusBarItem.tooltip = 'NaughtAgent: 连接错误 (点击查看状态)';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      break;
    default:
      statusBarItem.text = '$(hubot) NaughtAgent';
      statusBarItem.tooltip = 'NaughtAgent';
      statusBarItem.backgroundColor = undefined;
  }

  statusBarItem.show();
}

export function deactivate() {
  daemonClient?.dispose();
  diffProvider?.dispose();
}
