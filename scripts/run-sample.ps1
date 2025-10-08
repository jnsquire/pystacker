#!/usr/bin/env pwsh
# Launcher script for sample.py
# This script launches the sample Python program and displays helpful information

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PyStacker Sample Program Launcher" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Get the directory where this script is located
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$samplePath = Join-Path $scriptDir "sample.py"

# Check if Python is available
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[OK] Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Python not found in PATH" -ForegroundColor Red
    Write-Host "  Please install Python 3.7+ and ensure it's in your PATH" -ForegroundColor Yellow
    exit 1
}

# Check if sample.py exists
if (-not (Test-Path $samplePath)) {
    Write-Host "[ERROR] sample.py not found at: $samplePath" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Sample script found: $samplePath" -ForegroundColor Green
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Instructions:" -ForegroundColor Yellow
Write-Host "  1. The program will start running in this terminal" -ForegroundColor White
Write-Host "  2. Right-click the terminal and choose the PyStacker capture command or use the Command Palette" -ForegroundColor White
Write-Host "  3. Or right-click and select 'Capture stack trace'" -ForegroundColor White
Write-Host "  4. You'll see all Python threads and their stacks!" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Starting program in 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Launch Python directly (not through a shell)
& python $samplePath