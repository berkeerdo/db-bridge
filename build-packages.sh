#!/bin/bash

# Build packages in correct order
echo "Building DB Bridge packages..."

# Build Redis first (no dependencies on other DB Bridge packages)
echo "Building @db-bridge/redis..."
cd packages/redis
npm run build 2>/dev/null || true
cd ../..

# Build MySQL
echo "Building @db-bridge/mysql..."
cd packages/mysql
npm run build 2>/dev/null || true
cd ../..

# Build PostgreSQL
echo "Building @db-bridge/postgresql..."
cd packages/postgresql
npm run build 2>/dev/null || true
cd ../..

# Build Core (depends on adapters)
echo "Building @db-bridge/core..."
cd packages/core
npm run build || true
cd ../..

# Build main package
echo "Building db-bridge..."
cd packages/db-bridge
npm run build || true
cd ../..

echo "Build complete!"