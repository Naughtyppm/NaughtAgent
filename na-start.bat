@echo off
chcp 65001 >nul
:: 设置 Copilot Proxy 环境变量
set ANTHROPIC_BASE_URL=http://localhost:4141
set ANTHROPIC_API_KEY=dummy

echo ============================================
echo   NaughtAgent - Copilot Proxy Mode
echo   模型切换: 输入 /model
echo   直接指定: na --model opus
echo ============================================
echo.

:: 启动交互式 REPL（standalone 模式确保 /model 可用）
na --standalone %*
