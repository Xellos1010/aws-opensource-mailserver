#!/bin/bash
# Verification script for Nx workspace setup

set -e

echo "🔍 Verifying Nx workspace setup..."
echo ""

# Check pnpm
if command -v pnpm &> /dev/null; then
    echo "✅ pnpm found: $(which pnpm)"
    echo "   Version: $(pnpm --version)"
else
    echo "❌ pnpm not found in PATH"
    echo "   Please ensure nvm is loaded and pnpm is installed"
    exit 1
fi

# Check Nx
if command -v nx &> /dev/null || pnpm exec nx --version &> /dev/null; then
    echo "✅ Nx found"
    if pnpm exec nx --version &> /dev/null; then
        echo "   Version: $(pnpm exec nx --version)"
    fi
else
    echo "❌ Nx not found"
    exit 1
fi

# Check daemon status
echo ""
echo "🔍 Checking Nx daemon status..."
if pnpm exec nx daemon --status &> /dev/null; then
    echo "✅ Nx daemon is running"
    pnpm exec nx daemon --status
else
    echo "⚠️  Nx daemon is not running"
    echo "   Attempting to start..."
    pnpm exec nx daemon --start
    sleep 2
    if pnpm exec nx daemon --status &> /dev/null; then
        echo "✅ Nx daemon started successfully"
    else
        echo "❌ Failed to start Nx daemon"
        exit 1
    fi
fi

# Test project graph
echo ""
echo "🔍 Testing project graph access..."
if pnpm exec nx show projects &> /dev/null; then
    PROJECT_COUNT=$(pnpm exec nx show projects --json | jq 'length' 2>/dev/null || echo "unknown")
    echo "✅ Project graph accessible (found $PROJECT_COUNT projects)"
else
    echo "⚠️  Project graph access failed"
fi

echo ""
echo "🎉 Nx workspace setup verified!"

