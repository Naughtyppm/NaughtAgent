/**
 * Permission 模块导出
 */

export {
  type PermissionType,
  type PermissionAction,
  type PermissionRule,
  type PermissionSet,
  type PermissionRequest,
  type PermissionResult,
  type ConfirmCallback,
  checkPermission,
  enforcePermission,
  createDefaultPermissions,
  mergePermissions,
} from "./permission"
