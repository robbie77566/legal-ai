# Local Development Setup Guide

This guide will walk you through setting up HabeasGraph on your local machine for development.

## 1. Prerequisites

Before you begin, ensure you have the following installed:
*   **Node.js LTS** (v20 or higher)
*   **pnpm** (v11 or higher)
*   **Docker** & **Docker Compose** (v2 recommended)
*   **Ollama** (for local AI failover and entity resolution)

## 2. Automated Setup (Recommended)

The easiest way to get started is to use the provided setup script. From the root of the repository, run:

```bash
./setup.sh
```

This script will automatically:
1. Check that you have the required prerequisites.
2. Copy `.env.example` to `.env` and `packages/database/.env`.
3. Approve required build scripts for `pnpm` and install dependencies.
4. Start the local Docker infrastructure (PostgreSQL, Redis, Neo4j).
5. Generate the Prisma Client, push the schema to your local database, and seed it with initial data.

## 3. Manual Setup

If you prefer to set up the environment manually or need to troubleshoot a step from the automated script, follow these instructions:

### 3.1. Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
cp .env packages/database/.env
```
*(Open the newly created `.env` files and fill in any required API keys, such as `GOOGLE_GENAI_API_KEY`.)*

### 3.2. Install Dependencies

In newer versions of pnpm, you may need to explicitly approve build scripts before installing:
```bash
pnpm approve-builds @prisma/client @prisma/engines esbuild fastify-socket.io msgpackr-extract prisma
pnpm install
```

### 3.3. Start Infrastructure

Start the supporting databases and cache using Docker Compose:
```bash
docker compose up -d
```
*Note: We map PostgreSQL to host port `5433` and Neo4j to `7475`/`7688` by default to avoid conflicts with other local projects. If you change these in `docker-compose.yml`, be sure to update your `.env` file as well.*

### 3.4. Database Initialization

With the infrastructure running, initialize Prisma:
```bash
# Generate the Prisma client
pnpm --filter @hg/database db:generate

# Push the schema to the database
pnpm --filter @hg/database db:push

# Seed the database with the initial System Tenant
pnpm run db:seed:prod
```

## 4. Running the Application

To start the development servers for all applications and packages in parallel:

```bash
pnpm dev
```

The web application will be available at `http://localhost:3000` and the API will run according to its configured port (typically `3001`).

## 5. Troubleshooting

*   **Prisma Client Errors:** If you see an error like `@prisma/client did not initialize yet`, run `pnpm --filter @hg/database db:generate`.
*   **Database Connection Refused:** Ensure your Docker containers are healthy (`docker ps`). If ports are conflicting, adjust the `ports` mapping in `docker-compose.yml` and update `DATABASE_URL` in `.env`.
*   **Missing Environment Variables during DB Push:** Prisma requires a `.env` file directly inside `packages/database/` to resolve the `DATABASE_URL` during migrations/pushes. Ensure you copied it there.
