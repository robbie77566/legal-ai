# CI/CD and Deployment Strategy

HabeasGraph is designed for high availability, zero-trust security, and institutional-grade reliability. This document details the procedures for running the platform in Development and Production environments, as well as the CI/CD pipeline automation.

---

## 1. Development Environment

The development environment optimizes for rapid iteration, hot-reloading, and localized debugging.

### Prerequisites
- Node.js LTS (v20+)
- pnpm (v11+)
- Docker Compose

### Running the Stack
1. **Infrastructure**: Start the local databases (pgvector, Neo4j, Redis).
   ```bash
   docker compose up -d
   ```
2. **Environment Variables**: Ensure your `.env` is populated (see `.env.example`).
3. **Database Reset**: Ensure your schema is in sync:
   ```bash
   pnpm --filter @hg/database db:push
   ```
4. **Start Turborepo**: Run all dev servers in parallel.
   ```bash
   pnpm dev
   ```
   This will spin up Next.js (`apps/web`) on `localhost:3000` and Fastify (`apps/api`) on `localhost:3001` with Hot Module Replacement (HMR).

---

## 2. Production Environment

Production environments prioritize stability, security, and performance. You must never run the `dev` command in production. Instead, build the optimized static assets and compiled Node modules.

### The Build Step
Compile all Next.js assets and Fastify routes:
```bash
# This leverages Turborepo caching to optimize build times
pnpm build
```

### Running on Bare-Metal (PM2)
If deploying directly to a VM (e.g., AWS EC2, DigitalOcean), use **PM2** as the process manager to daemonize the applications, ensure zero-downtime reloads, and handle log rotation.

#### Starting the Backend API (Fastify / LangGraph)
```bash
NODE_ENV=production pm2 start apps/api/dist/index.js --name "habeas-api"
```

#### Starting the Frontend (Next.js)
```bash
cd apps/web
NODE_ENV=production pm2 start "pnpm start" --name "habeas-web"
```

### Dockerized Production Deployment
For container orchestration (Kubernetes, AWS ECS), we utilize multi-stage Dockerfiles. The CI pipeline builds these images by:
1. Pulling the base `node:20-alpine` image.
2. Running `pnpm install` and `pnpm build`.
3. Copying only the compiled `.next/standalone` directory (for web) and `dist` directory (for api) into the final minimal runtime image.

---

## 3. CI/CD Pipeline (GitHub Actions)

Our CI/CD pipeline is strictly enforced. It runs automatically via `.github/workflows/ci.yml` and ensures that no breaking changes or unauthorized data structures are merged into the `main` branch.

### Pipeline Stages
1. **Lint & Format**: Runs `pnpm lint` and `pnpm format` to enforce strict formatting standards.
2. **Type Checking**: Runs `tsc --noEmit` across all monorepo packages.
3. **Build Verification**: Runs `pnpm build` using Turborepo's remote caching. A build failure immediately blocks the PR.
4. **Unit/Integration Tests**: Executes Vitest (`pnpm test`). The platform enforces a strict >80% test coverage requirement.
5. **End-to-End Tests**: Spins up a transient Docker environment and executes Playwright E2E tests simulating the Clinic Director (Bento Dashboard) and Investigator (Knowledge Graph) personas.
6. **Deployment Trigger**: Upon a successful merge to `main`, the CD pipeline triggers an automated rolling update to the staging Kubernetes cluster.
