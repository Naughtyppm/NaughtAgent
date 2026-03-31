/**
 * WelcomeView 组件
 *
 * 欢迎界面，显示：
 * - 猫咪 ASCII art
 * - 版本信息
 * - 当前配置（agent、model、mode、cwd）
 *
 * 需求: 7.1, 7.2, 7.4, 7.5
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { WelcomeViewProps } from '../types.js'
import { VERSION } from '../../../config/index.js'

/**
 * 猫咪 ASCII art
 */
const CAT_ASCII = `
  /\\_/\\  
 ( o.o ) 
  > ^ <
`

/**
 * WelcomeView 组件
 *
 * 显示欢迎界面，包含版本信息和当前配置。
 *
 * @param props WelcomeViewProps
 */
export function WelcomeView({
  config,
  version = VERSION,
}: WelcomeViewProps): React.ReactElement {
  const modeText = config.autoConfirm ? 'auto' : 'manual'
  const modeColor = config.autoConfirm ? 'green' : 'yellow'

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 猫咪 ASCII art */}
      <Text color="cyan">{CAT_ASCII}</Text>

      {/* 标题 */}
      <Text color="cyan" bold>
        NaughtyAgent v{version}
      </Text>

      {/* 配置信息 */}
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text>
          <Text color="gray">Agent: </Text>
          <Text color="magenta">{config.agent}</Text>
        </Text>
        <Text>
          <Text color="gray">Model: </Text>
          <Text color="blue">{config.model || 'default'}</Text>
        </Text>
        <Text>
          <Text color="gray">Mode:  </Text>
          <Text color={modeColor}>{modeText}</Text>
        </Text>
        <Text>
          <Text color="gray">CWD:   </Text>
          <Text color="gray" dimColor>
            {config.cwd}
          </Text>
        </Text>
      </Box>

      {/* 提示 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          输入 /help 查看可用命令
        </Text>
      </Box>
    </Box>
  )
}

/**
 * 导出 ASCII art（用于测试）
 */
export { CAT_ASCII }
