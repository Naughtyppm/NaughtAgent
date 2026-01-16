/**
 * Diff 预览服务
 *
 * 使用 VS Code 原生 Diff 编辑器显示文件变更
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface DiffChange {
  /** 文件路径 */
  filePath: string;
  /** 原始内容（null 表示新文件） */
  originalContent: string | null;
  /** 修改后内容（null 表示删除文件） */
  modifiedContent: string | null;
  /** 变更类型 */
  type: 'create' | 'modify' | 'delete';
}

export class DiffProvider {
  private readonly scheme = 'naughtagent-diff';
  private contentProvider: vscode.TextDocumentContentProvider;
  private contents: Map<string, string> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // 注册虚拟文档提供器
    this.contentProvider = {
      provideTextDocumentContent: (uri: vscode.Uri): string => {
        return this.contents.get(uri.toString()) || '';
      },
    };

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        this.scheme,
        this.contentProvider
      )
    );
  }

  /**
   * 显示 Diff 预览
   */
  async showDiff(change: DiffChange): Promise<void> {
    const fileName = path.basename(change.filePath);
    const title = this.getDiffTitle(change);

    if (change.type === 'create') {
      // 新文件：显示空文件 vs 新内容
      const originalUri = this.createUri(change.filePath, 'original', '');
      const modifiedUri = this.createUri(
        change.filePath,
        'modified',
        change.modifiedContent || ''
      );

      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        title
      );
    } else if (change.type === 'delete') {
      // 删除文件：显示原内容 vs 空文件
      const originalUri = this.createUri(
        change.filePath,
        'original',
        change.originalContent || ''
      );
      const modifiedUri = this.createUri(change.filePath, 'modified', '');

      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        title
      );
    } else {
      // 修改文件：显示原内容 vs 新内容
      const originalUri = this.createUri(
        change.filePath,
        'original',
        change.originalContent || ''
      );
      const modifiedUri = this.createUri(
        change.filePath,
        'modified',
        change.modifiedContent || ''
      );

      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        title
      );
    }
  }

  /**
   * 显示多个文件的 Diff（使用 QuickPick 选择）
   */
  async showMultipleDiffs(changes: DiffChange[]): Promise<void> {
    if (changes.length === 0) {
      vscode.window.showInformationMessage('没有文件变更');
      return;
    }

    if (changes.length === 1) {
      await this.showDiff(changes[0]);
      return;
    }

    // 显示选择器
    const items = changes.map((change) => ({
      label: this.getChangeIcon(change.type) + ' ' + path.basename(change.filePath),
      description: change.filePath,
      detail: this.getChangeDescription(change.type),
      change,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要查看的文件变更',
      canPickMany: false,
    });

    if (selected) {
      await this.showDiff(selected.change);
    }
  }

  /**
   * 应用变更
   */
  async applyChange(change: DiffChange): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(change.filePath);

      if (change.type === 'delete') {
        await vscode.workspace.fs.delete(uri);
        vscode.window.showInformationMessage(`已删除: ${change.filePath}`);
      } else {
        const content = change.modifiedContent || '';
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
        vscode.window.showInformationMessage(`已保存: ${change.filePath}`);
      }

      return true;
    } catch (e) {
      vscode.window.showErrorMessage(
        `应用变更失败: ${e instanceof Error ? e.message : e}`
      );
      return false;
    }
  }

  /**
   * 显示 Diff 并询问是否应用
   */
  async showDiffWithApply(change: DiffChange): Promise<boolean> {
    await this.showDiff(change);

    const action = await vscode.window.showInformationMessage(
      `是否应用对 ${path.basename(change.filePath)} 的变更？`,
      '应用',
      '取消'
    );

    if (action === '应用') {
      return this.applyChange(change);
    }

    return false;
  }

  /**
   * 创建虚拟文档 URI
   */
  private createUri(filePath: string, version: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(
      `${this.scheme}:${filePath}?version=${version}&ts=${Date.now()}`
    );
    this.contents.set(uri.toString(), content);
    return uri;
  }

  /**
   * 获取 Diff 标题
   */
  private getDiffTitle(change: DiffChange): string {
    const fileName = path.basename(change.filePath);
    switch (change.type) {
      case 'create':
        return `${fileName} (新建)`;
      case 'delete':
        return `${fileName} (删除)`;
      case 'modify':
        return `${fileName} (修改)`;
      default:
        return fileName;
    }
  }

  /**
   * 获取变更图标
   */
  private getChangeIcon(type: DiffChange['type']): string {
    switch (type) {
      case 'create':
        return '$(add)';
      case 'delete':
        return '$(trash)';
      case 'modify':
        return '$(edit)';
      default:
        return '$(file)';
    }
  }

  /**
   * 获取变更描述
   */
  private getChangeDescription(type: DiffChange['type']): string {
    switch (type) {
      case 'create':
        return '新建文件';
      case 'delete':
        return '删除文件';
      case 'modify':
        return '修改文件';
      default:
        return '';
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.contents.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * 从工具调用结果中解析 Diff 变更
 */
export function parseDiffFromToolResult(
  toolName: string,
  input: unknown,
  output: string,
  isError: boolean
): DiffChange | null {
  if (isError) {
    return null;
  }

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'write': {
      const filePath = inputObj.path as string;
      const content = inputObj.content as string;
      // 判断是新建还是修改需要检查文件是否存在
      // 这里简化处理，假设都是修改
      return {
        filePath,
        originalContent: null, // 需要从外部获取
        modifiedContent: content,
        type: 'modify',
      };
    }

    case 'edit': {
      const filePath = inputObj.path as string;
      const oldString = inputObj.old_string as string;
      const newString = inputObj.new_string as string;
      // edit 工具的变更需要从原文件计算
      return {
        filePath,
        originalContent: null, // 需要从外部获取
        modifiedContent: null, // 需要计算
        type: 'modify',
      };
    }

    default:
      return null;
  }
}
