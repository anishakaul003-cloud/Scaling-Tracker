(function () {
  const DEFAULT_CONFIG = {
    refreshEndpoint: "/api/refresh-data",
    dataUrl: "./live-data.json",
    requestTimeoutMs: 90000
  };

  const config = Object.assign({}, DEFAULT_CONFIG, window.SCALING_TRACKER_CONFIG || {});
  const loaderRoot = document.getElementById("app-loading-screen");
  const loaderStatus = document.getElementById("app-loading-status");
  const loaderError = document.getElementById("app-loading-error");
  const retryButton = document.getElementById("app-loading-retry");
  const pageMeta = document.querySelector(".page-meta");

  function setLoaderStatus(text) {
    if (loaderStatus) {
      loaderStatus.textContent = text;
    }
  }

  function setLoaderError(text) {
    if (loaderError) {
      loaderError.textContent = text || "";
      loaderError.classList.toggle("is-visible", Boolean(text));
    }
  }

  function showLoader() {
    if (loaderRoot) {
      loaderRoot.classList.remove("is-hidden");
    }
  }

  function hideLoader() {
    if (loaderRoot) {
      loaderRoot.classList.add("is-hidden");
    }
  }

  function withTimeout(promise, timeoutMs) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error("Request timed out"));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    });
  }

  async function triggerServerRefresh() {
    try {
      const response = await withTimeout(
        fetch(config.refreshEndpoint, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          },
          body: "{}"
        }),
        config.requestTimeoutMs
      );
      if (!response.ok) {
        return { ok: false, reason: `Refresh endpoint failed (${response.status})` };
      }
      return await response.json();
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async function loadLiveDataJson() {
    const url = `${config.dataUrl}?cacheBust=${Date.now()}`;
    const response = await withTimeout(
      fetch(url, {
        method: "GET",
        cache: "no-store"
      }),
      config.requestTimeoutMs
    );

    if (!response.ok) {
      throw new Error(`Failed to load live data (${response.status})`);
    }

    const payload = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new Error("Live data payload is not an object");
    }
    return payload;
  }

  function extractPayloadFromRefreshResult(refreshResult) {
    if (!refreshResult || typeof refreshResult !== "object") {
      return null;
    }

    const candidates = [];
    if (refreshResult.data && typeof refreshResult.data === "object") {
      candidates.push(refreshResult.data);
    }
    if (refreshResult.showCsvTextByKey && typeof refreshResult.showCsvTextByKey === "object") {
      candidates.push(refreshResult);
    }

    for (const candidate of candidates) {
      try {
        validateLiveData(candidate);
        return candidate;
      } catch (_) {
        // Ignore invalid candidate payloads and continue fallback path.
      }
    }
    return null;
  }

  function validateLiveData(payload) {
    const requiredObjectFields = ["showCsvTextByKey"];
    const requiredStringFields = [
      "spendsPlanCsvText",
      "rawDumpCsvText",
      "scriptLevelSpendsCsvText",
      "showWiseBaseDataCsvText",
      "showWiseCostDataCsvText",
      "showWiseLayoutCsvText"
    ];

    requiredObjectFields.forEach((field) => {
      if (typeof payload[field] !== "object" || payload[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    });

    requiredStringFields.forEach((field) => {
      if (typeof payload[field] !== "string") {
        throw new Error(`Missing required field: ${field}`);
      }
    });
  }

  function installRuntimeGlobals(payload) {
    window.SHOW_CSV_TEXT_BY_KEY = payload.showCsvTextByKey;
    window.SPENDS_PLAN_CSV_TEXT = payload.spendsPlanCsvText;
    window.RAW_DUMP_CSV_TEXT = payload.rawDumpCsvText;
    window.SCRIPT_LEVEL_SPENDS_CSV_TEXT = payload.scriptLevelSpendsCsvText;
    window.SHOW_WISE_BASE_DATA_CSV_TEXT = payload.showWiseBaseDataCsvText;
    window.SHOW_WISE_COST_DATA_CSV_TEXT = payload.showWiseCostDataCsvText;
    window.SHOW_WISE_LAYOUT_CSV_TEXT = payload.showWiseLayoutCsvText;

    if (typeof payload.deepdiveWeeklyRawCsvText === "string") {
      window.DEEPDIVE_WEEKLY_RAW_CSV_TEXT = payload.deepdiveWeeklyRawCsvText;
    }
    if (typeof payload.deepdiveDailyRawCsvText === "string") {
      window.DEEPDIVE_DAILY_RAW_CSV_TEXT = payload.deepdiveDailyRawCsvText;
    }
    if (payload.deepdiveWeeklyCsvTextByKey && typeof payload.deepdiveWeeklyCsvTextByKey === "object") {
      window.DEEPDIVE_WEEKLY_CSV_TEXT_BY_KEY = payload.deepdiveWeeklyCsvTextByKey;
    }
    if (typeof payload.deepdiveDailyCsvText === "string") {
      window.DEEPDIVE_DAILY_CSV_TEXT = payload.deepdiveDailyCsvText;
    }
    window.__SCALING_TRACKER_LIVE_META__ = payload.meta || {};
  }

  function getPayloadGeneratedAt(payload) {
    return payload?.meta?.generatedAt || payload?.meta?.refreshedAt || "";
  }

  function updatePageMeta(state, payload) {
    if (!pageMeta) {
      return;
    }

    const generatedAt = getPayloadGeneratedAt(payload);
    if (state === "synced") {
      pageMeta.textContent = generatedAt
        ? `Live data synced · Last update: ${generatedAt}`
        : "Live data synced";
      return;
    }

    if (state === "syncing") {
      pageMeta.textContent = generatedAt
        ? `Showing recent snapshot · Last update: ${generatedAt} · Syncing latest data in background...`
        : "Showing recent snapshot · Syncing latest data in background...";
      return;
    }

    pageMeta.textContent = generatedAt
      ? `Showing last successful snapshot · Last update: ${generatedAt}`
      : "Showing last successful snapshot";
  }

  function loadDashboardScript() {
    return new Promise((resolve, reject) => {
      if (document.querySelector("script[data-dashboard-script='true']")) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = `./script.js?cacheBust=${Date.now()}`;
      script.async = false;
      script.dataset.dashboardScript = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load dashboard script"));
      document.body.appendChild(script);
    });
  }

  async function refreshInBackground(fallbackPayload) {
    updatePageMeta("syncing", fallbackPayload);
    const refreshResult = await triggerServerRefresh();
    let payload = extractPayloadFromRefreshResult(refreshResult);

    if (!payload) {
      try {
        payload = await loadLiveDataJson();
        validateLiveData(payload);
      } catch (error) {
        payload = fallbackPayload;
        console.warn("[ScalingTracker] Could not load refreshed live-data.json:", error);
      }
    }

    if (payload) {
      installRuntimeGlobals(payload);
    }

    if (refreshResult.ok) {
      updatePageMeta("synced", payload || fallbackPayload);
      return;
    }

    updatePageMeta("snapshot", payload || fallbackPayload);
    console.warn("[ScalingTracker] Live refresh failed:", refreshResult.reason || refreshResult);
  }

  async function bootstrapDashboard() {
    showLoader();
    setLoaderError("");
    setLoaderStatus("Loading latest snapshot...");

    let payload = null;
    try {
      payload = await loadLiveDataJson();
      validateLiveData(payload);
    } catch (snapshotError) {
      setLoaderStatus("Snapshot unavailable. Syncing live data from Google Sheet...");
      const refreshResult = await triggerServerRefresh();
      payload = extractPayloadFromRefreshResult(refreshResult);

      if (!payload) {
        payload = await loadLiveDataJson();
        validateLiveData(payload);
      }

      installRuntimeGlobals(payload);
      updatePageMeta(refreshResult.ok ? "synced" : "snapshot", payload);
      setLoaderStatus("Rendering dashboard...");
      await loadDashboardScript();
      hideLoader();

      if (!refreshResult.ok) {
        console.warn("[ScalingTracker] Live refresh failed:", refreshResult.reason || refreshResult);
      }
      return;
    }

    installRuntimeGlobals(payload);
    updatePageMeta("snapshot", payload);
    setLoaderStatus("Rendering dashboard...");
    await loadDashboardScript();
    hideLoader();

    // Keep initial load fast by syncing in background after the UI is visible.
    refreshInBackground(payload).catch((error) => {
      updatePageMeta("snapshot", payload);
      console.warn("[ScalingTracker] Background refresh failed:", error);
    });
  }

  async function runBootstrap() {
    try {
      await bootstrapDashboard();
    } catch (error) {
      showLoader();
      setLoaderStatus("Unable to load dashboard");
      setLoaderError(error instanceof Error ? error.message : String(error));
      console.error("[ScalingTracker] Bootstrap error", error);
    }
  }

  if (retryButton) {
    retryButton.addEventListener("click", () => {
      runBootstrap();
    });
  }

  runBootstrap();
})();
