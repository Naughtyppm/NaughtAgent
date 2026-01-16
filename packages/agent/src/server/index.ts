/**
 * Server 模块
 *
 * HTTP API 和 WebSocket 接口
 */

// Types
export type {
  ServerConfig,
  CreateSessionRequest,
  SessionResponse,
  SendMessageRequest,
  MessageResponse,
  ToolCallRecord,
  StreamEvent,
  TextEvent,
  ToolStartEvent,
  ToolEndEvent,
  ErrorEvent,
  DoneEvent,
  PermissionRequestEvent,
  WSClientMessage,
  WSSendMessage,
  WSCancelMessage,
  WSPingMessage,
  WSPermissionResponse,
  WSServerMessage,
  WSPongMessage,
  ExecuteSkillRequest,
  SkillResponse,
  ErrorCode,
  ErrorResponse,
  HealthResponse,
} from "./types"

// Server
export { createServer, type Server } from "./server"

// Routes (for testing)
export { createRoutes } from "./routes"

// Middleware (for testing)
export {
  createAuthMiddleware,
  createCorsMiddleware,
  sendError,
  sendJson,
  parseBody,
  parseQuery,
  matchRoute,
} from "./middleware"

// WebSocket (for testing)
export { createWebSocketHandler } from "./websocket"
