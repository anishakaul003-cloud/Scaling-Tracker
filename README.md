# Sheet Navigator (Snapshot Mode)

This site shows all subsheets from your workbook as sidebar folders and renders view-only table data.

## Current mode

- Data source: local snapshot file `public/data.json`
- Refresh behavior: no auto-refresh
- Auth: none (static website)

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
