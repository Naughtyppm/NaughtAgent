/**
 * 默认全局 Justfile 模板
 */

export const DEFAULT_JUSTFILE = `# NaughtyAgent 全局命令
# 这些命令在任意目录下都可用
# 位置: ~/.naughtyagent/justfile

# Windows 兼容：使用 cmd
set windows-shell := ["cmd.exe", "/c"]

# 默认命令：显示帮助
default:
    @just --list

# ============================================
# 系统命令
# ============================================

# 显示 NaughtyAgent 版本
version:
    @naughtyagent --version

# 打开配置目录
[windows]
config:
    @explorer "%USERPROFILE%\\.naughtyagent"

[unix]
config:
    @open ~/.naughtyagent 2>/dev/null || xdg-open ~/.naughtyagent 2>/dev/null || echo "请手动打开目录: ~/.naughtyagent"

# 检查更新
update:
    @echo "检查 NaughtyAgent 更新..."
    @npm view @naughtyagent/agent version

# 显示帮助信息
help:
    @echo "NaughtyAgent 全局命令"
    @echo ""
    @echo "系统命令:"
    @echo "  version  - 显示版本"
    @echo "  config   - 打开配置目录"
    @echo "  update   - 检查更新"
    @echo "  help     - 显示帮助"
    @echo ""
    @echo "开发命令:"
    @echo "  init     - 初始化项目"
    @echo "  status   - 显示 Git 状态"
    @echo ""
    @just --list

# ============================================
# 开发命令
# ============================================

# 初始化项目（生成 Naughty.md）
# 注意：此命令需要在 naughtyagent 交互模式中使用 /init
init:
    @echo 请启动 naughtyagent 后使用 /init 命令生成项目规范文档
    @echo 或直接运行: naughtyagent 然后输入 /init

# 显示 Git 状态
status:
    @git status -sb

# 显示 Git 日志
log:
    @git log --oneline -10

# ============================================
# 快捷命令
# ============================================

# 清屏
[windows]
cls:
    @cls

[unix]
cls:
    @clear

# 显示当前目录
[windows]
pwd:
    @cd

[unix]
pwd:
    @pwd

# 显示目录内容
[windows]
ls:
    @dir

[unix]
ls:
    @ls -la
`
