#!/bin/bash
# Launcher script for sample.py (Bash version for Linux/macOS)

set -e

echo ""
echo "========================================"
echo "PyStacker Sample Program Launcher"
echo "========================================"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_PATH="$SCRIPT_DIR/sample.py"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 not found in PATH"
    echo "Please install Python 3.7+ and ensure it's in your PATH"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1)
echo "[OK] Python found: $PYTHON_VERSION"

# Check if sample.py exists
if [ ! -f "$SAMPLE_PATH" ]; then
    echo "[ERROR] sample.py not found at: $SAMPLE_PATH"
    exit 1
fi

echo "[OK] Sample script found: $SAMPLE_PATH"
echo ""
echo "========================================"
echo "Instructions:"
echo "  1. The program will start running in this terminal"
echo "  2. Right-click the terminal and choose the PyStacker capture command or use the Command Palette"
echo "  3. Or right-click and select 'Capture stack trace'"
echo "  4. You'll see all Python threads and their stacks!"
echo "========================================"
echo ""

echo "Starting program in 2 seconds..."
sleep 2

# Launch Python directly
python3 "$SAMPLE_PATH"