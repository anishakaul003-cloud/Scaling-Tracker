const CONFIG = {
  SPREADSHEET_ID: "1Yt3aQpOYfcuPfdWBiCSoLHqT4ky5scXCgsktI0QLRrE",
  AUTH_TOKEN: "4s7nhrdksvtdx3gql020",
  MAX_ROWS_PER_TAB: 200000,
  DEFAULT_TAB: "Live_Merge",
  SOURCE_TO_SHEET: {
    ios_performance_dump: "iOS Performance",
    spends_plan_tracking: "Spends Plan Tracking",
    retention_view: "Retention View",
    raw_dump: "RAW_DUMP",
    spends_weekly: "spends - weekly",
    spends_daily: "spends - daily"
  }
};

function doGet(e) {
  try {
    validateToken_(e);

    const p = (e && e.parameter) || {};

    if (p.shows === "1") {
      return json_({
        ok: true,
        generatedAt: new Date().toISOString(),
        shows: getUniqueShows_()
      });
    }

    const sourceKeys = parseSourceKeys_(p);
    if (sourceKeys.length > 0) {
      const data = {};
      sourceKeys.forEach(function (key) {
        const sheetName = resolveSheetName_(key);
        data[key] = sheetToDataset_(sheetName);
      });

      return json_({
        ok: true,
        generatedAt: new Date().toISOString(),
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        data: data
      });
    }

    const tabName = p.tab || CONFIG.DEFAULT_TAB;
    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      data: {
        [tabName]: sheetToDataset_(tabName)
      }
    });
  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function validateToken_(e) {
  if (!CONFIG.AUTH_TOKEN) return;
  const token = (e && e.parameter && e.parameter.token) || "";
  if (token !== CONFIG.AUTH_TOKEN) throw new Error("Unauthorized");
}

function parseSourceKeys_(params) {
  const keys = [];

  const source = (params.source || "").trim();
  if (source) keys.push(source);

  const sources = (params.sources || "").trim();
  if (sources) {
    sources.split(",").forEach(function (entry) {
      const key = String(entry || "").trim();
      if (key) keys.push(key);
    });
  }

  return Array.from(new Set(keys.map(normalizeSourceKey_)));
}

function normalizeSourceKey_(key) {
  const normalized = String(key || "").trim();
  if (normalized.toUpperCase() === "RAW_DUMP") return "raw_dump";
  return normalized.toLowerCase();
}

function resolveSheetName_(sourceKey) {
  const key = normalizeSourceKey_(sourceKey);
  const sheetName = CONFIG.SOURCE_TO_SHEET[key];
  if (!sheetName) {
    throw new Error("Unknown source: " + sourceKey);
  }
  return sheetName;
}

function sheetToDataset_(sheetName) {
  const sh = getSpreadsheet_().getSheetByName(sheetName);
  if (!sh) return { ok: false, error: "Sheet not found: " + sheetName };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { ok: true, headers: [], rows: [] };

  const readRows = Math.min(lastRow, CONFIG.MAX_ROWS_PER_TAB);
  const displayValues = sh.getRange(1, 1, readRows, lastCol).getDisplayValues();

  const headers = (displayValues[0] || []).map(function (headerValue, index) {
    const normalized = String(headerValue || "").trim();
    return normalized || "Column_" + (index + 1);
  });

  const rows = [];
  for (let r = 1; r < displayValues.length; r += 1) {
    const row = displayValues[r];
    let hasValue = false;
    for (let c = 0; c < row.length; c += 1) {
      if (String(row[c] || "").trim() !== "") {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = row[c] || "";
    }
    rows.push(obj);
  }

  return { ok: true, headers: headers, rows: rows, rowCount: rows.length };
}

function getUniqueShows_() {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.DEFAULT_TAB);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const vals = sh.getRange(2, 7, lastRow - 1, 1).getValues().flat();
  const seen = new Set();
  vals.forEach(function (value) {
    const normalized = String(value || "").trim();
    if (normalized) seen.add(normalized);
  });

  return Array.from(seen).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
