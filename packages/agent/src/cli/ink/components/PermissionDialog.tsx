/**
 * PermissionDialog 组件
 *
 * 交互式权限确认对话框，提供：
 * - 操作详情显示
 * - y/a/n/s 选项
 * - 键盘导航支持
 *
 * 需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from '../../cc-ink/index.js'
import type { PermissionDialogProps, PermissionResult } from '../types.js'

/**
 * 权限选项定义
 */
interface PermissionOption {
  key: string
  label: string
  result: PermissionResult
  color: string
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  { key: 'y', label: '允许 (y)', result: 'allow', color: 'green' },
  { key: 'a', label: '总是允许 (a)', result: 'always', color: 'cyan' },
  { key: 'n', label: '拒绝 (n)', result: 'deny', color: 'red' },
  { key: 's', label: '跳过任务 (s)', result: 'skip', color: 'yellow' },
]

/**
 * 获取权限类型的显示名称
 */
function getPermissionTypeName(type: string): string {
  const typeNames: Record<string, string> = {
    read: '读取文件',
    write: '写入文件',
    edit: '编辑文件',
    bash: '执行命令',
    glob: '搜索文件',
    grep: '搜索内容',
  }
  return typeNames[type] || type
}

/**
 * PermissionDialog 组件
 *
 * 显示权限请求对话框，支持键盘选择。
 *
 * @param props PermissionDialogProps
 */
export function PermissionDialog({
  request,
  onResponse,
}: PermissionDialogProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 处理键盘输入
  useInput((input, key) => {
    // 直接按键快捷方式
    const option = PERMISSION_OPTIONS.find((o) => o.key === input.toLowerCase())
    if (option) {
      onResponse(option.result)
      return
    }

    // Escape 默认拒绝
    if (key.escape) {
      onResponse('deny')
      return
    }

    // 方向键导航
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(PERMISSION_OPTIONS.length - 1, prev + 1))
      return
    }

    // Enter 确认选择
    if (key.return) {
      onResponse(PERMISSION_OPTIONS[selectedIndex].result)
      return
    }
  })

  const typeName = getPermissionTypeName(request.type)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      {/* 标题 */}
      <Text color="yellow" bold>
        ⚠ 权限请求
      </Text>

      {/* 操作详情 */}
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="cyan">操作类型: </Text>
          <Text>{typeName}</Text>
        </Text>
        <Text>
          <Text color="cyan">资源: </Text>
          <Text>{request.resource}</Text>
        </Text>
        {request.description && (
          <Text>
            <Text color="cyan">描述: </Text>
            <Text color="gray">{request.description}</Text>
          </Text>
        )}
      </Box>

      {/* 选项列表 */}
      <Box flexDirection="column" marginTop={1}>
        {PERMISSION_OPTIONS.map((option, index) => (
          <Text key={option.key}>
            <Text color={index === selectedIndex ? option.color : 'gray'}>
              {index === selectedIndex ? '▶ ' : '  '}
              {option.label}
            </Text>
          </Text>
        ))}
      </Box>

      {/* 提示 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          按 y/a/n/s 快速选择，或使用方向键导航后按 Enter 确认
        </Text>
      </Box>
    </Box>
  )
}

/**
 * 导出选项定义（用于测试）
 */
export { PERMISSION_OPTIONS, getPermissionTypeName }
