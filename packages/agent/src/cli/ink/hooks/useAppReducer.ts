/**
 * useAppReducer Hook
 *
 * 将 App.tsx 的 15+ useState 合并为统一的 useReducer，
 * 单次 dispatch 批量更新所有相关状态，避免级联重渲染。
 *
 * 状态分为 4 个域：
 * - 运行时域：activeView, status, stepCount, tokenUsage
 * - UI 域：showHelp, expandedTools, selectedToolId, inputHistory
 * - 配置域：currentModel, autoConfirm
 * - 权限域：pendingPermission
 *
 * 核心优化：
 * - 一个 Runner 事件 → 一个 dispatch → 一次重渲染（原来可能触发 3-5 次）
 * - activeView 状态机确保同一时间只有一个主要动态区域
 * - 批量 action（TOOL_START, TASK_DONE 等）原子更新多个状态字段
 */

import { useReducer } from 'react'
import type {
  AppReducerState,
  AppAction,
} from '../types.js'

/**
 * 创建初始状态
 */
export function createInitialState(model: string, autoConfirm: boolean): AppReducerState {
  return {
    // 运行时域
    activeView: 'idle',
    status: 'idle',
    statusMessage: '',
    statusDetail: '',
    stepCount: 0,
    tokenUsage: undefined,
    // UI 域
    showHelp: false,
    expandedTools: new Set(),
    selectedToolId: null,
    inputHistory: [],
    // 配置域
    currentModel: model,
    autoConfirm,
    // 权限域
    pendingPermission: null,
  }
}

/**
 * App Reducer — 所有状态变更的唯一入口
 *
 * 设计原则：
 * 1. 批量 action 原子更新多个字段，避免级联 setState
 * 2. activeView 状态机控制渲染焦点
 * 3. 纯函数，无副作用
 */
export function appReducer(state: AppReducerState, action: AppAction): AppReducerState {
  switch (action.type) {
    // ========== 运行时 actions ==========
    case 'SET_STATUS':
      return {
        ...state,
        status: action.status,
        statusMessage: action.message,
        statusDetail: action.detail,
      }

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view }

    case 'INCREMENT_STEP':
      return { ...state, stepCount: state.stepCount + 1 }

    case 'SET_TOKEN_USAGE':
      return { ...state, tokenUsage: action.usage }

    case 'RESET_RUNTIME':
      return {
        ...state,
        activeView: 'idle',
        status: 'idle',
        statusMessage: '',
        statusDetail: '',
        stepCount: 0,
      }

    // ========== UI actions ==========
    case 'TOGGLE_HELP':
      return { ...state, showHelp: action.show ?? !state.showHelp }

    case 'TOGGLE_TOOL': {
      const next = new Set(state.expandedTools)
      if (next.has(action.toolId)) {
        next.delete(action.toolId)
      } else {
        next.add(action.toolId)
      }
      return { ...state, expandedTools: next }
    }

    case 'TOGGLE_ALL_TOOLS': {
      const hasExpanded = action.toolIds.some(id => state.expandedTools.has(id))
      return {
        ...state,
        expandedTools: hasExpanded ? new Set() : new Set(action.toolIds),
      }
    }

    case 'SELECT_TOOL':
      return { ...state, selectedToolId: action.toolId }

    case 'ADD_INPUT_HISTORY':
      return { ...state, inputHistory: [...state.inputHistory, action.input] }

    // ========== 配置 actions ==========
    case 'SET_MODEL':
      return { ...state, currentModel: action.model }

    case 'SET_AUTO_CONFIRM':
      return { ...state, autoConfirm: action.value }

    // ========== 权限 actions ==========
    case 'SET_PENDING_PERMISSION':
      return { ...state, pendingPermission: action.request }

    // ========== 批量 actions（Runner 事件的原子更新） ==========
    case 'STREAM_START':
      return {
        ...state,
        activeView: 'streaming',
        status: action.status,
        statusMessage: action.message,
        statusDetail: action.detail,
      }

    case 'TOOL_START':
      return {
        ...state,
        activeView: 'tool_execution',
        status: action.status,
        statusMessage: action.message,
        statusDetail: action.detail,
        stepCount: state.stepCount + 1,
        selectedToolId: action.toolId,
      }

    case 'TOOL_END':
      return {
        ...state,
        status: action.status,
        statusMessage: action.message,
        statusDetail: action.detail,
      }

    case 'TASK_DONE': {
      return {
        ...state,
        activeView: 'idle',
        status: 'idle',
        statusMessage: '',
        statusDetail: '',
        stepCount: 0,
        tokenUsage: action.usage ?? state.tokenUsage,
      }
    }

    default:
      return state
  }
}

/**
 * useAppReducer Hook
 *
 * 提供统一的状态管理和 dispatch 接口
 */
export function useAppReducer(model: string, autoConfirm: boolean) {
  const [state, dispatch] = useReducer(
    appReducer,
    { model, autoConfirm },
    (init) => createInitialState(init.model, init.autoConfirm),
  )

  return { state, dispatch }
}

// 导出内部函数用于测试
export { appReducer as _appReducer, createInitialState as _createInitialState }
