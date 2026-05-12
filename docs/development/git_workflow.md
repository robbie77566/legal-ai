# Development Workflow: Git & Build Standards

To maintain a stable and buildable `main` branch, all contributors must follow this workflow when submitting changes.

## 1. Prepare Your Changes
Before committing, always check the status of your workspace to ensure only intended files are staged.

```bash
# Check modified and untracked files
git status

# Stage specific files or all changes
git add .
```

## 2. Commit with Context
Use descriptive commit messages. We recommend the [Conventional Commits](https://www.conventionalcommits.org/) standard (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).

```bash
git commit -m "docs: expand scope to incarceration reduction engine and rename to HabeasGraph"
```

## 3. Sync with Remote
Always pull the latest changes from the remote repository before attempting to push. This helps resolve potential conflicts locally.

```bash
git pull origin main
```

## 4. The "Pre-Push" Build (Mandatory)
**Never push code that does not build.** Since we are in a Turborepo monorepo, a change in one package can break another. Run the build from the root directory.

```bash
# Run the full monorepo build
pnpm build

# (Optional) Run tests to ensure no regressions
pnpm test
```

## 5. Push to GitHub
Once the build passes locally, you are clear to push your changes.

```bash
git push origin main
```

---

## Workflow Summary (Pro-Tip)
A common one-liner for a clean workspace:
`git add . && git commit -m "your message" && git pull origin main && pnpm build && git push origin main`

---

## CI/CD Enforcement
The GitHub Actions pipeline will automatically run `pnpm build` and `pnpm test` on every push. If your local build failed, the CI will also fail, and the PR will be blocked.
