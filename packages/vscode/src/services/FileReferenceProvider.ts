/**
 * @file 引用补全提供器
 *
 * 在聊天输入框中提供 @file 文件路径补全
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface FileReference {
  /** 相对路径 */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件名 */
  fileName: string;
  /** 是否是目录 */
  isDirectory: boolean;
}

export class FileReferenceProvider {
  private cachedFiles: FileReference[] = [];
  private cacheTime = 0;
  private readonly cacheTimeout = 30000; // 30 秒缓存

  /**
   * 获取文件补全列表
   */
  async getCompletions(prefix: string): Promise<FileReference[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    // 刷新缓存
    await this.refreshCache(workspaceFolder.uri.fsPath);

    // 过滤匹配的文件
    const lowerPrefix = prefix.toLowerCase();
    return this.cachedFiles.filter((file) => {
      const lowerPath = file.relativePath.toLowerCase();
      const lowerName = file.fileName.toLowerCase();
      return lowerPath.includes(lowerPrefix) || lowerName.includes(lowerPrefix);
    });
  }

  /**
   * 刷新文件缓存
   */
  private async refreshCache(rootPath: string): Promise<void> {
    const now = Date.now();
    if (now - this.cacheTime < this.cacheTimeout && this.cachedFiles.length > 0) {
      return;
    }

    this.cachedFiles = [];
    this.cacheTime = now;

    // 使用 VS Code 的文件搜索 API
    const files = await vscode.workspace.findFiles(
      '**/*',
      '**/node_modules/**',
      1000 // 最多 1000 个文件
    );

    for (const file of files) {
      const relativePath = path.relative(rootPath, file.fsPath);
      this.cachedFiles.push({
        relativePath: relativePath.replace(/\\/g, '/'),
        absolutePath: file.fsPath,
        fileName: path.basename(file.fsPath),
        isDirectory: false,
      });
    }

    // 按路径排序
    this.cachedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedFiles = [];
    this.cacheTime = 0;
  }
}

/**
 * 解析消息中的 @file 引用
 */
export function parseFileReferences(message: string): string[] {
  const refs: string[] = [];
  const regex = /@file\s+([^\s]+)/g;
  let match;

  while ((match = regex.exec(message)) !== null) {
    refs.push(match[1]);
  }

  return refs;
}

/**
 * 替换消息中的 @file 引用为完整内容
 */
export async function expandFileReferences(
  message: string,
  rootPath: string
): Promise<{ expandedMessage: string; files: FileReference[] }> {
  const refs = parseFileReferences(message);
  const files: FileReference[] = [];
  let expandedMessage = message;

  for (const ref of refs) {
    const absolutePath = path.isAbsolute(ref)
      ? ref
      : path.join(rootPath, ref);

    try {
      const uri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const language = document.languageId;

      files.push({
        relativePath: ref,
        absolutePath,
        fileName: path.basename(absolutePath),
        isDirectory: false,
      });

      // 替换 @file 引用为文件内容
      const replacement = `\n--- ${ref} ---\n\`\`\`${language}\n${content}\n\`\`\`\n`;
      expandedMessage = expandedMessage.replace(`@file ${ref}`, replacement);
    } catch (e) {
      console.error(`Failed to read file: ${ref}`, e);
      // 保留原始引用
    }
  }

  return { expandedMessage, files };
}
