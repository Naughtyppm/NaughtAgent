#!/bin/bash
# NaughtAgent 模型切换测试脚本
# 用法: bash test-model.sh

echo "============================================"
echo "  NaughtyAgent 模型切换测试"
echo "============================================"
echo ""

# 确保环境变量
export ANTHROPIC_BASE_URL="http://localhost:4141"
export ANTHROPIC_API_KEY="dummy"

# 杀掉旧 daemon
rm -f "$HOME/.naughtyagent/daemon.pid" 2>/dev/null

echo "【测试 1】standalone REPL 模式（支持 /model 交互切换）"
echo "  启动命令: na --standalone"
echo "  进入后输入 /model 会弹出交互式选择器"
echo "  也可以 /model opus 直接切换"
echo ""

echo "【测试 2】命令行直接指定模型（daemon 模式）"
echo "  测试 opus..."
echo "Reply OK" | timeout 30 na --model opus -y 2>&1 | head -15
echo ""

echo "  测试 sonnet..."
echo "Reply OK" | timeout 30 na --model sonnet -y 2>&1 | head -15
echo ""

echo "【测试 3】standalone + 指定模型"
echo "  测试 opus standalone..."
echo "Reply OK" | timeout 30 na --standalone --model opus -y 2>&1 | head -15
echo ""

echo "============================================"
echo "  使用方式总结"
echo "============================================"
echo ""
echo "  交互式 REPL（可用 /model 切换）:"
echo "    na --standalone"
echo ""
echo "  单次对话（daemon 模式）:"
echo "    na --model opus \"你的问题\""
echo "    na -m claude-opus-4.6 \"你的问题\""
echo ""
echo "  可用模型简写:"
echo "    sonnet     → claude-sonnet-4"
echo "    sonnet-4.5 → claude-sonnet-4.5"
echo "    sonnet-4.6 → claude-sonnet-4.6"
echo "    opus       → claude-opus-4.6"
echo "    opus-4.5   → claude-opus-4.5"
echo "    haiku      → claude-haiku-4.5"
echo ""
