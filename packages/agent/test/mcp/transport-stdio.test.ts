/**
 * Stdio 传输层单元测试
 *
 * 测试 StdioTransport 类的连接、请求、通知和错误处理
 *
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { StdioTransport, createTransport } from "../../src/mcp/transport"
import type { McpServerConfig } from "../../src/mcp/types"

describe("StdioTransport 单元测试", () => {
  /**
   * 测试：使用 stdio 配置能够成功连接
   */
  describe("连接测试", () => {
    it("应该使用有效命令成功启动", async () => {
      const config: McpServerConfig = {
        name: "test-stdio-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready'); setTimeout(() => {}, 5000)"],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await expect(transport.start()).resolves.not.toThrow()
      expect(transport.connected).toBe(true)

      await transport.close()
      expect(transport.connected).toBe(false)
    })

    it("应该在缺少 command 时抛出错误", async () => {
      const config: McpServerConfig = {
        name: "no-command-server",
        transport: "stdio",
        // 缺少 command
      }

      const transport = new StdioTransport(config)

      await expect(transport.start()).rejects.toThrow(/command.*required/i)
      expect(transport.connected).toBe(false)
    })

    it("应该在命令不存在时抛出错误", async () => {
      const config: McpServerConfig = {
        name: "invalid-command-server",
        transport: "stdio",
        command: "nonexistent-command-that-does-not-exist-12345",
        timeout: 1000,
      }

      const transport = new StdioTransport(config)

      await expect(transport.start()).rejects.toThrow()
    })

    it("应该在进程无输出时仍能启动（有 1000ms 启动超时）", async () => {
      const config: McpServerConfig = {
        name: "timeout-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "setTimeout(() => {}, 60000)"], // 长时间运行但不输出
        timeout: 5000,
      }

      const transport = new StdioTransport(config)

      // 实现中有 1000ms 的启动超时，即使进程不输出也会成功启动
      // 这是为了兼容某些不立即输出的 MCP 服务器
      await transport.start()

      expect(transport.connected).toBe(true)

      await transport.close()
    })

    it("应该支持环境变量配置", async () => {
      const config: McpServerConfig = {
        name: "env-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log(process.env.TEST_VAR || 'not set')"],
        env: { TEST_VAR: "test-value" },
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()
      expect(transport.connected).toBe(true)

      await transport.close()
    })

    it("应该支持工作目录配置", async () => {
      const config: McpServerConfig = {
        name: "cwd-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log(process.cwd())"],
        cwd: process.cwd(),
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()
      expect(transport.connected).toBe(true)

      await transport.close()
    })
  })

  /**
   * 测试：请求和响应处理
   */
  describe("请求响应测试", () => {
    it("应该在未连接时拒绝请求", async () => {
      const config: McpServerConfig = {
        name: "not-connected-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready')"],
      }

      const transport = new StdioTransport(config)

      // 未调用 start()，直接发送请求
      await expect(transport.request("test/method")).rejects.toThrow(
        /not connected/i
      )
    })

    it("应该正确发送 JSON-RPC 请求并接收响应", async () => {
      // 创建一个简单的 echo 服务器
      const config: McpServerConfig = {
        name: "echo-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', (line) => {
            try {
              const req = JSON.parse(line);
              const res = { jsonrpc: '2.0', id: req.id, result: { echo: req.params } };
              console.log(JSON.stringify(res));
            } catch (e) {}
          });
        `,
        ],
        timeout: 5000,
      }

      const transport = new StdioTransport(config)

      await transport.start()
      expect(transport.connected).toBe(true)

      // 发送请求
      const result = await transport.request("test/echo", { message: "hello" })

      expect(result).toEqual({ echo: { message: "hello" } })

      await transport.close()
    })

    it("应该处理 JSON-RPC 错误响应", async () => {
      const config: McpServerConfig = {
        name: "error-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', (line) => {
            try {
              const req = JSON.parse(line);
              const res = { jsonrpc: '2.0', id: req.id, error: { code: -32600, message: 'Test error' } };
              console.log(JSON.stringify(res));
            } catch (e) {}
          });
        `,
        ],
        timeout: 5000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      await expect(transport.request("test/error")).rejects.toThrow("Test error")

      await transport.close()
    })

    it("应该处理请求超时", async () => {
      const config: McpServerConfig = {
        name: "slow-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', () => {
            // 不响应，模拟超时
          });
        `,
        ],
        timeout: 500, // 短超时
      }

      const transport = new StdioTransport(config)

      await transport.start()

      await expect(transport.request("test/slow")).rejects.toThrow(/timeout/i)

      await transport.close()
    })
  })

  /**
   * 测试：通知处理
   */
  describe("通知测试", () => {
    it("应该在未连接时静默忽略通知", () => {
      const config: McpServerConfig = {
        name: "notify-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready')"],
      }

      const transport = new StdioTransport(config)

      // 未连接时发送通知不应抛出错误
      expect(() => transport.notify("test/notification")).not.toThrow()
    })

    it("应该能够发送通知", async () => {
      const config: McpServerConfig = {
        name: "notify-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', () => {});
        `,
        ],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      // 发送通知不应抛出错误
      expect(() =>
        transport.notify("test/notification", { data: "test" })
      ).not.toThrow()

      await transport.close()
    })

    it("应该能够接收服务器通知", async () => {
      const config: McpServerConfig = {
        name: "server-notify",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          console.log('ready');
          setTimeout(() => {
            console.log(JSON.stringify({ jsonrpc: '2.0', method: 'server/notification', params: { data: 'from-server' } }));
          }, 100);
          setTimeout(() => {}, 5000);
        `,
        ],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      const notifications: Array<{ method: string; params: unknown }> = []

      transport.onNotification((method, params) => {
        notifications.push({ method, params })
      })

      await transport.start()

      // 等待通知到达
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(notifications.length).toBeGreaterThanOrEqual(1)
      expect(notifications[0]?.method).toBe("server/notification")
      expect(notifications[0]?.params).toEqual({ data: "from-server" })

      await transport.close()
    })
  })

  /**
   * 测试：关闭连接
   */
  describe("关闭连接测试", () => {
    it("应该正确关闭连接", async () => {
      const config: McpServerConfig = {
        name: "close-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready'); setTimeout(() => {}, 10000)"],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()
      expect(transport.connected).toBe(true)

      await transport.close()
      expect(transport.connected).toBe(false)
    })

    it("应该在关闭时拒绝所有待处理请求", async () => {
      const config: McpServerConfig = {
        name: "pending-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', () => {
            // 不响应
          });
        `,
        ],
        timeout: 5000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      // 发送请求但不等待响应
      const requestPromise = transport.request("test/pending")

      // 立即关闭连接
      await transport.close()

      // 请求应该被拒绝
      await expect(requestPromise).rejects.toThrow(/closed|timeout/i)
    })

    it("应该能够多次调用 close 而不出错", async () => {
      const config: McpServerConfig = {
        name: "multi-close-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready'); setTimeout(() => {}, 5000)"],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      await transport.close()
      await transport.close() // 第二次调用不应出错
      await transport.close() // 第三次调用不应出错

      expect(transport.connected).toBe(false)
    })
  })

  /**
   * 测试：工厂函数
   */
  describe("createTransport 工厂函数", () => {
    it("应该为 stdio 配置创建 StdioTransport", () => {
      const config: McpServerConfig = {
        name: "factory-stdio",
        transport: "stdio",
        command: "node",
      }

      const transport = createTransport(config)

      expect(transport).toBeInstanceOf(StdioTransport)
    })

    it("应该为未知传输类型抛出错误", () => {
      const config = {
        name: "unknown-transport",
        transport: "unknown" as "stdio",
        command: "node",
      }

      expect(() => createTransport(config)).toThrow(/unknown transport/i)
    })
  })

  /**
   * 测试：进程退出处理
   */
  describe("进程退出处理", () => {
    it("应该在进程退出时更新连接状态", async () => {
      const config: McpServerConfig = {
        name: "exit-server",
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('ready'); process.exit(0)"],
        timeout: 3000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      // 等待进程退出
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(transport.connected).toBe(false)
    })

    it("应该在进程异常退出时拒绝待处理请求", async () => {
      const config: McpServerConfig = {
        name: "crash-server",
        transport: "stdio",
        command: "node",
        args: [
          "-e",
          `
          const readline = require('readline');
          const rl = readline.createInterface({ input: process.stdin });
          console.log('ready');
          rl.on('line', () => {
            process.exit(1);
          });
        `,
        ],
        timeout: 5000,
      }

      const transport = new StdioTransport(config)

      await transport.start()

      // 发送请求会导致进程退出
      await expect(transport.request("test/crash")).rejects.toThrow()
    })
  })
})
