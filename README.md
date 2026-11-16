# PaperTrail

PaperTrail is a workspace for reproducing a computational research result and keeping a record someone else can check.

It does not summarise papers. You start from a paper's claims, the specific numbers it reports. PaperTrail then holds the rest of the record:

- **Your protocol** for testing those numbers.
- **Every run you make**: code commit, environment, seed, parameters and metrics, sent from your own machine by a small Python package.
- **A statistical comparison** between your runs and the published value, with warnings when the two aren't comparable.
- **Every deviation and discrepancy**, with a type, reason and evidence.
- **A report** that exports to Markdown or PDF.

Whether a claim "matched" is your call. The app computes the numbers and never sets the verdict.

![Results: reproduced runs against the published values](docs/screenshots/results.png)

## What is in this repository

| Path | What it is |
|---|---|
| `apps/web` | The application: Next.js 16 (App Router), TypeScript, Tailwind. Pages, API route handlers, authentication and statistics. |
| `db/migrations` | PostgreSQL schema, row-level security policies and constraints, as plain SQL. |
| `packages/python-sdk` | `papertrail`, the Python client and CLI that records runs. Standard library only, Python 3.7+. |
| `packages/analysis` | Reference statistics in Python (scipy). The TypeScript statistics are tested against fixtures generated here. |
| `pilot/gcn-kipf-welling-2017` | A real reproduction of Kipf & Welling (ICLR 2017), 400 runs. It is also loadable as a demo project. |
| `docs/` | Architecture, schema, API, SDK guide, deployment, security, methodology, status. |

## Run it locally with Docker

You need Docker Desktop (or Docker Engine with Compose).

```bash
docker compose up --build
```

Then open http://localhost:3000 and create an account. Use `localhost` rather than `127.0.0.1`: sign-in only accepts the address set in `APP_URL`. The first build takes a few minutes.

By default this starts a PostgreSQL container next to the app. To use a hosted database instead, such as Aiven, put its URL in a file named `.env` next to `docker-compose.yml`. Git ignores this file.

```
DATABASE_URL=postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require
```

On start-up the app applies the database migrations. If `BETTER_AUTH_SECRET` is unset, it generates one and keeps it in a Docker volume. See [.env.example](.env.example) for every setting.

### Load the demo project (optional)

The pilot reproduction can be loaded into your account as a demo project. It is marked as demonstration data everywhere it appears.

```bash
docker compose exec web node scripts/seed-pilot.mjs --email you@example.com
```

Use the email you signed up with. Running it again does nothing if the demo already exists.

### Stop

Stop with Ctrl+C. Data in the bundled database is kept in a Docker volume. To delete it as well:

```bash
docker compose down -v
```

## Develop without Docker

You need Node.js 22+ and a PostgreSQL 14+ database.

1. Create `apps/web/.env.local` with at least `DATABASE_URL`, `BETTER_AUTH_SECRET` and `APP_URL=http://localhost:3000`.
2. Install, migrate and start:

```bash
cd apps/web && npm ci && npm run db:migrate && npm run dev
```

The database user needs permission to create a role (`CREATEROLE`), because the migrations create the restricted `papertrail_app` role that row-level security uses. Aiven's `avnadmin` user has it.

## Record runs from your machine

```bash
pip install "git+https://github.com/NamanSharma2112/PaperTail#subdirectory=packages/python-sdk"
```

Create an ingestion token in your project's **Settings** tab. Then set three environment variables and wrap your existing command:

```bash
export PAPERTRAIL_URL=http://localhost:3000 PAPERTRAIL_PROJECT=<project id> PAPERTRAIL_TOKEN=pt_...
papertrail run --group cora --seed 1 --metric 'test_accuracy=test_acc= ([0-9.]+)' -- python train.py --dataset cora
```

Or use it from Python:

```python
from papertrail import Experiment

with Experiment(name="cora seed 1", group="cora", seed=1) as exp:
    exp.log_params({"learning_rate": 0.01})
    exp.log_metric("test_accuracy", 0.815)
```

Code always runs on your machine. The server never executes anything you send it. See the [SDK guide](docs/sdk-guide.md).

## Tests

```bash
cd apps/web && npm test                      # unit tests (statistics, comparison rules, parsers, validation)
TEST_DATABASE_URL=postgres://… npm test      # adds the database and row-level-security tests (drops and recreates the schema!)
npx playwright test                          # 14-step end-to-end workflow against a running app (E2E_BASE_URL)
cd packages/python-sdk && python -m pytest
cd packages/analysis && python -m pytest
```

What has been run, and the results, are in [docs/status.md](docs/status.md).

## Documentation

- [Architecture and decisions](docs/architecture.md)
- [Database schema](docs/database-schema.md)
- [API](docs/api.md)
- [SDK guide](docs/sdk-guide.md)
- [Deployment (free tier: Vercel + Aiven)](docs/deployment.md)
- [Security model](docs/security.md)
- [Reproduction methodology and statistics](docs/reproduction-methodology.md)
- [Status: what is done, tested and outstanding](docs/status.md)
- [Feasibility assessment](docs/feasibility-assessment.md) and the [pilot reproduction](pilot/gcn-kipf-welling-2017/README.md)
