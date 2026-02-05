/**
 * ContextInjector 扩展功能测试
 *
 * 测试文件选择、@file 语法解析、会话摘要注入
 * 需求: 4.1, 4.2, 4.3, 4.5
 */

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  createContextInjector,
  _selectRelevantFiles,
  _extractKeywords,
  _calculateRelevanceScore,
  _parseFileReferences,
  _injectSessionSummary,
  DEFAULT_IGNORE_PATTERNS,
  SESSION_SUMMARY_TAG_OPEN,
  SESSION_SUMMARY_TAG_CLOSE,
} from "../../src/context/context-injector"

// ============================================================================
// 单元测试
// ============================================================================

describe("selectRelevantFiles()", () => {
  const testFiles = [
    "src/index.ts",
    "src/utils/helper.ts",
    "src/components/Button.tsx",
    "src/services/auth.ts",
    "node_modules/lodash/index.js",
    "dist/bundle.js",
    "package.json",
    "README.md",
  ]

  it("过滤 node_modules 目录", () => {
    const result = _selectRelevantFiles(testFiles, "")
    expect(result).not.toContain("node_modules/lodash/index.js")
  })

  it("过滤 dist 目录", () => {
    const result = _selectRelevantFiles(testFiles, "")
    expect(result).not.toContain("dist/bundle.js")
  })

  it("根据关键词选择相关文件", () => {
    const result = _selectRelevantFiles(testFiles, "auth")
    expect(result).toContain("src/services/auth.ts")
    expect(result[0]).toBe("src/services/auth.ts") // 应该排在第一位
  })

  it("文件名完全匹配得分更高", () => {
    const result = _selectRelevantFiles(testFiles, "helper")
    expect(result[0]).toBe("src/utils/helper.ts")
  })

  it("空查询返回所有过滤后的文件", () => {
    const result = _selectRelevantFiles(testFiles, "")
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toContain("node_modules/lodash/index.js")
  })

  it("自定义忽略模式", () => {
    const result = _selectRelevantFiles(testFiles, "", ["src"])
    expect(result).not.toContain("src/index.ts")
    expect(result).toContain("package.json")
  })
})

describe("_extractKeywords()", () => {
  it("提取英文关键词", () => {
    const keywords = _extractKeywords("find the auth service")
    expect(keywords).toContain("find")
    expect(keywords).toContain("auth")
    expect(keywords).toContain("service")
    expect(keywords).not.toContain("the") // 停用词
  })

  it("提取中文关键词", () => {
    const keywords = _extractKeywords("查找认证服务")
    expect(keywords.length).toBeGreaterThan(0)
  })

  it("过滤短词", () => {
    const keywords = _extractKeywords("a b c auth")
    expect(keywords).toContain("auth")
    expect(keywords).not.toContain("a")
  })
})

describe("_calculateRelevanceScore()", () => {
  it("文件名完全匹配得分最高", () => {
    const score = _calculateRelevanceScore("src/auth.ts", ["auth"])
    expect(score).toBe(10)
  })

  it("文件名包含关键词得分中等", () => {
    const score = _calculateRelevanceScore("src/auth-service.ts", ["auth"])
    expect(score).toBe(5)
  })

  it("路径包含关键词得分较低", () => {
    const score = _calculateRelevanceScore("auth/index.ts", ["auth"])
    expect(score).toBe(2)
  })

  it("无匹配得分为零", () => {
    const score = _calculateRelevanceScore("src/utils.ts", ["auth"])
    expect(score).toBe(0)
  })
})

describe("parseFileReferences()", () => {
  it("解析单个 @file 引用", () => {
    const refs = _parseFileReferences("请查看 @file:src/index.ts 文件")
    expect(refs).toEqual(["src/index.ts"])
  })

  it("解析多个 @file 引用", () => {
    const refs = _parseFileReferences("@file:a.ts 和 @file:b.ts")
    expect(refs).toContain("a.ts")
    expect(refs).toContain("b.ts")
  })

  it("去重重复引用", () => {
    const refs = _parseFileReferences("@file:a.ts @file:a.ts")
    expect(refs).toEqual(["a.ts"])
  })

  it("无引用返回空数组", () => {
    const refs = _parseFileReferences("没有文件引用")
    expect(refs).toEqual([])
  })

  it("处理复杂路径", () => {
    const refs = _parseFileReferences("@file:src/components/Button.tsx")
    expect(refs).toEqual(["src/components/Button.tsx"])
  })
})

describe("injectSessionSummary()", () => {
  it("注入会话摘要", () => {
    const result = _injectSessionSummary("Base prompt", "Session summary")
    expect(result).toContain("Base prompt")
    expect(result).toContain(SESSION_SUMMARY_TAG_OPEN)
    expect(result).toContain("Session summary")
    expect(result).toContain(SESSION_SUMMARY_TAG_CLOSE)
  })

  it("空摘要不注入", () => {
    const result = _injectSessionSummary("Base prompt", "")
    expect(result).toBe("Base prompt")
  })

  it("空基础提示只返回摘要", () => {
    const result = _injectSessionSummary("", "Session summary")
    expect(result).toContain(SESSION_SUMMARY_TAG_OPEN)
    expect(result).toContain("Session summary")
  })
})

