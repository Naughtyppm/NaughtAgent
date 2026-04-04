@echo off
setlocal

set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set REPO_ROOT=%%~fI

REM Default values for your proxy setup
set PROXY_BASE_URL=http://127.0.0.1:7897
set MODEL=opus-4.5
set API_KEY=copilot-proxy-key
set PORT=31415

set ANTHROPIC_API_KEY=%API_KEY%
set ANTHROPIC_BASE_URL=%PROXY_BASE_URL%

echo.
echo [1/5] Build agent...
cd /d "%REPO_ROOT%"
call pnpm -C packages/agent build
if errorlevel 1 goto :failed
REM 验证构建产物存在
if not exist "packages\agent\dist\cli\cli.js" (
  echo [ERROR] Build output not found: packages\agent\dist\cli\cli.js
  goto :failed
)

echo.
echo [2/5] Restart daemon...
REM 先强制停止旧 daemon（忽略错误）
call node packages/agent/dist/cli/cli.js --port %PORT% daemon stop >nul 2>nul
REM 等待旧进程释放端口
timeout /t 3 >nul
REM 启动新 daemon（使用绝对路径确保加载最新代码）
start "NA-Daemon" /b node "%REPO_ROOT%\packages\agent\dist\cli\cli.js" --model %MODEL% --port %PORT% daemon start
timeout /t 3 >nul
call node packages/agent/dist/cli/cli.js --port %PORT% daemon status
if errorlevel 1 goto :failed

echo.
echo [3/5] Build VSCode extension...
cd /d "%REPO_ROOT%\packages\vscode"
call npm run build
if errorlevel 1 goto :failed

echo.
echo [4/5] Launch Extension Development Host...
start "VSCode-Extension-Host" code --extensionDevelopmentPath "%REPO_ROOT%\packages\vscode" "%REPO_ROOT%"

echo.
echo [5/5] Done.
echo In new VS Code window, run command: NaughtyAgent: 打开 AI 助手
echo Proxy: %ANTHROPIC_BASE_URL%
echo Model: %MODEL%
goto :success

:failed
set EXIT_CODE=%ERRORLEVEL%
if "%EXIT_CODE%"=="0" set EXIT_CODE=1

echo.
echo [ERROR] Script failed with code %EXIT_CODE%
pause
exit /b %EXIT_CODE%

:success
echo.
echo [OK] Finished.
pause
exit /b 0
