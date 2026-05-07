#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting Dance Analysis Backend Server..."
echo ""

# Prefer project venv so pip installs and the server use the same interpreter.
if [ -x "$SCRIPT_DIR/.venv/bin/python3" ]; then
    PYTHON_CMD="$SCRIPT_DIR/.venv/bin/python3"
elif [ -x "$SCRIPT_DIR/venv/bin/python3" ]; then
    PYTHON_CMD="$SCRIPT_DIR/venv/bin/python3"
else
    PYTHON_CMD="python3"
    if ! command -v python3 &>/dev/null; then
        echo "Python 3 not found"
        echo "   Please install Python 3: brew install python3"
        exit 1
    fi
    echo "[WARN] No backend/.venv — using: $(command -v python3)"
    echo "       MediaPipe/deps may be missing if you installed with a different pip."
    echo "       Run once: ./setup-venv.sh"
    echo ""
fi

# Ensure runtime directories exist
mkdir -p data storage/actual storage/tries storage/compressed_cache

# Start the FastAPI server using uvicorn
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-5000}
echo "Using Python: $PYTHON_CMD"
echo "Starting FastAPI server on http://${HOST}:${PORT}"
echo "   Using MediaPipe-based pose analysis"
echo "   Press Ctrl+C to stop"
echo ""
exec "$PYTHON_CMD" -m uvicorn api.main:app --host "$HOST" --port "$PORT"


