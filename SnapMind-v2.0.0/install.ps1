# SnapMind 安装脚本 v2.0.06
# 用法: .\install.ps1

$ErrorActionPreference = "Stop"

Write-Host "🧠 SnapMind v2.0.06 安装程序" -ForegroundColor Cyan
Write-Host ""

# 检查 Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未找到 Python，请先安装 Python 3.10+" -ForegroundColor Red
    exit 1
}

# 安装 MCP 服务器
Write-Host ""
Write-Host "📦 安装 MCP 服务器..." -ForegroundColor Yellow
Push-Location mcp-server
pip install -e . --quiet
Pop-Location
Write-Host "✅ MCP 服务器安装完成" -ForegroundColor Green

# 复制配置到目标项目
Write-Host ""
Write-Host "📁 配置文件说明:" -ForegroundColor Yellow
Write-Host "  1. 将 .kiro 目录复制到你的项目根目录"
Write-Host "  2. 或合并 .kiro/settings/mcp.json 到现有配置"
Write-Host ""

Write-Host "✅ SnapMind v2.0.06 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 使用方法:" -ForegroundColor Cyan
Write-Host "  - 新会话开始时，AI 会自动加载记忆"
Write-Host "  - 说 '保存' 让 AI 保存当前工作快照"
Write-Host "  - 说 '健康度' 检查记忆系统状态"
Write-Host "  - 说 '导出记忆' 备份所有记忆"
