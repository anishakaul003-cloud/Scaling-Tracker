function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function isCompletelyEmptyRow(row) {
  return row.every((cell) => cell === "");
}

function getColumnCountFromHeader(headerRow) {
  let lastFilledIndex = headerRow.length - 1;
  while (lastFilledIndex >= 0 && headerRow[lastFilledIndex] === "") {
    lastFilledIndex -= 1;
  }
  return lastFilledIndex + 1;
}

function extractSectionRows(parsedRows, headerFirstCell) {
  const headerIndex = parsedRows.findIndex((row) => (row[0] || "").trim() === headerFirstCell);
  if (headerIndex === -1) {
    return [];
  }

  const headerRow = parsedRows[headerIndex];
  const columnCount = getColumnCountFromHeader(headerRow);
  const sectionRows = [headerRow.slice(0, columnCount)];

  for (let i = headerIndex + 1; i < parsedRows.length; i += 1) {
    const currentRow = parsedRows[i];
    if (isCompletelyEmptyRow(currentRow)) {
      break;
    }
    sectionRows.push(currentRow.slice(0, columnCount));
  }

  return sectionRows;
}

function renderTable(tableId, rows) {
  const table = document.getElementById(tableId);
  table.textContent = "";

  if (rows.length === 0) {
    return;
  }

  const thead = document.createElement("thead");
  const headerTr = document.createElement("tr");

  rows[0].forEach((headerCell) => {
    const th = document.createElement("th");
    th.textContent = headerCell;
    if (headerCell === "Day" || headerCell === "Week") {
      th.classList.add("metric-primary");
    }
    headerTr.appendChild(th);
  });

  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.slice(1).forEach((dataRow) => {
    const tr = document.createElement("tr");
    dataRow.forEach((cell, columnIndex) => {
      const td = document.createElement("td");
      td.textContent = cell;
      if (columnIndex === 0) {
        td.classList.add("metric-primary");
      }
      if (cell === "$0.00" || cell === "0.00%" || cell === "0.00") {
        td.classList.add("value-muted");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  if (tableId === "daily-table" || tableId === "weekly-table") {
    applyIosPerformanceConditionalFormatting(table, rows);
  }
}

function parseScaleNumber(value) {
  if (value === null || value === undefined) {
    return NaN;
  }
  const trimmed = String(value).trim();
  if (trimmed === "") {
    return NaN;
  }
  const normalized = trimmed.replace(/[$,%]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function interpolateColor(startColor, endColor, ratio) {
  const bounded = Math.max(0, Math.min(1, ratio));
  const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * bounded);
  const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * bounded);
  const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * bounded);
  return `rgb(${r}, ${g}, ${b})`;
}

function getColumnMetricDirection(tableId, headerText) {
  const normalizedHeader = headerText.toLowerCase().trim();
  const costEfficiencyMetrics = new Set(["cpi", "cpfw d7", "d15 cpfsw", "d30 cpfsw"]);

  if (costEfficiencyMetrics.has(normalizedHeader)) {
    return "lower_better";
  }

  if (tableId === "daily-table") {
    const dailyPerformanceMetrics = new Set([
      "listening d0",
      "ldau d0",
      "activation d0",
      "activation d3",
      "meta spends (%)",
      "uac spends (%)",
      "tiktok spends (%)"
    ]);
    return dailyPerformanceMetrics.has(normalizedHeader) ? "higher_better" : null;
  }

  const weeklyPerformanceMetrics = new Set([
    "listening d3",
    "listening d7",
    "ldau d3",
    "ldau d7",
    "activation d3",
    "activation d7",
    "conversion d7",
    "arpu d7",
    "recovery d7",
    "ss d7h10",
    "ssd7h10",
    "meta spends (%)",
    "uac spends (%)",
    "tiktok spends (%)",
    "meta spends ($)",
    "uac spends ($)",
    "tiktok spends ($)"
  ]);
  return weeklyPerformanceMetrics.has(normalizedHeader) ? "higher_better" : null;
}

function applyIosPerformanceConditionalFormatting(table, rows) {
  if (!table || rows.length < 2) {
    return;
  }

  const headers = rows[0];
  const tbodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const firstIncludedColumn = 2;
  const lastIncludedColumn = headers.length - 1;
  const minColor = [154, 210, 171];
  const maxColor = [232, 155, 155];

  for (let columnIndex = firstIncludedColumn; columnIndex <= lastIncludedColumn; columnIndex += 1) {
    const direction = getColumnMetricDirection(table.id, headers[columnIndex] || "");
    if (!direction) {
      continue;
    }

    const columnValues = rows
      .slice(1)
      .map((row) => parseScaleNumber(row[columnIndex]))
      .filter((value) => Number.isFinite(value));

    if (columnValues.length === 0) {
      continue;
    }

    const minValue = Math.min(...columnValues);
    const maxValue = Math.max(...columnValues);
    const range = maxValue - minValue;

    tbodyRows.forEach((tr, rowIndex) => {
      const td = tr.children[columnIndex];
      if (!td) {
        return;
      }
      const value = parseScaleNumber(rows[rowIndex + 1][columnIndex]);
      if (!Number.isFinite(value)) {
        return;
      }

      const ratio = range === 0 ? 0.5 : (value - minValue) / range;
      const adjustedRatio = direction === "lower_better" ? ratio : 1 - ratio;
      td.style.backgroundColor = interpolateColor(minColor, maxColor, adjustedRatio);
      td.classList.add("ios-conditional-cell");
    });
  }
}

function applyDeepdiveConditionalFormatting(table) {
  if (!table) {
    return;
  }

  const tbodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const headerCells = Array.from(table.querySelectorAll("thead th"));
  if (tbodyRows.length === 0 || headerCells.length < 3) {
    return;
  }

  const firstIncludedColumn = 1;
  const hasTotalColumn = (headerCells[headerCells.length - 1]?.textContent || "").trim().toLowerCase() === "total";
  const lastIncludedColumn = hasTotalColumn ? headerCells.length - 2 : headerCells.length - 1;
  const minColor = [154, 210, 171];
  const maxColor = [232, 155, 155];

  for (let columnIndex = firstIncludedColumn; columnIndex <= lastIncludedColumn; columnIndex += 1) {
    const columnValues = tbodyRows
      .map((tr) => parseScaleNumber(tr.children[columnIndex]?.textContent))
      .filter((value) => Number.isFinite(value));

    if (columnValues.length === 0) {
      continue;
    }

    const minValue = Math.min(...columnValues);
    const maxValue = Math.max(...columnValues);
    const range = maxValue - minValue;

    tbodyRows.forEach((tr) => {
      const td = tr.children[columnIndex];
      if (!td) {
        return;
      }
      const value = parseScaleNumber(td.textContent);
      if (!Number.isFinite(value)) {
        return;
      }

      const ratio = range === 0 ? 0.5 : (value - minValue) / range;
      const adjustedRatio = 1 - ratio;
      td.style.backgroundColor = interpolateColor(minColor, maxColor, adjustedRatio);
      td.classList.add("ios-conditional-cell");
    });
  }
}

function renderRawGridTable(tableId, rows, options = {}) {
  const table = document.getElementById(tableId);
  table.textContent = "";

  if (rows.length === 0) {
    return;
  }

  const tbody = document.createElement("tbody");
  const maxColumns = rows.reduce((max, rowEntry) => {
    const row = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    return Math.max(max, row.length);
  }, 0);

  const boldRowNumbers = options.boldRowNumbers || null;

  rows.forEach((rowEntry, rowIndex) => {
    const row = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    const csvRowNumber = Array.isArray(rowEntry) ? rowIndex + 1 : rowEntry.csvRowNumber;
    const tr = document.createElement("tr");
    const firstNonEmptyCell = row.find((cell) => cell && cell.trim() !== "") || "";
    const isSpendsTable = tableId === "spends-plan-table";
    const normalizedRowCells = row.map((cell) => normalizeString(cell));
    const nonEmptyNormalizedCells = normalizedRowCells.filter((cell) => cell !== "");
    const hasNormalizedCell = (value) => nonEmptyNormalizedCells.includes(value);
    const channelHeaderTokens = new Set(["meta", "uac", "tik tok", "snapchat"]);
    const channelHeaderCount = nonEmptyNormalizedCells.filter((cell) => channelHeaderTokens.has(cell)).length;
    const isPrimarySpendsHeaderRow =
      isSpendsTable &&
      hasNormalizedCell("show") &&
      (hasNormalizedCell("planned drr") || hasNormalizedCell("mtd planned spends (feb)"));
    const isChannelSpendsHeaderRow =
      isSpendsTable && hasNormalizedCell("show name") && channelHeaderCount >= 4 && hasNormalizedCell("total");
    const isPlatformSpendsHeaderRow =
      isSpendsTable && (hasNormalizedCell("android") || hasNormalizedCell("ios")) && hasNormalizedCell("total");
    const isAnySpendsHeaderRow =
      isPrimarySpendsHeaderRow || isChannelSpendsHeaderRow || isPlatformSpendsHeaderRow;
    const isPlatformBudgetMergedRow =
      isSpendsTable &&
      Number.isFinite(parseScaleNumber(row[0])) &&
      normalizeString(row[1] || "") === "" &&
      normalizeString(row[2] || "") === "" &&
      normalizeString(row[3] || "") === "" &&
      Number.isFinite(parseScaleNumber(row[4])) &&
      normalizeString(row[5] || "") === "" &&
      normalizeString(row[6] || "") === "" &&
      normalizeString(row[7] || "") === "";
    const channelRowNeedsShowNamePrefix =
      isChannelSpendsHeaderRow && normalizeString(row[0] || "") === "meta";

    const getDisplayCellValue = (columnIndex) => {
      if (channelRowNeedsShowNamePrefix) {
        return columnIndex === 0 ? "Show Name" : row[columnIndex - 1] ?? "";
      }
      return row[columnIndex] ?? "";
    };

    if (boldRowNumbers && boldRowNumbers.has(csvRowNumber)) {
      tr.classList.add("row-force-bold");
    }
    if (isPrimarySpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-primary");
    } else if (isChannelSpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-secondary");
    } else if (isPlatformSpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-platform");
    }
    if (isPlatformBudgetMergedRow) {
      tr.classList.add("spends-platform-budget-row");
      const showNameSpacerCell = document.createElement("td");
      showNameSpacerCell.textContent = "";
      tr.appendChild(showNameSpacerCell);

      const androidValueCell = document.createElement("td");
      androidValueCell.textContent = row[0] ?? "";
      androidValueCell.colSpan = 4;
      androidValueCell.classList.add("metric-primary", "spends-merged-value-cell");
      tr.appendChild(androidValueCell);

      const iosValueCell = document.createElement("td");
      iosValueCell.textContent = row[4] ?? "";
      iosValueCell.colSpan = 4;
      iosValueCell.classList.add("metric-primary", "spends-merged-value-cell");
      tr.appendChild(iosValueCell);

      const totalValue = row[8] ?? "";
      if (normalizeString(totalValue) !== "") {
        const totalValueCell = document.createElement("td");
        totalValueCell.textContent = totalValue;
        totalValueCell.classList.add("metric-primary", "spends-merged-value-cell");
        tr.appendChild(totalValueCell);
      }

      tbody.appendChild(tr);
      return;
    }

    for (let i = 0; i < maxColumns; i += 1) {
      const td = document.createElement("td");
      const cellValue = getDisplayCellValue(i);
      td.textContent = cellValue;

      if (isPlatformSpendsHeaderRow) {
        const normalizedCell = normalizeString(cellValue);
        if (normalizedCell === "android" && normalizeString(getDisplayCellValue(i + 1)) === "") {
          td.colSpan = 4;
          td.classList.add("spends-merged-header-cell");
          i += 3;
        } else if (normalizedCell === "ios" && normalizeString(getDisplayCellValue(i + 1)) === "") {
          td.colSpan = 4;
          td.classList.add("spends-merged-header-cell");
          i += 3;
        }
      }

      if (isSpendsTable) {
        if (firstNonEmptyCell.startsWith("D-2 Overall") || firstNonEmptyCell === "Show Name") {
          td.classList.add("row-section-title");
        }
        if (firstNonEmptyCell === "Total") {
          td.classList.add("row-total");
        }
        if (firstNonEmptyCell === "MTD Diff" || firstNonEmptyCell === "D-2 Diff") {
          td.classList.add("row-diff");
        }
        if (i === 0 || (i === 1 && row[0] === "")) {
          td.classList.add("metric-primary");
        }
        if (!isAnySpendsHeaderRow && i > 0) {
          td.classList.add("spends-data-cell");
        }
      }

      if (/^-\$?\d|^-\d/.test(cellValue.trim())) {
        td.classList.add("value-negative");
      }
      if (cellValue === "$0.00" || cellValue === "0.00%" || cellValue === "0") {
        td.classList.add("value-muted");
      }

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function extractScriptLevelSpendsRows(csvText) {
  const parsedRows = parseCsv(csvText);
  const startSheetRow = 2;
  const hiddenSheetRows = new Set([4]);
  const dataRows = [];
  for (let i = startSheetRow - 1; i < parsedRows.length; i += 1) {
    const sheetRowNumber = i + 1;
    if (hiddenSheetRows.has(sheetRowNumber)) {
      continue;
    }

    const row = parsedRows[i];
    const scoped = row.slice(1, 10);
    const showName = (scoped[0] || "").trim();
    const scriptName = (scoped[1] || "").trim();
    const rowHasContent = scoped.some((cell) => (cell || "").trim() !== "");

    const isHeaderRow = normalizeString(showName) === "show name" && normalizeString(scriptName) === "script name";
    if (isHeaderRow) {
      continue;
    }

    if (!rowHasContent) {
      continue;
    }
    if (showName === "" && scriptName === "") {
      continue;
    }

    dataRows.push({
      showName: scoped[0] || "",
      scriptName: scoped[1] || "",
      androidMeta: scoped[2] || "",
      androidUac: scoped[3] || "",
      androidTiktok: scoped[4] || "",
      iosMeta: scoped[5] || "",
      iosUac: scoped[6] || "",
      iosTiktok: scoped[7] || "",
      total: scoped[8] || ""
    });

    if (normalizeString(showName) === "total") {
      break;
    }
  }

  return dataRows;
}

function formatScriptLevelCurrency(value) {
  const parsed = parseScaleNumber(value);
  if (Number.isFinite(parsed)) {
    return formatCurrency(parsed);
  }
  return value;
}

function renderScriptLevelSpendsTable(tableId, rows) {
  const table = document.getElementById(tableId);
  table.textContent = "";

  const thead = document.createElement("thead");
  const topHeaderRow = document.createElement("tr");
  const showHeader = document.createElement("th");
  showHeader.textContent = "Show Name";
  showHeader.rowSpan = 2;
  topHeaderRow.appendChild(showHeader);

  const scriptHeader = document.createElement("th");
  scriptHeader.textContent = "Script Name";
  scriptHeader.rowSpan = 2;
  topHeaderRow.appendChild(scriptHeader);

  const androidGroupHeader = document.createElement("th");
  androidGroupHeader.textContent = "Android";
  androidGroupHeader.colSpan = 3;
  topHeaderRow.appendChild(androidGroupHeader);

  const iosGroupHeader = document.createElement("th");
  iosGroupHeader.textContent = "iOS";
  iosGroupHeader.colSpan = 3;
  topHeaderRow.appendChild(iosGroupHeader);

  const totalHeader = document.createElement("th");
  totalHeader.textContent = "Total";
  totalHeader.rowSpan = 2;
  topHeaderRow.appendChild(totalHeader);
  thead.appendChild(topHeaderRow);

  const secondHeaderRow = document.createElement("tr");
  ["Meta", "UAC", "TikTok", "Meta", "UAC", "TikTok"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    secondHeaderRow.appendChild(th);
  });
  thead.appendChild(secondHeaderRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const isTotalRow = normalizeString(row.showName) === "total";
    if (isTotalRow) {
      tr.classList.add("script-level-total-row");
    }

    const showNameCell = document.createElement("td");
    showNameCell.textContent = row.showName;
    showNameCell.classList.add("metric-primary");
    tr.appendChild(showNameCell);

    const scriptNameCell = document.createElement("td");
    scriptNameCell.textContent = row.scriptName;
    tr.appendChild(scriptNameCell);

    [row.androidMeta, row.androidUac, row.androidTiktok, row.iosMeta, row.iosUac, row.iosTiktok, row.total].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = formatScriptLevelCurrency(value);
      td.classList.add("script-level-number");
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function getScriptLevelSpendsCsvText() {
  return typeof SCRIPT_LEVEL_SPENDS_CSV_TEXT === "string" ? SCRIPT_LEVEL_SPENDS_CSV_TEXT : "";
}

function buildShowSectionsMap(showCsvTextByKey) {
  const sectionsByShow = {};
  const hiddenTab1CsvRows = new Set([5, 26]);

  Object.entries(showCsvTextByKey).forEach(([showKey, csvText]) => {
    const parsedRows = parseCsv(csvText).filter((row, index) => !hiddenTab1CsvRows.has(index + 1));
    sectionsByShow[showKey] = {
      daily: extractSectionRows(parsedRows, "Day"),
      weekly: extractSectionRows(parsedRows, "Week")
    };
  });

  return sectionsByShow;
}

function buildRecoveriesRowsMap(recoveriesCsvTextByKey) {
  const rowsByShow = {};

  Object.entries(recoveriesCsvTextByKey).forEach(([showKey, csvText]) => {
    const parsedRows = parseCsv(csvText);
    rowsByShow[showKey] = parsedRows.slice(8, 24);
  });

  return rowsByShow;
}

function buildCsvRecords(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function parseFormulaMetricDefinitions(formulaCsvText) {
  const rows = parseCsv(formulaCsvText);
  const baseSumRanges = new Set();
  const costSumRanges = new Set();
  const derived = new Set();

  rows.forEach((row) => {
    const formula = row[1] || "";
    if (!formula) {
      return;
    }
    const baseMatches = formula.match(/Base_Data!\$([A-Z]+):\$([A-Z]+)/g) || [];
    baseMatches.forEach((match) => {
      const column = match.replace("Base_Data!$", "").replace(/:\$[A-Z]+/, "");
      baseSumRanges.add(column);
    });
    const costMatches = formula.match(/Cost_Data!\$([A-Z]+):\$([A-Z]+)/g) || [];
    costMatches.forEach((match) => {
      const column = match.replace("Cost_Data!$", "").replace(/:\$[A-Z]+/, "");
      costSumRanges.add(column);
    });
    if (formula.includes("/")) {
      derived.add("ratio_metrics");
    }
    if (formula.includes("IFERROR")) {
      derived.add("error_safe_metrics");
    }
  });

  return {
    baseSumRanges: Array.from(baseSumRanges),
    costSumRanges: Array.from(costSumRanges),
    derivedMetrics: Array.from(derived)
  };
}

function colNumberToLetters(colNumber) {
  let n = colNumber;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function buildLayoutGrid(layoutCsvText, maxRows = 24, maxCol = 33) {
  const rows = parseCsv(layoutCsvText).slice(0, maxRows).map((row) => row.slice(0, maxCol));
  const cellMap = new Map();
  rows.forEach((row, rowIndex) => {
    for (let colIndex = 0; colIndex < maxCol; colIndex += 1) {
      const a1 = `${colNumberToLetters(colIndex + 1)}${rowIndex + 1}`;
      cellMap.set(a1, row[colIndex] ?? "");
    }
  });
  return { rows, cellMap };
}

function parseSheetStyleDateToIso(dateText, fallbackYear) {
  const label = String(dateText || "").trim();
  const match = label.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };
  const month = monthMap[match[2].toLowerCase()];
  if (!Number.isFinite(day) || month === undefined) return "";
  const dateObj = new Date(fallbackYear, month, day);
  return toIsoDateString(toMidnightDate(dateObj));
}

function formatPct(value) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }
  return `${value.toFixed(1)}%`;
}

function parseDateField(value) {
  const parsed = parseIsoDate(value);
  return parsed ? toMidnightDate(parsed) : null;
}

function isExcludedSubTeam(value, selectedSubTeam) {
  const normalized = normalizeString(value);
  if (selectedSubTeam === "__exclude_reengagement_affiliates__") {
    return normalized === "re-engagement" || normalized === "affiliates";
  }
  return normalizeString(selectedSubTeam) !== "all" && normalizeString(selectedSubTeam) !== normalized;
}

function isExcludedLanguage(value, selectedLanguage) {
  const normalized = normalizeString(value);
  if (selectedLanguage === "__exclude_spanish__") {
    return normalized === "spanish";
  }
  return normalizeString(selectedLanguage) !== "all" && normalizeString(selectedLanguage) !== normalized;
}

function filterRecoveriesBaseRows(baseRows, filters, segmentPredicate) {
  const refreshIso = filters.refreshDate;
  return baseRows.filter((row) => {
    if (row.refresh_date !== refreshIso) return false;
    if (normalizeString(row.first_listening_show_title_v1) !== normalizeString(filters.show)) return false;
    if (isExcludedSubTeam(row.sub_team, filters.subTeam)) return false;
    if (isExcludedLanguage(row.first_listening_show_language_v1, filters.language)) return false;
    return segmentPredicate(row);
  });
}

function filterRecoveriesCostRows(costRows, filters, segmentPredicate) {
  const refreshIso = filters.refreshDate;
  return costRows.filter((row) => {
    if (row.refresh_date !== refreshIso) return false;
    if (normalizeString(row.ad_show_title_final) !== normalizeString(filters.show)) return false;
    if (isExcludedSubTeam(row.sub_team, filters.subTeam)) return false;
    if (isExcludedLanguage(row.ad_show_language_final, filters.language)) return false;
    return segmentPredicate(row);
  });
}

function sumNumber(rows, fieldName) {
  return rows.reduce((sum, row) => sum + (parseScaleNumber(row[fieldName]) || 0), 0);
}

function inRange(dateValue, rangeStart, rangeEnd) {
  if (!(dateValue instanceof Date)) return false;
  return dateValue >= rangeStart && dateValue <= rangeEnd;
}

function buildRecoveriesMetricEngine(baseRows, costRows) {
  const refreshDates = Array.from(
    new Set(baseRows.map((row) => row.refresh_date).filter((value) => (value || "").trim() !== ""))
  ).sort((a, b) => b.localeCompare(a));

  const shows = Array.from(
    new Set(baseRows.map((row) => row.first_listening_show_title_v1).filter((value) => (value || "").trim() !== ""))
  ).sort((a, b) => a.localeCompare(b));

  const subTeams = Array.from(
    new Set(baseRows.map((row) => row.sub_team).filter((value) => (value || "").trim() !== ""))
  ).sort((a, b) => a.localeCompare(b));

  const languages = Array.from(
    new Set(baseRows.map((row) => row.first_listening_show_language_v1).filter((value) => (value || "").trim() !== ""))
  ).sort((a, b) => a.localeCompare(b));

  const isTikTokSource = (value) => normalizeString(value).replace(/\s+/g, "").includes("tiktok");
  const segments = [
    { label: "All (w/ Testing)", base: () => true, cost: () => true },
    {
      label: "Growth",
      base: (row) => ["scaling", "testing"].includes(normalizeString(row.campaign_type)),
      cost: (row) => ["scaling", "testing"].includes(normalizeString(row.campaign_type))
    },
    {
      label: "Android",
      base: (row) => normalizeString(row.platform_v1) === "android",
      cost: (row) => normalizeString(row.platform) === "android"
    },
    {
      label: "    Facebook",
      base: (row) => normalizeString(row.platform_v1) === "android" && normalizeString(row.media_source_v1) === "facebook",
      cost: (row) => normalizeString(row.platform) === "android" && normalizeString(row.media_source) === "facebook"
    },
    {
      label: "    Google",
      base: (row) => normalizeString(row.platform_v1) === "android" && normalizeString(row.media_source_v1) === "google",
      cost: (row) => normalizeString(row.platform) === "android" && normalizeString(row.media_source) === "google"
    },
    {
      label: "    TikTok",
      base: (row) => normalizeString(row.platform_v1) === "android" && isTikTokSource(row.media_source_v1),
      cost: (row) => normalizeString(row.platform) === "android" && isTikTokSource(row.media_source)
    },
    {
      label: "    Organic",
      base: (row) => normalizeString(row.platform_v1) === "android" && normalizeString(row.media_source_v1) === "organic",
      cost: (row) => normalizeString(row.platform) === "android" && normalizeString(row.media_source) === "organic"
    },
    {
      label: "iOS",
      base: (row) => normalizeString(row.platform_v1) === "ios",
      cost: (row) => normalizeString(row.platform) === "ios"
    },
    {
      label: "    Facebook",
      base: (row) => normalizeString(row.platform_v1) === "ios" && normalizeString(row.media_source_v1) === "facebook",
      cost: (row) => normalizeString(row.platform) === "ios" && normalizeString(row.media_source) === "facebook"
    },
    {
      label: "    Google",
      base: (row) => normalizeString(row.platform_v1) === "ios" && normalizeString(row.media_source_v1) === "google",
      cost: (row) => normalizeString(row.platform) === "ios" && normalizeString(row.media_source) === "google"
    },
    {
      label: "    TikTok",
      base: (row) => normalizeString(row.platform_v1) === "ios" && isTikTokSource(row.media_source_v1),
      cost: (row) => normalizeString(row.platform) === "ios" && isTikTokSource(row.media_source)
    }
  ];

  function computeRows(filters) {
    const refreshDate = parseDateField(filters.refreshDate);
    if (!refreshDate) {
      return [];
    }
    const d3Latest = addDays(refreshDate, -4);
    const d7Latest = addDays(refreshDate, -8);
    const d15Latest = addDays(refreshDate, -15);
    const windows = [
      { flag: "D3", start: addDays(d3Latest, -6), end: d3Latest },
      { flag: "D7", start: addDays(d7Latest, -6), end: d7Latest },
      { flag: "D15", start: addDays(d15Latest, -6), end: d15Latest }
    ];

    const rows = segments.map((segment) => {
      const segmentBaseRows = filterRecoveriesBaseRows(baseRows, filters, segment.base);
      const segmentCostRows = filterRecoveriesCostRows(costRows, filters, segment.cost);
      const metricByFlag = {};

      windows.forEach((window) => {
        const baseInWindow = segmentBaseRows.filter((row) => {
          const dateValue = parseDateField(row.install_date_v1);
          return inRange(dateValue, window.start, window.end) && normalizeString(row.day_flag) === normalizeString(window.flag);
        });
        const costInWindow = segmentCostRows.filter((row) => {
          const dateValue = parseDateField(row.date);
          return inRange(dateValue, window.start, window.end);
        });
        const sameShowRevenue = sumNumber(baseInWindow, "same_show_revenue");
        const totalCost = sumNumber(costInWindow, "total_cost_dollars");
        metricByFlag[window.flag] = totalCost > 0 ? (sameShowRevenue / totalCost) * 100 : 0;
      });

      const costCurrentWindow = segmentCostRows.filter((row) => {
        const dateValue = parseDateField(row.date);
        return inRange(dateValue, windows[0].start, windows[0].end);
      });
      const baseCurrentWindow = segmentBaseRows.filter((row) => {
        const dateValue = parseDateField(row.install_date_v1);
        return inRange(dateValue, windows[0].start, windows[0].end);
      });

      const totalCost = sumNumber(costCurrentWindow, "total_cost_dollars");
      const installs = sumNumber(baseCurrentWindow, "installs");
      const m9D7 = sumNumber(baseCurrentWindow, "M9_revenue_d7_projected");
      const m9D15CpNssw = sumNumber(baseCurrentWindow, "M9_revenue_d15_projected_cpnsw");
      const m9D15CpFsw = sumNumber(baseCurrentWindow, "M9_revenue_d15_projected_cpfsw");
      return {
        segment: segment.label,
        d3: metricByFlag.D3 || 0,
        d7: metricByFlag.D7 || 0,
        d15: metricByFlag.D15 || 0,
        cost: totalCost,
        cpi: installs > 0 ? totalCost / installs : 0,
        m9d7: m9D7,
        m9d15cpnssw: m9D15CpNssw,
        m9d15cpfsw: m9D15CpFsw,
        paybackD7: totalCost > 0 ? (m9D7 / totalCost) * 100 : 0,
        paybackD15cpnssw: totalCost > 0 ? (m9D15CpNssw / totalCost) * 100 : 0
      };
    });
    return {
      rows,
      dates: {
        d3Latest: toIsoDateString(d3Latest),
        d7Latest: toIsoDateString(d7Latest),
        d15Latest: toIsoDateString(d15Latest),
        m10: toIsoDateString(windows[0].start),
        o10: toIsoDateString(windows[0].end)
      }
    };
  }

  return { refreshDates, shows, subTeams, languages, computeRows };
}

function renderShowWiseRecoveriesEngineTable(tableId, rows) {
  const table = document.getElementById(tableId);
  table.textContent = "";

  const headers = [
    "Segment",
    "D3",
    "D7",
    "D15",
    "Cost",
    "CPI",
    "M9 Revenue (D7)",
    "M9 (proj) Rev (D15 NSSW)",
    "M9 (proj) Rev (D15 FSW)",
    "Payback D7",
    "Payback D15 CPNSSW"
  ];

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const values = [
      row.segment,
      formatPct(row.d3),
      formatPct(row.d7),
      formatPct(row.d15),
      formatCurrency(row.cost),
      formatCurrency(row.cpi),
      formatCurrency(row.m9d7),
      formatCurrency(row.m9d15cpnssw),
      formatCurrency(row.m9d15cpfsw),
      formatPct(row.paybackD7),
      formatPct(row.paybackD15cpnssw)
    ];
    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 0) {
        td.classList.add("metric-primary");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== ""))).sort((a, b) => a.localeCompare(b));
}

function orderDayDiffValues(values) {
  const dayDiffOrder = ["d3", "d7", "d15", "d30"];
  const normalized = Array.from(new Set(values.filter((value) => value !== "").map((value) => value.toLowerCase())));
  const orderedKnown = dayDiffOrder.filter((dayDiff) => normalized.includes(dayDiff));
  const remaining = normalized.filter((value) => !dayDiffOrder.includes(value)).sort((a, b) => a.localeCompare(b));
  return [...orderedKnown, ...remaining];
}

function setSelectOptions(selectElement, values, emptyLabel = null) {
  const previousValue = selectElement.value;
  selectElement.textContent = "";

  if (emptyLabel !== null) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    selectElement.appendChild(option);
  }

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });

  const nextValue = values.includes(previousValue) ? previousValue : values[0] || "";
  selectElement.value = nextValue;
}

function normalizeString(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeIdString(value) {
  return String(value ?? "").trim();
}

function doesRowMatchFilters(row, selectedFilters) {
  const campaignMatches = !selectedFilters.campaignIsActive || normalizeString(row.Campaign_ID) === selectedFilters.campaignNormalized;

  return (
    normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
    normalizeString(row.Platform) === selectedFilters.platformNormalized &&
    normalizeString(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
    normalizeString(normalizeIdString(row.Adset_ID)) === selectedFilters.adsetNormalized &&
    normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized &&
    campaignMatches
  );
}

function createSearchableComboBox(config) {
  const { inputElement, optionsElement, initialOptions = [], allowEmpty = false, emptyLabel = "Any (Optional)", onCommit } =
    config;
  let allOptions = [...initialOptions];
  let open = false;

  function getCurrentValue() {
    return normalizeIdString(inputElement.value);
  }

  function closeOptions() {
    open = false;
    optionsElement.hidden = true;
  }

  function openOptions() {
    open = true;
    optionsElement.hidden = false;
  }

  function commit(value, triggerChange = true) {
    inputElement.value = normalizeIdString(value);
    if (triggerChange) {
      if (typeof onCommit === "function") {
        onCommit();
      } else {
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  function getFilteredOptions(query) {
    const normalizedQuery = normalizeString(query);
    if (!normalizedQuery) {
      return allOptions;
    }
    return allOptions.filter((option) => normalizeString(option).includes(normalizedQuery));
  }

  function renderOptions(query) {
    const filteredOptions = getFilteredOptions(query);
    optionsElement.textContent = "";

    if (allowEmpty) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "searchable-option";
      clearButton.textContent = emptyLabel;
      clearButton.addEventListener("mousedown", (event) => {
        event.preventDefault();
        commit("");
        closeOptions();
      });
      optionsElement.appendChild(clearButton);
    }

    if (filteredOptions.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "searchable-option is-empty";
      emptyState.textContent = "No matching options";
      optionsElement.appendChild(emptyState);
      return;
    }

    filteredOptions.forEach((option) => {
      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "searchable-option";
      optionButton.textContent = option;
      optionButton.addEventListener("mousedown", (event) => {
        event.preventDefault();
        commit(option);
        closeOptions();
      });
      optionsElement.appendChild(optionButton);
    });
  }

  function setOptions(nextOptions, setOptionsConfig = {}) {
    const { preserveValue = true } = setOptionsConfig;
    const previousValue = getCurrentValue();
    allOptions = [...nextOptions];

    if (preserveValue && previousValue && allOptions.some((option) => normalizeIdString(option) === previousValue)) {
      inputElement.value = previousValue;
    } else if (allowEmpty) {
      inputElement.value = "";
    } else {
      inputElement.value = allOptions[0] || "";
    }

    if (open) {
      renderOptions(getCurrentValue());
    }
  }

  inputElement.addEventListener("focus", () => {
    openOptions();
    renderOptions(getCurrentValue());
  });
  inputElement.addEventListener("input", () => {
    openOptions();
    renderOptions(getCurrentValue());
  });
  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOptions();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit(getCurrentValue());
      closeOptions();
    }
  });
  inputElement.addEventListener("blur", () => {
    setTimeout(() => {
      closeOptions();
      if (typeof onCommit === "function") {
        onCommit();
      }
    }, 120);
  });

  setOptions(allOptions, { preserveValue: false });

  return {
    getValue: getCurrentValue,
    setValue: (value, triggerChange = false) => commit(value, triggerChange),
    setOptions
  };
}

function toIsoDateString(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekHeaderDate(dateValue) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dateValue.getDate()}-${monthNames[dateValue.getMonth()]}-${dateValue.getFullYear()}`;
}

function getCurrentWeekMonday(referenceDate) {
  const current = new Date(referenceDate);
  current.setHours(0, 0, 0, 0);
  const mondayIndex = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - mondayIndex);
  return current;
}

function getLastSevenWeekBuckets(todayDate) {
  const monday = getCurrentWeekMonday(todayDate);
  const weeks = [];
  for (let i = 0; i < 7; i += 1) {
    const weekDate = new Date(monday);
    weekDate.setDate(monday.getDate() - 7 * i);
    weeks.push({
      date: weekDate,
      iso: toIsoDateString(weekDate),
      label: formatWeekHeaderDate(weekDate)
    });
  }
  return weeks;
}

function parseMetricNumber(value) {
  if (value === null || value === undefined) {
    return NaN;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "") {
    return NaN;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(
    value
  );
}

function formatInstalls(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatSplitPercent(value) {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }
  return `${value.toFixed(2)}%`;
}

function formatDateLabel(dateValue) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dateValue.getDate()}-${monthNames[dateValue.getMonth()]}-${dateValue.getFullYear()}`;
}

function buildRawDumpRows(rawDumpCsvText) {
  const parsed = parseCsv(rawDumpCsvText);
  if (parsed.length === 0) {
    return [];
  }
  const headers = parsed[0];
  return parsed.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function getFirstPresentValue(row, fieldCandidates) {
  for (let i = 0; i < fieldCandidates.length; i += 1) {
    const key = fieldCandidates[i];
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = normalizeIdString(row[key]);
      if (value !== "") {
        return value;
      }
    }
  }
  return "";
}

function parseIsoDate(value) {
  const raw = normalizeIdString(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function getDeepdiveShowName(row) {
  return normalizeIdString(row["Ad Show Title"] || row.Show_Name);
}

function getDeepdiveDateValue(row) {
  return normalizeIdString(row["Spend Period"] || row.Install_Period);
}

function getDeepdiveMediaSource(row) {
  return normalizeIdString(row["Media Source"] || row.Media_Source);
}

function getDeepdiveOptimization(row) {
  return normalizeIdString(row.Optimization || row["Optimization Type"] || row["Optimization_Type"]);
}

function getDeepdiveLaCode(row) {
  return normalizeIdString(row["LA Code"] || row.LA_Code || row["LA code"]);
}

function getDeepdiveCost(row) {
  return parseMetricNumber(row["Total Cost ($)"] ?? row.Cost);
}

function getWeekStartMonday(dateValue) {
  const normalized = toMidnightDate(dateValue);
  const mondayOffset = (normalized.getDay() + 6) % 7;
  return addDays(normalized, -mondayOffset);
}

function getLastCompletedWeekStarts(todayDate, count) {
  const currentWeekMonday = getCurrentWeekMonday(todayDate);
  const weeks = [];
  for (let i = count; i >= 1; i -= 1) {
    const weekStart = addDays(currentWeekMonday, -7 * i);
    weeks.push({
      date: weekStart,
      iso: toIsoDateString(weekStart),
      label: formatDateLabel(weekStart)
    });
  }
  return weeks;
}

function getLastDays(todayDate, count) {
  const normalizedToday = toMidnightDate(todayDate);
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const dayDate = addDays(normalizedToday, -i);
    days.push({
      date: dayDate,
      iso: toIsoDateString(dayDate),
      label: formatDateLabel(dayDate)
    });
  }
  return days;
}

function getLastPeriodsFromRows(rows, rowDateAccessor, count) {
  const uniqueIsoSet = new Set();
  rows.forEach((row) => {
    const dateValue = parseIsoDate(rowDateAccessor(row));
    if (!dateValue) {
      return;
    }
    uniqueIsoSet.add(toIsoDateString(toMidnightDate(dateValue)));
  });

  const sortedIsoDates = Array.from(uniqueIsoSet).sort((a, b) => a.localeCompare(b));
  const selectedIsoDates = sortedIsoDates.slice(-count);
  return selectedIsoDates.map((iso) => {
    const dateValue = parseIsoDate(iso);
    return {
      date: dateValue,
      iso,
      label: formatDateLabel(dateValue)
    };
  });
}

function renderPivotTable(tableId, rowLabel, rowBuckets, dimensionValues, valueMapByRowIsoDimension, options = {}) {
  const table = document.getElementById(tableId);
  table.textContent = "";
  const valueMode = options.valueMode || "currency";
  const includeTotalColumn = options.includeTotalColumn ?? true;
  const sortedRowBuckets = [...rowBuckets].sort((a, b) => {
    const aTime = a?.date instanceof Date ? a.date.getTime() : -Infinity;
    const bTime = b?.date instanceof Date ? b.date.getTime() : -Infinity;
    return bTime - aTime;
  });

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const rowHeader = document.createElement("th");
  rowHeader.textContent = rowLabel;
  headerRow.appendChild(rowHeader);

  dimensionValues.forEach((dimensionValue) => {
    const th = document.createElement("th");
    th.textContent = dimensionValue;
    headerRow.appendChild(th);
  });
  if (includeTotalColumn) {
    const totalHeader = document.createElement("th");
    totalHeader.textContent = "Total";
    headerRow.appendChild(totalHeader);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sortedRowBuckets.forEach((rowBucket) => {
    const tr = document.createElement("tr");
    const rowNameCell = document.createElement("td");
    rowNameCell.textContent = rowBucket.label;
    rowNameCell.classList.add("metric-primary");
    tr.appendChild(rowNameCell);

    let rowTotal = 0;
    const rowValues = dimensionValues.map((dimensionValue) => {
      const key = `${rowBucket.iso}||${dimensionValue}`;
      const value = valueMapByRowIsoDimension.get(key) || 0;
      rowTotal += value;
      return value;
    });

    dimensionValues.forEach((dimensionValue) => {
      const td = document.createElement("td");
      const value = rowValues[dimensionValues.indexOf(dimensionValue)];
      if (valueMode === "percentage_split") {
        const split = rowTotal > 0 ? (value / rowTotal) * 100 : 0;
        td.textContent = formatSplitPercent(split);
      } else {
        td.textContent = value > 0 ? formatCurrency(value) : "$0.00";
      }
      tr.appendChild(td);
    });

    if (includeTotalColumn) {
      const totalCell = document.createElement("td");
      totalCell.textContent = valueMode === "percentage_split" ? (rowTotal > 0 ? "100.00%" : "0.00%") : formatCurrency(rowTotal);
      totalCell.classList.add("metric-primary");
      tr.appendChild(totalCell);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  if (tableId.startsWith("deepdive-")) {
    applyDeepdiveConditionalFormatting(table);
  }
}

function buildPivotMatrix(rows, rowIsoAccessor, dimensionAccessor, valueAccessor = (row) => parseMetricNumber(row.Cost)) {
  const dimensionValuesSet = new Set();
  const valueMap = new Map();

  rows.forEach((row) => {
    const rowIso = rowIsoAccessor(row);
    const dimension = dimensionAccessor(row);
    if (!rowIso || !dimension) {
      return;
    }
    const spend = valueAccessor(row);
    if (!Number.isFinite(spend)) {
      return;
    }

    dimensionValuesSet.add(dimension);
    const key = `${rowIso}||${dimension}`;
    valueMap.set(key, (valueMap.get(key) || 0) + spend);
  });

  return {
    dimensionValues: Array.from(dimensionValuesSet).sort((a, b) => a.localeCompare(b)),
    valueMap
  };
}

function addDays(dateValue, days) {
  const next = new Date(dateValue);
  next.setDate(next.getDate() + days);
  return next;
}

function toMidnightDate(dateValue) {
  const normalized = new Date(dateValue);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getMaturityConfig(dayDiff) {
  const durationDays = { d3: 3, d7: 7, d15: 15, d30: 30 };
  return {
    duration: durationDays[dayDiff] ?? 0
  };
}

function isImmatureCell(weekDate, rowName, selectedDayDiff, todayDate) {
  const maturity = getMaturityConfig(selectedDayDiff);
  const normalizedToday = toMidnightDate(todayDate);
  const weekStart = toMidnightDate(weekDate);
  const weekEnd = addDays(weekStart, 6);
  const maturityDate = addDays(weekEnd, maturity.duration);

  const maturityGateValid = normalizedToday <= maturityDate;
  const finalResult = maturityGateValid;
  console.debug("[Retention][MaturityCheck]", {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    maturityDate: maturityDate.toISOString().slice(0, 10),
    today: normalizedToday.toISOString().slice(0, 10),
    duration: selectedDayDiff,
    maturityGateValid,
    finalResult
  });

  return finalResult;
}

function isStructuralRetentionRowHighlight(selectedDayDiff, rowName) {
  const dayDiff = normalizeString(selectedDayDiff);
  const tier = normalizeString(rowName);

  if (tier === "cpi" || tier === "installs") {
    return false;
  }
  if (dayDiff === "d3") {
    return tier === "h10" || tier === "h20" || tier === "h40";
  }
  if (dayDiff === "d7") {
    return tier === "h20" || tier === "h40";
  }
  if (dayDiff === "d15") {
    return tier === "h40";
  }
  return false;
}

function renderRetentionMetricTable(
  tableId,
  weekBuckets,
  rowNames,
  getFormattedValue,
  selectedDayDiff,
  todayDate,
  options = {}
) {
  const table = document.getElementById(tableId);
  table.textContent = "";
  const rowStartIndex = options.rowStartIndex || 1;
  const colStartIndex = options.colStartIndex || 1;
  const enableConditionalFormatting = options.enableConditionalFormatting === true;
  const debugKey = options.debugKey || tableId;

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const leadingHeader = document.createElement("th");
  leadingHeader.textContent = "Retention /Week >>";
  headerRow.appendChild(leadingHeader);
  weekBuckets.forEach((bucket) => {
    const th = document.createElement("th");
    th.textContent = bucket.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rowNames.forEach((rowName, rowNameIndex) => {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("td");
    rowHeader.textContent = rowName;
    rowHeader.classList.add("metric-primary");
    tr.appendChild(rowHeader);

    weekBuckets.forEach((bucket, bucketIndex) => {
      const td = document.createElement("td");
      const formattedValue = getFormattedValue(rowName, bucket);
      td.textContent = formattedValue;

      const sheetRowIndex = rowStartIndex + rowNameIndex;
      const sheetColumnIndex = colStartIndex + bucketIndex;
      const inTargetRange =
        (sheetRowIndex >= 9 && sheetRowIndex <= 14 && sheetColumnIndex >= 2 && sheetColumnIndex <= 8) ||
        (sheetRowIndex >= 19 && sheetRowIndex <= 23 && sheetColumnIndex >= 2 && sheetColumnIndex <= 8);
      const tier = normalizeString(rowName);
      const isCpiOrInstalls = tier === "cpi" || tier === "installs";
      const immature = isImmatureCell(bucket.date, rowName, selectedDayDiff, todayDate);
      const highlightEligibleRow = tier === "h5" || tier === "h10" || tier === "h20" || tier === "h40";
      const structuralRowHighlight = isStructuralRetentionRowHighlight(selectedDayDiff, rowName);

      if (enableConditionalFormatting && inTargetRange && !isCpiOrInstalls && structuralRowHighlight) {
        td.classList.add("structural-row-cell");
      } else if (enableConditionalFormatting && inTargetRange && !isCpiOrInstalls && highlightEligibleRow && immature) {
        td.classList.add("immature-cell");
        console.debug(
          `[Retention][ImmatureCell] table=${debugKey} rowIndex=${sheetRowIndex} columnKey=${bucket.label} value=${formattedValue}`
        );
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function init() {
  if (typeof SHOW_CSV_TEXT_BY_KEY !== "object" || SHOW_CSV_TEXT_BY_KEY === null) {
    throw new Error("SHOW_CSV_TEXT_BY_KEY is not available in index.html");
  }

  const sectionsByShow = buildShowSectionsMap(SHOW_CSV_TEXT_BY_KEY);
  const performanceShowSelect = document.getElementById("performance-show-select");

  function renderDailySelectedShow() {
    const selectedShow = performanceShowSelect.value;
    renderTable("daily-table", sectionsByShow[selectedShow]?.daily || []);
  }

  function renderWeeklySelectedShow() {
    const selectedShow = performanceShowSelect.value;
    renderTable("weekly-table", sectionsByShow[selectedShow]?.weekly || []);
  }

  performanceShowSelect.addEventListener("change", () => {
    renderDailySelectedShow();
    renderWeeklySelectedShow();
  });

  renderDailySelectedShow();
  renderWeeklySelectedShow();

  if (typeof SPENDS_PLAN_CSV_TEXT !== "string") {
    throw new Error("SPENDS_PLAN_CSV_TEXT is not available in index.html");
  }
  const spendsPlanRows = parseCsv(SPENDS_PLAN_CSV_TEXT);
  const hiddenSectionStartIndex = spendsPlanRows.findIndex(
    (row) => (row[0] || "").trim() === "D-2 Growth Spends"
  );
  const renderLimitIndex = hiddenSectionStartIndex >= 0 ? hiddenSectionStartIndex : spendsPlanRows.length;
  const hiddenCsvRowNumbers = new Set([18, 35]);
  const visibleSpendsPlanRows = spendsPlanRows
    .map((row, index) => ({ values: row, csvRowNumber: index + 1 }))
    .filter((rowEntry) => {
      const csvRowNumber = rowEntry.csvRowNumber;
      return csvRowNumber <= renderLimitIndex && !hiddenCsvRowNumbers.has(csvRowNumber);
    })
    .map((rowEntry) => {
      const rowValues = rowEntry.values;
      if ((rowValues[0] || "").trim() === "" && (rowValues[1] || "").trim() !== "") {
        return { ...rowEntry, values: rowValues.slice(1) };
      }
      return rowEntry;
    });
  const spendsBoldRows = new Set([2, 17, 19, 26, 34]);
  renderRawGridTable("spends-plan-table", visibleSpendsPlanRows, { boldRowNumbers: spendsBoldRows });

  const scriptLevelSpendsCsvText = getScriptLevelSpendsCsvText();
  const scriptLevelSpendsRows = extractScriptLevelSpendsRows(scriptLevelSpendsCsvText);
  renderScriptLevelSpendsTable("script-level-spends-table", scriptLevelSpendsRows);

  if (typeof SHOW_WISE_BASE_DATA_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_BASE_DATA_CSV_TEXT is not available in recoveries-data.js");
  }
  if (typeof SHOW_WISE_COST_DATA_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_COST_DATA_CSV_TEXT is not available in recoveries-data.js");
  }
  if (typeof SHOW_WISE_FORMULA_MAP_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_FORMULA_MAP_CSV_TEXT is not available in recoveries-data.js");
  }
  if (typeof SHOW_WISE_LAYOUT_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_LAYOUT_CSV_TEXT is not available in recoveries-data.js");
  }

  const recoveriesBaseRows = buildCsvRecords(SHOW_WISE_BASE_DATA_CSV_TEXT);
  const recoveriesCostRows = buildCsvRecords(SHOW_WISE_COST_DATA_CSV_TEXT);
  const recoveriesFormulaDefinitions = parseFormulaMetricDefinitions(SHOW_WISE_FORMULA_MAP_CSV_TEXT);
  console.debug("[ShowWiseRecoveries] Formula-derived metric definitions", recoveriesFormulaDefinitions);
  const recoveriesLayoutGrid = buildLayoutGrid(SHOW_WISE_LAYOUT_CSV_TEXT, 24, 33);
  const recoveriesEngine = buildRecoveriesMetricEngine(recoveriesBaseRows, recoveriesCostRows);

  const recoveriesRefreshDateSelect = document.getElementById("recoveries-refresh-date-select");
  const recoveriesShowSelect = document.getElementById("recoveries-show-select");
  const recoveriesSubTeamSelect = document.getElementById("recoveries-sub-team-select");
  const recoveriesLanguageSelect = document.getElementById("recoveries-language-select");

  recoveriesEngine.refreshDates.forEach((refreshDate) => {
    const option = document.createElement("option");
    option.value = refreshDate;
    option.textContent = formatDateLabel(parseIsoDate(refreshDate));
    recoveriesRefreshDateSelect.appendChild(option);
  });

  recoveriesEngine.shows.forEach((showName) => {
    const option = document.createElement("option");
    option.value = showName;
    option.textContent = showName;
    recoveriesShowSelect.appendChild(option);
  });

  const defaultSubTeamOption = document.createElement("option");
  defaultSubTeamOption.value = "__exclude_reengagement_affiliates__";
  defaultSubTeamOption.textContent = "Exclude Re-engagement, Affiliates";
  recoveriesSubTeamSelect.appendChild(defaultSubTeamOption);
  const allSubTeamsOption = document.createElement("option");
  allSubTeamsOption.value = "all";
  allSubTeamsOption.textContent = "All";
  recoveriesSubTeamSelect.appendChild(allSubTeamsOption);
  recoveriesEngine.subTeams.forEach((subTeam) => {
    const option = document.createElement("option");
    option.value = subTeam;
    option.textContent = subTeam;
    recoveriesSubTeamSelect.appendChild(option);
  });
  recoveriesSubTeamSelect.value = "__exclude_reengagement_affiliates__";

  const defaultLanguageOption = document.createElement("option");
  defaultLanguageOption.value = "__exclude_spanish__";
  defaultLanguageOption.textContent = "Exclude Spanish";
  recoveriesLanguageSelect.appendChild(defaultLanguageOption);
  const allLanguagesOption = document.createElement("option");
  allLanguagesOption.value = "all";
  allLanguagesOption.textContent = "All";
  recoveriesLanguageSelect.appendChild(allLanguagesOption);
  recoveriesEngine.languages.forEach((language) => {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language;
    recoveriesLanguageSelect.appendChild(option);
  });
  recoveriesLanguageSelect.value = "__exclude_spanish__";

  const latestRefreshYear = parseIsoDate(recoveriesEngine.refreshDates[0])?.getFullYear() || new Date().getFullYear();
  const layoutRefreshIso = parseSheetStyleDateToIso(recoveriesLayoutGrid.cellMap.get("D1"), latestRefreshYear);
  if (layoutRefreshIso && recoveriesEngine.refreshDates.includes(layoutRefreshIso)) {
    recoveriesRefreshDateSelect.value = layoutRefreshIso;
  }
  const layoutShow = (recoveriesLayoutGrid.cellMap.get("D5") || "").trim();
  if (layoutShow && recoveriesEngine.shows.includes(layoutShow)) {
    recoveriesShowSelect.value = layoutShow;
  }
  const layoutSubTeam = normalizeString(recoveriesLayoutGrid.cellMap.get("D6"));
  if (layoutSubTeam.includes("<>re-engagement") && layoutSubTeam.includes("affiliates")) {
    recoveriesSubTeamSelect.value = "__exclude_reengagement_affiliates__";
  }
  const layoutLanguage = normalizeString(recoveriesLayoutGrid.cellMap.get("D7"));
  if (layoutLanguage.includes("<>spanish")) {
    recoveriesLanguageSelect.value = "__exclude_spanish__";
  }

  function renderShowWiseRecoveriesDashboard() {
    const filters = {
      refreshDate: recoveriesRefreshDateSelect.value || recoveriesEngine.refreshDates[0] || "",
      show: recoveriesShowSelect.value || recoveriesEngine.shows[0] || "",
      subTeam: recoveriesSubTeamSelect.value || "__exclude_reengagement_affiliates__",
      language: recoveriesLanguageSelect.value || "__exclude_spanish__"
    };
    const computed = recoveriesEngine.computeRows(filters);
    renderShowWiseRecoveriesEngineTable("recoveries-table", computed.rows);
    const h12 = computed.rows[0]?.cost ?? 0;
    const d12 = computed.rows[0]?.segment ?? "";
    const baseFilteredCount = filterRecoveriesBaseRows(recoveriesBaseRows, filters, () => true).length;
    const costFilteredCount = filterRecoveriesCostRows(recoveriesCostRows, filters, () => true).length;
    console.debug("[ShowWiseRecoveries][Validation] H12=", h12);
    console.debug("[ShowWiseRecoveries][Validation] M10=", computed.dates.m10);
    console.debug("[ShowWiseRecoveries][Validation] O10=", computed.dates.o10);
    console.debug("[ShowWiseRecoveries][Validation] D12=", d12);
    console.debug("[ShowWiseRecoveries][Validation] FilteredRowCounts base=", baseFilteredCount, "cost=", costFilteredCount);
  }

  recoveriesRefreshDateSelect.addEventListener("change", renderShowWiseRecoveriesDashboard);
  recoveriesShowSelect.addEventListener("change", renderShowWiseRecoveriesDashboard);
  recoveriesSubTeamSelect.addEventListener("change", renderShowWiseRecoveriesDashboard);
  recoveriesLanguageSelect.addEventListener("change", renderShowWiseRecoveriesDashboard);
  renderShowWiseRecoveriesDashboard();

  if (typeof RAW_DUMP_CSV_TEXT !== "string") {
    throw new Error("RAW_DUMP_CSV_TEXT is not available in index.html");
  }

  const rawDumpRows = buildRawDumpRows(RAW_DUMP_CSV_TEXT);
  const deepdiveWeeklyRawRows =
    typeof DEEPDIVE_WEEKLY_RAW_CSV_TEXT === "string" ? buildRawDumpRows(DEEPDIVE_WEEKLY_RAW_CSV_TEXT) : rawDumpRows;
  const deepdiveDailyRawRows =
    typeof DEEPDIVE_DAILY_RAW_CSV_TEXT === "string" ? buildRawDumpRows(DEEPDIVE_DAILY_RAW_CSV_TEXT) : rawDumpRows;
  const deepdiveShowMap = {
    MVS: "My Vampire System",
    FLBM: "First Legendary Beast Master",
    WBT: "Weakest Beast Tamer"
  };
  const deepdiveShowSelect = document.getElementById("deepdive-show-select");

  function renderIosDeepdiveTables() {
    if (!deepdiveShowSelect) {
      return;
    }

    const selectedShowName = deepdiveShowMap[deepdiveShowSelect.value] || "";
    const selectedWeeklyShowRows = deepdiveWeeklyRawRows.filter(
      (row) =>
        normalizeString(getDeepdiveShowName(row)) === normalizeString(selectedShowName) &&
        normalizeString(row.Platform) === "ios"
    );
    const selectedDailyShowRows = deepdiveDailyRawRows.filter(
      (row) =>
        normalizeString(getDeepdiveShowName(row)) === normalizeString(selectedShowName) &&
        normalizeString(row.Platform) === "ios"
    );

    const weeklyBuckets = getLastPeriodsFromRows(selectedWeeklyShowRows, getDeepdiveDateValue, 11);
    const weeklyBucketIsoSet = new Set(weeklyBuckets.map((bucket) => bucket.iso));
    const dailyBuckets = getLastPeriodsFromRows(selectedDailyShowRows, getDeepdiveDateValue, 11);
    const dailyBucketIsoSet = new Set(dailyBuckets.map((bucket) => bucket.iso));

    const weeklyRows = selectedWeeklyShowRows
      .map((row) => {
        const weekDate = parseIsoDate(getDeepdiveDateValue(row));
        if (!weekDate) {
          return null;
        }
        const weekIso = toIsoDateString(toMidnightDate(weekDate));
        return weeklyBucketIsoSet.has(weekIso) ? { ...row, __weekIso: weekIso } : null;
      })
      .filter((row) => row !== null);

    const dailyRows = selectedDailyShowRows
      .map((row) => {
        const installDate = parseIsoDate(getDeepdiveDateValue(row));
        if (!installDate) {
          return null;
        }
        const dayIso = toIsoDateString(installDate);
        return dailyBucketIsoSet.has(dayIso) ? { ...row, __dayIso: dayIso } : null;
      })
      .filter((row) => row !== null);

    const weeklyByMedia = buildPivotMatrix(
      weeklyRows,
      (row) => row.__weekIso,
      (row) => getDeepdiveMediaSource(row) || "Unknown",
      getDeepdiveCost
    );
    renderPivotTable(
      "deepdive-weekly-media-source-table",
      "Week",
      weeklyBuckets,
      weeklyByMedia.dimensionValues,
      weeklyByMedia.valueMap,
      { valueMode: "percentage_split", includeTotalColumn: false }
    );

    const weeklyByOptimization = buildPivotMatrix(
      weeklyRows,
      (row) => row.__weekIso,
      (row) => getDeepdiveOptimization(row) || "Unknown",
      getDeepdiveCost
    );
    renderPivotTable(
      "deepdive-weekly-optimization-table",
      "Week",
      weeklyBuckets,
      weeklyByOptimization.dimensionValues,
      weeklyByOptimization.valueMap,
      { valueMode: "percentage_split", includeTotalColumn: false }
    );

    const weeklyByLaCode = buildPivotMatrix(
      weeklyRows,
      (row) => row.__weekIso,
      (row) => getDeepdiveLaCode(row) || "Unknown",
      getDeepdiveCost
    );
    renderPivotTable(
      "deepdive-weekly-la-code-table",
      "Week",
      weeklyBuckets,
      weeklyByLaCode.dimensionValues,
      weeklyByLaCode.valueMap,
      { valueMode: "percentage_split", includeTotalColumn: false }
    );

    const dailyByMedia = buildPivotMatrix(
      dailyRows,
      (row) => row.__dayIso,
      (row) => getDeepdiveMediaSource(row) || "Unknown",
      getDeepdiveCost
    );
    renderPivotTable(
      "deepdive-daily-media-source-table",
      "Day",
      dailyBuckets,
      dailyByMedia.dimensionValues,
      dailyByMedia.valueMap,
      { valueMode: "percentage_split", includeTotalColumn: false }
    );
  }

  if (deepdiveShowSelect) {
    deepdiveShowSelect.addEventListener("change", renderIosDeepdiveTables);
    renderIosDeepdiveTables();
  }

  const retentionShowSelect = document.getElementById("retention-show-select");
  const retentionPlatformSelect = document.getElementById("retention-platform-select");
  const retentionMediaSourceSelect = document.getElementById("retention-media-source-select");
  const retentionAdsetInput = document.getElementById("retention-adset-id-select");
  const retentionCampaignInput = document.getElementById("retention-campaign-id-select");
  const retentionAdsetOptions = document.getElementById("retention-adset-id-list");
  const retentionCampaignOptions = document.getElementById("retention-campaign-id-list");
  const retentionDayDiffSelect = document.getElementById("retention-day-diff-select");
  const retentionDebugTotalRows = document.getElementById("retention-debug-total-rows");
  const retentionDebugAdsetCount = document.getElementById("retention-debug-adset-count");
  const retentionDebugCampaignCount = document.getElementById("retention-debug-campaign-count");
  const retentionDebugMatchingRows = document.getElementById("retention-debug-matching-rows");
  const benchmarkCpi = 19.49;

  const showValues = uniqueSorted(rawDumpRows.map((row) => row.Show_Name));
  const platformValues = uniqueSorted(rawDumpRows.map((row) => row.Platform));
  const mediaSourceValues = uniqueSorted(rawDumpRows.map((row) => row.Media_Source));
  const adsetValues = uniqueSorted(rawDumpRows.map((row) => row.Adset_ID));
  const campaignValues = uniqueSorted(rawDumpRows.map((row) => row.Campaign_ID));
  const dayDiffValues = orderDayDiffValues(rawDumpRows.map((row) => row.day_diff));
  const campaignValueSet = new Set(campaignValues.map((value) => normalizeString(value)));

  setSelectOptions(retentionShowSelect, showValues);
  setSelectOptions(retentionPlatformSelect, platformValues);
  setSelectOptions(retentionMediaSourceSelect, mediaSourceValues);
  const campaignComboBox = createSearchableComboBox({
    inputElement: retentionCampaignInput,
    optionsElement: retentionCampaignOptions,
    initialOptions: campaignValues,
    allowEmpty: true,
    emptyLabel: "Any (Optional)"
  });
  const adsetComboBox = createSearchableComboBox({
    inputElement: retentionAdsetInput,
    optionsElement: retentionAdsetOptions,
    initialOptions: adsetValues,
    allowEmpty: false
  });
  setSelectOptions(retentionDayDiffSelect, dayDiffValues);

  retentionDebugTotalRows.textContent = `Total RAW_DUMP rows loaded: ${rawDumpRows.length}`;
  retentionDebugAdsetCount.textContent = `Unique Adset IDs: ${adsetValues.length}`;
  retentionDebugCampaignCount.textContent = `Unique Campaign IDs: ${campaignValues.length}`;
  console.debug(
    `[Retention] totals loaded -> rows: ${rawDumpRows.length}, unique Campaign IDs: ${campaignValues.length}, unique Adset IDs: ${adsetValues.length}`
  );

  function refreshAdsetOptionsByCampaign() {
    const selectedCampaignNormalized = normalizeString(campaignComboBox.getValue());
    const campaignIsActive = campaignValueSet.has(selectedCampaignNormalized);
    const adsetSourceRows = !campaignIsActive
      ? rawDumpRows
      : rawDumpRows.filter((row) => normalizeString(row.Campaign_ID) === selectedCampaignNormalized);
    const adsetOptionsForCampaign = uniqueSorted(adsetSourceRows.map((row) => row.Adset_ID));
    adsetComboBox.setOptions(adsetOptionsForCampaign, { preserveValue: true });
  }

  function refreshRetentionFiltersAndRender() {
    refreshAdsetOptionsByCampaign();

    const selectedFilters = {
      show: retentionShowSelect.value,
      platform: retentionPlatformSelect.value,
      mediaSource: retentionMediaSourceSelect.value,
      adsetId: adsetComboBox.getValue(),
      campaignId: campaignComboBox.getValue(),
      dayDiff: retentionDayDiffSelect.value
    };
    selectedFilters.showNormalized = normalizeString(selectedFilters.show);
    selectedFilters.platformNormalized = normalizeString(selectedFilters.platform);
    selectedFilters.mediaSourceNormalized = normalizeString(selectedFilters.mediaSource);
    selectedFilters.adsetNormalized = normalizeString(selectedFilters.adsetId);
    selectedFilters.campaignNormalized = normalizeString(selectedFilters.campaignId);
    selectedFilters.dayDiffNormalized = normalizeString(selectedFilters.dayDiff);
    selectedFilters.campaignIsActive = campaignValueSet.has(selectedFilters.campaignNormalized);

    console.debug("[Retention] Selected filters", selectedFilters);

    const fullyFilteredRows = rawDumpRows.filter((row) => doesRowMatchFilters(row, selectedFilters));
    retentionDebugMatchingRows.textContent = `Rows matching current filters: ${fullyFilteredRows.length}`;
    console.debug(`[Retention] Rows returned after filtering: ${fullyFilteredRows.length}`);

    const weekBuckets = getLastSevenWeekBuckets(new Date());
    const weeklyRows = weekBuckets.map((bucket) => {
      const weekMatches = fullyFilteredRows.filter((row) => normalizeString(row.Install_Period) === normalizeString(bucket.iso));
      console.debug(`[Retention] Week ${bucket.iso} matched rows: ${weekMatches.length}`);
      if (weekMatches.length > 1) {
        console.warn(`[Retention] Multiple matches for week ${bucket.iso}; using first row.`);
      }
      if (weekMatches.length === 0) {
        const stageChecks = [
          {
            name: "Install_Period",
            count: rawDumpRows.filter((row) => normalizeString(row.Install_Period) === normalizeString(bucket.iso)).length
          },
          {
            name: "Show_Name",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized
            ).length
          },
          {
            name: "Platform",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized
            ).length
          },
          {
            name: "Media_Source",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                normalizeString(row.Media_Source) === selectedFilters.mediaSourceNormalized
            ).length
          },
          {
            name: "Adset_ID",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                normalizeString(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                normalizeString(normalizeIdString(row.Adset_ID)) === selectedFilters.adsetNormalized
            ).length
          },
          {
            name: "day_diff",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                normalizeString(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                normalizeString(normalizeIdString(row.Adset_ID)) === selectedFilters.adsetNormalized &&
                normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized
            ).length
          }
        ];

        if (selectedFilters.campaignIsActive) {
          stageChecks.push({
            name: "Campaign_ID",
            count: rawDumpRows.filter(
              (row) =>
                normalizeString(row.Install_Period) === normalizeString(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                normalizeString(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                normalizeString(normalizeIdString(row.Adset_ID)) === selectedFilters.adsetNormalized &&
                normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized &&
                normalizeString(row.Campaign_ID) === selectedFilters.campaignNormalized
            ).length
          });
        }

        const failingStage = stageChecks.find((stage) => stage.count === 0);
        console.debug(
          `[Retention] No row for week ${bucket.iso}. First mismatch at: ${failingStage ? failingStage.name : "unknown"}`,
          stageChecks
        );
      }

      const match = weekMatches[0];
      const installs = parseMetricNumber(match?.Installs);
      const cost = parseMetricNumber(match?.Cost);
      const h5Users = parseMetricNumber(match?.H5_same_show_users);
      const h10Users = parseMetricNumber(match?.H10_same_show_users);
      const h20Users = parseMetricNumber(match?.H20_same_show_users);
      const h40Users = parseMetricNumber(match?.H40_same_show_users);

      const cpi = Number.isFinite(installs) && installs > 0 && Number.isFinite(cost) ? cost / installs : NaN;
      const h5 = Number.isFinite(installs) && installs > 0 && Number.isFinite(h5Users) ? h5Users / installs : NaN;
      const h10 =
        Number.isFinite(installs) && installs > 0 && Number.isFinite(h10Users) ? h10Users / installs : NaN;
      const h20 =
        Number.isFinite(installs) && installs > 0 && Number.isFinite(h20Users) ? h20Users / installs : NaN;
      const h40 =
        Number.isFinite(installs) && installs > 0 && Number.isFinite(h40Users) ? h40Users / installs : NaN;

      return { ...bucket, installs, cpi, h5, h10, h20, h40 };
    });

    const rowNamesRaw = ["CPI", "Installs", "H5", "H10", "H20", "H40"];
    renderRetentionMetricTable(
      "retention-raw-table",
      weeklyRows,
      rowNamesRaw,
      (rowName, weekRow) => {
        if (rowName === "CPI") return formatCurrency(weekRow.cpi);
        if (rowName === "Installs") return formatInstalls(weekRow.installs);
        if (rowName === "H5") return formatPercent(weekRow.h5);
        if (rowName === "H10") return formatPercent(weekRow.h10);
        if (rowName === "H20") return formatPercent(weekRow.h20);
        if (rowName === "H40") return formatPercent(weekRow.h40);
        return "";
      },
      selectedFilters.dayDiffNormalized,
      new Date(),
      {
        rowStartIndex: 9,
        colStartIndex: 2,
        enableConditionalFormatting: true,
        debugKey: "raw-metrics"
      }
    );

    const rowNamesNormalized = ["Installs", "H5", "H10", "H20", "H40"];
    renderRetentionMetricTable(
      "retention-normalized-table",
      weeklyRows,
      rowNamesNormalized,
      (rowName, weekRow) => {
        if (rowName === "Installs") return formatInstalls(weekRow.installs);
        if (!Number.isFinite(weekRow.cpi) || weekRow.cpi <= 0) return "";
        if (rowName === "H5") return formatPercent((benchmarkCpi * weekRow.h5) / weekRow.cpi);
        if (rowName === "H10") return formatPercent((benchmarkCpi * weekRow.h10) / weekRow.cpi);
        if (rowName === "H20") return formatPercent((benchmarkCpi * weekRow.h20) / weekRow.cpi);
        if (rowName === "H40") return formatPercent((benchmarkCpi * weekRow.h40) / weekRow.cpi);
        return "";
      },
      selectedFilters.dayDiffNormalized,
      new Date(),
      {
        rowStartIndex: 19,
        colStartIndex: 2,
        enableConditionalFormatting: true,
        debugKey: "normalized-metrics"
      }
    );
  }

  [
    retentionShowSelect,
    retentionPlatformSelect,
    retentionMediaSourceSelect,
    retentionDayDiffSelect
  ].forEach((selectElement) => {
    selectElement.addEventListener("change", refreshRetentionFiltersAndRender);
  });
  retentionAdsetInput.addEventListener("change", refreshRetentionFiltersAndRender);
  retentionCampaignInput.addEventListener("change", refreshRetentionFiltersAndRender);
  retentionAdsetInput.addEventListener("blur", refreshRetentionFiltersAndRender);
  retentionCampaignInput.addEventListener("blur", refreshRetentionFiltersAndRender);

  refreshRetentionFiltersAndRender();
}

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  function activateTab(tabId) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tabTarget === tabId;
      button.classList.toggle("is-active", isActive);
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === tabId);
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tabTarget);
    });
  });
}

try {
  initTabs();
  init();
} catch (error) {
  document.body.textContent = error.message;
}
