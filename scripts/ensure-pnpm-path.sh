#!/bin/bash
# Script to ensure pnpm is available - run this before starting Cursor
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="$PATH:$HOME/.nvm/versions/node/v20.18.1/bin"
exec "$@"
