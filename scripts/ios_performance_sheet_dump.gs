const CONFIG = {
  SPREADSHEET_ID: "1Yt3aQpOYfcuPfdWBiCSoLHqT4ky5scXCgsktI0QLRrE",
  SHEET_NAME: "iOS Performance",
  AUTH_TOKEN: "4s7nhrdksvtdx3gql020",
  MAX_ROWS: 200000
};

function doGet(e) {
  try {
    validateToken_(e);
    const payload = readSheetAsDataset_(CONFIG.SHEET_NAME);

    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      sheetName: CONFIG.SHEET_NAME,
      data: payload
    });
  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function validateToken_(e) {
  if (!CONFIG.AUTH_TOKEN) return;
  const token = (e && e.parameter && e.parameter.token) || "";
  if (token !== CONFIG.AUTH_TOKEN) {
    throw new Error("Unauthorized");
  }
}

function readSheetAsDataset_(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) {
    throw new Error("Sheet not found: " + sheetName);
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const readRows = Math.min(lastRow, CONFIG.MAX_ROWS);
  const values = sh.getRange(1, 1, readRows, lastCol).getValues();

  const headers = (values[0] || []).map(function (h, i) {
    const text = String(h || "").trim();
    return text || "Column_" + (i + 1);
  });

  const rows = [];
  for (let r = 1; r < values.length; r += 1) {
    const sourceRow = values[r];
    let hasValue = false;
    for (let c = 0; c < sourceRow.length; c += 1) {
      if (String(sourceRow[c] || "").trim() !== "") {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) continue;

    const item = {};
    for (let c = 0; c < headers.length; c += 1) {
      const value = sourceRow[c];
      item[headers[c]] =
        value instanceof Date
          ? Utilities.formatDate(value, Session.getScriptTimeZone(), "M/d/yyyy")
          : value;
    }
    rows.push(item);
  }

  return { headers: headers, rows: rows, rowCount: rows.length };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
