import { z } from "zod"
import { Tool } from "./tool"

// ─── 常量 ────────────────────────────────────────────────
const FETCH_TIMEOUT = 30_000 // 30 秒超时
const MAX_CONTENT_LENGTH = 50_000 // 最大内容长度（字符）
const MAX_SUMMARY_INPUT = 30_000 // 传给 summarizer 的最大字符数

const DESCRIPTION = `Fetches content from a URL and optionally summarizes it using an AI model.

Usage:
- Takes a URL and a prompt as input
- Fetches the URL content, strips HTML tags, converts to plain text
- If a summarizer is available (via ctx.meta), processes content with the prompt
- Otherwise returns truncated plain text
- HTTP URLs are automatically upgraded to HTTPS
- Timeout: 30 seconds

Notes:
- This tool is read-only and does not modify any files
- The prompt should describe what information you want to extract from the page
- Results may be truncated if the content is very large`

// ─── HTML → 纯文本转换 ──────────────────────────────────

/**
 * 将 HTML 内容转换为可读的纯文本
 *
 * 处理流程：
 * 1. 移除 script/style/head 等不可见标签
 * 2. 将块级标签转换为换行
 * 3. 将 <br> 转换为换行
 * 4. 剥离剩余 HTML 标签
 * 5. 解码常见 HTML 实体
 * 6. 清理多余空白
 */
function htmlToText(html: string): string {
  let text = html

  // 移除 script、style、head、noscript 标签及其内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "")
  text = text.replace(/<head[\s\S]*?<\/head>/gi, "")
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")

  // 将块级标签转换为换行（段落、标题、div、li 等）
  text = text.replace(/<\/?(?:p|div|h[1-6]|ul|ol|li|tr|br|hr|blockquote|pre|section|article|header|footer|nav|main|aside)[\s>][^>]*>/gi, "\n")
  text = text.replace(/<br\s*\/?>/gi, "\n")

  // 剥离所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, "")

  // 解码常见 HTML 实体
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // 清理多余空白：每行 trim，合并连续空行
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return text
}

/**
 * 验证并规范化 URL
 * - 自动将 http:// 升级为 https://
 * - 验证 URL 格式是否合法
 */
function normalizeUrl(rawUrl: string): URL {
  let urlStr = rawUrl.trim()

  // 自动升级 http → https
  if (urlStr.startsWith("http://")) {
    urlStr = "https://" + urlStr.slice(7)
  }

  // 如果没有协议前缀，默认加 https://
  if (!urlStr.startsWith("https://") && !urlStr.startsWith("http://")) {
    urlStr = "https://" + urlStr
  }

  return new URL(urlStr) // 无效 URL 会抛出 TypeError
}

/**
 * 截断文本到指定长度，在句子边界截断
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  // 尝试在句子边界截断
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf("。")
  const lastDot = truncated.lastIndexOf(". ")
  const lastNewline = truncated.lastIndexOf("\n")

  const breakPoint = Math.max(lastPeriod, lastDot, lastNewline)
  if (breakPoint > maxLength * 0.5) {
    return truncated.slice(0, breakPoint + 1) + "\n\n[... 内容已截断]"
  }

  return truncated + "\n\n[... 内容已截断]"
}

// ─── 工具定义 ────────────────────────────────────────────

export const WebFetchTool = Tool.define({
  id: "web_fetch",
  description: DESCRIPTION,
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    url: z.string().describe("The URL to fetch content from (must be a valid URL)"),
    prompt: z.string().describe("The prompt describing what information to extract from the page"),
  }),

  async execute(params, ctx) {
    const { url: rawUrl, prompt } = params

    // ── 1. 验证并规范化 URL ──
    let parsedUrl: URL
    try {
      parsedUrl = normalizeUrl(rawUrl)
    } catch {
      return {
        title: "WebFetch Error",
        output: `URL 无效: "${rawUrl}"。请提供一个合法的 URL（如 https://example.com）。`,
        isError: true,
      }
    }

    const urlStr = parsedUrl.toString()

    // ── 2. 使用 Node.js 内置 fetch 抓取网页 ──
    let response: Response
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        response = await fetch(urlStr, {
          signal: controller.signal,
          headers: {
            // 模拟浏览器请求头，避免被反爬拦截
            "User-Agent": "Mozilla/5.0 (compatible; NaughtAgent/1.0; +https://github.com/naughtagent)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          },
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)

      // 区分超时和其他网络错误
      if (errMsg.includes("abort") || errMsg.includes("AbortError")) {
        return {
          title: "WebFetch Timeout",
          output: `请求超时（${FETCH_TIMEOUT / 1000} 秒）: ${urlStr}`,
          isError: true,
        }
      }

      return {
        title: "WebFetch Error",
        output: `网络请求失败: ${urlStr}\n错误: ${errMsg}`,
        isError: true,
      }
    }

    // ── 3. 检查 HTTP 状态 ──
    if (!response.ok) {
      return {
        title: "WebFetch Error",
        output: `HTTP ${response.status} ${response.statusText}: ${urlStr}`,
        isError: true,
      }
    }

    // ── 4. 读取响应体 ──
    let rawBody: string
    try {
      rawBody = await response.text()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        title: "WebFetch Error",
        output: `读取响应内容失败: ${errMsg}`,
        isError: true,
      }
    }

    if (!rawBody.trim()) {
      return {
        title: "WebFetch",
        output: `页面内容为空: ${urlStr}`,
        isError: true,
      }
    }

    // ── 5. 判断内容类型并转换 ──
    const contentType = response.headers.get("content-type") || ""
    let plainText: string

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      // HTML → 纯文本
      plainText = htmlToText(rawBody)
    } else if (contentType.includes("application/json")) {
      // JSON 直接格式化
      try {
        const parsed = JSON.parse(rawBody)
        plainText = JSON.stringify(parsed, null, 2)
      } catch {
        plainText = rawBody
      }
    } else {
      // 其他类型（text/plain 等）直接使用
      plainText = rawBody
    }

    // 限制总长度
    plainText = truncateText(plainText, MAX_CONTENT_LENGTH)

    // ── 6. 如果有 summarizer，用 AI 摘要 ──
    const summarizer = ctx.meta?.summarizer as
      | ((text: string, prompt: string) => Promise<string>)
      | undefined

    if (summarizer) {
      try {
        const inputText = truncateText(plainText, MAX_SUMMARY_INPUT)
        const summary = await summarizer(inputText, prompt)
        return {
          title: `WebFetch: ${parsedUrl.hostname}`,
          output: summary,
          metadata: {
            url: urlStr,
            contentType,
            originalLength: rawBody.length,
            summarized: true,
          },
        }
      } catch (err: unknown) {
        // summarizer 失败时降级为返回纯文本
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          title: `WebFetch: ${parsedUrl.hostname}`,
          output: `[摘要生成失败: ${errMsg}]\n\n--- 原始内容 ---\n\n${plainText}`,
          metadata: {
            url: urlStr,
            contentType,
            originalLength: rawBody.length,
            summarized: false,
            summarizerError: errMsg,
          },
        }
      }
    }

    // ── 7. 无 summarizer，直接返回纯文本 ──
    return {
      title: `WebFetch: ${parsedUrl.hostname}`,
      output: plainText,
      metadata: {
        url: urlStr,
        contentType,
        originalLength: rawBody.length,
        summarized: false,
      },
    }
  },
})
