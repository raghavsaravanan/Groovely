#!/bin/bash

# Script to run dance.py with the correct Python interpreter

# Use the full path to Python 3.13 where packages are installed
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"

cd "$(dirname "$0")"

echo "Using Python: $PYTHON"
echo "Checking dependencies..."
$PYTHON -c "import cv2; import numpy; import scipy; import pygame; print('All dependencies available')" 2>&1 | grep -v "UserWarning" | grep -v "Hello from"

if [ $? -eq 0 ]; then
    echo ""
    echo "Running dance.py..."
    echo ""
    $PYTHON dance.py "$@"
else
    echo "Missing dependencies. Installing..."
    $PYTHON -m pip install opencv-python numpy scipy pygame imageio-ffmpeg
    echo ""
    echo "Running dance.py..."
    echo ""
    $PYTHON dance.py "$@"
fi



