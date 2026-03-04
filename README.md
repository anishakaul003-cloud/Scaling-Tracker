# Sheet Navigator (Snapshot Mode)

This site shows all subsheets from your workbook as sidebar folders and renders view-only table data.

## Prerequisites

- Node.js 20 LTS
- npm (10.x expected with Node 20)
- Python 3.x (`python3` in PATH)

## Current mode

- Data source: local snapshot file `public/data.json`
- Refresh behavior:
  - Local dev: Python cache server refreshes every 5 minutes.
  - Vercel: `/api/cron/refresh` updates KV every 5 minutes via `vercel.json` cron.
- Auth:
  - Local fallback remote fetch can use browser globals.
  - Vercel cron + KV fetch uses server-side env vars.
- Retention raw dump remote fallback can be configured in browser by setting:
  - `window.IOS_PERFORMANCE_DUMP_API_URL`
  in `public/index.html` (token is intentionally not embedded in client code).
- Local cache server:
  - `npm start` now runs `scripts/dev_server.py`
  - the server refreshes all dump sources every 5 minutes into root cache files: `<source>_cache.csv`
  - frontend reads from local endpoint `/__dump_cache/<source>.csv` first, then remote webapp, then inline fallback
  - health endpoint: `/__ios_performance_dump_health`
  - default remote token used by server: `4s7nhrdksvtdx3gql020` (override with `IOS_DUMP_REMOTE_TOKEN`)
  - bottom-right UI widget is collapsible and shows source/status for each dump block

## Vercel deployment (Cron + KV)

1. Connect Vercel KV to the project (this injects `KV_*` env vars).
2. Add project environment variables:
   - `IOS_DUMP_REMOTE_URL` (required)
   - `IOS_DUMP_REMOTE_TOKEN` (required if upstream enforces token)
   - `IOS_DUMP_REMOTE_TIMEOUT_SECONDS` (optional, default `90`)
   - `IOS_DUMP_REMOTE_SOURCES` (optional, default is all current sources)
   - `CRON_SECRET` (required, used as `Authorization: Bearer <secret>` for manual refresh)
3. Deploy with `vercel.json` included.
4. Trigger a manual refresh once after deploy:
   - `GET /api/cron/refresh` with header `Authorization: Bearer <CRON_SECRET>`
5. Verify:
   - Health: `GET /__ios_performance_dump_health`
   - Source CSV: `GET /__dump_cache/ios_performance_dump.csv`

## Quickstart (NPM-first)

```bash
npm install
npm run dev
npm run check
```

Open `http://localhost:4173`.

## Refresh snapshot from XLSX

When your workbook changes, regenerate `public/data.json`:

```bash
npm run snapshot:export
```

Then reload the site.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run setup` | Installs dependencies and validates Node/npm/Python versions. |
| `npm run start` | Starts the Python local cache dev server. |
| `npm run dev` | Alias for `npm run start`. |
| `npm run snapshot:export` | Exports XLSX snapshot to `public/data.json`. |
| `npm run check:env` | Verifies required local runtime versions. |
| `npm run lint` | Runs JS, CSS, and HTML lint checks. |
| `npm run format:check` | Verifies formatting (no writes). |
| `npm run format` | Applies formatting updates. |
| `npm run smoke` | Runs required-file, syntax, and optional health-endpoint smoke checks. |
| `npm run check` | Full local quality gate: env + lint + format check + smoke. |

## Troubleshooting

- Python missing:
  - Install Python 3 and ensure `python3 --version` works in your terminal.
- Port conflict on `4173`:
  - Stop the process already using port `4173`, then rerun `npm run dev`.
- Remote token behavior:
  - `scripts/dev_server.py` uses default token `4s7nhrdksvtdx3gql020`.
  - Override with `IOS_DUMP_REMOTE_TOKEN` in your shell before `npm run dev`.

## Files

- `public/index.html`: app shell
- `public/styles.css`: UI styling
- `public/app.js`: snapshot UI logic
- `public/script.js`: main dashboard logic
- `public/data.json`: exported workbook data
- `api/cron/refresh.js`: Vercel cron refresh worker (KV writer)
- `api/dump-cache/[source].js`: KV-backed CSV read endpoint
- `api/dump-health.js`: KV-backed health/meta endpoint
- `api/_lib/dump-source.js`: shared remote fetch + CSV conversion helpers
- `vercel.json`: Vercel cron schedule and route rewrites
- `scripts/dev_server.py`: local cache server
- `scripts/export_xlsx_snapshot.py`: XLSX -> JSON exporter
- `scripts/check_env.js`: runtime validator for Node/npm/Python
- `scripts/smoke_check.js`: lightweight smoke validation
