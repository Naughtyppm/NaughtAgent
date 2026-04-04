/**
 * React Compiler Runtime Shim
 *
 * CC 使用了 React Compiler，编译后的代码会引用 `react/compiler-runtime` 中的 `c` 函数。
 * 该函数创建一个固定大小的数组用于 memoization 缓存。
 *
 * 这个 shim 提供了兼容实现，使 CC ink 代码无需修改即可运行。
 * 性能比 React Compiler 原生实现略低（没有编译器优化），但功能等价。
 */

const EMPTY = Symbol.for("react.memo_cache_sentinel")

/**
 * 创建一个 memoization 缓存数组
 *
 * React Compiler 的 `_c(n)` 创建一个长度为 n 的数组，
 * 每个槽初始化为 sentinel 值。编译后的组件用它来跳过不必要的重新计算。
 *
 * @param size - 缓存槽数量
 * @returns 初始化为 sentinel 的数组
 */
export function c(size: number): unknown[] {
  return new Array(size).fill(EMPTY)
}
