/**
 * 命令注册
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './views/chat/ChatViewProvider';
import { AgentClient } from './services/AgentClient';
import { ContextCollector } from './services/ContextCollector';

export function registerCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  agentClient: AgentClient,
  contextCollector: ContextCollector
): void {
  // 打开聊天面板
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.openChat', () => {
      vscode.commands.executeCommand('naughtagent.chatView.focus');
    })
  );

  // 新建对话
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.newChat', async () => {
      await chatViewProvider.newChat();
    })
  );

  // 清空对话
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.clearChat', async () => {
      await chatViewProvider.clearChat();
    })
  );

  // 询问选中代码
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.askAboutSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('请先选中一些代码');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      // 打开聊天面板
      await vscode.commands.executeCommand('naughtagent.chatView.focus');

      // 发送带上下文的消息
      const message = `请帮我分析这段代码：\n\n\`\`\`${language}\n${selection}\n\`\`\``;
      await chatViewProvider.sendMessage(message);
    })
  );

  // 解释代码
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.explainCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('请先选中一些代码');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      await vscode.commands.executeCommand('naughtagent.chatView.focus');

      const message = `请解释这段代码的作用：\n\n\`\`\`${language}\n${selection}\n\`\`\``;
      await chatViewProvider.sendMessage(message);
    })
  );

  // 修复代码
  context.subscriptions.push(
    vscode.commands.registerCommand('naughtagent.fixCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('请先选中一些代码');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      const filePath = editor.document.uri.fsPath;

      await vscode.commands.executeCommand('naughtagent.chatView.focus');

      const message = `请帮我修复这段代码中的问题：\n\n文件: ${filePath}\n\n\`\`\`${language}\n${selection}\n\`\`\``;
      await chatViewProvider.sendMessage(message);
    })
  );
}
