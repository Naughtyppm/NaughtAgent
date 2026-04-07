@echo off
echo === Building VSCode Extension ===
cd /d "%~dp0packages\vscode"
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)
echo.
echo === Build OK ===
echo.
echo To test the extension:
echo   1. Open VS Code in this folder: code packages\vscode
echo   2. Press F5 to launch Extension Development Host
echo   3. Open the NaughtyAgent panel from the Activity Bar
echo.
echo Or install directly:
echo   cd packages\vscode
echo   npx vsce package
echo   code --install-extension naughtyagent-0.2.0.vsix
echo.
pause
