/**
 * NotebookEdit 工具
 *
 * 操作 Jupyter Notebook (.ipynb) 文件的 cell：
 * - replace: 替换指定 cell 的内容
 * - insert: 在指定位置插入新 cell
 * - delete: 删除指定位置的 cell
 *
 * 直接解析 .ipynb JSON，不依赖外部包。
 */

import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"

/** Notebook cell 结构 */
interface NotebookCell {
  cell_type: "code" | "markdown" | "raw"
  source: string[]
  metadata: Record<string, unknown>
  outputs?: unknown[]
  execution_count?: number | null
}

/** .ipynb 顶层结构 */
interface NotebookDocument {
  cells: NotebookCell[]
  metadata: Record<string, unknown>
  nbformat: number
  nbformat_minor: number
}

/**
 * 将字符串内容转换为 source 行数组
 *
 * .ipynb 的 source 字段是行数组，每行（除最后一行外）以 \n 结尾。
 */
function contentToSourceLines(content: string): string[] {
  if (content === "") return []

  const lines = content.split("\n")
  return lines.map((line, i) => {
    // 除最后一行外，每行末尾加 \n
    return i < lines.length - 1 ? line + "\n" : line
  })
}

/**
 * 将 source 行数组转换回字符串（用于显示）
 */
function sourceLinesToContent(source: string[]): string {
  return source.join("")
}

/**
 * 创建一个空 cell
 */
function createEmptyCell(
  cellType: "code" | "markdown",
  source: string[]
): NotebookCell {
  const cell: NotebookCell = {
    cell_type: cellType,
    source,
    metadata: {},
  }

  if (cellType === "code") {
    cell.outputs = []
    cell.execution_count = null
  }

  return cell
}

const DESCRIPTION = `Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source.

Usage:
- notebook_path must be an absolute path to a .ipynb file
- cell_number is 0-indexed
- edit_mode=replace (default): replaces the cell content at cell_number
- edit_mode=insert: inserts a new cell at the position specified by cell_number
- edit_mode=delete: deletes the cell at cell_number (new_source is ignored)
- cell_type defaults to the existing cell's type for replace, required for insert`

export const NotebookEditTool = Tool.define({
  id: "notebook_edit",
  description: DESCRIPTION,
  parameters: z.object({
    notebook_path: z
      .string()
      .describe("The absolute path to the Jupyter notebook file to edit"),
    new_source: z
      .string()
      .describe("The new source content for the cell"),
    cell_number: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("The 0-indexed cell number to operate on (default 0)"),
    cell_type: z
      .enum(["code", "markdown"])
      .optional()
      .describe(
        "The cell type. Required for insert mode, optional for replace (defaults to existing type)"
      ),
    edit_mode: z
      .enum(["replace", "insert", "delete"])
      .optional()
      .describe("The edit mode: replace (default), insert, or delete"),
  }),

  async execute(params, ctx) {
    const notebookPath = resolvePath(params.notebook_path, ctx.cwd)
    const title = path.basename(notebookPath)
    const cellNumber = params.cell_number ?? 0
    const editMode = params.edit_mode ?? "replace"

    // 验证文件扩展名
    if (!notebookPath.endsWith(".ipynb")) {
      throw new Error(
        `Not a Jupyter notebook file (expected .ipynb): ${notebookPath}`
      )
    }

    // 读取并解析 notebook 文件
    let rawContent: string
    try {
      rawContent = await fs.readFile(notebookPath, "utf-8")
    } catch {
      throw new Error(`Notebook file not found: ${notebookPath}`)
    }

    let notebook: NotebookDocument
    try {
      notebook = JSON.parse(rawContent) as NotebookDocument
    } catch {
      throw new Error(
        `Failed to parse notebook JSON: ${notebookPath}`
      )
    }

    // 基本结构验证
    if (!Array.isArray(notebook.cells)) {
      throw new Error(
        `Invalid notebook: missing "cells" array in ${notebookPath}`
      )
    }

    const totalCells = notebook.cells.length
    const sourceLines = contentToSourceLines(params.new_source)

    let output: string

    switch (editMode) {
      case "replace": {
        // 替换：cell_number 必须在范围内
        if (cellNumber >= totalCells) {
          throw new Error(
            `cell_number ${cellNumber} out of range. Notebook has ${totalCells} cell(s) (0-indexed).`
          )
        }

        const existingCell = notebook.cells[cellNumber]
        const oldContent = sourceLinesToContent(existingCell.source)
        const newCellType = params.cell_type ?? existingCell.cell_type

        // 如果 cell_type 改变了，重建 cell 结构
        if (newCellType !== existingCell.cell_type) {
          notebook.cells[cellNumber] = createEmptyCell(
            newCellType as "code" | "markdown",
            sourceLines
          )
        } else {
          existingCell.source = sourceLines
          // code cell 替换后清空 outputs 和 execution_count
          if (existingCell.cell_type === "code") {
            existingCell.outputs = []
            existingCell.execution_count = null
          }
        }

        output = `Replaced cell ${cellNumber} (${newCellType}) in ${title}\n`
        output += `Old content (${oldContent.length} chars):\n${truncate(oldContent, 200)}\n`
        output += `New content (${params.new_source.length} chars):\n${truncate(params.new_source, 200)}`
        break
      }

      case "insert": {
        // 插入：cell_number 可以等于 totalCells（表示追加到末尾）
        if (cellNumber > totalCells) {
          throw new Error(
            `cell_number ${cellNumber} out of range for insert. Valid range: 0-${totalCells}.`
          )
        }

        // insert 模式必须指定 cell_type
        const insertType = params.cell_type
        if (!insertType) {
          throw new Error(
            "cell_type is required when edit_mode is 'insert'"
          )
        }

        const newCell = createEmptyCell(insertType, sourceLines)
        notebook.cells.splice(cellNumber, 0, newCell)

        output = `Inserted new ${insertType} cell at position ${cellNumber} in ${title}\n`
        output += `Content (${params.new_source.length} chars):\n${truncate(params.new_source, 200)}\n`
        output += `Notebook now has ${notebook.cells.length} cell(s).`
        break
      }

      case "delete": {
        // 删除：cell_number 必须在范围内
        if (cellNumber >= totalCells) {
          throw new Error(
            `cell_number ${cellNumber} out of range. Notebook has ${totalCells} cell(s) (0-indexed).`
          )
        }

        if (totalCells <= 1) {
          throw new Error(
            "Cannot delete the last remaining cell in the notebook."
          )
        }

        const deletedCell = notebook.cells[cellNumber]
        const deletedContent = sourceLinesToContent(deletedCell.source)
        notebook.cells.splice(cellNumber, 1)

        output = `Deleted cell ${cellNumber} (${deletedCell.cell_type}) from ${title}\n`
        output += `Deleted content (${deletedContent.length} chars):\n${truncate(deletedContent, 200)}\n`
        output += `Notebook now has ${notebook.cells.length} cell(s).`
        break
      }

      default:
        throw new Error(`Unknown edit_mode: ${editMode}`)
    }

    // 写回文件（保持 2 空格缩进 + 尾部换行，与 Jupyter 默认格式一致）
    const updatedContent = JSON.stringify(notebook, null, 1) + "\n"
    await fs.writeFile(notebookPath, updatedContent, "utf-8")

    return {
      title,
      output,
      metadata: {
        editMode,
        cellNumber,
        totalCells: notebook.cells.length,
      },
    }
  },
})

/**
 * 截断文本用于显示
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.substring(0, maxLen) + "... (truncated)"
}
