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
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function trimTrailingEmptyCells(row) {
  let lastFilledIndex = row.length - 1;
  while (lastFilledIndex >= 0 && String(row[lastFilledIndex] ?? "").trim() === "") {
    lastFilledIndex -= 1;
  }
  return row.slice(0, lastFilledIndex + 1);
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

function extractSectionRowsByMarker(parsedRows, markerFirstCell, headerFirstCell) {
  const markerIndex = parsedRows.findIndex((row) => (row[0] || "").trim() === markerFirstCell);
  if (markerIndex === -1) {
    return [];
  }

  let headerIndex = -1;
  for (let i = markerIndex + 1; i < parsedRows.length; i += 1) {
    if ((parsedRows[i]?.[0] || "").trim() === headerFirstCell) {
      headerIndex = i;
      break;
    }
  }
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
  if (tableId === "daily-table" || tableId === "weekly-table" || tableId === "cpi-metrics-table") {
    applyIosPerformanceConditionalFormatting(table, rows);
  }
}

function renderTableWithHeaderRows(tableId, rows, headerRowCount = 1) {
  const table = document.getElementById(tableId);
  if (!table) {
    return;
  }
  table.textContent = "";

  if (!rows || rows.length === 0) {
    return;
  }

  const normalizedRows = rows
    .map((row) => trimTrailingEmptyCells((row || []).map((cell) => String(cell ?? ""))))
    .filter((row) => row.length > 0);
  if (normalizedRows.length === 0) {
    return;
  }

  const columnCount = Math.max(...normalizedRows.map((row) => row.length));
  const paddedRows = normalizedRows.map((row) => {
    if (row.length >= columnCount) {
      return row;
    }
    return [...row, ...Array(columnCount - row.length).fill("")];
  });

  const safeHeaderRowCount = Math.max(0, Math.min(headerRowCount, paddedRows.length));
  if (safeHeaderRowCount > 0) {
    const thead = document.createElement("thead");
    paddedRows.slice(0, safeHeaderRowCount).forEach((rowCells, rowIndex) => {
      const tr = document.createElement("tr");
      rowCells.forEach((value, columnIndex) => {
        const th = document.createElement("th");
        th.textContent = value;
        if (rowIndex === safeHeaderRowCount - 1 && columnIndex === 0) {
          th.classList.add("metric-primary");
        }
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    });
    table.appendChild(thead);
  }

  const bodyRows = paddedRows.slice(safeHeaderRowCount);
  if (bodyRows.length === 0) {
    return;
  }

  const tbody = document.createElement("tbody");
  bodyRows.forEach((rowCells) => {
    const tr = document.createElement("tr");
    rowCells.forEach((value, columnIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (columnIndex === 0) {
        td.classList.add("metric-primary");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  if (tableId.startsWith("deepdive-")) {
    applyDeepdiveConditionalFormatting(table);
  }
}

function renderTableWithMergedGroupHeaderRow(tableId, rows, options = {}) {
  const table = document.getElementById(tableId);
  if (!table) {
    return;
  }
  table.textContent = "";

  if (!rows || rows.length === 0) {
    return;
  }

  const normalizedRows = rows
    .map((row) => trimTrailingEmptyCells((row || []).map((cell) => String(cell ?? ""))))
    .filter((row) => row.length > 0);
  if (normalizedRows.length === 0) {
    return;
  }

  const columnCount = Math.max(...normalizedRows.map((row) => row.length));
  const paddedRows = normalizedRows.map((row) => {
    if (row.length >= columnCount) {
      return row;
    }
    return [...row, ...Array(columnCount - row.length).fill("")];
  });

  const requestedHeaderRowCount = Number(options.headerRowCount ?? 1);
  const safeHeaderRowCount = Math.max(0, Math.min(requestedHeaderRowCount, paddedRows.length));
  const requestedGroupHeaderRowIndex = Number(options.groupHeaderRowIndex ?? 1);
  const groupHeaderRowIndex = Math.max(0, Math.min(requestedGroupHeaderRowIndex, safeHeaderRowCount - 1));
  const leafHeaderRowIndex = safeHeaderRowCount - 1;

  if (safeHeaderRowCount > 0) {
    const thead = document.createElement("thead");

    paddedRows.slice(0, safeHeaderRowCount).forEach((rowCells, rowIndex) => {
      const tr = document.createElement("tr");

      if (rowIndex !== groupHeaderRowIndex) {
        rowCells.forEach((value, columnIndex) => {
          const th = document.createElement("th");
          th.textContent = value;
          if (rowIndex === leafHeaderRowIndex && columnIndex === 0) {
            th.classList.add("metric-primary");
          }
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        return;
      }

      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const currentValue = rowCells[columnIndex] || "";
        const currentNormalized = normalizeString(currentValue);

        if (columnIndex > 0 && currentNormalized === "") {
          continue;
        }

        const th = document.createElement("th");
        th.textContent = currentValue;

        let colspan = 1;
        if (columnIndex > 0 && currentNormalized !== "") {
          for (let nextIndex = columnIndex + 1; nextIndex < columnCount; nextIndex += 1) {
            const nextGroupValue = normalizeString(rowCells[nextIndex] || "");
            const nextLeafValue = normalizeString((paddedRows[leafHeaderRowIndex] || [])[nextIndex] || "");
            if (nextGroupValue !== "" || nextLeafValue === "") {
              break;
            }
            colspan += 1;
          }
        }

        if (colspan > 1) {
          th.colSpan = colspan;
          columnIndex += colspan - 1;
        }
        tr.appendChild(th);
      }

      thead.appendChild(tr);
    });

    table.appendChild(thead);
  }

  const bodyRows = paddedRows.slice(safeHeaderRowCount);
  if (bodyRows.length === 0) {
    return;
  }

  const tbody = document.createElement("tbody");
  bodyRows.forEach((rowCells) => {
    const tr = document.createElement("tr");
    rowCells.forEach((value, columnIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (columnIndex === 0) {
        td.classList.add("metric-primary");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  if (tableId.startsWith("deepdive-")) {
    applyDeepdiveConditionalFormatting(table);
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
  const normalizedHeader = String(headerText ?? "").toLowerCase().trim();
  const costEfficiencyMetrics = new Set([
    "cpi",
    "cpfw d7",
    "d15 cpfsw",
    "d30 cpfsw",
    "d15 cpnssw",
    "d30 cpnssw"
  ]);

  if (tableId === "cpi-metrics-table") {
    const cpiLowerBetterMetrics = new Set([
      "cpi - meta",
      "cpm - meta",
      "cpi - uac",
      "cpm - uac",
      "cpi - tt",
      "cpm - tiktok"
    ]);
    if (cpiLowerBetterMetrics.has(normalizedHeader)) {
      return "lower_better";
    }

    const cpiHigherBetterMetrics = new Set([
      "ctr - meta (%)",
      "cti - meta (%)",
      "ctr - uac",
      "cti - uac",
      "ctr - tiktok",
      "cti - tiktok"
    ]);
    return cpiHigherBetterMetrics.has(normalizedHeader) ? "higher_better" : null;
  }

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
    "ss d15h20",
    "ssd15h20",
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
  const headerRow = table.querySelector("thead tr:last-child");
  const headerCells = headerRow ? Array.from(headerRow.querySelectorAll("th")) : [];
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

function renderRawGridTableElement(table, rows, options = {}) {
  table.textContent = "";

  if (rows.length === 0) {
    return;
  }

  const tbody = document.createElement("tbody");
  const isSpendsTable = table.classList.contains("spends-plan-table");
  let tableMaxColumns = null;
  if (isSpendsTable && table.classList.contains("spends-table-1")) {
    rows.some((rowEntry) => {
      const rowValues = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
      const plannedIndex = rowValues.findIndex(
        (cell) => normalizeString(cell) === "planned drr"
      );
      if (plannedIndex >= 0) {
        tableMaxColumns = plannedIndex + 1;
        return true;
      }
      return false;
    });
  }
  const getLastNonEmptyIndex = (rowValues) => {
    let lastIndex = -1;
    for (let i = 0; i < rowValues.length; i += 1) {
      if (String(rowValues[i] ?? "").trim() !== "") {
        lastIndex = i;
      }
    }
    return lastIndex;
  };
  const getRowEffectiveLength = (rowValues, isChannelHeader) => {
    const lastNonEmptyIndex = getLastNonEmptyIndex(rowValues);
    const baseLength = lastNonEmptyIndex + 1;
    return isChannelHeader ? Math.max(baseLength, 10) : baseLength;
  };

  const boldRowNumbers = options.boldRowNumbers || null;

  let spendsSectionIndex = 1;

  rows.forEach((rowEntry, rowIndex) => {
    const row = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    const csvRowNumber = Array.isArray(rowEntry) ? rowIndex + 1 : rowEntry.csvRowNumber;
    const tr = document.createElement("tr");
    const firstNonEmptyCell = row.find((cell) => cell && cell.trim() !== "") || "";
    const isSpendsRowInSpendsTable = isSpendsTable;
    const isSpacerRow = isSpendsTable && row.every((cell) => String(cell ?? "").trim() === "");
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
      isSpendsTable &&
      channelHeaderCount >= 4 &&
      (normalizeString(row[0] || "") === "meta" || normalizeString(row[1] || "") === "meta");
    const isPlatformSpendsHeaderRow =
      isSpendsTable &&
      (hasNormalizedCell("android") || hasNormalizedCell("ios")) &&
      (hasNormalizedCell("total") ||
        table.classList.contains("spends-table-2") ||
        table.classList.contains("spends-table-3"));
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
    const isPlatformBudgetMergedRowAlt =
      isSpendsTable &&
      normalizeString(row[0] || "") === "" &&
      Number.isFinite(parseScaleNumber(row[1])) &&
      normalizeString(row[2] || "") === "" &&
      normalizeString(row[3] || "") === "" &&
      normalizeString(row[4] || "") === "" &&
      Number.isFinite(parseScaleNumber(row[5])) &&
      normalizeString(row[6] || "") === "" &&
      normalizeString(row[7] || "") === "" &&
      normalizeString(row[8] || "") === "";
    const channelRowNeedsShowNamePrefix =
      isChannelSpendsHeaderRow && normalizeString(row[0] || "") === "meta";
    const channelHeaderDisplayRow = channelRowNeedsShowNamePrefix
      ? ["Show Name", "Meta", "UAC", "Tik Tok", "Snapchat", "Meta", "UAC", "Tik Tok", "Snapchat", "Total"]
      : null;
    const isPlannedShowNameHeaderRow =
      isSpendsTable &&
      normalizeString(row[0]) === "show name" &&
      (hasNormalizedCell("android") || hasNormalizedCell("ios")) &&
      normalizeString(firstNonEmptyCell) === "show name";
    const removeShowNameLabel = isPlannedShowNameHeaderRow && spendsSectionIndex >= 2;

    const getDisplayCellValue = (columnIndex) => {
      if (channelRowNeedsShowNamePrefix) {
        return channelHeaderDisplayRow[columnIndex] ?? "";
      }
      if (removeShowNameLabel && normalizeString(row[columnIndex]) === "show name") {
        return "";
      }
      return row[columnIndex] ?? "";
    };

    if (boldRowNumbers && boldRowNumbers.has(csvRowNumber)) {
      tr.classList.add("row-force-bold");
    }
    if (isSpendsTable && firstNonEmptyCell.startsWith("D-2 Overall")) {
      spendsSectionIndex += 1;
      tr.classList.add("spends-section-divider");
    } else if (isSpendsTable && spendsSectionIndex === 1) {
      tr.classList.add("spends-section-one");
    }
    if (
      isSpendsTable &&
      (firstNonEmptyCell.startsWith("D-2 Overall Spends") ||
        firstNonEmptyCell.startsWith("D-2 Planned Spends - Growth"))
    ) {
      tr.classList.add("spends-title-row");
    }
    if (isSpacerRow) {
      tr.classList.add("spends-spacer-row");
    }
    if (isPrimarySpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-primary");
    } else if (isChannelSpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-secondary");
    } else if (isPlatformSpendsHeaderRow) {
      tr.classList.add("spends-header-row", "spends-header-platform");
    }

    if (isPlatformSpendsHeaderRow && (table.classList.contains("spends-table-2") || table.classList.contains("spends-table-3"))) {
      const makeCell = (label, span = 1) => {
        const th = document.createElement("th");
        th.textContent = label;
        if (span > 1) {
          th.colSpan = span;
        }
        th.classList.add("spends-merged-header-cell");
        return th;
      };
      tr.appendChild(makeCell(""));
      tr.appendChild(makeCell("Android", 4));
      tr.appendChild(makeCell("iOS", 4));
      tr.appendChild(makeCell(""));
      tbody.appendChild(tr);
      return;
    }

    if (isPlatformBudgetMergedRow || isPlatformBudgetMergedRowAlt) {
      tr.classList.add("spends-platform-budget-row");
      const showNameSpacerCell = document.createElement("td");
      showNameSpacerCell.textContent = "";
      tr.appendChild(showNameSpacerCell);

      const androidValueCell = document.createElement("td");
      androidValueCell.textContent = (isPlatformBudgetMergedRowAlt ? row[1] : row[0]) ?? "";
      androidValueCell.colSpan = 4;
      androidValueCell.classList.add("metric-primary", "spends-merged-value-cell");
      tr.appendChild(androidValueCell);

      const iosValueCell = document.createElement("td");
      iosValueCell.textContent = (isPlatformBudgetMergedRowAlt ? row[5] : row[4]) ?? "";
      iosValueCell.colSpan = 4;
      iosValueCell.classList.add("metric-primary", "spends-merged-value-cell");
      tr.appendChild(iosValueCell);

      const totalValue = (isPlatformBudgetMergedRowAlt ? row[9] : row[8]) ?? "";
      const totalValueCell = document.createElement("td");
      totalValueCell.textContent = totalValue;
      totalValueCell.classList.add("metric-primary", "spends-merged-value-cell");
      tr.appendChild(totalValueCell);

      tbody.appendChild(tr);
      return;
    }

    let rowEffectiveLength = getRowEffectiveLength(row, channelRowNeedsShowNamePrefix);
    if (isSpendsRowInSpendsTable) {
      if (table.classList.contains("spends-table-1")) {
        rowEffectiveLength = isSpacerRow ? Math.max(rowEffectiveLength, 1) : rowEffectiveLength;
      } else {
        rowEffectiveLength = isSpacerRow ? Math.max(rowEffectiveLength, 1) : 10;
      }
    }
    if (tableMaxColumns) {
      rowEffectiveLength = Math.min(rowEffectiveLength, tableMaxColumns);
    }
    for (let i = 0; i < rowEffectiveLength; i += 1) {
      const td = document.createElement("td");
      const cellValue = getDisplayCellValue(i);
      td.textContent = cellValue;
      if (isSpacerRow && i === 0) {
        td.colSpan = isSpendsTable ? 10 : rowEffectiveLength;
        td.classList.add("spends-spacer-cell");
      }

      const canMergeSpendsCells =
        isSpendsRowInSpendsTable &&
        !isSpacerRow &&
        cellValue.trim() !== "" &&
        (isChannelSpendsHeaderRow ||
          isPlatformSpendsHeaderRow ||
          firstNonEmptyCell.startsWith("D-2"));
      if (canMergeSpendsCells) {
        let span = 1;
        for (let j = i + 1; j < rowEffectiveLength; j += 1) {
          const nextValue = getDisplayCellValue(j);
          if (String(nextValue ?? "").trim() !== "") {
            break;
          }
          span += 1;
        }
        if (span > 1) {
          td.colSpan = span;
          i += span - 1;
        }
      }

    if (isPlatformSpendsHeaderRow) {
      if (table.classList.contains("spends-table-2") || table.classList.contains("spends-table-3")) {
        const thEmptyLeft = document.createElement("th");
        thEmptyLeft.textContent = "";
        thEmptyLeft.classList.add("spends-merged-header-cell");
        tr.appendChild(thEmptyLeft);

        const thAndroid = document.createElement("th");
        thAndroid.textContent = "Android";
        thAndroid.colSpan = 4;
        thAndroid.classList.add("spends-merged-header-cell");
        tr.appendChild(thAndroid);

        const thIos = document.createElement("th");
        thIos.textContent = "iOS";
        thIos.colSpan = 4;
        thIos.classList.add("spends-merged-header-cell");
        tr.appendChild(thIos);

        const thEmptyRight = document.createElement("th");
        thEmptyRight.textContent = "";
        thEmptyRight.classList.add("spends-merged-header-cell");
        tr.appendChild(thEmptyRight);

        tbody.appendChild(tr);
        return;
      }
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

      if (isSpendsRowInSpendsTable) {
        if (firstNonEmptyCell.startsWith("D-2") || firstNonEmptyCell === "Show Name") {
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
        if (channelHeaderTokens.has(normalizeString(cellValue))) {
          td.classList.add("spends-channel-title");
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

function renderRawGridTable(tableId, rows, options = {}) {
  const table = document.getElementById(tableId);
  renderRawGridTableElement(table, rows, options);
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

  const showGroupMetaByStart = new Map();
  (() => {
    const groups = [];
    let currentGroup = null;
    rows.forEach((row, index) => {
      const trimmedShow = (row.showName || "").trim();
      if (trimmedShow) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { label: trimmedShow, startIndex: index, length: 1 };
      } else if (currentGroup) {
        currentGroup.length += 1;
      } else {
        currentGroup = { label: "", startIndex: index, length: 1 };
      }
    });
    if (currentGroup) {
      groups.push(currentGroup);
    }
    groups.forEach((group) => showGroupMetaByStart.set(group.startIndex, group));
  })();

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
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const isTotalRow = normalizeString(row.showName) === "total";
    if (isTotalRow) {
      tr.classList.add("script-level-total-row");
    }

    const groupMeta = showGroupMetaByStart.get(index);
    if (groupMeta) {
      const showNameCell = document.createElement("td");
      showNameCell.textContent = groupMeta.label;
      showNameCell.rowSpan = groupMeta.length;
      showNameCell.classList.add("metric-primary", "script-level-show-cell");
      tr.appendChild(showNameCell);
    }

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

  Object.entries(showCsvTextByKey).forEach(([showKey, csvText]) => {
    const parsedRows = parseCsv(csvText);
    sectionsByShow[showKey] = {
      daily: extractSectionRows(parsedRows, "Day"),
      weekly: extractSectionRows(parsedRows, "Week"),
      cpiMetrics: extractSectionRowsByMarker(parsedRows, "CPI Metrics", "Week")
    };
  });

  return sectionsByShow;
}

function splitSpendsPlanShortfall(rows) {
  let inPlannedSection = false;
  let shortfallStartIndex = -1;
  const mainRows = [];
  const shortfallRows = [];

  rows.forEach((rowEntry) => {
    const row = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    const firstNonEmptyCell = row.find((cell) => cell && cell.trim() !== "") || "";
    const normalizedFirst = normalizeString(firstNonEmptyCell);

    if (normalizedFirst.startsWith("d-2 overall planned spends")) {
      inPlannedSection = true;
    }

    if (inPlannedSection) {
      const shortfallIndex = row.findIndex((cell) =>
        normalizeString(cell).includes("d-2 overall planned spends - shortfall")
      );
      if (shortfallIndex >= 0) {
        shortfallStartIndex = shortfallIndex;
      }
    }

    if (inPlannedSection && shortfallStartIndex >= 0) {
      const mainSlice = row.slice(0, shortfallStartIndex);
      const shortfallSlice = row.slice(shortfallStartIndex);
      mainRows.push({ ...rowEntry, values: mainSlice });
      if (shortfallSlice.some((cell) => String(cell ?? "").trim() !== "")) {
        shortfallRows.push({ ...rowEntry, values: shortfallSlice });
      }
      return;
    }

    mainRows.push(rowEntry);
  });

  if (shortfallRows.length > 0) {
    const spacer = { values: [""], csvRowNumber: 0 };
    return [...mainRows, spacer, ...shortfallRows];
  }
  return mainRows;
}

function addSpendsPlanSpacing(rows) {
  const output = [];

  const getFirstNonEmptyCell = (rowValues) => rowValues.find((cell) => String(cell ?? "").trim() !== "") || "";
  const isEmptyRow = (rowValues) => rowValues.every((cell) => String(cell ?? "").trim() === "");
  let sectionIndex = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowEntry = rows[i];
    output.push(rowEntry);

    const rowValues = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    if (isEmptyRow(rowValues)) {
      continue;
    }

    const firstCell = getFirstNonEmptyCell(rowValues);
    if (firstCell.startsWith("D-2 Overall Planned Spends - Shortfall")) {
      sectionIndex = 3;
    } else if (firstCell.startsWith("D-2 Overall Planned Spends")) {
      sectionIndex = 2;
    } else if (firstCell.startsWith("D-2 Overall Spends")) {
      sectionIndex = 1;
    }

    const normalizedFirst = normalizeString(firstCell);
    if (sectionIndex === 0 && normalizedFirst === "mtd diff") {
      continue;
    }

    if (normalizedFirst !== "total") {
      continue;
    }
    if (sectionIndex === 2) {
      continue;
    }
  }

  return output;
}

function splitSpendsPlanSections(rows) {
  const sections = [];
  let currentIndex = 0;
  let seenTable1End = false;
  sections[currentIndex] = [];

  const getFirstNonEmptyCell = (rowValues) => rowValues.find((cell) => String(cell ?? "").trim() !== "") || "";

  rows.forEach((rowEntry) => {
    const rowValues = Array.isArray(rowEntry) ? rowEntry : rowEntry.values;
    const firstCell = getFirstNonEmptyCell(rowValues);
    const isEmptyRow = rowValues.every((cell) => String(cell ?? "").trim() === "");
    if (currentIndex === 0 && isEmptyRow) {
      return;
    }
    if (firstCell.startsWith("D-2 Overall Spends")) {
      currentIndex = 1;
      sections[currentIndex] = [];
      seenTable1End = false;
    } else if (firstCell.startsWith("D-2 Planned Spends - Growth")) {
      currentIndex = 2;
      sections[currentIndex] = [];
      seenTable1End = false;
    } else if (firstCell.startsWith("D-2 Overall Planned Spends - Shortfall")) {
      currentIndex = 3;
      sections[currentIndex] = [];
      seenTable1End = false;
    }
    if (currentIndex === 0 && seenTable1End) {
      return;
    }
    sections[currentIndex].push(rowEntry);
    if (currentIndex === 0 && normalizeString(firstCell) === "mtd diff") {
      seenTable1End = true;
    }
  });

  const cleaned = sections.filter((section) => section && section.length > 0);
  if (cleaned[0]) {
    while (cleaned[0].length > 0) {
      const lastRow = cleaned[0][cleaned[0].length - 1];
      const values = Array.isArray(lastRow) ? lastRow : lastRow.values;
      const hasContent = values.some((cell) => String(cell ?? "").trim() !== "");
      if (hasContent) {
        break;
      }
      cleaned[0].pop();
    }
  }
  return cleaned;
}

function renderSpendsPlanTables(containerId, sections, options = {}) {
  const container = document.getElementById(containerId);
  container.textContent = "";

  sections.forEach((rows, index) => {
    const table = document.createElement("table");
    table.classList.add("spends-plan-table", "data-table", `spends-table-${index + 1}`);
    renderRawGridTableElement(table, rows, options);
    container.appendChild(table);
  });
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

let cachedRecoveriesLayoutRows = null;

function getRecoveriesLayoutRows() {
  if (cachedRecoveriesLayoutRows !== null) {
    return cachedRecoveriesLayoutRows;
  }
  if (typeof SHOW_WISE_LAYOUT_CSV_TEXT !== "string") {
    cachedRecoveriesLayoutRows = [];
  } else {
    cachedRecoveriesLayoutRows = parseCsv(SHOW_WISE_LAYOUT_CSV_TEXT);
  }
  return cachedRecoveriesLayoutRows;
}

let cachedRecoveriesLayoutMetadata = null;

function getRecoveriesLayoutMetadata() {
  if (cachedRecoveriesLayoutMetadata !== null) {
    return cachedRecoveriesLayoutMetadata;
  }
  const layoutRows = getRecoveriesLayoutRows();
  if (layoutRows.length === 0) {
    cachedRecoveriesLayoutMetadata = null;
    return null;
  }
  const headerRowIndex = layoutRows.findIndex((row) => {
    return (row[3] || "").trim() === "D3";
  });
  if (headerRowIndex === -1) {
    cachedRecoveriesLayoutMetadata = null;
    return null;
  }

  const subSegments = new Set(["Facebook", "Google", "Tik Tok", "Organic"]);
  const rowMap = new Map();
  let currentParent = "";
  for (let i = headerRowIndex + 1; i < layoutRows.length; i += 1) {
    const row = layoutRows[i];
    if (!row) {
      continue;
    }
    const labelCellIndex = row.findIndex((cell, idx) => idx >= 3 && String(cell || "").trim());
    const label = labelCellIndex >= 0 ? String(row[labelCellIndex]).trim() : "";
    if (!label) {
      currentParent = "";
      continue;
    }

    let key = label;
    if (label === "Android" || label === "iOS") {
      currentParent = label;
    } else if (currentParent && subSegments.has(label)) {
      key = `${currentParent}>${label}`;
    } else {
      currentParent = "";
    }
    rowMap.set(key, row);
  }

  const metricRow = layoutRows[headerRowIndex] || [];
  const firstMetricCol = metricRow.findIndex(
    (cell, idx) => idx >= 4 && String(cell || "").trim()
  );
  const layoutMainColumnStartIndex = firstMetricCol >= 0 ? firstMetricCol : 4;
  const layoutMainColumnOffset = Math.max(0, layoutMainColumnStartIndex - 1);

  const findColumnIndex = (matcher) => {
    for (const row of layoutRows) {
      for (let col = 0; col < row.length; col += 1) {
        const cell = String(row[col] || "").trim();
        if (matcher(cell)) {
          return col;
        }
      }
    }
    return -1;
  };

  const secondaryColumnIndexes = {
    1: findColumnIndex((cell) => cell.includes("Current DRR")),
    2: findColumnIndex((cell) => cell.includes("Current CPI")),
    3: findColumnIndex(
      (cell) => cell.includes("Spends% (D-2)") && !cell.includes("Platform")
    ),
    4: findColumnIndex(
      (cell) => cell.includes("Spends%(D-2)") && cell.includes("Platform")
    )
  };

  cachedRecoveriesLayoutMetadata = {
    rowMap,
    headerRowIndex,
    secondaryColumnIndexes,
    layoutMainColumnStartIndex,
    layoutMainColumnOffset
  };
  return cachedRecoveriesLayoutMetadata;
}

function buildRecoveriesTableHeaderRows(layoutRows, metadata, showName, totalColumns) {
  if (!metadata || !layoutRows || metadata.headerRowIndex <= 0) {
    return null;
  }
  const topRow = layoutRows[metadata.headerRowIndex - 1] || [];
  const metricRow = layoutRows[metadata.headerRowIndex] || [];
  const startIndex = metadata.layoutMainColumnStartIndex ?? 4;
  const boundaryIndex = topRow.findIndex((cell) =>
    String(cell ?? "").toLowerCase().includes("current drr")
  );
  const endIndex = boundaryIndex === -1 ? metricRow.length : boundaryIndex;
  const dataColumnCount = Math.max(0, endIndex - startIndex);
  if (1 + dataColumnCount !== totalColumns) {
    return null;
  }
  const topCells = [showName || ""];
  const metricCells = [""];
  for (let col = startIndex; col < startIndex + dataColumnCount; col += 1) {
    topCells.push((topRow[col] || "").replace(/\s*\n\s*/g, " ").trim());
    metricCells.push((metricRow[col] || "").replace(/\s*\n\s*/g, " ").trim());
  }
  return { topCells, metricCells, dataColumnStartIndex: startIndex };
}

function layoutCellHasValue(rowKey, layoutColumnIndex, metadata) {
  if (!metadata || layoutColumnIndex < 0) {
    return true;
  }
  const layoutRow = metadata.rowMap.get(rowKey);
  if (!layoutRow || layoutColumnIndex >= layoutRow.length) {
    return true;
  }
  return String(layoutRow[layoutColumnIndex] || "").trim() !== "";
}

function shouldRenderMainColumnValue(rowKey, columnIndex, metadata) {
  if (!metadata) {
    return true;
  }
  const layoutColumnOffset = metadata.layoutMainColumnOffset ?? 3;
  const layoutColumnIndex = layoutColumnOffset + columnIndex;
  return layoutCellHasValue(rowKey, layoutColumnIndex, metadata);
}

function shouldRenderSecondaryColumnValue(rowKey, columnIndex, metadata) {
  if (!metadata) {
    return true;
  }
  if (columnIndex === 0) {
    return true;
  }
  const layoutColumnIndex = metadata.secondaryColumnIndexes[columnIndex];
  if (layoutColumnIndex === -1 || layoutColumnIndex === undefined) {
    return true;
  }
  return layoutCellHasValue(rowKey, layoutColumnIndex, metadata);
}

function getRecoveriesWeekBoundaries(fallbackYear) {
  const layoutRows = getRecoveriesLayoutRows();
  if (layoutRows.length === 0) {
    return [];
  }
  const headerRow = layoutRows.find((row) => row.some((cell) => String(cell || "").includes("Week of >")));
  if (!headerRow) {
    return [];
  }
  const dateCells = headerRow
    .map((cell, index) => ({ cell: String(cell || "").trim(), index }))
    .filter(({ cell }) => /^\d{1,2}-[A-Za-z]{3}$/.test(cell));
  const windows = [];
  for (let i = 0; i + 1 < dateCells.length; i += 2) {
    const startIso = parseSheetStyleDateToIso(dateCells[i].cell, fallbackYear);
    const endIso = parseSheetStyleDateToIso(dateCells[i + 1].cell, fallbackYear);
    const startDate = parseIsoDate(startIso);
    const endDate = parseIsoDate(endIso);
    if (startDate && endDate) {
      windows.push({ startDate, endDate });
    }
  }
  return windows;
}

function buildLegacyBlockWindows(refreshDate) {
  const d1 = refreshDate;
  const d2 = addDays(d1, -4);
  const d3 = addDays(d1, -8);
  const d4 = addDays(d1, -15);

  const z10 = d4;
  const o10 = addDays(z10, -7);
  const m10 = addDays(o10, -6);
  const x10 = addDays(z10, -6);
  const af10 = d3;
  const ad10 = addDays(af10, -6);
  const aj10 = d2;
  const ai10 = addDays(aj10, -6);

  return [
    { startDate: m10, endDate: o10 },
    { startDate: x10, endDate: z10 },
    { startDate: ad10, endDate: af10 },
    { startDate: ai10, endDate: aj10 }
  ];
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
  const month = monthMap[String(match[2] ?? "").toLowerCase()];
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

function buildRecoveriesMetricEngine(baseRows, costRows, layoutWeekBoundaries = []) {
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

  const normalizeMediaSource = (value) => normalizeString(value).replace(/\s+/g, "");

  const segments = [
    { key: "all", label: "All (w/ Testing)" },
    { key: "growth", label: "Growth", campaignType: "Scaling" },
    { key: "android", label: "Android", campaignType: "Scaling", platform: "android" },
    {
      key: "android_facebook",
      label: "Facebook",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "android",
      mediaSource: "facebook"
    },
    {
      key: "android_google",
      label: "Google",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "android",
      mediaSource: "google"
    },
    {
      key: "android_tiktok",
      label: "Tik Tok",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "android",
      mediaSource: "tiktok"
    },
    {
      key: "android_organic",
      label: "Organic",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "android",
      mediaSource: "organic"
    },
    { key: "ios", label: "iOS", campaignType: "Scaling", platform: "ios" },
    {
      key: "ios_facebook",
      label: "Facebook",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "ios",
      mediaSource: "facebook"
    },
    {
      key: "ios_google",
      label: "Google",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "ios",
      mediaSource: "google"
    },
    {
      key: "ios_tiktok",
      label: "Tik Tok",
      indentLevel: 1,
      campaignType: "Scaling",
      platform: "ios",
      mediaSource: "tiktok"
    }
  ];

  function filterBase(rows, filters, segment) {
    const refreshIso = filters.refreshDate;
    return rows.filter((row) => {
      if (row.refresh_date !== refreshIso) return false;
      if (normalizeString(row.first_listening_show_title_v1) !== normalizeString(filters.show)) return false;
      if (isExcludedSubTeam(row.sub_team, filters.subTeam)) return false;
      if (isExcludedLanguage(row.first_listening_show_language_v1, filters.language)) return false;
      if (segment.campaignType && normalizeString(row.campaign_type) !== normalizeString(segment.campaignType)) return false;
      if (segment.platform && normalizeString(row.platform_v1) !== normalizeString(segment.platform)) return false;
      if (segment.mediaSource && normalizeMediaSource(row.media_source_v1) !== normalizeMediaSource(segment.mediaSource)) return false;
      return true;
    });
  }

  function filterCost(rows, filters, segment) {
    const refreshIso = filters.refreshDate;
    return rows.filter((row) => {
      if (row.refresh_date !== refreshIso) return false;
      if (normalizeString(row.ad_show_title_final) !== normalizeString(filters.show)) return false;
      if (isExcludedSubTeam(row.sub_team, filters.subTeam)) return false;
      if (isExcludedLanguage(row.ad_show_language_final, filters.language)) return false;
      if (segment.campaignType && normalizeString(row.campaign_type) !== normalizeString(segment.campaignType)) return false;
      if (segment.platform && normalizeString(row.platform) !== normalizeString(segment.platform)) return false;
      if (segment.mediaSource && normalizeMediaSource(row.media_source) !== normalizeMediaSource(segment.mediaSource)) return false;
      return true;
    });
  }

  function sumBase(rows, fieldName, startDate, endDate, dayFlag = null) {
    return rows.reduce((sum, row) => {
      const dateValue = parseDateField(row.install_date_v1);
      if (!inRange(dateValue, startDate, endDate)) return sum;
      if (dayFlag && normalizeString(row.day_flag) !== normalizeString(dayFlag)) return sum;
      return sum + (parseScaleNumber(row[fieldName]) || 0);
    }, 0);
  }

  function sumCost(rows, startDate, endDate) {
    return rows.reduce((sum, row) => {
      const dateValue = parseDateField(row.date);
      if (!inRange(dateValue, startDate, endDate)) return sum;
      return sum + (parseScaleNumber(row.total_cost_dollars) || 0);
    }, 0);
  }

  function sumCostAtDate(rows, targetDate) {
    return rows.reduce((sum, row) => {
      const dateValue = parseDateField(row.date);
      if (!dateValue || dateValue.getTime() !== targetDate.getTime()) return sum;
      return sum + (parseScaleNumber(row.total_cost_dollars) || 0);
    }, 0);
  }

  function sumBaseAtDate(rows, fieldName, targetDate, dayFlag = null) {
    return rows.reduce((sum, row) => {
      const dateValue = parseDateField(row.install_date_v1);
      if (!dateValue || dateValue.getTime() !== targetDate.getTime()) return sum;
      if (dayFlag && normalizeString(row.day_flag) !== normalizeString(dayFlag)) return sum;
      return sum + (parseScaleNumber(row[fieldName]) || 0);
    }, 0);
  }

  function computePayback(m9Value, costValue) {
    const ratio = costValue > 0 ? m9Value / costValue : 0;
    if (!Number.isFinite(ratio) || ratio <= 0) return 6;
    const val = Math.log10(1.5 / ratio) * 39.5161 + 9;
    return Math.max(val, 6);
  }

  function computeRows(filters) {
    const refreshDate = parseDateField(filters.refreshDate);
    if (!refreshDate) {
      return null;
    }

    const d1 = refreshDate;
    const d2 = addDays(d1, -4);
    const d3 = addDays(d1, -8);
    const d4 = addDays(d1, -15);

    const hasLayoutWindows =
      layoutWeekBoundaries &&
      layoutWeekBoundaries.length >= 4 &&
      layoutWeekBoundaries.slice(0, 4).every(
        (window) => window?.startDate instanceof Date && window?.endDate instanceof Date
      );
    const windows = hasLayoutWindows ? layoutWeekBoundaries.slice(0, 4) : buildLegacyBlockWindows(refreshDate);
    const [block1Window, block2Window, block3Window, block4Window] = windows;

    const headerDates = {
      m10: block1Window.startDate,
      o10: block1Window.endDate,
      x10: block2Window.startDate,
      z10: block2Window.endDate,
      ad10: block3Window.startDate,
      af10: block3Window.endDate,
      ai10: block4Window.startDate,
      aj10: block4Window.endDate
    };

    const rows = segments.map((segment) => {
      const baseSegmentRows = filterBase(baseRows, filters, segment);
      const costSegmentRows = filterCost(costRows, filters, segment);

      const block1Cost = sumCost(costSegmentRows, block1Window.startDate, block1Window.endDate);
      const block1D3 =
        block1Cost > 0 ? sumBase(baseSegmentRows, "revenue", block1Window.startDate, block1Window.endDate, "D3") / block1Cost : 0;
      const block1D7 =
        block1Cost > 0 ? sumBase(baseSegmentRows, "revenue", block1Window.startDate, block1Window.endDate, "D7") / block1Cost : 0;
      const block1D15 =
        block1Cost > 0 ? sumBase(baseSegmentRows, "revenue", block1Window.startDate, block1Window.endDate, "D15") / block1Cost : 0;
      const block1Installs = sumBase(
        baseSegmentRows,
        "installs",
        block1Window.startDate,
        block1Window.endDate,
        "D15"
      );
      const block1Cpi = block1Installs > 0 ? block1Cost / block1Installs : 0;
      const block1M9D7 = sumBase(
        baseSegmentRows,
        "M9_revenue_d7_projected",
        block1Window.startDate,
        block1Window.endDate,
        "D7"
      );
      const block1M9D15Nssw = sumBase(
        baseSegmentRows,
        "M9_revenue_d15_projected_cpnsw",
        block1Window.startDate,
        block1Window.endDate,
        "D15"
      );
      const block1M9D15Fsw = sumBase(
        baseSegmentRows,
        "M9_revenue_d15_projected_cpfsw",
        block1Window.startDate,
        block1Window.endDate,
        "D15"
      );
      const block1PaybackD7 = computePayback(block1M9D7, block1Cost);
      const block1PaybackD15Nssw = computePayback(block1M9D15Nssw, block1Cost);
      const block1PaybackD15Fsw = computePayback(block1M9D15Fsw, block1Cost);

      const block2Cost = sumCost(costSegmentRows, block2Window.startDate, block2Window.endDate);
      const block2D3 =
        block2Cost > 0 ? sumBase(baseSegmentRows, "revenue", block2Window.startDate, block2Window.endDate, "D3") / block2Cost : 0;
      const block2D7 =
        block2Cost > 0 ? sumBase(baseSegmentRows, "revenue", block2Window.startDate, block2Window.endDate, "D7") / block2Cost : 0;
      const block2D15 =
        block2Cost > 0 ? sumBase(baseSegmentRows, "revenue", block2Window.startDate, block2Window.endDate, "D15") / block2Cost : 0;
      const block2Installs = sumBase(
        baseSegmentRows,
        "installs",
        block2Window.startDate,
        block2Window.endDate,
        "D15"
      );
      const block2Cpi = block2Installs > 0 ? block2Cost / block2Installs : 0;
      const block2M9D7 = sumBase(
        baseSegmentRows,
        "M9_revenue_d7_projected",
        block2Window.startDate,
        block2Window.endDate,
        "D7"
      );
      const block2M9D15Nssw = sumBase(
        baseSegmentRows,
        "M9_revenue_d15_projected_cpnsw",
        block2Window.startDate,
        block2Window.endDate,
        "D15"
      );
      const block2M9D15Fsw = sumBase(
        baseSegmentRows,
        "M9_revenue_d15_projected_cpfsw",
        block2Window.startDate,
        block2Window.endDate,
        "D15"
      );
      const block2PaybackD7 = computePayback(block2M9D7, block2Cost);
      const block2PaybackD15Nssw = computePayback(block2M9D15Nssw, block2Cost);
      const block2PaybackD15 = computePayback(block2M9D15Fsw, block2Cost);

      const block3Cost = sumCost(costSegmentRows, block3Window.startDate, block3Window.endDate);
      const block3D3 =
        block3Cost > 0 ? sumBase(baseSegmentRows, "revenue", block3Window.startDate, block3Window.endDate, "D3") / block3Cost : 0;
      const block3D7 =
        block3Cost > 0 ? sumBase(baseSegmentRows, "revenue", block3Window.startDate, block3Window.endDate, "D7") / block3Cost : 0;
      const block3Installs = sumBase(
        baseSegmentRows,
        "installs",
        block3Window.startDate,
        block3Window.endDate,
        "D0"
      );
      const block3Cpi = block3Installs > 0 ? block3Cost / block3Installs : 0;
      const block3M9D7 = sumBase(
        baseSegmentRows,
        "M9_revenue_d7_projected",
        block3Window.startDate,
        block3Window.endDate,
        "D7"
      );
      const block3PaybackD7 = computePayback(block3M9D7, block3Cost);

      const block4Cost = sumCost(costSegmentRows, block4Window.startDate, block4Window.endDate);
      const block4D3 =
        block4Cost > 0 ? sumBase(baseSegmentRows, "revenue", block4Window.startDate, block4Window.endDate, "D3") / block4Cost : 0;
      const block4Installs = sumBase(
        baseSegmentRows,
        "installs",
        block4Window.startDate,
        block4Window.endDate,
        "D0"
      );
      const block4Cpi = block4Installs > 0 ? block4Cost / block4Installs : 0;

      const d2Date = addDays(d1, -2);
      const currentCost = sumCostAtDate(costSegmentRows, d2Date);
      const currentInstalls = sumBaseAtDate(baseSegmentRows, "installs", d2Date, "D0");
      const currentCpi = currentInstalls > 0 ? currentCost / currentInstalls : 0;

      return {
        segment: segment.label,
        indentLevel: segment.indentLevel || 0,
        block1: {
          d3: block1D3,
          d7: block1D7,
          d15: block1D15,
          cost: block1Cost,
          cpi: block1Cpi,
          m9d7: block1M9D7,
          m9d15nssw: block1M9D15Nssw,
          m9d15fsw: block1M9D15Fsw,
          paybackD7: block1PaybackD7,
          paybackD15nssw: block1PaybackD15Nssw,
          paybackD15fsw: block1PaybackD15Fsw
        },
        block2: {
          d3: block2D3,
          d7: block2D7,
          d15: block2D15,
          cost: block2Cost,
          cpi: block2Cpi,
          m9d7: block2M9D7,
          m9d15nssw: block2M9D15Nssw,
          m9d15: block2M9D15Fsw,
          paybackD7: block2PaybackD7,
          paybackD15nssw: block2PaybackD15Nssw,
          paybackD15: block2PaybackD15
        },
        block3: {
          d3: block3D3,
          d7: block3D7,
          cost: block3Cost,
          cpi: block3Cpi,
          m9d7: block3M9D7,
          paybackD7: block3PaybackD7
        },
        block4: {
          d3: block4D3,
          cost: block4Cost,
          cpi: block4Cpi,
          potentialPayback: ""
        },
        current: {
          drr: currentCost,
          cpi: currentCpi
        }
      };
    });

    return { rows, dates: { d1, d2, d3, d4, ...headerDates }, showName: filters.show };
  }

  return { refreshDates, shows, subTeams, languages, computeRows };
}

function renderShowWiseRecoveriesEngineTable(tableId, computed) {
  const table = document.getElementById(tableId);
  const secondaryTable = document.getElementById("recoveries-current-metrics-table");

  if (secondaryTable) {
    secondaryTable.textContent = "";
  }
  if (!table) {
    return;
  }
  table.textContent = "";
  if (!computed) {
    return;
  }

  const { rows, dates, showName } = computed;
  const layoutMetadata = getRecoveriesLayoutMetadata();
  const layoutRows = getRecoveriesLayoutRows() || [];
  const formatPctRatio = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "");
  const formatNumber = (value, decimals = 0) => {
    if (!Number.isFinite(value)) return "";
    return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };
  
  const formatDateLabel = (dateObj) =>
    dateObj instanceof Date
      ? dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(" ", "-")
      : "";

  const hasNonZeroMetric = (value) => Number.isFinite(value) && value !== 0;

  const totalColumns =
    1 + // Segment
    11 + // Block1
    11 + // Block2
    6 + // Block3
    4; // Block4

  const buildFallbackTopRow = () => {
    const cells = Array(totalColumns).fill("");
    for (let i = 0; i < totalColumns; i += 1) {
      if (i === 0) {
        cells[i] = showName || "";
      }
      if (i === 1) cells[i] = "Week of >";
      if (i === 1 + 8) cells[i] = formatDateLabel(dates.m10);
      if (i === 1 + 10) cells[i] = formatDateLabel(dates.o10);

      if (i === 12) cells[i] = "Week of >";
      if (i === 12 + 8) cells[i] = formatDateLabel(dates.x10);
      if (i === 12 + 10) cells[i] = formatDateLabel(dates.z10);

      if (i === 23) cells[i] = "Week of >";
      if (i === 23 + 3) cells[i] = formatDateLabel(dates.ad10);
      if (i === 23 + 5) cells[i] = formatDateLabel(dates.af10);

      if (i === 29) cells[i] = "Week of >";
      if (i === 29 + 2) cells[i] = formatDateLabel(dates.ai10);
      if (i === 29 + 3) cells[i] = formatDateLabel(dates.aj10);
    }
    return cells;
  };

  const headerRowsFromLayout = buildRecoveriesTableHeaderRows(layoutRows, layoutMetadata, showName, totalColumns);
  const headerRow1Cells = headerRowsFromLayout?.topCells ?? buildFallbackTopRow();

  const thead = document.createElement("thead");
  const headerRow1 = document.createElement("tr");

  headerRow1Cells.forEach((cellValue, index) => {
    const th1 = document.createElement("th");
    th1.textContent = cellValue;
    if (index === 0) {
      th1.classList.add("recoveries-show-title");
    }
    headerRow1.appendChild(th1);
  });

  const blockHeaders = headerRowsFromLayout?.metricCells ?? [
    "",
    "D3",
    "D7",
    "D15",
    "Cost",
    "CPI",
    "M9 (proj.) Revenue (D7)",
    "M9 (proj.) Revenue (D15 NSSW)",
    "M9 (proj.) Revenue (D15 FSW)",
    "Payback D7",
    "Payback D15 CPNSSW",
    "Payback D15 CPFSW",
    "D3",
    "D7",
    "D15",
    "Cost",
    "CPI",
    "M9 (proj.) Revenue (D7)",
    "M9 (proj.) Revenue (D15 NSSW)",
    "M9 (proj.) Revenue (D15)",
    "Payback D7",
    "Payback D15 CPNSSW",
    "Payback D15",
    "D3",
    "D7",
    "Cost",
    "CPI",
    "M9 Revenue (D7)",
    "Payback D7",
    "D3",
    "Cost",
    "CPI",
    "Potential Payback"
  ];

  const headerRow3 = document.createElement("tr");
  blockHeaders.forEach((header, index) => {
    const th = document.createElement("th");
    th.textContent = header;
    if (index === 0) th.classList.add("metric-primary");
    headerRow3.appendChild(th);
  });

  thead.appendChild(headerRow1);
  thead.appendChild(headerRow3);
  table.appendChild(thead);

  if (secondaryTable) {
    const secondaryThead = document.createElement("thead");
    const secondaryShowRow = document.createElement("tr");
    for (let i = 0; i < 5; i += 1) {
      const th = document.createElement("th");
      if (i === 0) {
        th.textContent = showName || "";
        th.classList.add("recoveries-show-title");
      }
      secondaryShowRow.appendChild(th);
    }
  const secondaryColumnHeaders = [
    "Segment",
    "Current DRR (D-2)",
    "Current CPI (D-2)",
    "Spends% (D-2)",
    "Spends% (D-2) Platform Level"
  ];
    const secondaryHeaderRow = document.createElement("tr");
    secondaryColumnHeaders.forEach((header, index) => {
      const th = document.createElement("th");
      th.textContent = header;
      if (index === 0) {
        th.classList.add("metric-primary");
      }
      secondaryHeaderRow.appendChild(th);
    });
    secondaryThead.appendChild(secondaryShowRow);
    secondaryThead.appendChild(secondaryHeaderRow);
    secondaryTable.appendChild(secondaryThead);
  }

  const tbody = document.createElement("tbody");
  const secondaryTbody = document.createElement("tbody");
  const growthRow = rows.find((entry) => entry.segment.trim() === "Growth");
  const growthTotal = growthRow?.current?.drr || 0;
  let activePlatform = "";
  let activePlatformTotal = 0;

  const computeCurrentMetrics = (row, segmentName, platformTotal) => {
    const drr = row.current.drr;
    const cpi = row.current.cpi;
    const spendPct = segmentName === "All (w/ Testing)" || !growthTotal ? "" : drr / growthTotal;
    let platformValue = "";
    if (segmentName === "Android" || segmentName === "iOS") {
      platformValue = segmentName;
    } else if (row.indentLevel && platformTotal) {
      platformValue = drr / platformTotal;
    }
    return { drr, cpi, spendPct, platformValue };
  };

  rows.forEach((row) => {
    const segmentName = row.segment.trim();
    if (segmentName === "Android" || segmentName === "iOS") {
      activePlatform = segmentName;
      activePlatformTotal = row.current.drr || 0;
    }

    const currentMetrics = computeCurrentMetrics(row, segmentName, activePlatformTotal);
    const layoutRowKey =
      row.indentLevel && activePlatform ? `${activePlatform}>${segmentName}` : segmentName;

    const mainValues = [
      row.segment,
      formatPctRatio(row.block1.d3),
      formatPctRatio(row.block1.d7),
      formatPctRatio(row.block1.d15),
      formatNumber(row.block1.cost),
      formatNumber(row.block1.cpi, 1),
      formatNumber(row.block1.m9d7),
      formatNumber(row.block1.m9d15nssw),
      formatNumber(row.block1.m9d15fsw),
      formatNumber(row.block1.paybackD7, 1),
      formatNumber(row.block1.paybackD15nssw, 1),
      formatNumber(row.block1.paybackD15fsw, 1),
      formatPctRatio(row.block2.d3),
      formatPctRatio(row.block2.d7),
      formatPctRatio(row.block2.d15),
      formatNumber(row.block2.cost),
      formatNumber(row.block2.cpi, 1),
      formatNumber(row.block2.m9d7),
      formatNumber(row.block2.m9d15nssw),
      formatNumber(row.block2.m9d15),
      formatNumber(row.block2.paybackD7, 1),
      formatNumber(row.block2.paybackD15nssw, 1),
      formatNumber(row.block2.paybackD15, 1),
      formatPctRatio(row.block3.d3),
      formatPctRatio(row.block3.d7),
      formatNumber(row.block3.cost),
      formatNumber(row.block3.cpi, 1),
      formatNumber(row.block3.m9d7),
      formatNumber(row.block3.paybackD7, 1),
      formatPctRatio(row.block4.d3),
      formatNumber(row.block4.cost),
      formatNumber(row.block4.cpi, 1),
      row.block4.potentialPayback
    ];

    const secondaryValues = [
      row.segment,
      formatNumber(currentMetrics.drr),
      formatNumber(currentMetrics.cpi, 1),
      currentMetrics.spendPct ? formatPctRatio(currentMetrics.spendPct) : "",
      typeof currentMetrics.platformValue === "string"
        ? currentMetrics.platformValue
        : currentMetrics.platformValue !== ""
        ? formatPctRatio(currentMetrics.platformValue)
        : ""
    ];

    mainValues.forEach((_, index) => {
      if (index === 0) {
        return;
      }
      if (!shouldRenderMainColumnValue(layoutRowKey, index, layoutMetadata)) {
        mainValues[index] = "";
      }
    });

    secondaryValues.forEach((_, index) => {
      if (index === 0) {
        return;
      }
      if (!shouldRenderSecondaryColumnValue(layoutRowKey, index, layoutMetadata)) {
        secondaryValues[index] = "";
      }
    });

    const tr = document.createElement("tr");
    mainValues.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 0) {
        td.classList.add("metric-primary");
        if (row.indentLevel) {
          td.classList.add("recoveries-subsegment");
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);

    if (secondaryTable) {
      const secondaryTr = document.createElement("tr");
      secondaryValues.forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index === 0) {
          td.classList.add("metric-primary");
          if (row.indentLevel) {
            td.classList.add("recoveries-subsegment");
          }
        }
        secondaryTr.appendChild(td);
      });
      secondaryTbody.appendChild(secondaryTr);
    }
  });

  table.appendChild(tbody);
  if (secondaryTable) {
    secondaryTable.appendChild(secondaryTbody);
  }
}
function uniqueSorted(values) {
  const sanitized = values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value !== "");
  return Array.from(new Set(sanitized)).sort((a, b) => a.localeCompare(b));
}

function orderDayDiffValues(values) {
  const dayDiffOrder = ["d3", "d7", "d15", "d30"];
  const normalized = Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value !== "")
        .map((value) => value.toLowerCase())
    )
  );
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

let deepdiveWeeklyShowwiseTablesByKey = {};
let deepdiveWeeklyShowwiseLoadPromise = null;
let deepdiveDailyShowwiseTablesByKey = {};
let deepdiveDailyShowwiseLoadPromise = null;
const DEEPDIVE_DAILY_SHOWWISE_CSV_URL = "./deepdive-daily-pivot.csv";

function getRuntimeDeepdiveWeeklyCsvTextByKey() {
  if (typeof window === "undefined") {
    return null;
  }

  const candidateValues = [window.DEEPDIVE_WEEKLY_CSV_TEXT_BY_KEY, window.deepdiveWeeklyCsvTextByKey];
  for (let i = 0; i < candidateValues.length; i += 1) {
    const candidate = candidateValues[i];
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
  }
  return null;
}

function getRuntimeDeepdiveDailyCsvText() {
  if (typeof window === "undefined") {
    return null;
  }

  const candidateValues = [window.DEEPDIVE_DAILY_CSV_TEXT, window.deepdiveDailyCsvText];
  for (let i = 0; i < candidateValues.length; i += 1) {
    const candidate = candidateValues[i];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }
  return null;
}

function extractRowsFromColumnWindow(rows, rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex) {
  const extractedRows = [];
  for (let rowIndex = rowStartIndex; rowIndex <= rowEndIndex; rowIndex += 1) {
    const sourceRow = rows[rowIndex] || [];
    const rawSlice = sourceRow.slice(columnStartIndex, columnEndIndex + 1);
    const normalizedSlice = trimTrailingEmptyCells(rawSlice.map((cell) => String(cell ?? "")));
    if (!isCompletelyEmptyRow(normalizedSlice)) {
      extractedRows.push(normalizedSlice);
    }
  }
  return extractedRows;
}

function parseDeepdiveWeeklyShowwiseCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return null;
  }

  const firstHeaderRow = rows[0] || [];
  const firstBlockColumnStarts = [];
  firstHeaderRow.forEach((cell, index) => {
    if (normalizeString(cell) === "sum of total cost ($)") {
      firstBlockColumnStarts.push(index);
    }
  });
  if (firstBlockColumnStarts.length < 3) {
    return null;
  }

  const firstBlockGrandTotalRowIndex = rows.findIndex(
    (row, index) =>
      index >= 2 && normalizeString((row || [])[firstBlockColumnStarts[0]] || "") === "grand total"
  );
  if (firstBlockGrandTotalRowIndex === -1) {
    return null;
  }

  const rowSpanWidth = Math.max((rows[1] || []).length, firstHeaderRow.length);
  const firstBlockColumnEnds = firstBlockColumnStarts.map((startIndex, index) => {
    const nextStartIndex = firstBlockColumnStarts[index + 1];
    return typeof nextStartIndex === "number" ? nextStartIndex - 1 : rowSpanWidth - 1;
  });

  const mediaSourceRows = extractRowsFromColumnWindow(
    rows,
    1,
    firstBlockGrandTotalRowIndex,
    firstBlockColumnStarts[0],
    firstBlockColumnEnds[0]
  );
  const optimizationRows = extractRowsFromColumnWindow(
    rows,
    1,
    firstBlockGrandTotalRowIndex,
    firstBlockColumnStarts[1],
    firstBlockColumnEnds[1]
  );
  const laCodeRows = extractRowsFromColumnWindow(
    rows,
    1,
    firstBlockGrandTotalRowIndex,
    firstBlockColumnStarts[2],
    firstBlockColumnEnds[2]
  );

  let secondBlockStartRowIndex = -1;
  for (let rowIndex = firstBlockGrandTotalRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    if (normalizeString((rows[rowIndex] || [])[0] || "") === "sum of total cost ($)") {
      secondBlockStartRowIndex = rowIndex;
      break;
    }
  }

  let mediaSourceLaCodeRows = [];
  if (secondBlockStartRowIndex >= 0) {
    let secondBlockGrandTotalRowIndex = -1;
    for (let rowIndex = secondBlockStartRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      if (normalizeString((rows[rowIndex] || [])[0] || "") === "grand total") {
        secondBlockGrandTotalRowIndex = rowIndex;
        break;
      }
    }

    if (secondBlockGrandTotalRowIndex > secondBlockStartRowIndex) {
      const secondBlockColumnEnd = rows
        .slice(secondBlockStartRowIndex, secondBlockGrandTotalRowIndex + 1)
        .reduce((maxValue, row) => Math.max(maxValue, (row || []).length - 1), 0);
      mediaSourceLaCodeRows = extractRowsFromColumnWindow(
        rows,
        secondBlockStartRowIndex,
        secondBlockGrandTotalRowIndex,
        0,
        secondBlockColumnEnd
      );
    }
  }

  if (optimizationRows.length === 0 || laCodeRows.length === 0) {
    return null;
  }

  return {
    mediaSourceRows,
    optimizationRows,
    laCodeRows,
    mediaSourceLaCodeRows
  };
}

async function loadDeepdiveWeeklyShowwiseTablesByKey() {
  if (deepdiveWeeklyShowwiseLoadPromise) {
    return deepdiveWeeklyShowwiseLoadPromise;
  }

  deepdiveWeeklyShowwiseLoadPromise = (async () => {
    const runtimeCsvTextByKey = getRuntimeDeepdiveWeeklyCsvTextByKey();
    if (runtimeCsvTextByKey) {
      const runtimeLoadedByKey = {};
      Object.entries(runtimeCsvTextByKey).forEach(([showKeyRaw, csvText]) => {
        if (typeof csvText !== "string" || csvText.trim() === "") {
          return;
        }
        const parsed = parseDeepdiveWeeklyShowwiseCsv(csvText);
        if (!parsed) {
          return;
        }
        const showKey = normalizeIdString(showKeyRaw).toUpperCase();
        if (showKey) {
          runtimeLoadedByKey[showKey] = parsed;
        }
      });

      if (Object.keys(runtimeLoadedByKey).length > 0) {
        deepdiveWeeklyShowwiseTablesByKey = runtimeLoadedByKey;
        return runtimeLoadedByKey;
      }
      console.warn(
        "[Deepdive] Runtime deepdiveWeeklyCsvTextByKey is present but no valid show tables were parsed."
      );
    }
    deepdiveWeeklyShowwiseTablesByKey = {};
    return deepdiveWeeklyShowwiseTablesByKey;
  })();

  return deepdiveWeeklyShowwiseLoadPromise;
}

function findShowLabelCell(rows, showName) {
  const target = normalizeString(showName);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (normalizeString(row[columnIndex]) === target) {
        return { rowIndex, columnIndex };
      }
    }
  }
  return null;
}

function extractDeepdiveDailyTableForShow(rows, showName) {
  const labelCell = findShowLabelCell(rows, showName);
  if (!labelCell) {
    return null;
  }

  const showColumnIndex = labelCell.columnIndex;
  let topHeaderRowIndex = -1;
  for (let rowIndex = labelCell.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    if (normalizeString((rows[rowIndex] || [])[showColumnIndex] || "") === "sum of total cost ($)") {
      topHeaderRowIndex = rowIndex;
      break;
    }
  }
  if (topHeaderRowIndex === -1) {
    return null;
  }

  let headerRowIndex = -1;
  for (let rowIndex = topHeaderRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    if (normalizeString((rows[rowIndex] || [])[showColumnIndex] || "") === "spend period") {
      headerRowIndex = rowIndex;
      break;
    }
  }
  if (headerRowIndex === -1) {
    return null;
  }

  const headerRow = rows[headerRowIndex] || [];
  let columnEndIndex = showColumnIndex;
  for (let columnIndex = showColumnIndex; columnIndex < headerRow.length; columnIndex += 1) {
    if (String(headerRow[columnIndex] ?? "").trim() === "") {
      break;
    }
    columnEndIndex = columnIndex;
  }

  const tableRows = [];
  tableRows.push((rows[topHeaderRowIndex] || []).slice(showColumnIndex, columnEndIndex + 1));
  tableRows.push((rows[headerRowIndex] || []).slice(showColumnIndex, columnEndIndex + 1));

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const rowSlice = (rows[rowIndex] || []).slice(showColumnIndex, columnEndIndex + 1);
    if (isCompletelyEmptyRow(rowSlice)) {
      if (tableRows.length > 2) {
        break;
      }
      continue;
    }
    tableRows.push(rowSlice);
    if (normalizeString(rowSlice[0] || "") === "grand total") {
      break;
    }
  }

  const hasHeader = tableRows.length >= 2 && normalizeString(tableRows[1][0] || "") === "spend period";
  const hasGrandTotal = tableRows.some((row) => normalizeString(row[0] || "") === "grand total");
  if (!hasHeader || !hasGrandTotal) {
    return null;
  }

  return tableRows;
}

function parseDeepdiveDailyShowwiseCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return {};
  }

  const showNameByKey = {
    MVS: "My Vampire System",
    FLBM: "First Legendary Beast Master",
    WBT: "Weakest Beast Tamer"
  };
  const tableRowsByKey = {};

  Object.entries(showNameByKey).forEach(([showKey, showName]) => {
    const extractedRows = extractDeepdiveDailyTableForShow(rows, showName);
    if (extractedRows && extractedRows.length > 0) {
      tableRowsByKey[showKey] = extractedRows;
    }
  });

  return tableRowsByKey;
}

async function loadDeepdiveDailyShowwiseTablesByKey() {
  if (deepdiveDailyShowwiseLoadPromise) {
    return deepdiveDailyShowwiseLoadPromise;
  }

  deepdiveDailyShowwiseLoadPromise = (async () => {
    const runtimeCsvText = getRuntimeDeepdiveDailyCsvText();
    if (runtimeCsvText) {
      const parsedByKey = parseDeepdiveDailyShowwiseCsv(runtimeCsvText);
      if (Object.keys(parsedByKey).length > 0) {
        deepdiveDailyShowwiseTablesByKey = parsedByKey;
        return deepdiveDailyShowwiseTablesByKey;
      }
      console.warn(
        "[Deepdive] Runtime deepdiveDailyCsvText is present but no valid show tables were parsed; falling back to static CSV file."
      );
    }

    try {
      const response = await fetch(`${DEEPDIVE_DAILY_SHOWWISE_CSV_URL}?cacheBust=${Date.now()}`, {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const csvText = await response.text();
      deepdiveDailyShowwiseTablesByKey = parseDeepdiveDailyShowwiseCsv(csvText);
    } catch (error) {
      deepdiveDailyShowwiseTablesByKey = {};
      console.warn("[Deepdive] Could not load daily show-wise CSV:", error);
    }

    return deepdiveDailyShowwiseTablesByKey;
  })();

  return deepdiveDailyShowwiseLoadPromise;
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

  function renderCpiMetricsSelectedShow() {
    const selectedShow = performanceShowSelect.value;
    renderTable("cpi-metrics-table", sectionsByShow[selectedShow]?.cpiMetrics || []);
  }

  performanceShowSelect.addEventListener("change", () => {
    renderDailySelectedShow();
    renderWeeklySelectedShow();
    renderCpiMetricsSelectedShow();
  });

  renderDailySelectedShow();
  renderWeeklySelectedShow();
  renderCpiMetricsSelectedShow();

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
  const expandedSpendsPlanRows = splitSpendsPlanShortfall(visibleSpendsPlanRows);
  const spendsPlanSections = splitSpendsPlanSections(expandedSpendsPlanRows);
  renderSpendsPlanTables("spends-plan-table", spendsPlanSections, { boldRowNumbers: spendsBoldRows });

  const scriptLevelSpendsCsvText = getScriptLevelSpendsCsvText();
  const scriptLevelSpendsRows = extractScriptLevelSpendsRows(scriptLevelSpendsCsvText);
  renderScriptLevelSpendsTable("script-level-spends-table", scriptLevelSpendsRows);

  if (typeof SHOW_WISE_BASE_DATA_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_BASE_DATA_CSV_TEXT is not available in recoveries-data.js");
  }
  if (typeof SHOW_WISE_COST_DATA_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_COST_DATA_CSV_TEXT is not available in recoveries-data.js");
  }
  if (typeof SHOW_WISE_LAYOUT_CSV_TEXT !== "string") {
    throw new Error("SHOW_WISE_LAYOUT_CSV_TEXT is not available in recoveries-data.js");
  }

  const recoveriesBaseRows = buildCsvRecords(SHOW_WISE_BASE_DATA_CSV_TEXT);
  const recoveriesCostRows = buildCsvRecords(SHOW_WISE_COST_DATA_CSV_TEXT);
  const layoutWeekBoundaries = [];
  const recoveriesLayoutGrid = buildLayoutGrid(SHOW_WISE_LAYOUT_CSV_TEXT, 24, 33);
  const recoveriesEngine = buildRecoveriesMetricEngine(
    recoveriesBaseRows,
    recoveriesCostRows,
    layoutWeekBoundaries
  );

  const recoveriesRefreshDateSelect = document.getElementById("recoveries-refresh-date-select");
  const recoveriesShowSelect = document.getElementById("recoveries-show-select");
  const recoveriesSubTeamSelect = document.getElementById("recoveries-sub-team-select");
  const recoveriesLanguageSelect = document.getElementById("recoveries-language-select");
  const recoveriesToggleColumns = document.getElementById("recoveries-toggle-columns");
  const recoveriesTable = document.getElementById("recoveries-table");

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

  if (recoveriesTable) {
    recoveriesTable.classList.add("hide-recoveries-columns");
  }
  if (recoveriesToggleColumns && recoveriesTable) {
    recoveriesToggleColumns.addEventListener("click", () => {
      const isHidden = recoveriesTable.classList.toggle("hide-recoveries-columns");
      recoveriesToggleColumns.setAttribute("aria-pressed", String(!isHidden));
      recoveriesToggleColumns.textContent = isHidden ? "Show hidden columns" : "Hide extra columns";
    });
  }

  const latestRefreshYear = parseIsoDate(recoveriesEngine.refreshDates[0])?.getFullYear() || new Date().getFullYear();
  const parsedWeekBoundaries = getRecoveriesWeekBoundaries(latestRefreshYear);
  layoutWeekBoundaries.splice(0, layoutWeekBoundaries.length, ...parsedWeekBoundaries);
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
    renderShowWiseRecoveriesEngineTable("recoveries-table", computed);
    const h12 = computed?.rows?.[0]?.block1?.cost ?? 0;
    const d12 = computed?.rows?.[0]?.segment ?? "";
    const baseFilteredCount = filterRecoveriesBaseRows(recoveriesBaseRows, filters, () => true).length;
    const costFilteredCount = filterRecoveriesCostRows(recoveriesCostRows, filters, () => true).length;
    console.debug("[ShowWiseRecoveries][Validation] H12=", h12);
    console.debug("[ShowWiseRecoveries][Validation] M10=", computed?.dates?.m10);
    console.debug("[ShowWiseRecoveries][Validation] O10=", computed?.dates?.o10);
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
  const deepdiveShowSelect = document.getElementById("deepdive-show-select");

  function renderIosDeepdiveTables() {
    if (!deepdiveShowSelect) {
      return;
    }

    const selectedShowKey = normalizeIdString(deepdiveShowSelect.value).toUpperCase();

    const selectedShowTables = deepdiveWeeklyShowwiseTablesByKey[selectedShowKey];
    if (selectedShowTables) {
      renderTableWithHeaderRows("deepdive-weekly-optimization-table", selectedShowTables.optimizationRows, 1);
      renderTableWithHeaderRows("deepdive-weekly-la-code-table", selectedShowTables.laCodeRows, 1);
      renderTableWithMergedGroupHeaderRow(
        "deepdive-weekly-media-source-la-code-table",
        selectedShowTables.mediaSourceLaCodeRows,
        {
          headerRowCount: 3,
          groupHeaderRowIndex: 1
        }
      );
    } else {
      renderTableWithHeaderRows("deepdive-weekly-optimization-table", [], 1);
      renderTableWithHeaderRows("deepdive-weekly-la-code-table", [], 1);
      renderTableWithMergedGroupHeaderRow("deepdive-weekly-media-source-la-code-table", [], {
        headerRowCount: 3,
        groupHeaderRowIndex: 1
      });
    }
  }

  if (deepdiveShowSelect) {
    deepdiveShowSelect.addEventListener("change", renderIosDeepdiveTables);
    renderIosDeepdiveTables();
    Promise.all([loadDeepdiveWeeklyShowwiseTablesByKey()])
      .then(() => {
        renderIosDeepdiveTables();
      })
      .catch((error) => {
        console.warn("[Deepdive] Show-wise CSV load failed; deepdive tables will remain empty.", error);
      });
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

  const retentionBenchmarkToggle = document.getElementById('retention-benchmark-toggle');
  const retentionBenchmarkPanel = document.getElementById('retention-benchmark-panel');
  const setBenchmarkVisibility = (visible) => {
    if (!retentionBenchmarkPanel || !retentionBenchmarkToggle) {
      return;
    }
    retentionBenchmarkPanel.classList.toggle('benchmark-panel--hidden', !visible);
    retentionBenchmarkToggle.setAttribute('aria-pressed', String(visible));
    retentionBenchmarkToggle.textContent = visible ? 'Hide benchmarks' : 'Show benchmarks';
  };
  if (retentionBenchmarkToggle) {
    retentionBenchmarkToggle.addEventListener('click', () => {
      const panelVisible = retentionBenchmarkPanel && !retentionBenchmarkPanel.classList.contains('benchmark-panel--hidden');
      setBenchmarkVisibility(!panelVisible);
    });
  }
  setBenchmarkVisibility(false);
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
