import { describe, it, expect } from "vitest"
import {
  generateUnifiedDiff,
  generateFileChange,
  formatDiffForTerminal,
  formatChangeSummary,
  createDiffGenerator,
} from "../../src/ux/diff"

describe("Diff", () => {
  describe("generateUnifiedDiff", () => {
    it("should generate diff for simple change", () => {
      const oldContent = "line1\nline2\nline3"
      const newContent = "line1\nmodified\nline3"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("--- a/test.txt")
      expect(diff).toContain("+++ b/test.txt")
      expect(diff).toContain("-line2")
      expect(diff).toContain("+modified")
    })

    it("should generate diff for addition", () => {
      const oldContent = "line1\nline2"
      const newContent = "line1\nline2\nline3"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("+line3")
    })

    it("should generate diff for deletion", () => {
      const oldContent = "line1\nline2\nline3"
      const newContent = "line1\nline3"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("-line2")
    })

    it("should handle empty old content (new file)", () => {
      const oldContent = ""
      const newContent = "line1\nline2"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("+line1")
      expect(diff).toContain("+line2")
    })

    it("should handle empty new content (deleted file)", () => {
      const oldContent = "line1\nline2"
      const newContent = ""

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("-line1")
      expect(diff).toContain("-line2")
    })

    it("should return minimal diff for identical content", () => {
      const content = "line1\nline2\nline3"

      const diff = generateUnifiedDiff(content, content, "test.txt")

      // Should only have headers, no hunks
      expect(diff).toContain("--- a/test.txt")
      expect(diff).toContain("+++ b/test.txt")
      expect(diff).not.toContain("@@")
    })

    it("should include context lines", () => {
      const oldContent = "a\nb\nc\nd\ne\nf\ng"
      const newContent = "a\nb\nc\nX\ne\nf\ng"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt", { contextLines: 2 })

      // Should include context around the change
      expect(diff).toContain(" b")
      expect(diff).toContain(" c")
      expect(diff).toContain("-d")
      expect(diff).toContain("+X")
      expect(diff).toContain(" e")
      expect(diff).toContain(" f")
    })

    it("should handle multiple changes", () => {
      const oldContent = "a\nb\nc\nd\ne"
      const newContent = "A\nb\nc\nd\nE"

      const diff = generateUnifiedDiff(oldContent, newContent, "test.txt")

      expect(diff).toContain("-a")
      expect(diff).toContain("+A")
      expect(diff).toContain("-e")
      expect(diff).toContain("+E")
    })
  })

  describe("generateFileChange", () => {
    it("should detect create operation", () => {
      const change = generateFileChange("new.txt", null, "content")

      expect(change.changeType).toBe("create")
      expect(change.filePath).toBe("new.txt")
      expect(change.oldContent).toBeUndefined()
      expect(change.newContent).toBe("content")
    })

    it("should detect modify operation", () => {
      const change = generateFileChange("file.txt", "old", "new")

      expect(change.changeType).toBe("modify")
      expect(change.oldContent).toBe("old")
      expect(change.newContent).toBe("new")
    })

    it("should detect delete operation", () => {
      const change = generateFileChange("file.txt", "content", null)

      expect(change.changeType).toBe("delete")
      expect(change.oldContent).toBe("content")
      expect(change.newContent).toBeUndefined()
    })

    it("should calculate stats correctly", () => {
      const change = generateFileChange(
        "file.txt",
        "line1\nline2\nline3",
        "line1\nmodified\nline3\nnew"
      )

      expect(change.stats.additions).toBe(2) // modified, new
      expect(change.stats.deletions).toBe(1) // line2
    })

    it("should include unified diff", () => {
      const change = generateFileChange("file.txt", "old", "new")

      expect(change.unifiedDiff).toContain("--- a/file.txt")
      expect(change.unifiedDiff).toContain("+++ b/file.txt")
    })
  })

  describe("formatDiffForTerminal", () => {
    it("should add colors to diff", () => {
      const diff = "--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old\n+new"

      const formatted = formatDiffForTerminal(diff, true)

      // Should contain ANSI codes
      expect(formatted).toContain("\x1b[")
    })

    it("should not add colors when disabled", () => {
      const diff = "--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old\n+new"

      const formatted = formatDiffForTerminal(diff, false)

      // Should not contain ANSI codes
      expect(formatted).not.toContain("\x1b[")
      expect(formatted).toBe(diff)
    })

    it("should color additions green", () => {
      const diff = "+added line"
      const formatted = formatDiffForTerminal(diff, true)

      expect(formatted).toContain("\x1b[32m") // green
    })

    it("should color deletions red", () => {
      const diff = "-deleted line"
      const formatted = formatDiffForTerminal(diff, true)

      expect(formatted).toContain("\x1b[31m") // red
    })
  })

  describe("formatChangeSummary", () => {
    it("should format create summary", () => {
      const change = generateFileChange("new.txt", null, "content\nline2")
      const summary = formatChangeSummary(change, false)

      expect(summary).toContain("[CREATE]")
      expect(summary).toContain("new.txt")
    })

    it("should format modify summary", () => {
      const change = generateFileChange("file.txt", "old", "new")
      const summary = formatChangeSummary(change, false)

      expect(summary).toContain("[MODIFY]")
      expect(summary).toContain("file.txt")
    })

    it("should format delete summary", () => {
      const change = generateFileChange("file.txt", "content", null)
      const summary = formatChangeSummary(change, false)

      expect(summary).toContain("[DELETE]")
      expect(summary).toContain("file.txt")
    })

    it("should include stats", () => {
      const change = generateFileChange("file.txt", "a\nb", "a\nb\nc")
      const summary = formatChangeSummary(change, false)

      expect(summary).toContain("+1")
      expect(summary).toContain("-0")
    })
  })

  describe("createDiffGenerator", () => {
    it("should create generator with all methods", () => {
      const generator = createDiffGenerator()

      expect(generator.generateUnifiedDiff).toBeDefined()
      expect(generator.generateFileChange).toBeDefined()
      expect(generator.formatForTerminal).toBeDefined()
      expect(generator.formatSummary).toBeDefined()
    })

    it("should work correctly", () => {
      const generator = createDiffGenerator()

      const diff = generator.generateUnifiedDiff("old", "new", "test.txt")
      expect(diff).toContain("--- a/test.txt")

      const change = generator.generateFileChange("test.txt", "old", "new")
      expect(change.changeType).toBe("modify")
    })
  })
})
