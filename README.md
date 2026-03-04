# Sheet Navigator (Snapshot Mode)

This site shows all subsheets from your workbook as sidebar folders and renders view-only table data.

## Current mode

- Data source: local snapshot file `public/data.json`
- Refresh behavior: no auto-refresh
- Auth: none (static website)
- Retention raw dump can be fetched from a Google Apps Script web app by setting:
  - `window.IOS_PERFORMANCE_DUMP_API_URL`
  - `window.IOS_PERFORMANCE_DUMP_AUTH_TOKEN`
  in `public/index.html` (5-minute request timeout, local inline fallback if fetch fails).
- Local cache server:
  - `npm start` now runs `scripts/dev_server.py`
  - the server refreshes all dump sources every 5 minutes into root cache files: `<source>_cache.csv`
  - frontend reads from local endpoint `/__dump_cache/<source>.csv` first, then remote webapp, then inline fallback
  - health endpoint: `/__ios_performance_dump_health`
  - default remote token used by server: `4s7nhrdksvtdx3gql020` (override with `IOS_DUMP_REMOTE_TOKEN`)
  - bottom-right UI widget is collapsible and shows source/status for each dump block

## Run locally

```bash
npm start
```

Open `http://localhost:4173`.

## Refresh snapshot from XLSX

When your workbook changes, regenerate `public/data.json`:

```bash
python3 scripts/export_xlsx_snapshot.py
```

Then reload the site.

## Files

- `public/index.html`: app shell
- `public/styles.css`: UI styling
- `public/app.js`: snapshot UI logic
- `public/data.json`: exported workbook data
- `scripts/export_xlsx_snapshot.py`: XLSX -> JSON exporter
