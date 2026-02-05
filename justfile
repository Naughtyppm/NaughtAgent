# NaughtyAgent 项目命令

# 显示帮助
help:
    @echo "NaughtyAgent 项目命令"

# 构建项目
build:
    @pnpm -C packages/agent build

# 运行测试
test:
    @pnpm -C packages/agent test

# 显示 Git 状态
status:
    @git status -sb

# 显示 Git 日志
log:
    @git log --oneline -10
