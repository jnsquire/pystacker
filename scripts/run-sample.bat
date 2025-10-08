@echo off
REM Launcher script for sample.py (Windows batch version)

echo.
echo ========================================
echo PyStacker Sample Program Launcher
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "SAMPLE_PATH=%SCRIPT_DIR%sample.py"

REM Check if Python is available
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found in PATH
    echo Please install Python 3.7+ and ensure it's in your PATH
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [OK] Python found: %PYTHON_VERSION%

REM Check if sample.py exists
if not exist "%SAMPLE_PATH%" (
    echo [ERROR] sample.py not found at: %SAMPLE_PATH%
    exit /b 1
)

echo [OK] Sample script found: %SAMPLE_PATH%
echo.
echo ========================================
echo Instructions:
echo   1. The program will start running in this terminal
echo   2. Right-click the terminal and choose the PyStacker capture command or use the Command Palette
echo   3. Or right-click and select 'Capture stack trace'
echo   4. You'll see all Python threads and their stacks!
echo ========================================
echo.

echo Starting program in 2 seconds...
timeout /t 2 /nobreak >nul

REM Launch Python directly
python "%SAMPLE_PATH%"