#!/bin/bash
set -e
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts seed:plans
