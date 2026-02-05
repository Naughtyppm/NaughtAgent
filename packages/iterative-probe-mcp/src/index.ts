#!/usr/bin/env node
/**
 * iterative-probe MCP Server 入口
 */

import { startServer } from "./server.js"

// 启动服务器
startServer().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
