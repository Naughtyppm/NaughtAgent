/**
 * CC Ink 适配层类型声明
 *
 * cc-ink/ 被 tsconfig exclude，此 .d.ts 为消费者提供类型。
 * 类型签名对齐 ink@5 npm 包的公共 API（NA 组件实际使用的子集）。
 */

import type { ReactNode, JSX } from "react"

// ─── render ────────────────────────────────────────────

export interface RenderOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream
  stderr?: NodeJS.WriteStream
  exitOnCtrlC?: boolean
  patchConsole?: boolean
}

export interface Instance {
  rerender: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
  cleanup: () => void
}

export interface Root {
  render: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

export function render(
  node: ReactNode,
  options?: RenderOptions,
): Promise<Instance>

export function createRoot(options?: RenderOptions): Promise<Root>

// ─── Box ───────────────────────────────────────────────

export interface BoxProps {
  readonly flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  readonly flexGrow?: number
  readonly flexShrink?: number
  readonly flexBasis?: number | string
  readonly alignItems?: "flex-start" | "center" | "flex-end" | "stretch"
  readonly alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch"
  readonly justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
  readonly width?: number | string
  readonly height?: number | string
  readonly minWidth?: number | string
  readonly minHeight?: number | string
  readonly padding?: number
  readonly paddingX?: number
  readonly paddingY?: number
  readonly paddingTop?: number
  readonly paddingBottom?: number
  readonly paddingLeft?: number
  readonly paddingRight?: number
  readonly margin?: number
  readonly marginX?: number
  readonly marginY?: number
  readonly marginTop?: number
  readonly marginBottom?: number
  readonly marginLeft?: number
  readonly marginRight?: number
  readonly gap?: number
  readonly columnGap?: number
  readonly rowGap?: number
  readonly borderStyle?: "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic" | "arrow"
  readonly borderColor?: string
  readonly borderTop?: boolean
  readonly borderBottom?: boolean
  readonly borderLeft?: boolean
  readonly borderRight?: boolean
  readonly overflow?: "visible" | "hidden"
  readonly children?: ReactNode
}

export function Box(props: BoxProps): JSX.Element

// ─── Text ──────────────────────────────────────────────

export interface TextProps {
  readonly color?: string
  readonly backgroundColor?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly dimColor?: boolean
  readonly inverse?: boolean
  readonly wrap?: "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end"
  readonly children?: ReactNode
}

export function Text(props: TextProps): JSX.Element

// ─── Newline / Spacer ──────────────────────────────────

export interface NewlineProps {
  readonly count?: number
}

export function Newline(props?: NewlineProps): JSX.Element
export function Spacer(props?: Record<string, never>): JSX.Element

// ─── useInput ──────────────────────────────────────────

export interface Key {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean
}

export function useInput(
  inputHandler: (input: string, key: Key) => void,
  options?: { isActive?: boolean },
): void

// ─── useApp / useStdin ─────────────────────────────────

export function useApp(): { exit: (error?: Error) => void }

export function useStdin(): {
  stdin: NodeJS.ReadStream
  setRawMode: (mode: boolean) => void
  isRawModeSupported: boolean
}
