#!/usr/bin/env npx tsx
/**
 * 测试 grep 工具
 */

import { ToolRegistry } from '../src/tool/registry.js';
import { GrepTool } from '../src/tool/grep.js';

ToolRegistry.clear();
ToolRegistry.register(GrepTool);

const ctx = { sessionID: 'test', cwd: process.cwd(), abort: new AbortController().signal };

async function main() {
  console.log('=== 测试 grep 工具 ===\n');
  console.log('工作目录:', process.cwd());

  // 测试 1: 搜索 zod（无 include 参数）
  console.log('\n--- 测试 1: 搜索 zod（path: src/tool）---');
  try {
    const r1 = await ToolRegistry.execute('grep', { pattern: 'zod', path: 'src/tool' }, ctx);
    console.log('结果:', r1.output.substring(0, 500));
  } catch (e) {
    console.log('错误:', e);
  }

  // 测试 2: 搜索 zod（include: *.ts）
  console.log('\n--- 测试 2: 搜索 zod（include: *.ts）---');
  try {
    const r2 = await ToolRegistry.execute('grep', { pattern: 'zod', path: 'src/tool', include: '*.ts' }, ctx);
    console.log('结果:', r2.output.substring(0, 500));
  } catch (e) {
    console.log('错误:', e);
  }

  // 测试 3: 搜索 zod（include: **/*.ts）
  console.log('\n--- 测试 3: 搜索 zod（include: **/*.ts）---');
  try {
    const r3 = await ToolRegistry.execute('grep', { pattern: 'zod', path: 'src/tool', include: '**/*.ts' }, ctx);
    console.log('结果:', r3.output.substring(0, 500));
  } catch (e) {
    console.log('错误:', e);
  }

  // 测试 4: 搜索 import（无参数）
  console.log('\n--- 测试 4: 搜索 import（path: src/tool/read.ts）---');
  try {
    const r4 = await ToolRegistry.execute('grep', { pattern: 'import', path: 'src/tool/read.ts' }, ctx);
    console.log('结果:', r4.output.substring(0, 500));
  } catch (e) {
    console.log('错误:', e);
  }
}

main().catch(console.error);
