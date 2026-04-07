import {
  type AnsiCode,
  ansiCodesToString,
  reduceAnsiCodes,
  tokenize,
  undoAnsiCodes,
} from '@alcalzone/ansi-tokenize'
import { stringWidth } from '../ink/stringWidth.js'

// A code is an "end code" if its code equals its endCode (e.g., hyperlink close)
function isEndCode(code: AnsiCode): boolean {
  return code.code === code.endCode
}

// Filter to only include "start codes" (not end codes)
function filterStartCodes(codes: AnsiCode[]): AnsiCode[] {
  return codes.filter(c => !isEndCode(c))
}

/**
 * Slice a string containing ANSI escape codes.
 *
 * Unlike the slice-ansi package, this properly handles OSC 8 hyperlink
 * sequences because @alcalzone/ansi-tokenize tokenizes them correctly.
 */
export default function sliceAnsi(
  str: string,
  start: number,
  end?: number,
): string {
  const tokens = tokenize(str)
  let activeCodes: AnsiCode[] = []
  let position = 0
  let result = ''
  let include = false

  for (const token of tokens) {
    const width =
      token.type === 'ansi' ? 0 : token.type === 'char' ? (token.fullWidth ? 2 : stringWidth(token.value)) : 0

    if (end !== undefined && position >= end) {
      if (token.type === 'ansi' || width > 0 || !include) break
    }

    if (token.type === 'ansi') {
      activeCodes.push(token)
      if (include) {
        result += token.code
      }
    } else if (token.type === 'char') {
      if (!include && position >= start) {
        if (start > 0 && width === 0) continue
        include = true
        activeCodes = filterStartCodes(reduceAnsiCodes(activeCodes))
        result = ansiCodesToString(activeCodes)
      }

      if (include) {
        result += token.value
      }

      position += width
    }
  }

  const activeStartCodes = filterStartCodes(reduceAnsiCodes(activeCodes))
  result += ansiCodesToString(undoAnsiCodes(activeStartCodes))
  return result
}
