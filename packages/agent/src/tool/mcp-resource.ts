/**
 * MCP 资源工具
 *
 * 提供两个工具用于访问 MCP 服务器的资源：
 * - ListMcpResourcesTool: 列出所有 MCP 服务器的资源
 * - ReadMcpResourceTool: 读取指定 MCP 服务器的资源内容
 *
 * 通过 ctx.meta.mcpManager 获取 McpManager 实例
 */

import { z } from "zod"
import { Tool } from "./tool"
import type { McpManager } from "../mcp/manager"

// ─── ListMcpResourcesTool ────────────────────────────────

const LIST_DESCRIPTION = `List available resources from configured MCP servers.
Each returned resource includes standard MCP resource fields plus a 'server' field
indicating which server the resource belongs to.

Parameters:
- server (optional): The name of a specific MCP server to get resources from.
  If not provided, resources from all servers will be returned.`

export const ListMcpResourcesTool = Tool.define({
  id: "list_mcp_resources",
  description: LIST_DESCRIPTION,
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    server: z
      .string()
      .optional()
      .describe("Optional server name to filter resources by"),
  }),

  async execute(params, ctx) {
    const mcpManager = ctx.meta?.mcpManager as McpManager | undefined

    if (!mcpManager) {
      return {
        title: "ListMcpResources",
        output: "No MCP servers configured. Add MCP server configuration to .naught/mcp.json to use this tool.",
        isError: true,
      }
    }

    try {
      // 获取所有资源
      const allResources = await mcpManager.getAllResources()

      // 按服务器名过滤（如果指定）
      const resources = params.server
        ? allResources.filter((r) => r.serverName === params.server)
        : allResources

      if (resources.length === 0) {
        const hint = params.server
          ? `No resources found for server "${params.server}".`
          : "No resources found from any MCP server."
        return {
          title: "ListMcpResources",
          output: hint,
        }
      }

      // 格式化输出
      const lines: string[] = []
      lines.push(`Found ${resources.length} resource(s):\n`)

      // 按服务器分组
      const grouped = new Map<string, typeof resources>()
      for (const resource of resources) {
        const list = grouped.get(resource.serverName) || []
        list.push(resource)
        grouped.set(resource.serverName, list)
      }

      for (const [serverName, serverResources] of grouped) {
        lines.push(`## Server: ${serverName}`)
        for (const r of serverResources) {
          lines.push(`- **${r.name}** (${r.uri})`)
          if (r.description) {
            lines.push(`  ${r.description}`)
          }
          if (r.mimeType) {
            lines.push(`  MIME: ${r.mimeType}`)
          }
        }
        lines.push("")
      }

      return {
        title: "ListMcpResources",
        output: lines.join("\n"),
        metadata: {
          count: resources.length,
          server: params.server,
        },
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      return {
        title: "ListMcpResources Error",
        output: `获取 MCP 资源列表失败: ${errMsg}`,
        isError: true,
      }
    }
  },
})

// ─── ReadMcpResourceTool ─────────────────────────────────

const READ_DESCRIPTION = `Read a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read`

export const ReadMcpResourceTool = Tool.define({
  id: "read_mcp_resource",
  description: READ_DESCRIPTION,
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    server: z.string().describe("The MCP server name"),
    uri: z.string().describe("The resource URI to read"),
  }),

  async execute(params, ctx) {
    const mcpManager = ctx.meta?.mcpManager as McpManager | undefined

    if (!mcpManager) {
      return {
        title: "ReadMcpResource",
        output: "No MCP servers configured. Add MCP server configuration to .naught/mcp.json to use this tool.",
        isError: true,
      }
    }

    const { server, uri } = params

    // 检查服务器是否存在
    if (!mcpManager.hasServer(server)) {
      const available = mcpManager.getServerNames()
      const hint = available.length > 0
        ? `Available servers: ${available.join(", ")}`
        : "No MCP servers are connected."
      return {
        title: "ReadMcpResource Error",
        output: `Server not found: "${server}". ${hint}`,
        isError: true,
      }
    }

    try {
      const contents = await mcpManager.readResource(server, uri)

      if (!contents || contents.length === 0) {
        return {
          title: `ReadMcpResource: ${server}`,
          output: `Resource returned empty content: ${uri}`,
          isError: true,
        }
      }

      // 拼接所有内容块
      const parts: string[] = []
      for (const content of contents) {
        if (content.text) {
          parts.push(content.text)
        } else if (content.blob) {
          // blob 是 base64 编码，提示用户
          parts.push(`[Binary content: ${content.mimeType || "unknown type"}, ${content.blob.length} bytes (base64)]`)
        } else {
          parts.push(`[Empty content block: ${content.uri}]`)
        }
      }

      return {
        title: `ReadMcpResource: ${server}`,
        output: parts.join("\n\n"),
        metadata: {
          server,
          uri,
          contentCount: contents.length,
          mimeType: contents[0]?.mimeType,
        },
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      return {
        title: "ReadMcpResource Error",
        output: `读取 MCP 资源失败 (server: ${server}, uri: ${uri}): ${errMsg}`,
        isError: true,
      }
    }
  },
})
