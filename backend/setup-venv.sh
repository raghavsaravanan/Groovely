#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# MediaPipe classic pose code uses `mediapipe.solutions`. Wheels for Python 3.14+
# may ship a tasks-only package without `solutions`. Prefer 3.11 (matches Dockerfile).
pick_venv_python() {
    if [ -n "${GROOVELY_PYTHON:-}" ] && command -v "${GROOVELY_PYTHON}" &>/dev/null; then
        echo "${GROOVELY_PYTHON}"
        return
    fi
    for cand in python3.11 python3.12 python3; do
        if command -v "$cand" &>/dev/null; then
            echo "$cand"
            return
        fi
    done
    return 1
}

mediapipe_has_solutions() {
    ./.venv/bin/python3 -c "import mediapipe as m; raise SystemExit(0 if hasattr(m, 'solutions') else 1)" 2>/dev/null
}

if ! VENV_PY="$(pick_venv_python)"; then
    echo "No python3 found. Install Python 3.11+ (e.g. brew install python@3.11)."
    exit 1
fi

if [ -d .venv ] && ! mediapipe_has_solutions; then
    echo "Removing backend/.venv: MediaPipe here has no solutions API (wrong Python or wheel)."
    echo "Recreating with: $VENV_PY"
    rm -rf .venv
fi

if [ ! -d .venv ]; then
    echo "Creating backend/.venv with $VENV_PY ..."
    "$VENV_PY" -m venv .venv
fi

echo "Installing dependencies from requirements.txt ..."
./.venv/bin/python3 -m pip install -U pip setuptools wheel
./.venv/bin/python3 -m pip install -r requirements.txt

if ! mediapipe_has_solutions; then
    echo ""
    echo "MediaPipe does not expose mp.solutions in this venv (pose analysis will not work)."
    echo "Use Python 3.11 or 3.12, then remove the venv and re-run this script:"
    echo "  brew install python@3.11"
    echo "  rm -rf \"$SCRIPT_DIR/.venv\" && \"$SCRIPT_DIR/setup-venv.sh\""
    exit 1
fi

echo ""
echo "Done. Start the API with:"
echo "  cd $(pwd) && ./start.sh"
echo "Or explicitly:"
echo "  ./.venv/bin/python3 -m uvicorn api.main:app --host 0.0.0.0 --port 5000"
