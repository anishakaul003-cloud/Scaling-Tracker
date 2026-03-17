const CONFIG = {
  dataUrl: "./data.json",
  maxRenderedRows: 2000
};

const state = {
  sheets: [],
  selectedSheetIndex: 0,
  generatedAt: null
};

const sheetNav = document.getElementById("sheetNav");
const sheetTitle = document.getElementById("sheetTitle");
const tableWrap = document.getElementById("tableWrap");
const globalFilter = document.getElementById("globalFilter");
const lastUpdated = document.getElementById("lastUpdated");
const refreshButton = document.getElementById("refreshButton");

async function loadSnapshot() {
  const res = await fetch(CONFIG.dataUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load snapshot (${res.status})`);

  const payload = await res.json();
  state.sheets = payload.sheets || [];
  state.generatedAt = payload.generatedAt || null;
  if (state.selectedSheetIndex >= state.sheets.length) {
    state.selectedSheetIndex = 0;
  }
}

function renderNav() {
  sheetNav.innerHTML = "";
  state.sheets.forEach((sheet, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sheet-link ${idx === state.selectedSheetIndex ? "active" : ""}`;
    btn.textContent = sheet.title;
    btn.addEventListener("click", () => {
      state.selectedSheetIndex = idx;
      globalFilter.value = "";
      renderNav();
      renderTable();
    });
    sheetNav.appendChild(btn);
  });
}

function renderTable() {
  const selected = state.sheets[state.selectedSheetIndex];
  if (!selected) {
    sheetTitle.textContent = "No sheet selected";
    tableWrap.innerHTML = '<div class="empty">No data available.</div>';
    return;
  }

  sheetTitle.textContent = selected.title;
  const allRows = selected.rows || [];
  if (!allRows.length) {
    tableWrap.innerHTML = '<div class="empty">This sheet has no rows.</div>';
    return;
  }

  const headers = allRows[0] || [];
  const bodyRows = allRows.slice(1);
  const query = globalFilter.value.trim().toLowerCase();
  const filtered = !query
    ? bodyRows
    : bodyRows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query)));

  if (!filtered.length) {
    tableWrap.innerHTML = '<div class="empty">No matching rows for the current filter.</div>';
    return;
  }

  const rowsToRender = filtered.slice(0, CONFIG.maxRenderedRows);
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  headers.forEach((header, idx) => {
    const th = document.createElement("th");
    th.textContent = header || `Column ${idx + 1}`;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  rowsToRender.forEach((row) => {
    const tr = document.createElement("tr");
    const cells = Math.max(headers.length, row.length);
    for (let i = 0; i < cells; i += 1) {
      const td = document.createElement("td");
      td.textContent = row[i] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);

  if (filtered.length > rowsToRender.length) {
    const note = document.createElement("div");
    note.className = "empty";
    note.textContent = `Showing first ${rowsToRender.length} of ${filtered.length} rows for performance.`;
    tableWrap.appendChild(note);
  }
}

function renderGeneratedAt() {
  if (!state.generatedAt) {
    lastUpdated.textContent = "Snapshot timestamp unavailable";
    return;
  }

  const date = new Date(state.generatedAt);
  if (Number.isNaN(date.getTime())) {
    lastUpdated.textContent = `Snapshot created: ${state.generatedAt}`;
    return;
  }
  lastUpdated.textContent = `Snapshot created: ${date.toLocaleString()}`;
}

async function initialize() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Snapshot mode";
  refreshButton.title = "Auto-refresh is disabled in snapshot mode";

  try {
    await loadSnapshot();
    renderGeneratedAt();
    renderNav();
    renderTable();
  } catch (error) {
    tableWrap.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

globalFilter.addEventListener("input", () => {
  renderTable();
});

initialize();
