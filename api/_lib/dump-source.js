"use strict";

const DEFAULT_REMOTE_URL =
  "https://script.google.com/macros/s/AKfycbyL126fntw3tGFi1BQjmI89InuuHrKa04vjiwE6DPV_F7hDA8olqHggbLXbwuh6UsjzUA/exec";
const DEFAULT_REMOTE_SOURCES =
  "ios_performance_dump,spends_plan_tracking,retention_view,raw_dump,cost_data,base_data,spends_weekly,spends_daily";
const DEFAULT_TIMEOUT_SECONDS = 90;

function utcNowIso() {
  return new Date().toISOString();
}

function getSourceKeys() {
  const raw = process.env.IOS_DUMP_REMOTE_SOURCES || DEFAULT_REMOTE_SOURCES;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRemoteConfig() {
  const timeoutSeconds = Number(
    process.env.IOS_DUMP_REMOTE_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS
  );
  return {
    remoteUrl: process.env.IOS_DUMP_REMOTE_URL || DEFAULT_REMOTE_URL,
    token: process.env.IOS_DUMP_REMOTE_TOKEN || "",
    timeoutMs:
      Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
        ? timeoutSeconds * 1000
        : DEFAULT_TIMEOUT_SECONDS * 1000,
  };
}

function buildRemoteUrl({ remoteUrl, token, sourceKey }) {
  const url = new URL(remoteUrl);
  url.searchParams.delete("source");
  url.searchParams.delete("sources");
  if (sourceKey) {
    url.searchParams.set("source", sourceKey);
  } else {
    url.searchParams.set("sources", getSourceKeys().join(","));
  }
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
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
      const padded = row.concat(
        Array(Math.max(0, headers.length - row.length)).fill("")
      );
      return headers.map((_, index) => escapeCsvCell(padded[index])).join(",");
    }
    return headers.map((header) => escapeCsvCell(row?.[header])).join(",");
  });

  return [headerLine].concat(dataLines).join("\r\n");
}

function extractDataset(entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("invalid entry payload");
  }
  if (entry.data && typeof entry.data === "object") {
    return extractDataset(entry.data);
  }
  if (Array.isArray(entry.headers) && Array.isArray(entry.rows)) {
    return entry;
  }
  throw new Error("dataset missing headers/rows");
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      const preview = (body || "").replace(/\s+/g, " ").slice(0, 280);
      throw new Error(
        `non-json response (status=${response.status}, content-type=${
          response.headers.get("content-type") || "unknown"
        }): ${preview || "<empty>"}`
      );
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function extractDatasetFromPayload(payload, sourceKey) {
  if (!payload?.ok) {
    throw new Error(payload?.error || "remote returned ok=false");
  }

  const data = payload.data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.headers) && Array.isArray(data.rows)) {
      return extractDataset(data);
    }
    if (data[sourceKey]) {
      return extractDataset(data[sourceKey]);
    }
    const keys = Object.keys(data);
    if (keys.length === 1) {
      return extractDataset(data[keys[0]]);
    }
  }

  if (Array.isArray(payload.headers) && Array.isArray(payload.rows)) {
    return extractDataset(payload);
  }

  throw new Error("source missing in response");
}

async function fetchSourceSnapshot(sourceKey) {
  const { remoteUrl, token, timeoutMs } = getRemoteConfig();
  const requestUrl = buildRemoteUrl({ remoteUrl, token, sourceKey });
  const payload = await fetchJsonWithTimeout(requestUrl, timeoutMs);
  const dataset = extractDatasetFromPayload(payload, sourceKey);
  const csvText = datasetToCsv(dataset);
  if (!csvText) {
    throw new Error("received empty dataset/csv");
  }
  const rowCount = Array.isArray(dataset.rows) ? dataset.rows.length : 0;

  return {
    ok: true,
    sourceKey,
    csvText,
    rowCount,
    requestUrl,
    updatedAt: utcNowIso(),
    error: "",
  };
}

module.exports = {
  DEFAULT_REMOTE_URL,
  DEFAULT_REMOTE_SOURCES,
  DEFAULT_TIMEOUT_SECONDS,
  utcNowIso,
  getSourceKeys,
  getRemoteConfig,
  buildRemoteUrl,
  datasetToCsv,
  fetchSourceSnapshot,
};
