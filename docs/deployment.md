# Deployment

**Status:** nothing has been deployed. These steps were written against the code and the providers' documentation. Aiven connectivity was not tested from the development environment, because the sandbox could not resolve Aiven host names. Follow the checks at the end after you deploy.

Two routes are described:

- **A. Vercel Hobby + Aiven free PostgreSQL**: hosted, no cost, for personal and non-commercial use.
- **B. Docker on any machine**: one command, with the bundled database or Aiven.

## Free-plan limits (checked 15 November 2026)

| Service | What the free plan gives | What to watch |
|---|---|---|
| Aiven for PostgreSQL, Free plan | 1 CPU, 1 GB RAM, 1 GB storage, single node, no time limit | Aiven may stop an unused free instance. There is no high availability. Connection limits and backup terms weren't clearly stated, so keep `DATABASE_POOL_MAX` low and take your own `pg_dump` backups. Artifacts count against the 1 GB, so the per-project quota defaults to 50 MB. |
| Vercel Hobby | Serverless functions, with a default maximum duration of 300 s | Personal, non-commercial use only. Hitting a limit pauses the project rather than billing. Rate limiting in this app is per function instance, so it is weaker on serverless than on one Docker container. |
| Resend free (optional) | Transactional email for password resets | Without it, reset links are written to the server log, which on Vercel means the function logs. |

Sources: [Aiven free PostgreSQL](https://aiven.io/free-postgresql-database), [Aiven free tier concepts](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier), [Aiven free plans announcement](https://aiven.io/blog/free-plans-postgresql-mysql-redis), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Vercel fair use](https://vercel.com/docs/v2/platform/fair-use-policy). The providers change these terms. Check them again before relying on them.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Aiven's "Service URI", e.g. `postgres://avnadmin:…@pg-….aivencloud.com:PORT/defaultdb?sslmode=require`. |
| `BETTER_AUTH_SECRET` | yes | 32+ random bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out. |
| `APP_URL` | yes | The public address, e.g. `https://papertrail-yourname.vercel.app`. Used for auth callbacks, reset links and SDK instructions. |
| `DATABASE_CA_CERT` | recommended | Aiven's CA certificate (PEM text, from the service's overview page). With it, the server certificate is verified. Without it, `sslmode=require` encrypts but does not verify, as in libpq. |
| `DATABASE_POOL_MAX` | no | Connections per instance. Default 5. Use 2–3 on Vercel with a free database. |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Password-reset email. |
| `CROSSREF_MAILTO` | no | Contact address sent to Crossref, which gives better service. |
| `OPENALEX_API_KEY` | no | OpenAlex requires a key for production use since February 2026. Single lookups worked without one when tested. |
| `ARTIFACT_PROJECT_QUOTA_MB` | no | Default 50. |
| `SDK_RATE_LIMIT_PER_MIN` | no | Default 600, per token, per instance. |

Never commit these values. `.env` and `.env.local` are git-ignored.

## A. Vercel Hobby + Aiven

1. **Create the database.** In the Aiven console, create a PostgreSQL service on the Free plan and copy its Service URI. Optionally download the CA certificate.
2. **Run the migrations from your machine.** Vercel doesn't run them for you.

   ```bash
   cd apps/web && npm ci && DATABASE_URL='postgres://avnadmin:…?sslmode=require' npm run db:migrate
   ```

   In PowerShell:

   ```powershell
   cd apps/web; npm ci; $env:DATABASE_URL='postgres://avnadmin:…?sslmode=require'; npm run db:migrate
   ```

   The migrations create a role, `papertrail_app`, so the user needs `CREATEROLE`. Aiven's `avnadmin` has it. Run the same command after every update that adds a migration. It applies only new files and refuses to continue if an applied file has changed.
3. **Create the Vercel project.** Import the GitHub repository and set **Root Directory** to `apps/web`. The framework (Next.js) is detected automatically.
4. **Add the environment variables** from the table above (Production and Preview).
5. **Deploy**, then open `https://…vercel.app/api/v1/health`. It should return `{"status":"ok","database":"ok"}`.
6. **Optional demo data.** From your machine, with the same `DATABASE_URL`, after creating your account in the deployed app:

   ```bash
   cd apps/web && DATABASE_URL='…' npm run seed:pilot -- --email you@example.com
   ```

## B. Docker

```bash
docker compose up --build
```

The `web` container applies migrations on every start, retrying while the database comes up. It generates and keeps `BETTER_AUTH_SECRET` in the `papertrail-data` volume if you don't set one. To use Aiven instead of the bundled database, put `DATABASE_URL=…` (and optionally the other variables) in `.env` next to `docker-compose.yml`. The bundled `db` service still starts, but nothing uses it.

To run behind a reverse proxy with HTTPS, set `APP_URL` to the public address.

## After deploying: checks

- `/api/v1/health` returns 200.
- Sign up, sign out and sign in. Request a password reset and confirm the link arrives (or appears in the logs).
- Create a project and a token, then run `papertrail run -- python -c "print('acc= 0.5')" --metric 'acc=acc= ([0-9.]+)'` from your machine with the deployed `PAPERTRAIL_URL`. The run should appear in the Experiments tab.
- Sign up as a second user and confirm the first user's project URL returns "not found".

## Troubleshooting

- **"Invalid origin" when signing up or in.** The address in the browser must match `APP_URL` exactly, including the host name. `http://127.0.0.1:3000` and `http://localhost:3000` count as different origins. This check is Better Auth's protection against cross-site requests, so keep it and fix `APP_URL` instead.
- **`entrypoint: database not ready` repeating (Docker).** The app can't reach `DATABASE_URL`. For Aiven, check that the service is running (free services can be stopped when unused) and that the URL includes `?sslmode=require`. To fall back to the bundled database, remove `DATABASE_URL` from `.env`.
- **`permission denied to create role`.** The database user needs `CREATEROLE` for the first migration.

## Backups

The Aiven free plan's backup terms aren't clearly documented. Take your own:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=papertrail-$(date +%F).dump
```