describe("ContextInjector 接口", () => {
  const injector = createContextInjector()

  it("selectRelevantFiles 方法可用", () => {
    const files = ["src/index.ts", "node_modules/x.js"]
    const result = injector.selectRelevantFiles(files, "index")
    expect(result).toContain("src/index.ts")
  })

  it("parseFileReferences 方法可用", () => {
    const refs = injector.parseFileReferences("@file:test.ts")
    expect(refs).toEqual(["test.ts"])
  })

  it("injectSessionSummary 方法可用", () => {
    const result = injector.injectSessionSummary("prompt", "summary")
    expect(result).toContain("summary")
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("注入器扩展属性测试", () => {
  /**
   * 属性 9: 上下文注入忽略模式
   * 验证需求: 4.5
   */
  describe("属性 9: 上下文注入忽略模式", () => {
    it("忽略模式中的文件不应出现在结果中", () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...DEFAULT_IGNORE_PATTERNS), { minLength: 1, maxLength: 3 }),
          fc.array(fc.stringMatching(/^[a-z]+\.(ts|js|py)$/), { minLength: 1, maxLength: 5 }),
          (ignorePatterns, normalFiles) => {
            // 创建包含忽略模式的文件列表
            const ignoredFiles = ignorePatterns.map(p => `${p}/index.js`)
            const allFiles = [...normalFiles, ...ignoredFiles]
            
            const result = _selectRelevantFiles(allFiles, "")
            
            // 忽略的文件不应出现在结果中
            for (const ignored of ignoredFiles) {
              if (result.includes(ignored)) {
                return false
              }
            }
            
            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * 属性 10: @file 语法解析
   * 验证需求: 4.2
   */
  describe("属性 10: @file 语法解析", () => {
    it("解析结果应该是唯一的文件路径", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z\/]+\.(ts|js|py)$/), { minLength: 1, maxLength: 5 }),
          (paths) => {
            // 构建包含 @file 引用的文本
            const text = paths.map(p => `@file:${p}`).join(" ")
            const result = _parseFileReferences(text)
            
            // 结果应该是唯一的
            const unique = new Set(result)
            return unique.size === result.length
          }
        ),
        { numRuns: 50 }
      )
    })

    it("解析结果应该包含所有引用的路径", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z]+\.(ts|js)$/), { minLength: 1, maxLength: 3 }),
          (paths) => {
            const uniquePaths = [...new Set(paths)]
            const text = uniquePaths.map(p => `@file:${p}`).join(" ")
            const result = _parseFileReferences(text)
            
            // 所有唯一路径都应该在结果中
            for (const p of uniquePaths) {
              if (!result.includes(p)) {
                return false
              }
            }
            
            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * 属性 11: 关键词匹配选择
   * 验证需求: 4.1
   */
  describe("属性 11: 关键词匹配选择", () => {
    // 停用词列表（与 extractKeywords 中的一致）
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "must", "shall",
      "can", "need", "dare", "ought", "used", "to", "of", "in",
      "for", "on", "with", "at", "by", "from", "as", "into",
      "through", "during", "before", "after", "above", "below",
      "between", "under", "again", "further", "then", "once",
      "here", "there", "when", "where", "why", "how", "all",
      "each", "few", "more", "most", "other", "some", "such",
      "no", "nor", "not", "only", "own", "same", "so", "than",
      "too", "very", "just", "and", "but", "if", "or", "because",
      "until", "while", "this", "that", "these", "those", "what",
      "which", "who", "whom", "whose", "it", "its", "i", "me",
      "my", "myself", "we", "our", "ours", "ourselves", "you",
      "your", "yours", "yourself", "yourselves", "he", "him",
      "his", "himself", "she", "her", "hers", "herself",
    ])

    it("文件名完全匹配应该排在前面", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]+$/),
          (keyword) => {
            // 跳过短词和停用词
            if (keyword.length < 3 || stopWords.has(keyword)) return true
            
            const files = [
              `src/other.ts`,
              `src/${keyword}.ts`,
              `lib/${keyword}-utils.ts`,
            ]
            
            const result = _selectRelevantFiles(files, keyword)
            
            // 完全匹配的文件应该排在第一位
            if (result.length > 0) {
              return result[0] === `src/${keyword}.ts`
            }
            
            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("相关性分数应该是非负的", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z\/]+\.(ts|js)$/),
          fc.array(fc.stringMatching(/^[a-z]+$/), { minLength: 1, maxLength: 3 }),
          (file, keywords) => {
            const validKeywords = keywords.filter(k => k.length >= 2)
            if (validKeywords.length === 0) return true
            
            const score = _calculateRelevanceScore(file, validKeywords)
            return score >= 0
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})
