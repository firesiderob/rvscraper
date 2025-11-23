#!/bin/bash

echo "🚀 Starting RV Scraper Backend + ngrok..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start backend in background
echo "📦 Starting backend server..."
cd "$SCRIPT_DIR/backend"
source ~/.nvm/nvm.sh
npm run dev > /tmp/rvscraper-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 5

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend started successfully (PID: $BACKEND_PID)"
    echo "   Logs: tail -f /tmp/rvscraper-backend.log"
else
    echo "❌ Backend failed to start"
    echo "   Check logs: cat /tmp/rvscraper-backend.log"
    exit 1
fi

echo ""
echo "🌐 Starting ngrok tunnel..."
cd "$SCRIPT_DIR"
ngrok http 5000

# When you Ctrl+C ngrok, kill the backend too
echo ""
echo "🛑 Stopping backend..."
kill $BACKEND_PID 2>/dev/null
echo "✅ Shutdown complete"
