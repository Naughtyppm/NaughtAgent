/**
 * 上下文收集器
 *
 * 收集当前编辑器状态、选中代码、项目信息等上下文
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface FileContext {
  path: string;
  relativePath: string;
  content: string;
  language: string;
}

export interface SelectionContext {
  text: string;
  startLine: number;
  endLine: number;
  filePath: string;
}

export interface WorkspaceContext {
  name: string;
  rootPath: string;
}

export interface CollectedContext {
  currentFile?: FileContext;
  selection?: SelectionContext;
  referencedFiles?: FileContext[];
  workspace?: WorkspaceContext;
}

export class ContextCollector {
  /**
   * 收集当前上下文
   */
  async collect(): Promise<CollectedContext> {
    const context: CollectedContext = {};
    const config = vscode.workspace.getConfiguration('naughtyagent');

    // 工作区信息
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      context.workspace = {
        name: workspaceFolder.name,
        rootPath: workspaceFolder.uri.fsPath,
      };
    }

    // 当前文件
    const editor = vscode.window.activeTextEditor;
    if (editor && config.get<boolean>('includeCurrentFile', true)) {
      const document = editor.document;
      context.currentFile = {
        path: document.uri.fsPath,
        relativePath: workspaceFolder
          ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
          : document.uri.fsPath,
        content: document.getText(),
        language: document.languageId,
      };
    }

    // 选中代码
    if (editor && config.get<boolean>('includeSelection', true)) {
      const selection = editor.selection;
      if (!selection.isEmpty) {
        context.selection = {
          text: editor.document.getText(selection),
          startLine: selection.start.line + 1,
          endLine: selection.end.line + 1,
          filePath: editor.document.uri.fsPath,
        };
      }
    }

    return context;
  }

  /**
   * 解析 @file 引用
   */
  async resolveFileReference(ref: string): Promise<FileContext | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    // 支持相对路径和绝对路径
    let filePath = ref;
    if (!path.isAbsolute(ref)) {
      filePath = path.join(workspaceFolder.uri.fsPath, ref);
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);

      return {
        path: filePath,
        relativePath: path.relative(workspaceFolder.uri.fsPath, filePath),
        content: document.getText(),
        language: document.languageId,
      };
    } catch (e) {
      console.error(`Failed to resolve file reference: ${ref}`, e);
      return null;
    }
  }

  /**
   * 解析消息中的所有 @file 引用
   */
  async resolveAllFileReferences(message: string): Promise<FileContext[]> {
    const files: FileContext[] = [];
    const regex = /@file\s+([^\s]+)/g;
    let match;

    while ((match = regex.exec(message)) !== null) {
      const ref = match[1];
      const file = await this.resolveFileReference(ref);
      if (file) {
        files.push(file);
      }
    }

    return files;
  }

  /**
   * 构建上下文提示
   */
  buildContextPrompt(context: CollectedContext): string {
    const parts: string[] = [];

    if (context.workspace) {
      parts.push(`工作目录: ${context.workspace.rootPath}`);
    }

    if (context.currentFile) {
      parts.push(`\n当前文件: ${context.currentFile.relativePath}`);
      parts.push(`语言: ${context.currentFile.language}`);
      parts.push('```' + context.currentFile.language);
      parts.push(context.currentFile.content);
      parts.push('```');
    }

    if (context.selection) {
      parts.push(`\n选中代码 (行 ${context.selection.startLine}-${context.selection.endLine}):`);
      parts.push('```');
      parts.push(context.selection.text);
      parts.push('```');
    }

    if (context.referencedFiles && context.referencedFiles.length > 0) {
      parts.push('\n引用的文件:');
      for (const file of context.referencedFiles) {
        parts.push(`\n--- ${file.relativePath} ---`);
        parts.push('```' + file.language);
        parts.push(file.content);
        parts.push('```');
      }
    }

    return parts.join('\n');
  }

  /**
   * 获取工作区根路径
   */
  getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
