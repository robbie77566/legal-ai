#!/bin/bash

# setup.sh - Initial setup script for HabeasGraph developers

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting HabeasGraph initial setup..."

# 1. Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo >&2 "❌ Node.js is required but it's not installed. Aborting."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo >&2 "❌ pnpm is required but it's not installed. Aborting."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo >&2 "❌ Docker is required but it's not installed. Aborting."; exit 1; }

# 2. Environment Configuration
echo "⚙️  Configuring environment variables..."
if [ ! -f .env ]; then
  echo "Copying .env.example to .env..."
  cp .env.example .env
else
  echo "✅ .env already exists. Skipping."
fi

if [ ! -f packages/database/.env ]; then
  echo "Copying .env to packages/database/.env..."
  cp .env packages/database/.env
else
  echo "✅ packages/database/.env already exists. Skipping."
fi

# 3. Install Dependencies
echo "📦 Installing dependencies..."
# For pnpm v11+, we need to approve build scripts
pnpm approve-builds @prisma/client @prisma/engines esbuild fastify-socket.io msgpackr-extract prisma || true
pnpm install

# 4. Start Infrastructure
echo "🐳 Starting Docker infrastructure..."
docker compose up -d

echo "⏳ Waiting for PostgreSQL to be ready..."
# Simple wait loop for postgres to become available
# Using a fixed sleep for simplicity, but a pg_isready check would be more robust in production
sleep 5 

# 5. Database Initialization
echo "🗄️  Initializing database..."
echo "Generating Prisma Client..."
pnpm --filter @hg/database db:generate

echo "Pushing schema to database..."
pnpm --filter @hg/database db:push

echo "Seeding the database..."
pnpm run db:seed:prod

echo "🎉 Setup complete! You can now start the development server with:"
echo "pnpm dev"
