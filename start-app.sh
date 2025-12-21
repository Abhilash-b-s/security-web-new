#!/bin/bash

# Function to kill processes on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Base directory
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=================================================="
echo "   Starting Security Dashboard Services"
echo "=================================================="

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    echo "Please run: sudo apt-get update && sudo apt-get install -y npm nodejs"
    exit 1
fi

# Function to check and setup backend environment
# Function to check and setup backend environment
setup_backend() {
    echo "Setting up Backend Environment..."
    cd "$BASE_DIR/security-dashboard/backend"

    VENV_DIR="$BASE_DIR/security-dashboard/venv"
    
    # 1. Check for directory existence and basic integrity
    if [ -d "$VENV_DIR" ]; then
        if [ ! -f "$VENV_DIR/bin/activate" ] || [ ! -f "$VENV_DIR/bin/pip" ]; then
            echo "Detected incomplete virtual environment. Marking for recreation..."
            rm -rf "$VENV_DIR"
        else
            # 2. Check path portability
            CURRENT_VENV_PATH=$(grep "VIRTUAL_ENV=" "$VENV_DIR/bin/activate" | cut -d'"' -f2)
            if [ "$CURRENT_VENV_PATH" != "$VENV_DIR" ]; then
                echo "Detected broken virtual environment (path mismatch). Marking for recreation..."
                rm -rf "$VENV_DIR"
            fi
        fi
    fi

    # Create venv if missing (or deleted above)
    if [ ! -d "$VENV_DIR" ]; then
        echo "Creating virtual environment..."
        if ! python3 -m venv "$VENV_DIR"; then
            echo "Error: Failed to create virtual environment."
            echo "You are likely missing the python3-venv package."
            
            # Try to detect python version for helpful message
            PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
            echo "Please run: sudo apt-get install -y python${PY_VER}-venv"
            exit 1
        fi
        
        echo "Installing dependencies..."
        "$VENV_DIR/bin/pip" install -r requirements.txt || {
            echo "Error: Failed to install dependencies."
            exit 1
        }
    fi
}

# Start Backend
setup_backend
echo "[Backend] Starting on port 8000..."
"$BASE_DIR/security-dashboard/venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 &

# Start Report Server
echo "[Report Server] Starting on port 8081..."
# We use the system python3 because venv might not be active in this shell context, 
# although we could use "$VENV_DIR/bin/python3". 
# But standard library http.server is enough.
python3 -m http.server 8081 --directory "$BASE_DIR/new" & # Assuming new is relative to BASE_DIR which is /app

# Start Frontend
echo "[Frontend] Starting on port 5173..."
cd "$BASE_DIR/security-dashboard/frontend"
npm run dev -- --host &

echo ""
echo "--------------------------------------------------"
echo "Services is Running!"
echo "Backend API   : http://localhost:8000/docs"
echo "Report Server : http://localhost:8081"
echo "Frontend UI   : http://localhost:5173"
echo "--------------------------------------------------"
echo "Press Ctrl+C to stop all services."
echo ""

# Wait indefinitely
wait
