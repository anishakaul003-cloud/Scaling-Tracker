from __future__ import annotations

import json
import math
import os
import socket
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _first_present(container: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in container:
            return container[key]
    return None


def _fetch_json(url: str, timeout_seconds: float = 80.0) -> Dict[str, Any]:
    errors = []

    try:
        return _fetch_json_via_curl(url, timeout_seconds)
    except RuntimeError as curl_error:
        errors.append(f"curl: {curl_error}")

    try:
        return _fetch_json_via_urllib(url, timeout_seconds)
    except RuntimeError as urllib_error:
        errors.append(f"urllib: {urllib_error}")

    raise RuntimeError("Apps Script fetch failed: " + " | ".join(errors))


def _fetch_json_via_urllib(url: str, timeout_seconds: float) -> Dict[str, Any]:
    request = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw_bytes = response.read()
    except HTTPError as exc:
        raise RuntimeError(f"Apps Script HTTP error {exc.code}") from exc
    except TimeoutError as exc:
        raise RuntimeError("Apps Script URL error: timed out") from exc
    except socket.timeout as exc:
        raise RuntimeError("Apps Script URL error: timed out") from exc
    except URLError as exc:
        raise RuntimeError(f"Apps Script URL error: {exc.reason}") from exc

    try:
        decoded = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("Apps Script response is not valid UTF-8") from exc

    try:
        parsed = json.loads(decoded)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Apps Script response is not valid JSON") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("Apps Script response root must be a JSON object")
    return parsed


def _fetch_json_via_curl(url: str, timeout_seconds: float) -> Dict[str, Any]:
    max_time = max(1, int(math.ceil(timeout_seconds)))
    connect_timeout = max(5, min(20, int(max_time / 3) if max_time > 6 else max_time))
    try:
        completed = subprocess.run(
            [
                "curl",
                "--silent",
                "--show-error",
                "--location",
                "--compressed",
                "--ipv4",
                "--retry",
                "1",
                "--retry-all-errors",
                "--retry-delay",
                "1",
                "--connect-timeout",
                str(connect_timeout),
                "--max-time",
                str(max_time),
                "--header",
                "Accept: application/json",
                url,
            ],
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("curl is not available on this machine") from exc

    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(stderr or f"curl exited with status {completed.returncode}")

    raw_bytes = completed.stdout
    try:
        decoded = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("Apps Script response is not valid UTF-8") from exc

    try:
        parsed = json.loads(decoded)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Apps Script response is not valid JSON") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("Apps Script response root must be a JSON object")
    return parsed


def _resolve_fetch_timeout_seconds(default_timeout: float = 80.0) -> float:
    for env_key in ("APPS_SCRIPT_FETCH_TIMEOUT_SECONDS", "FETCH_TIMEOUT_SECONDS"):
        raw_value = os.environ.get(env_key, "").strip()
        if not raw_value:
            continue
        try:
            parsed = float(raw_value)
        except ValueError:
            continue
        if parsed > 0:
            return parsed
    return default_timeout


def _normalize_remote_payload(remote_payload: Dict[str, Any]) -> Dict[str, Any]:
    if remote_payload.get("ok") is False:
        error_text = _first_present(remote_payload, "error", "reason", "message")
        if not isinstance(error_text, str) or not error_text.strip():
            error_text = "Apps Script returned ok=false without an error message"
        raise ValueError(f"Apps Script error: {error_text}")

    payload_root = remote_payload.get("data")
    if isinstance(payload_root, dict):
        data = payload_root
    else:
        data = remote_payload

    normalized: Dict[str, Any] = {
        "showCsvTextByKey": _first_present(
            data,
            "showCsvTextByKey",
            "SHOW_CSV_TEXT_BY_KEY",
            "show_csv_text_by_key",
        ),
        "spendsPlanCsvText": _first_present(
            data,
            "spendsPlanCsvText",
            "SPENDS_PLAN_CSV_TEXT",
            "spends_plan_csv_text",
        ),
        "rawDumpCsvText": _first_present(
            data,
            "rawDumpCsvText",
            "RAW_DUMP_CSV_TEXT",
            "raw_dump_csv_text",
        ),
        "scriptLevelSpendsCsvText": _first_present(
            data,
            "scriptLevelSpendsCsvText",
            "SCRIPT_LEVEL_SPENDS_CSV_TEXT",
            "script_level_spends_csv_text",
        ),
        "showWiseBaseDataCsvText": _first_present(
            data,
            "showWiseBaseDataCsvText",
            "SHOW_WISE_BASE_DATA_CSV_TEXT",
            "show_wise_base_data_csv_text",
        ),
        "showWiseCostDataCsvText": _first_present(
            data,
            "showWiseCostDataCsvText",
            "SHOW_WISE_COST_DATA_CSV_TEXT",
            "show_wise_cost_data_csv_text",
        ),
        "showWiseLayoutCsvText": _first_present(
            data,
            "showWiseLayoutCsvText",
            "SHOW_WISE_LAYOUT_CSV_TEXT",
            "show_wise_layout_csv_text",
        ),
    }

    optional_weekly = _first_present(
        data,
        "deepdiveWeeklyRawCsvText",
        "DEEPDIVE_WEEKLY_RAW_CSV_TEXT",
        "deepdive_weekly_raw_csv_text",
    )
    optional_daily = _first_present(
        data,
        "deepdiveDailyRawCsvText",
        "DEEPDIVE_DAILY_RAW_CSV_TEXT",
        "deepdive_daily_raw_csv_text",
    )
    optional_weekly_by_key = _first_present(
        data,
        "deepdiveWeeklyCsvTextByKey",
        "DEEPDIVE_WEEKLY_CSV_TEXT_BY_KEY",
        "deepdive_weekly_csv_text_by_key",
    )
    optional_daily_csv = _first_present(
        data,
        "deepdiveDailyCsvText",
        "DEEPDIVE_DAILY_CSV_TEXT",
        "deepdive_daily_csv_text",
    )
    if isinstance(optional_weekly, str):
        normalized["deepdiveWeeklyRawCsvText"] = optional_weekly
    if isinstance(optional_daily, str):
        normalized["deepdiveDailyRawCsvText"] = optional_daily
    if isinstance(optional_weekly_by_key, dict):
        normalized["deepdiveWeeklyCsvTextByKey"] = optional_weekly_by_key
    if isinstance(optional_daily_csv, str):
        normalized["deepdiveDailyCsvText"] = optional_daily_csv

    if not isinstance(normalized["showCsvTextByKey"], dict):
        raise ValueError("Missing or invalid showCsvTextByKey in Apps Script response")

    required_text_fields = [
        "spendsPlanCsvText",
        "rawDumpCsvText",
        "scriptLevelSpendsCsvText",
        "showWiseBaseDataCsvText",
        "showWiseCostDataCsvText",
        "showWiseLayoutCsvText",
    ]
    for field in required_text_fields:
        if not isinstance(normalized[field], str) or normalized[field] == "":
            raise ValueError(f"Missing or invalid {field} in Apps Script response")

    remote_meta = remote_payload.get("meta")
    meta: Dict[str, Any] = {}
    if isinstance(remote_meta, dict):
        meta.update(remote_meta)
    elif isinstance(data.get("meta"), dict):
        meta.update(data["meta"])

    meta.setdefault("source", "apps-script")
    meta["generatedAt"] = _first_present(
        meta,
        "generatedAt",
        "generated_at",
        "timestamp",
    ) or _utc_now_iso()
    meta["refreshedAt"] = _utc_now_iso()
    normalized["meta"] = meta

    return normalized


def _refresh_live_data() -> Dict[str, Any]:
    apps_script_url = os.environ.get("APPS_SCRIPT_URL", "").strip()
    timeout_seconds = _resolve_fetch_timeout_seconds()
    if not apps_script_url:
        return {
            "ok": False,
            "updated": False,
            "reason": "APPS_SCRIPT_URL not configured",
            "staleDataAvailable": True,
        }

    try:
        remote_payload = _fetch_json(apps_script_url, timeout_seconds=timeout_seconds)
        normalized_payload = _normalize_remote_payload(remote_payload)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "updated": False,
            "reason": str(exc),
            "staleDataAvailable": True,
        }

    return {
        "ok": True,
        "updated": True,
        "staleDataAvailable": True,
        "meta": normalized_payload.get("meta", {}),
        "data": normalized_payload,
    }


class handler(BaseHTTPRequestHandler):
    def _send_json(self, body: Dict[str, Any], status_code: int = 200) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        body = {
            "ok": True,
            "configured": bool(os.environ.get("APPS_SCRIPT_URL", "").strip()),
            "staleDataAvailable": True,
        }
        self._send_json(body, status_code=200)

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > 0:
            self.rfile.read(content_length)
        result = _refresh_live_data()
        self._send_json(result, status_code=200)
