#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm run cms:infra:up
CMS_DATABASE_URL=${CMS_DATABASE_URL:-postgres://cms:cms@localhost:5432/cms} pnpm run cms:migrate
pnpm run cms:apps:serve
