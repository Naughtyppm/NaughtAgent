# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.10.1] - 2026-04-07

### Fixed
- VSCode extension: 10 TypeScript type errors (`data` as `unknown` in API responses)
- VSCode extension: `sessionId` accessibility (private → public getter)
- Multi-session: message mixing across sessions (`sendIfSubscribed` isolation)
- Multi-session: stale `done` events captured by wrong `waitForRunCompletion` (`run_start` gate)
- Multi-session: new message hijacking old loop's `pendingInputResolver`
- SessionPicker: `clearAllSessions` response data destructuring

### Added
- ESLint + Prettier configuration (flat config)
- Multi-session support with WS subscribe/unsubscribe model
- `GET /sessions/:id/messages` API for background session sync
- `clearAllSessions` command with bulk delete UI
- `syncMessagesFromBackend()` for recovering background-completed replies
- `run_start` event for new task lifecycle signaling

### Removed
- Unused `@ai-sdk/anthropic` dependency
- Empty `planning/` directory

## [0.10.0] - 2026-04-01

### Added
- Initial release with CLI + VS Code extension + Daemon architecture
- Anthropic Claude integration via official SDK
- Tool system with 39 tools
- Subtask/sub-agent system
- MCP protocol support
- Session management
- Ink-based terminal UI (custom fork)
