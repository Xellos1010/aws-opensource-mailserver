#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Cursor Flow for Kareo..."

# Function to cleanup background processes on exit
cleanup() {
  echo "🛑 Stopping Cursor Flow..."
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT

# Start dev server in background
echo "📱 Starting Kareo dev server..."
pnpm exec nx run kareo:dev:watch &
DEV_PID=$!

# Wait a moment for dev server to initialize
sleep 3

# Start bridge server in foreground (blocks until interrupted)
echo "🌉 Starting Cursor Flow bridge..."
pnpm exec node tools/cursor/feature-bridge.cjs &
BRIDGE_PID=$!

# Wait for both processes
wait $DEV_PID $BRIDGE_PID
