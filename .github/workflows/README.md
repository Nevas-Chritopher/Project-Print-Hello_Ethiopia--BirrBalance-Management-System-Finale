# GitHub Actions Workflows

This folder contains the project's CI/CD automation.

| File | Purpose | When it runs |
|------|---------|--------------|
| [`ci.yml`](./ci.yml) | **Continuous Integration** — test backend, lint & build frontend | Every push/PR to `main` or `dev` |
| [`cd.yml`](./cd.yml) | **Continuous Deployment** — package & upload production builds | After CI succeeds on `main`, or manually |

## Quick links (after pushing to GitHub)

- **Actions tab:** `https://github.com/<your-org>/<your-repo>/actions`
- **Workflow runs:** shows pass/fail status for every push and PR

## Manual deploy trigger

1. Open the **Actions** tab on GitHub
2. Select **CD** in the left sidebar
3. Click **Run workflow** → choose `main` → **Run workflow**

## Enabling automatic deployment

The CD workflow uploads build artifacts by default. To deploy to a host (e.g. Render, Railway, Fly.io):

1. Go to **Settings → Secrets and variables → Actions**
2. Add deploy hook URLs or API tokens as secrets
3. Uncomment the deploy steps in `cd.yml`

See the root [README.md](../../README.md#cicd) for a beginner-friendly walkthrough.
