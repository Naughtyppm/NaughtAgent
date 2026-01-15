import { describe, it, expect } from 'vitest'
import {
  checkPermission,
  enforcePermission,
  createDefaultPermissions,
  mergePermissions,
  type PermissionSet,
  type PermissionRequest,
} from '../../src/permission/permission'

describe('Permission', () => {
  describe('checkPermission', () => {
    it('should allow when rule matches with allow action', () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'read', action: 'allow' }],
        default: 'deny',
      }

      const result = checkPermission(
        { type: 'read', resource: '/any/file.txt' },
        permissions
      )

      expect(result.allowed).toBe(true)
      expect(result.action).toBe('allow')
      expect(result.needsConfirmation).toBe(false)
    })

    it('should deny when rule matches with deny action', () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'bash', action: 'deny' }],
        default: 'allow',
      }

      const result = checkPermission(
        { type: 'bash', resource: 'rm -rf /' },
        permissions
      )

      expect(result.allowed).toBe(false)
      expect(result.action).toBe('deny')
      expect(result.needsConfirmation).toBe(false)
    })

    it('should require confirmation when rule matches with ask action', () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'write', action: 'ask' }],
        default: 'deny',
      }

      const result = checkPermission(
        { type: 'write', resource: '/some/file.txt' },
        permissions
      )

      expect(result.allowed).toBe(false)
      expect(result.action).toBe('ask')
      expect(result.needsConfirmation).toBe(true)
    })

    it('should use default when no rule matches', () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'read', action: 'allow' }],
        default: 'deny',
      }

      const result = checkPermission(
        { type: 'bash', resource: 'echo hello' },
        permissions
      )

      expect(result.allowed).toBe(false)
      expect(result.action).toBe('deny')
    })

    it('should match pattern with glob syntax', () => {
      const permissions: PermissionSet = {
        rules: [
          { type: 'read', action: 'ask', pattern: '**/.env*' },
          { type: 'read', action: 'allow' },
        ],
        default: 'deny',
      }

      // Should match .env pattern
      const envResult = checkPermission(
        { type: 'read', resource: 'config/.env.local' },
        permissions
      )
      expect(envResult.action).toBe('ask')

      // Should not match .env pattern
      const normalResult = checkPermission(
        { type: 'read', resource: 'src/index.ts' },
        permissions
      )
      expect(normalResult.action).toBe('allow')
    })

    it('should return matched rule', () => {
      const rule = { type: 'read' as const, action: 'allow' as const }
      const permissions: PermissionSet = {
        rules: [rule],
        default: 'deny',
      }

      const result = checkPermission(
        { type: 'read', resource: '/file.txt' },
        permissions
      )

      expect(result.matchedRule).toEqual(rule)
    })

    it('should match first rule in order', () => {
      const permissions: PermissionSet = {
        rules: [
          { type: 'read', action: 'deny', pattern: '**/secret*' },
          { type: 'read', action: 'allow' },
        ],
        default: 'deny',
      }

      const result = checkPermission(
        { type: 'read', resource: 'data/secret.txt' },
        permissions
      )

      expect(result.action).toBe('deny')
    })
  })

  describe('enforcePermission', () => {
    it('should return true for allow without calling callback', async () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'read', action: 'allow' }],
        default: 'deny',
      }

      let callbackCalled = false
      const result = await enforcePermission(
        { type: 'read', resource: '/file.txt' },
        permissions,
        async () => {
          callbackCalled = true
          return true
        }
      )

      expect(result).toBe(true)
      expect(callbackCalled).toBe(false)
    })

    it('should return false for deny without calling callback', async () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'bash', action: 'deny' }],
        default: 'allow',
      }

      let callbackCalled = false
      const result = await enforcePermission(
        { type: 'bash', resource: 'rm -rf /' },
        permissions,
        async () => {
          callbackCalled = true
          return true
        }
      )

      expect(result).toBe(false)
      expect(callbackCalled).toBe(false)
    })

    it('should call callback for ask and return its result', async () => {
      const permissions: PermissionSet = {
        rules: [{ type: 'write', action: 'ask' }],
        default: 'deny',
      }

      let receivedRequest: PermissionRequest | null = null

      // User confirms
      const allowResult = await enforcePermission(
        { type: 'write', resource: '/file.txt', description: 'Write file' },
        permissions,
        async (req) => {
          receivedRequest = req
          return true
        }
      )

      expect(allowResult).toBe(true)
      expect(receivedRequest?.resource).toBe('/file.txt')

      // User denies
      const denyResult = await enforcePermission(
        { type: 'write', resource: '/file.txt' },
        permissions,
        async () => false
      )

      expect(denyResult).toBe(false)
    })
  })

  describe('createDefaultPermissions', () => {
    it('should create build permissions', () => {
      const permissions = createDefaultPermissions('build')

      expect(permissions.default).toBe('ask')
      expect(permissions.rules.length).toBeGreaterThan(0)

      // Read should be allowed
      const readResult = checkPermission(
        { type: 'read', resource: 'src/index.ts' },
        permissions
      )
      expect(readResult.action).toBe('allow')

      // Write should ask
      const writeResult = checkPermission(
        { type: 'write', resource: 'src/index.ts' },
        permissions
      )
      expect(writeResult.action).toBe('ask')
    })

    it('should create plan permissions (read-only)', () => {
      const permissions = createDefaultPermissions('plan')

      expect(permissions.default).toBe('deny')

      // Read should be allowed
      const readResult = checkPermission(
        { type: 'read', resource: 'src/index.ts' },
        permissions
      )
      expect(readResult.action).toBe('allow')

      // Write should be denied
      const writeResult = checkPermission(
        { type: 'write', resource: 'src/index.ts' },
        permissions
      )
      expect(writeResult.action).toBe('deny')

      // Bash should be denied
      const bashResult = checkPermission(
        { type: 'bash', resource: 'echo hello' },
        permissions
      )
      expect(bashResult.action).toBe('deny')
    })

    it('should create explore permissions (read-only)', () => {
      const permissions = createDefaultPermissions('explore')

      expect(permissions.default).toBe('deny')

      // Read should be allowed
      const readResult = checkPermission(
        { type: 'read', resource: 'src/index.ts' },
        permissions
      )
      expect(readResult.action).toBe('allow')

      // Glob should be allowed
      const globResult = checkPermission(
        { type: 'glob', resource: '**/*.ts' },
        permissions
      )
      expect(globResult.action).toBe('allow')
    })
  })

  describe('mergePermissions', () => {
    it('should merge rules with override first', () => {
      const base: PermissionSet = {
        rules: [{ type: 'read', action: 'allow' }],
        default: 'deny',
      }

      const override: Partial<PermissionSet> = {
        rules: [{ type: 'read', action: 'ask', pattern: '**/.env*' }],
      }

      const merged = mergePermissions(base, override)

      // Override rule should come first
      expect(merged.rules[0].pattern).toBe('**/.env*')
      expect(merged.rules[1].action).toBe('allow')
    })

    it('should override default if provided', () => {
      const base: PermissionSet = {
        rules: [],
        default: 'deny',
      }

      const merged = mergePermissions(base, { default: 'allow' })

      expect(merged.default).toBe('allow')
    })

    it('should keep base default if not overridden', () => {
      const base: PermissionSet = {
        rules: [],
        default: 'deny',
      }

      const merged = mergePermissions(base, { rules: [] })

      expect(merged.default).toBe('deny')
    })
  })
})
