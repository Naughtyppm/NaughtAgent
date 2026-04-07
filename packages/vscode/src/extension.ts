/**
 * NaughtyAgent VS Code Extension
 *
 * 入口文件
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './views/chat/ChatViewProvider';
import { DaemonClient } from './services/DaemonClient';
import { AgentClient, getDefaultConfig } from './services/AgentClient';
import { ContextCollector } from './services/ContextCollector';
import { SessionPicker } from './views/SessionPicker';
import { SessionListProvider } from './views/SessionListProvider';
import { DiffProvider } from './services/DiffProvider';
import { FileReferenceProvider } from './services/FileReferenceProvider';
import { registerCommands } from './commands';

let daemonClient: DaemonClient | undefined;
let agentClient: AgentClient | undefined;
let diffProvider: DiffProvider | undefined;
let sessionListProvider: SessionListProvider | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('NaughtyAgent is now active!');
  outputChannel = vscode.window.createOutputChannel('NaughtyAgent');
  outputChannel.appendLine('[activate] extension activated');
  context.subscriptions.push(outputChannel);

  // 获取配置
  const config = vscode.workspace.getConfiguration('naughtyagent');
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
    contextCollector,
    outputChannel
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

  // 注册会话列表 TreeView
  sessionListProvider = new SessionListProvider(agentClient);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'naughtyagent.sessionsView',
      sessionListProvider
    )
  );
  sessionListProvider.startAutoRefresh();
  context.subscriptions.push(new vscode.Disposable(() => sessionListProvider?.dispose()));

  // 刷新会话列表
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.refreshSessions', () => {
      sessionListProvider?.refresh();
    })
  );

  // 切换到指定会话
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.switchToSession', async (session: { id: string }) => {
      if (!session?.id) return;
      try {
        // 先断开旧连接
        agentClient!.disconnect();
        // 重新连接到新会话
        await agentClient!.connect(session.id);
        sessionListProvider?.setActiveSession(session.id);
        // 清空 Chat View 消息（不断开连接）
        await chatViewProvider.clearChat();
        outputChannel?.appendLine(`[session] switched to ${session.id}`);
      } catch (e) {
        vscode.window.showErrorMessage(
          `切换会话失败: ${e instanceof Error ? e.message : e}`
        );
      }
    })
  );

  // 多窗口 Chat — 在编辑器区域打开独立 Chat 页签
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.openChatInEditor', () => {
      const panel = vscode.window.createWebviewPanel(
        'naughtyagent.chatPanel',
        'NaughtyAgent Chat',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] }
      );

      // 每个 panel 使用独立的 AgentClient 连接
      const panelAgentClient = new AgentClient(clientConfig);
      const panelChatProvider = new ChatViewProvider(
        context.extensionUri,
        panelAgentClient,
        contextCollector,
        outputChannel
      );
      panelChatProvider.resolveWebviewPanel(panel);

      panel.onDidDispose(() => {
        panelAgentClient.dispose();
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.showLogs', () => {
      outputChannel?.show(true);
    })
  );

  // 注册会话相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.selectSession', async () => {
      const session = await sessionPicker.pick({
        allowCreate: true,
        filterByCwd: true,
      });
      if (session) {
        // 连接到选中的会话
        try {
          await agentClient!.connect(session.id);
          sessionListProvider?.setActiveSession(session.id);
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
    vscode.commands.registerCommand('naughtyagent.newSession', async () => {
      const session = await sessionPicker.createNewSession();
      if (session) {
        try {
          await agentClient!.connect(session.id);
          sessionListProvider?.setActiveSession(session.id);
          sessionListProvider?.refresh();
        } catch (e) {
          vscode.window.showErrorMessage(
            `连接会话失败: ${e instanceof Error ? e.message : e}`
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.deleteSession', async () => {
      await sessionPicker.deleteSession();
      sessionListProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.reconnect', async () => {
      const success = await daemonClient!.reconnect();
      if (success) {
        vscode.window.showInformationMessage('已重新连接到 Daemon');
      } else {
        vscode.window.showErrorMessage('重新连接失败');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('naughtyagent.showDaemonStatus', async () => {
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
      if (e.affectsConfiguration('naughtyagent.serverUrl')) {
        const newUrl = vscode.workspace
          .getConfiguration('naughtyagent')
          .get<string>('serverUrl', '');

        const newConfig = newUrl
          ? {
              baseURL: newUrl,
              wsURL: newUrl.replace('http', 'ws'),
            }
          : getDefaultConfig();

        agentClient?.updateConfig(newConfig);

        vscode.window.showInformationMessage(
          `NaughtyAgent: 服务地址已更新为 ${newConfig.baseURL}`
        );
      }
    })
  );

  // 状态栏
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'naughtyagent.showDaemonStatus';
  context.subscriptions.push(statusBarItem);

  // 监听 Daemon 状态变化
  context.subscriptions.push(
    daemonClient.onStatusChange((status) => {
      updateStatusBar(status.status);
    })
  );

  // 初始化连接
  initializeDaemon();

  // 监听 .reload-signal 文件（Agent 自迭代触发重载）
  const reloadWatcher = vscode.workspace.createFileSystemWatcher('**/.reload-signal');
  const handleReloadSignal = async (uri: vscode.Uri) => {
    outputChannel?.appendLine(`[reload] signal detected: ${uri.fsPath}`);
    // 删除信号文件
    try { await vscode.workspace.fs.delete(uri); } catch { /* ignore */ }
    // 读取信号文件内容判断是否自动重载
    // 直接自动重载（无人值守模式），让 Agent 自迭代更流畅
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  };
  reloadWatcher.onDidCreate(handleReloadSignal);
  reloadWatcher.onDidChange(handleReloadSignal);
  context.subscriptions.push(reloadWatcher);

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
      'NaughtyAgent: 无法连接到 Daemon 服务。请确保已安装 naughtyagent CLI。',
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
      statusBarItem.text = '$(check) NaughtyAgent';
      statusBarItem.tooltip = 'NaughtyAgent: 已连接';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'connecting':
      statusBarItem.text = '$(sync~spin) NaughtyAgent';
      statusBarItem.tooltip = 'NaughtyAgent: 连接中...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'disconnected':
      statusBarItem.text = '$(debug-disconnect) NaughtyAgent';
      statusBarItem.tooltip = 'NaughtyAgent: 未连接 (点击查看状态)';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      break;
    case 'error':
      statusBarItem.text = '$(error) NaughtyAgent';
      statusBarItem.tooltip = 'NaughtyAgent: 连接错误 (点击查看状态)';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      break;
    default:
      statusBarItem.text = '$(hubot) NaughtyAgent';
      statusBarItem.tooltip = 'NaughtyAgent';
      statusBarItem.backgroundColor = undefined;
  }

  statusBarItem.show();
}

export function deactivate() {
  outputChannel?.appendLine('[deactivate] extension deactivated');
  daemonClient?.dispose();
  diffProvider?.dispose();
}
