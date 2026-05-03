#!/bin/bash
# Wrapper script for Nx daemon that ensures pnpm is in PATH
# This is used by VS Code/Cursor extensions that don't inherit shell environment

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Ensure pnpm is in PATH
export PATH="$PATH:$HOME/.nvm/versions/node/v20.18.1/bin"

# Execute the command passed as arguments
exec "$@"

