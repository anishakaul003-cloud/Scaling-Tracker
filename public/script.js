const LIVE_DUMP_SOURCE = {
  webAppUrl: window.IOS_PERFORMANCE_DUMP_API_URL || "",
  authToken: window.IOS_PERFORMANCE_DUMP_AUTH_TOKEN || "",
  timeoutMs: 5 * 60 * 1000,
  sources: {
    iosPerformanceDump: "ios_performance_dump",
    spendsPlan: "spends_plan_tracking",
    retentionView: "retention_view",
    rawDump: "raw_dump",
    spendsWeekly: "spends_weekly",
    spendsDaily: "spends_daily"
  },
  statusOnlySources: {
    costData: "cost_data",
    baseData: "base_data"
  },
  healthUrl: "/__ios_performance_dump_health"
};

const dumpHealthState = {
  lastRefreshAt: null,
  remoteUrl: LIVE_DUMP_SOURCE.webAppUrl || "not-configured",
  dumps: {
    performance: { label: "iOS Performance", source: "unknown", updatedAt: null, details: "not loaded yet" },
    spendsPlan: { label: "Spends Plan", source: "unknown", updatedAt: null, details: "not loaded yet" },
    retentionView: { label: "Retention View", source: "unknown", updatedAt: null, details: "not loaded yet" },
    rawDump: { label: "RAW_DUMP", source: "unknown", updatedAt: null, details: "not loaded yet" },
    costData: { label: "Cost_Data", source: "unknown", updatedAt: null, details: "not loaded yet" },
    baseData: { label: "Base_Data", source: "unknown", updatedAt: null, details: "not loaded yet" },
    recoveries: { label: "Recoveries", source: "unknown", updatedAt: null, details: "not loaded yet" },
    deepdiveWeekly: { label: "Deepdive Weekly", source: "unknown", updatedAt: null, details: "not loaded yet" },
    deepdiveDaily: { label: "Deepdive Daily", source: "unknown", updatedAt: null, details: "not loaded yet" }
  }
};

function setDumpHealthStatus(key, nextValues) {
  const existing = dumpHealthState.dumps[key] || { label: key, source: "unknown", updatedAt: null, details: "" };
  dumpHealthState.dumps[key] = { ...existing, ...nextValues };
  dumpHealthState.lastRefreshAt = new Date().toISOString();
}

function formatIstTimestamp(timestamp) {
  if (!timestamp) return "n/a";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  const text = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: true
  }).format(date);
  return `${text} IST`;
}

function sourceDisplayName(source) {
  if (source === "local-cache" || source === "remote-live") return "api-fetch";
  return source;
}

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

function escapeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function datasetToCsv(dataset) {
  const headers = Array.isArray(dataset?.headers) ? dataset.headers : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];

  if (headers.length === 0) {
    return "";
  }

  const headerLine = headers.map((header) => escapeCsvCell(header)).join(",");
  const dataLines = rows.map((row) => {
    if (Array.isArray(row)) {
      return headers.map((_, index) => escapeCsvCell(row[index])).join(",");
    }
    return headers.map((header) => escapeCsvCell(row?.[header])).join(",");
  });

  return [headerLine, ...dataLines].join("\r\n");
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildSourceCacheUrl(sourceKey) {
  return `/__dump_cache/${encodeURIComponent(sourceKey)}.csv`;
}

async function loadRemoteSourceCsvMap(sourceKeys) {
  if (!LIVE_DUMP_SOURCE.webAppUrl) {
    return {};
  }

  const url = new URL(LIVE_DUMP_SOURCE.webAppUrl);
  if (sourceKeys.length === 1) {
    url.searchParams.set("source", sourceKeys[0]);
  } else {
    url.searchParams.set("sources", sourceKeys.join(","));
  }
  if (LIVE_DUMP_SOURCE.authToken) {
    url.searchParams.set("token", LIVE_DUMP_SOURCE.authToken);
  }

  const payload = await fetchJsonWithTimeout(url.toString(), LIVE_DUMP_SOURCE.timeoutMs);
  if (!payload?.ok) {
    throw new Error(payload?.error || "Live source returned a non-ok response");
  }

  const result = {};
  if (sourceKeys.length === 1 && payload?.data?.headers && payload?.data?.rows) {
    result[sourceKeys[0]] = {
      csvText: datasetToCsv(payload.data),
      generatedAt: payload.generatedAt || null,
      rowCount: Array.isArray(payload?.data?.rows) ? payload.data.rows.length : null
    };
    return result;
  }

  const responseData = payload?.data || {};
  sourceKeys.forEach((sourceKey) => {
    const sourceEntry = responseData[sourceKey];
    const dataset = sourceEntry?.data || sourceEntry;
    const csvText = datasetToCsv(dataset);
    if (!csvText) {
      return;
    }
    result[sourceKey] = {
      csvText,
      generatedAt: payload.generatedAt || null,
      rowCount: Array.isArray(dataset?.rows) ? dataset.rows.length : null
    };
  });

  if (Object.keys(result).length === 0) {
    throw new Error("No remote source returned usable CSV payloads");
  }

  return result;
}

async function loadLocalCachedCsvText(sourceKey) {
  const response = await fetch(buildSourceCacheUrl(sourceKey), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Local cache request failed (${sourceKey}) with status ${response.status}`);
  }
  const text = await response.text();
  return text.trim() ? text : "";
}

async function loadLocalCacheHealth() {
  if (!LIVE_DUMP_SOURCE.healthUrl) {
    return null;
  }
  try {
    const response = await fetch(LIVE_DUMP_SOURCE.healthUrl, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

function renderDumpHealthToggle() {
  const toggle = document.getElementById("dump-health-toggle");
  const panel = document.getElementById("dump-health-panel");
  const list = document.getElementById("dump-health-list");
  const lastRefresh = document.getElementById("dump-health-last-refresh");

  if (!toggle || !panel || !list || !lastRefresh) {
    return;
  }

  const dumpEntries = Object.values(dumpHealthState.dumps);
  const knownCount = dumpEntries.filter((entry) => sourceDisplayName(entry.source) !== "unknown").length;
  toggle.textContent = `Status ${knownCount}/${dumpEntries.length}`;
  lastRefresh.textContent = formatIstTimestamp(dumpHealthState.lastRefreshAt);

  list.textContent = "";
  dumpEntries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "dump-health-item";

    const title = document.createElement("p");
    title.className = "dump-health-item-title";
    title.textContent = `${entry.label}: ${sourceDisplayName(entry.source)}`;

    const meta = document.createElement("p");
    meta.className = "dump-health-item-meta";
    const updated = formatIstTimestamp(entry.updatedAt);
    meta.textContent = `Updated: ${updated} | ${entry.details || "n/a"}`;

    item.appendChild(title);
    item.appendChild(meta);
    list.appendChild(item);
  });

  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      toggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }
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

function isLikelyDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  return /^(mon|tue|wed|thu|fri|sat|sun)\s/i.test(text);
}

function isPlainNumberText(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (text.includes("$") || text.includes("%") || text.includes(",")) return false;
  if (isLikelyDateText(text)) return false;
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text);
}

function formatUsdCompact(value) {
  if (!Number.isFinite(value)) return "";
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(normalized);
}

function formatSpendsCellValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!isPlainNumberText(text)) return value;

  const numberValue = Number(text);
  if (!Number.isFinite(numberValue)) return value;
  return formatUsdCompact(numberValue);
}

function interpolateColor(startColor, endColor, ratio) {
  const bounded = Math.max(0, Math.min(1, ratio));
  const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * bounded);
  const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * bounded);
  const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * bounded);
  return `rgb(${r}, ${g}, ${b})`;
}

function getColumnMetricDirection(tableId, headerText) {
  const normalizedHeader = String(headerText ?? "").toLowerCase().trim();
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
      const renderedCellValue = isSpendsTable ? formatSpendsCellValue(cellValue) : cellValue;
      td.textContent = renderedCellValue;

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

      if (/^-\$?\d|^-\d/.test(String(renderedCellValue ?? "").trim())) {
        td.classList.add("value-negative");
      }
      if (
        renderedCellValue === "$0.00" ||
        renderedCellValue === "$0" ||
        renderedCellValue === "0.00%" ||
        renderedCellValue === "0"
      ) {
        td.classList.add("value-muted");
      }

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
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

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== ""))).sort((a, b) => a.localeCompare(b));
}

function orderDayDiffValues(values) {
  const dayDiffOrder = ["d3", "d7", "d15", "d30"];
  const normalized = Array.from(new Set(values.map((value) => normalizeString(value)).filter((value) => value !== "")));
  const orderedKnown = dayDiffOrder.filter((dayDiff) => normalized.includes(dayDiff));
  const remaining = normalized.filter((value) => !dayDiffOrder.includes(value)).sort((a, b) => a.localeCompare(b));
  return [...orderedKnown, ...remaining];
}

function setSelectOptions(selectElement, values, emptyLabel = null, getLabel = null) {
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
    option.textContent = typeof getLabel === "function" ? getLabel(value) : value;
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

function normalizeIdKey(value) {
  return normalizeString(normalizeIdString(value));
}

function normalizeDateKey(value) {
  const parsed = parseIsoDate(value);
  return parsed ? toIsoDateString(parsed) : normalizeString(value);
}

function isWildcardSelection(normalizedValue) {
  return normalizedValue === "" || normalizedValue === "all";
}

function getPlatformDisplayLabel(value) {
  const normalized = normalizeString(value);
  if (normalized === "ios") return "iOS";
  if (normalized === "android") return "Android";
  return normalizeIdString(value);
}

function getDayDiffDisplayLabel(value) {
  return normalizeIdString(value).toUpperCase();
}

function getMediaSourceGroup(value) {
  const normalized = normalizeString(value);
  if (normalized.includes("googleadwords") || normalized.includes("google ads")) return "google_ads";
  if (normalized.includes("facebook") || normalized.includes("meta")) return "meta";
  if (normalized.includes("bytedance") || normalized.includes("tiktok") || normalized.includes("tik tok")) return "tiktok";
  return "other";
}

function getMediaSourceDisplayLabel(value) {
  if (value === "google_ads") return "Google Ads";
  if (value === "meta") return "Meta";
  if (value === "tiktok") return "TikTok";
  return normalizeIdString(value);
}

function doesRowMatchFilters(row, selectedFilters) {
  const adsetMatches = !selectedFilters.adsetIsActive || normalizeIdKey(row.Adset_ID) === selectedFilters.adsetNormalized;
  const campaignMatches = !selectedFilters.campaignIsActive || normalizeIdKey(row.Campaign_ID) === selectedFilters.campaignNormalized;
  const showMatches =
    isWildcardSelection(selectedFilters.showNormalized) ||
    normalizeString(row.Show_Name) === selectedFilters.showNormalized;
  const platformMatches =
    isWildcardSelection(selectedFilters.platformNormalized) ||
    normalizeString(row.Platform) === selectedFilters.platformNormalized;
  const mediaSourceMatches =
    isWildcardSelection(selectedFilters.mediaSourceNormalized) ||
    getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized;
  const dayDiffMatches =
    isWildcardSelection(selectedFilters.dayDiffNormalized) ||
    normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized;

  return (
    showMatches &&
    platformMatches &&
    mediaSourceMatches &&
    adsetMatches &&
    dayDiffMatches &&
    campaignMatches
  );
}

function matchesRetentionFormulaRow(row, selectedFilters, installPeriodIso, requireNonZeroInstalls) {
  const showMatches =
    isWildcardSelection(selectedFilters.showNormalized) ||
    normalizeString(row.Show_Name) === selectedFilters.showNormalized;
  const platformMatches =
    isWildcardSelection(selectedFilters.platformNormalized) ||
    normalizeString(row.Platform) === selectedFilters.platformNormalized;
  const mediaSourceMatches =
    isWildcardSelection(selectedFilters.mediaSourceNormalized) ||
    getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized;
  const adsetMatches =
    !selectedFilters.adsetIsActive ||
    normalizeIdKey(row.Adset_ID) === selectedFilters.adsetNormalized;
  const campaignMatches =
    !selectedFilters.campaignIsActive ||
    normalizeIdKey(row.Campaign_ID) === selectedFilters.campaignNormalized;
  const dayDiffMatches =
    isWildcardSelection(selectedFilters.dayDiffNormalized) ||
    normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized;
  const periodMatches = normalizeDateKey(row.Install_Period) === normalizeDateKey(installPeriodIso);
  const installs = parseMetricNumber(row.Installs);
  const nonZeroInstalls = !requireNonZeroInstalls || (Number.isFinite(installs) && installs !== 0);

  return (
    showMatches &&
    platformMatches &&
    mediaSourceMatches &&
    adsetMatches &&
    campaignMatches &&
    dayDiffMatches &&
    periodMatches &&
    nonZeroInstalls
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

function bindIdInputSanitizer(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener("input", () => {
    const sanitized = normalizeIdString(inputElement.value).replace(/[^\w.-]/g, "");
    if (sanitized !== inputElement.value) {
      inputElement.value = sanitized;
    }
  });
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

function hasRawDumpSchema(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const sample = rows[0] || {};
  const keys = Object.keys(sample);
  return keys.includes("Install_Period") && keys.includes("day_diff");
}

function parseUsDateToIso(text) {
  const raw = normalizeIdString(text);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const dateValue = new Date(year, month - 1, day);
  if (Number.isNaN(dateValue.getTime())) return null;
  return toIsoDateString(dateValue);
}

function parsePrecomputedRetentionView(rawDumpCsvText) {
  const rows = parseCsv(rawDumpCsvText);
  if (rows.length === 0) return null;

  const firstHeaderIndex = rows.findIndex((row) => normalizeString(row[0]) === "retention /week >>");
  if (firstHeaderIndex < 0) return null;

  const secondHeaderIndex = rows.findIndex(
    (row, index) => index > firstHeaderIndex && normalizeString(row[0]) === "retention /week >>"
  );
  if (secondHeaderIndex < 0) return null;

  const headerDates = rows[firstHeaderIndex].slice(1).filter((cell) => normalizeIdString(cell) !== "");
  const weekBuckets = headerDates
    .map((cell) => {
      const iso = parseUsDateToIso(cell);
      const dateValue = iso ? parseIsoDate(iso) : null;
      if (!iso || !dateValue) return null;
      return { iso, date: dateValue, label: formatDateLabel(dateValue) };
    })
    .filter((entry) => entry !== null);

  const readMetricMap = (startIndex) => {
    const metricMap = new Map();
    for (let i = startIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowName = normalizeIdString(row[0]);
      if (!rowName) break;
      if (normalizeString(rowName) === "normalised retention") continue;
      if (normalizeString(rowName) === "retention /week >>") break;
      metricMap.set(
        rowName.toUpperCase(),
        weekBuckets.map((bucket, columnIndex) => parseMetricNumber(row[columnIndex + 1]))
      );
    }
    return metricMap;
  };

  const rawMetrics = readMetricMap(firstHeaderIndex);
  const normalizedMetrics = readMetricMap(secondHeaderIndex);
  if (weekBuckets.length === 0 || rawMetrics.size === 0) return null;

  const metaByPrefix = (prefix) => {
    const row = rows.find((cells) => normalizeString(cells[0]).startsWith(prefix));
    return normalizeIdString(row?.[1] || "");
  };

  return {
    weekBuckets,
    rawMetrics,
    normalizedMetrics,
    meta: {
      show: metaByPrefix("show >>"),
      platform: metaByPrefix("platform >>"),
      mediaSource: metaByPrefix("media source >>"),
      adsetId: metaByPrefix("ad set id >>"),
      campaignId: metaByPrefix("campaign id >>"),
      dayDiff: normalizeString(metaByPrefix("day diff >>")) || "d30"
    }
  };
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

async function init() {
  renderDumpHealthToggle();

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

  const embeddedSpendsPlanCsvText = typeof SPENDS_PLAN_CSV_TEXT === "string" ? SPENDS_PLAN_CSV_TEXT : "";
  const embeddedRawDumpCsvText = typeof RAW_DUMP_CSV_TEXT === "string" ? RAW_DUMP_CSV_TEXT : "";
  const embeddedDeepdiveWeeklyCsvText =
    typeof DEEPDIVE_WEEKLY_RAW_CSV_TEXT === "string" ? DEEPDIVE_WEEKLY_RAW_CSV_TEXT : "";
  const embeddedDeepdiveDailyCsvText =
    typeof DEEPDIVE_DAILY_RAW_CSV_TEXT === "string" ? DEEPDIVE_DAILY_RAW_CSV_TEXT : "";

  let spendsPlanCsvText = embeddedSpendsPlanCsvText;
  let rawDumpCsvText = embeddedRawDumpCsvText;
  let deepdiveWeeklyCsvText = embeddedDeepdiveWeeklyCsvText;
  let deepdiveDailyCsvText = embeddedDeepdiveDailyCsvText;

  const sourceToDumpKey = {
    [LIVE_DUMP_SOURCE.sources.iosPerformanceDump]: "performance",
    [LIVE_DUMP_SOURCE.sources.spendsPlan]: "spendsPlan",
    [LIVE_DUMP_SOURCE.sources.retentionView]: "retentionView",
    [LIVE_DUMP_SOURCE.sources.rawDump]: "rawDump",
    [LIVE_DUMP_SOURCE.sources.spendsWeekly]: "deepdiveWeekly",
    [LIVE_DUMP_SOURCE.sources.spendsDaily]: "deepdiveDaily",
    [LIVE_DUMP_SOURCE.statusOnlySources.costData]: "costData",
    [LIVE_DUMP_SOURCE.statusOnlySources.baseData]: "baseData"
  };

  const sourceCsvMap = {};
  const sourceErrors = {};
  const allSourceKeys = Object.values(LIVE_DUMP_SOURCE.sources);
  const localHealth = await loadLocalCacheHealth();

  for (const sourceKey of allSourceKeys) {
    try {
      const csvText = await loadLocalCachedCsvText(sourceKey);
      if (!csvText) {
        sourceErrors[sourceKey] = "empty local cache";
        continue;
      }
      sourceCsvMap[sourceKey] = csvText;
      const dumpKey = sourceToDumpKey[sourceKey];
      if (!dumpKey) {
        return;
      }
      const sourceHealth = localHealth?.sources?.[sourceKey];
      setDumpHealthStatus(dumpKey, {
        source: "local-cache",
        updatedAt: sourceHealth?.updatedAt || localHealth?.updatedAt || new Date().toISOString(),
        details: sourceHealth?.ok
          ? `Local cache (${sourceHealth.rowCount || 0} rows)`
          : "Local cache"
      });
    } catch (error) {
      sourceErrors[sourceKey] = error.message || String(error);
    }
  }

  const missingSourceKeys = allSourceKeys.filter((sourceKey) => !sourceCsvMap[sourceKey]);
  if (missingSourceKeys.length > 0) {
    try {
      const remoteCsvMap = await loadRemoteSourceCsvMap(missingSourceKeys);
      missingSourceKeys.forEach((sourceKey) => {
        const remoteEntry = remoteCsvMap[sourceKey];
        if (!remoteEntry?.csvText) {
          if (!sourceErrors[sourceKey]) {
            sourceErrors[sourceKey] = "remote response missing source payload";
          }
          return;
        }
        sourceCsvMap[sourceKey] = remoteEntry.csvText;
        const dumpKey = sourceToDumpKey[sourceKey];
        if (!dumpKey) {
          return;
        }
        setDumpHealthStatus(dumpKey, {
          source: "remote-live",
          updatedAt: remoteEntry.generatedAt || new Date().toISOString(),
          details: `Apps Script (${remoteEntry.rowCount || 0} rows)`
        });
      });
    } catch (error) {
      const remoteError = error.message || String(error);
      missingSourceKeys.forEach((sourceKey) => {
        if (!sourceErrors[sourceKey]) {
          sourceErrors[sourceKey] = remoteError;
        }
      });
    }
  }

  if (sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsPlan]) {
    spendsPlanCsvText = sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsPlan];
  }
  if (sourceCsvMap[LIVE_DUMP_SOURCE.sources.rawDump]) {
    rawDumpCsvText = sourceCsvMap[LIVE_DUMP_SOURCE.sources.rawDump];
  } else if (sourceCsvMap[LIVE_DUMP_SOURCE.sources.retentionView]) {
    rawDumpCsvText = sourceCsvMap[LIVE_DUMP_SOURCE.sources.retentionView];
  }
  if (sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsWeekly]) {
    deepdiveWeeklyCsvText = sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsWeekly];
  }
  if (sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsDaily]) {
    deepdiveDailyCsvText = sourceCsvMap[LIVE_DUMP_SOURCE.sources.spendsDaily];
  }

  Object.entries(LIVE_DUMP_SOURCE.statusOnlySources).forEach(([statusKey, sourceKey]) => {
    const sourceHealth = localHealth?.sources?.[sourceKey];
    if (sourceHealth) {
      setDumpHealthStatus(statusKey, {
        source: sourceHealth.ok ? "local-cache" : "unavailable",
        updatedAt: sourceHealth.updatedAt || localHealth?.updatedAt || new Date().toISOString(),
        details: sourceHealth.ok
          ? `Local cache (${sourceHealth.rowCount || 0} rows)`
          : sourceHealth.error || "Local cache unavailable"
      });
      return;
    }

    setDumpHealthStatus(statusKey, {
      source: "unknown",
      updatedAt: localHealth?.updatedAt || new Date().toISOString(),
      details: "not loaded yet"
    });
  });

  const performanceSourceKey = LIVE_DUMP_SOURCE.sources.iosPerformanceDump;
  if (sourceCsvMap[performanceSourceKey]) {
    setDumpHealthStatus("performance", {
      source: dumpHealthState.dumps.performance.source === "local-cache" ? "local-cache" : "remote-live",
      details: "Loaded"
    });
  }

  const embeddedFallbackSources = new Set([
    LIVE_DUMP_SOURCE.sources.iosPerformanceDump,
    LIVE_DUMP_SOURCE.sources.spendsPlan,
    LIVE_DUMP_SOURCE.sources.retentionView,
    LIVE_DUMP_SOURCE.sources.rawDump,
    LIVE_DUMP_SOURCE.sources.spendsWeekly,
    LIVE_DUMP_SOURCE.sources.spendsDaily
  ]);

  Object.entries(sourceToDumpKey).forEach(([sourceKey, dumpKey]) => {
    if (!sourceCsvMap[sourceKey]) {
      setDumpHealthStatus(dumpKey, {
        source: embeddedFallbackSources.has(sourceKey) ? "embedded-local" : "unavailable",
        updatedAt: new Date().toISOString(),
        details: embeddedFallbackSources.has(sourceKey)
          ? sourceErrors[sourceKey]
            ? `Fallback | ${sourceErrors[sourceKey]}`
            : "Fallback to embedded constants"
          : sourceErrors[sourceKey] || "No fallback configured"
      });
    }
  });
  renderDumpHealthToggle();

  const hasSpendsPlanSource = Boolean(spendsPlanCsvText);
  const spendsPlanRows = parseCsv(spendsPlanCsvText);
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
    })
    .filter((rowEntry) => {
      const nonEmptyValues = rowEntry.values.map((value) => String(value ?? "").trim()).filter((value) => value !== "");
      if (nonEmptyValues.length === 0) return false;
      const syntheticHeaderCells = nonEmptyValues.filter(
        (value) => /^Column_\d+$/i.test(value) || isLikelyDateText(value)
      );
      return syntheticHeaderCells.length !== nonEmptyValues.length;
    });
  const spendsBoldRows = new Set([2, 17, 19, 26, 34]);
  renderRawGridTable("spends-plan-table", visibleSpendsPlanRows, { boldRowNumbers: spendsBoldRows });

  if (typeof RECOVERIES_CSV_TEXT_BY_KEY !== "object" || RECOVERIES_CSV_TEXT_BY_KEY === null) {
    throw new Error("RECOVERIES_CSV_TEXT_BY_KEY is not available in index.html");
  }
  const recoveriesRowsByShow = buildRecoveriesRowsMap(RECOVERIES_CSV_TEXT_BY_KEY);
  const recoveriesSelect = document.getElementById("recoveries-show-select");

  function renderSelectedRecoveriesShow() {
    const selectedShow = recoveriesSelect.value;
    renderRawGridTable("recoveries-table", recoveriesRowsByShow[selectedShow] || []);
  }

  recoveriesSelect.addEventListener("change", renderSelectedRecoveriesShow);
  renderSelectedRecoveriesShow();
  if (dumpHealthState.dumps.recoveries.source === "unknown") {
    setDumpHealthStatus("recoveries", {
      source: "embedded-local",
      updatedAt: new Date().toISOString(),
      details: "Inline constants"
    });
  }

  const hasRawDumpSource = Boolean(rawDumpCsvText);

  let rawDumpRows = hasRawDumpSource ? buildRawDumpRows(rawDumpCsvText) : [];
  const deepdiveWeeklyRawRows = deepdiveWeeklyCsvText ? buildRawDumpRows(deepdiveWeeklyCsvText) : rawDumpRows;
  const deepdiveDailyRawRows = deepdiveDailyCsvText ? buildRawDumpRows(deepdiveDailyCsvText) : rawDumpRows;
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
  let benchmarkCpi = 19.49;
  let retentionUsesEmbeddedRawFallback = false;
  bindIdInputSanitizer(retentionAdsetInput);
  bindIdInputSanitizer(retentionCampaignInput);

  if (!hasRawDumpSchema(rawDumpRows) && embeddedRawDumpCsvText) {
    const embeddedRawDumpRows = buildRawDumpRows(embeddedRawDumpCsvText);
    if (hasRawDumpSchema(embeddedRawDumpRows)) {
      rawDumpRows = embeddedRawDumpRows;
      retentionUsesEmbeddedRawFallback = true;
    }
  }

  if (!hasRawDumpSchema(rawDumpRows)) {
    const precomputedRetention = parsePrecomputedRetentionView(rawDumpCsvText);
    if (precomputedRetention) {
      const { weekBuckets, rawMetrics, normalizedMetrics, meta } = precomputedRetention;
      const dayDiffValue = meta.dayDiff || "d30";

      benchmarkCpi = parseMetricNumber(rawMetrics.get("CPI")?.[0]) || benchmarkCpi;

      const precomputedMediaSourceGroup = getMediaSourceGroup(meta.mediaSource || "");
      setSelectOptions(retentionShowSelect, [meta.show || "N/A"]);
      setSelectOptions(retentionPlatformSelect, [meta.platform || "N/A"], null, getPlatformDisplayLabel);
      setSelectOptions(
        retentionMediaSourceSelect,
        [precomputedMediaSourceGroup],
        null,
        getMediaSourceDisplayLabel
      );
      setSelectOptions(retentionDayDiffSelect, [dayDiffValue], null, getDayDiffDisplayLabel);
      retentionAdsetInput.value = meta.adsetId || "";
      retentionCampaignInput.value = meta.campaignId || "";

      [
        retentionShowSelect,
        retentionPlatformSelect,
        retentionMediaSourceSelect,
        retentionDayDiffSelect,
        retentionAdsetInput,
        retentionCampaignInput
      ].forEach((element) => {
        element.disabled = true;
      });

      retentionDebugTotalRows.textContent = `Precomputed Retention rows loaded: ${weekBuckets.length} weeks`;
      retentionDebugAdsetCount.textContent = "Mode: Precomputed retention sheet";
      retentionDebugCampaignCount.textContent = "Filters are locked to source metadata";
      retentionDebugMatchingRows.textContent = `Day diff: ${getDayDiffDisplayLabel(dayDiffValue)}`;

      const rawRowNames = ["CPI", "Installs", "H5", "H10", "H20", "H40"];
      renderRetentionMetricTable(
        "retention-raw-table",
        weekBuckets,
        rawRowNames,
        (rowName, bucket) => {
          const rowValues = rawMetrics.get(rowName.toUpperCase()) || [];
          const value = rowValues[weekBuckets.findIndex((entry) => entry.iso === bucket.iso)];
          if (rowName === "CPI") return formatCurrency(value);
          if (rowName === "Installs") return formatInstalls(value);
          return formatPercent(value);
        },
        dayDiffValue,
        new Date(),
        {
          rowStartIndex: 9,
          colStartIndex: 2,
          enableConditionalFormatting: true,
          debugKey: "raw-metrics-precomputed"
        }
      );

      const normalizedRowNames = ["Installs", "H5", "H10", "H20", "H40"];
      renderRetentionMetricTable(
        "retention-normalized-table",
        weekBuckets,
        normalizedRowNames,
        (rowName, bucket) => {
          const rowValues = normalizedMetrics.get(rowName.toUpperCase()) || [];
          const value = rowValues[weekBuckets.findIndex((entry) => entry.iso === bucket.iso)];
          if (rowName === "Installs") return formatInstalls(value);
          return formatPercent(value);
        },
        dayDiffValue,
        new Date(),
        {
          rowStartIndex: 19,
          colStartIndex: 2,
          enableConditionalFormatting: true,
          debugKey: "normalized-metrics-precomputed"
        }
      );

      return;
    }
  }

  const showValues = uniqueSorted(rawDumpRows.map((row) => row.Show_Name));
  const platformValues = uniqueSorted(rawDumpRows.map((row) => row.Platform));
  const preferredMediaSourceOrder = ["meta", "google_ads", "tiktok"];
  const availableMediaSourceGroups = preferredMediaSourceOrder.filter((group) =>
    rawDumpRows.some((row) => getMediaSourceGroup(row.Media_Source) === group)
  );
  const mediaSourceValues = availableMediaSourceGroups.length > 0 ? availableMediaSourceGroups : ["meta", "google_ads", "tiktok"];
  const adsetValues = uniqueSorted(rawDumpRows.map((row) => row.Adset_ID));
  const campaignValues = uniqueSorted(rawDumpRows.map((row) => row.Campaign_ID));
  const dayDiffValues = orderDayDiffValues(rawDumpRows.map((row) => row.day_diff));
  const adsetValueSet = new Set(adsetValues.map((value) => normalizeIdKey(value)));
  const campaignValueSet = new Set(campaignValues.map((value) => normalizeIdKey(value)));

  setSelectOptions(retentionShowSelect, showValues, "All Shows");
  setSelectOptions(retentionPlatformSelect, platformValues, "All Platforms", getPlatformDisplayLabel);
  setSelectOptions(retentionMediaSourceSelect, mediaSourceValues, "All Media Sources", getMediaSourceDisplayLabel);
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
    allowEmpty: true,
    emptyLabel: "Any (Optional)"
  });
  setSelectOptions(retentionDayDiffSelect, dayDiffValues, "All Day Diffs", getDayDiffDisplayLabel);
  campaignComboBox.setValue("", false);
  adsetComboBox.setValue("", false);
  retentionShowSelect.value = "";
  retentionPlatformSelect.value = "";
  retentionMediaSourceSelect.value = "";
  retentionDayDiffSelect.value = "";

  retentionDebugTotalRows.textContent = `Total RAW_DUMP rows loaded: ${rawDumpRows.length}`;
  retentionDebugAdsetCount.textContent = `Unique Adset IDs: ${adsetValues.length}`;
  retentionDebugCampaignCount.textContent = `Unique Campaign IDs: ${campaignValues.length}`;
  if (retentionUsesEmbeddedRawFallback) {
    retentionDebugMatchingRows.textContent = "Source: embedded RAW_DUMP fallback (interactive filters enabled)";
  }
  console.debug(
    `[Retention] totals loaded -> rows: ${rawDumpRows.length}, unique Campaign IDs: ${campaignValues.length}, unique Adset IDs: ${adsetValues.length}`
  );

  function refreshAdsetOptionsByCampaign() {
    const selectedCampaignNormalized = normalizeIdKey(campaignComboBox.getValue());
    const campaignIsActive = campaignValueSet.has(selectedCampaignNormalized);
    const adsetSourceRows = !campaignIsActive
      ? rawDumpRows
      : rawDumpRows.filter((row) => normalizeIdKey(row.Campaign_ID) === selectedCampaignNormalized);
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
    selectedFilters.adsetNormalized = normalizeIdKey(selectedFilters.adsetId);
    selectedFilters.campaignNormalized = normalizeIdKey(selectedFilters.campaignId);
    selectedFilters.dayDiffNormalized = normalizeString(selectedFilters.dayDiff);
    selectedFilters.adsetIsActive = adsetValueSet.has(selectedFilters.adsetNormalized);
    selectedFilters.campaignIsActive = campaignValueSet.has(selectedFilters.campaignNormalized);

    console.debug("[Retention] Selected filters", selectedFilters);

    const fullyFilteredRows = rawDumpRows.filter((row) => doesRowMatchFilters(row, selectedFilters));
    retentionDebugMatchingRows.textContent = `Rows matching current filters: ${fullyFilteredRows.length}`;
    console.debug(`[Retention] Rows returned after filtering: ${fullyFilteredRows.length}`);

    const weekBuckets = getLastSevenWeekBuckets(new Date());
    const weeklyRows = weekBuckets.map((bucket) => {
      const weekMatches = rawDumpRows.filter((row) =>
        matchesRetentionFormulaRow(row, selectedFilters, bucket.iso, false)
      );
      const weekRateMatches = rawDumpRows.filter((row) =>
        matchesRetentionFormulaRow(row, selectedFilters, bucket.iso, true)
      );
      console.debug(`[Retention] Week ${bucket.iso} matched rows: ${weekMatches.length}`);
      if (weekMatches.length > 1) {
        console.warn(`[Retention] Multiple matches for week ${bucket.iso}; using first row.`);
      }
      if (weekMatches.length === 0) {
        const stageChecks = [
          {
            name: "Install_Period",
            count: rawDumpRows.filter((row) => normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso)).length
          },
          {
            name: "Show_Name",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized
            ).length
          },
          {
            name: "Platform",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized
            ).length
          },
          {
            name: "Media_Source",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized
            ).length
          },
          {
            name: "day_diff",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized
            ).length
          }
        ];

        if (selectedFilters.adsetIsActive) {
          stageChecks.push({
            name: "Adset_ID",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized &&
                normalizeIdKey(row.Adset_ID) === selectedFilters.adsetNormalized
            ).length
          });
        }

        if (selectedFilters.campaignIsActive) {
          stageChecks.push({
            name: "Campaign_ID",
            count: rawDumpRows.filter(
              (row) =>
                normalizeDateKey(row.Install_Period) === normalizeDateKey(bucket.iso) &&
                normalizeString(row.Show_Name) === selectedFilters.showNormalized &&
                normalizeString(row.Platform) === selectedFilters.platformNormalized &&
                getMediaSourceGroup(row.Media_Source) === selectedFilters.mediaSourceNormalized &&
                (!selectedFilters.adsetIsActive ||
                  normalizeIdKey(row.Adset_ID) === selectedFilters.adsetNormalized) &&
                normalizeString(row.day_diff) === selectedFilters.dayDiffNormalized &&
                normalizeIdKey(row.Campaign_ID) === selectedFilters.campaignNormalized
            ).length
          });
        }

        const failingStage = stageChecks.find((stage) => stage.count === 0);
        console.debug(
          `[Retention] No row for week ${bucket.iso}. First mismatch at: ${failingStage ? failingStage.name : "unknown"}`,
          stageChecks
        );
      }

      const match = weekRateMatches[0] || weekMatches[0];
      const installs = parseMetricNumber(match && match.Installs);
      const cost = parseMetricNumber(match && match.Cost);
      const h5Users = parseMetricNumber(match && match.H5_same_show_users);
      const h10Users = parseMetricNumber(match && match.H10_same_show_users);
      const h20Users = parseMetricNumber(match && match.H20_same_show_users);
      const h40Users = parseMetricNumber(match && match.H40_same_show_users);

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

  if (!hasSpendsPlanSource) {
    setDumpHealthStatus("spendsPlan", {
      source: "unavailable",
      updatedAt: new Date().toISOString(),
      details: "No spends plan source available"
    });
  }
  if (!hasRawDumpSource) {
    setDumpHealthStatus("retentionView", {
      source: "unavailable",
      updatedAt: new Date().toISOString(),
      details: "No Retention View source available"
    });
  }
  renderDumpHealthToggle();
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
  init().catch((error) => {
    document.body.textContent = error.message;
  });
} catch (error) {
  document.body.textContent = error.message;
}
