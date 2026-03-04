#!/usr/bin/env python3
"""Static server for public/ + cached dump refresh every 5 minutes."""

from __future__ import annotations

import csv
import io
import json
import os
import threading
import time
from json import JSONDecodeError
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qsl
from urllib.request import Request, urlopen

HOST = os.environ.get("IOS_DUMP_HOST", "0.0.0.0")
PORT = int(os.environ.get("IOS_DUMP_PORT", "4173"))
PUBLIC_DIR = Path(__file__).resolve().parent.parent / "public"
ROOT_DIR = Path(__file__).resolve().parent.parent

REMOTE_BASE_URL = os.environ.get(
    "IOS_DUMP_REMOTE_URL",
    "https://script.google.com/macros/s/AKfycbyL126fntw3tGFi1BQjmI89InuuHrKa04vjiwE6DPV_F7hDA8olqHggbLXbwuh6UsjzUA/exec",
)
REMOTE_TOKEN = os.environ.get("IOS_DUMP_REMOTE_TOKEN", "4s7nhrdksvtdx3gql020")
REMOTE_SOURCES = os.environ.get(
    "IOS_DUMP_REMOTE_SOURCES",
    "ios_performance_dump,spends_plan_tracking,retention_view,raw_dump,cost_data,base_data,spends_weekly,spends_daily",
)
REFRESH_SECONDS = int(os.environ.get("IOS_DUMP_REFRESH_SECONDS", "300"))
REMOTE_TIMEOUT_SECONDS = int(os.environ.get("IOS_DUMP_REMOTE_TIMEOUT_SECONDS", "90"))

SOURCE_KEYS = [key.strip() for key in REMOTE_SOURCES.split(",") if key.strip()]
CACHE_FILES = {key: ROOT_DIR / f"{key}_cache.csv" for key in SOURCE_KEYS}
CACHE_META_PATH = ROOT_DIR / "dump_cache_meta.json"

meta_lock = threading.Lock()
runtime_meta = {
    "ok": False,
    "updatedAt": None,
    "remoteUrl": REMOTE_BASE_URL,
    "sources": {
        key: {"ok": False, "updatedAt": None, "rowCount": 0, "error": "not-initialized"} for key in SOURCE_KEYS
    },
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_remote_url(source_key: str | None = None) -> str:
    parsed = urlparse(REMOTE_BASE_URL)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("source", None)
    query.pop("sources", None)
    if source_key:
        query["source"] = source_key
    else:
        query["sources"] = ",".join(SOURCE_KEYS)
    if REMOTE_TOKEN:
        query["token"] = REMOTE_TOKEN
    encoded_query = urlencode(query)
    return parsed._replace(query=encoded_query).geturl()


def dataset_to_csv_text(dataset: dict) -> tuple[str, int]:
    headers = dataset.get("headers") or []
    rows = dataset.get("rows") or []
    if not headers:
        return "", 0

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)

    for row in rows:
        if isinstance(row, dict):
            writer.writerow([row.get(h, "") for h in headers])
        elif isinstance(row, list):
            padded = row + [""] * max(0, len(headers) - len(row))
            writer.writerow(padded[: len(headers)])
        else:
            writer.writerow([""] * len(headers))

    return output.getvalue(), len(rows)


def extract_dataset(entry: dict) -> dict:
    if not isinstance(entry, dict):
        raise RuntimeError("invalid entry payload")
    if "data" in entry and isinstance(entry["data"], dict):
        return entry["data"]
    if "headers" in entry and "rows" in entry:
        return entry
    raise RuntimeError("dataset missing headers/rows")


def save_meta(meta: dict) -> None:
    CACHE_META_PATH.write_text(json.dumps(meta, ensure_ascii=True), encoding="utf-8")
    with meta_lock:
        runtime_meta.clear()
        runtime_meta.update(meta)


def _fetch_json(remote_url: str) -> dict:
    req = Request(remote_url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=REMOTE_TIMEOUT_SECONDS) as response:
        status_code = getattr(response, "status", 200)
        content_type = response.headers.get("Content-Type", "")
        body = response.read().decode("utf-8", errors="replace")

    try:
        payload = json.loads(body)
    except JSONDecodeError as exc:
        preview = body.strip().replace("\n", " ")[:280]
        raise RuntimeError(
            f"non-json response (status={status_code}, content-type={content_type}): {preview or '<empty>'}"
        ) from exc
    return payload


def _extract_dataset_from_payload(payload: dict, source_key: str) -> dict:
    if not payload.get("ok"):
        raise RuntimeError(payload.get("error") or "remote returned ok=false")

    data = payload.get("data") or {}
    if isinstance(data, dict) and "headers" in data and "rows" in data:
        return extract_dataset(data)
    if isinstance(data, dict) and source_key in data:
        return extract_dataset(data[source_key])
    if isinstance(data, dict) and len(data) == 1:
        # Some deployments key by sheet/tab name instead of source key.
        only_entry = next(iter(data.values()))
        return extract_dataset(only_entry)
    if "headers" in payload and "rows" in payload:
        return extract_dataset(payload)
    if "data" in payload and isinstance(payload["data"], dict):
        raise RuntimeError(f"source missing in response; available keys: {', '.join(payload['data'].keys()) or '<none>'}")
    raise RuntimeError("source missing in response")


def fetch_and_refresh_cache() -> None:
    next_sources = {}
    for key in SOURCE_KEYS:
        try:
            remote_url = build_remote_url(key)
            payload = _fetch_json(remote_url)
            dataset = _extract_dataset_from_payload(payload, key)
            csv_text, row_count = dataset_to_csv_text(dataset)
            if not csv_text:
                raise RuntimeError("received empty dataset/csv")
            CACHE_FILES[key].write_text(csv_text, encoding="utf-8")
            next_sources[key] = {"ok": True, "updatedAt": utc_now_iso(), "rowCount": row_count, "error": ""}
        except Exception as exc:  # noqa: BLE001
            next_sources[key] = {"ok": False, "updatedAt": utc_now_iso(), "rowCount": 0, "error": str(exc)}

    meta = {
        "ok": all(source["ok"] for source in next_sources.values()),
        "updatedAt": utc_now_iso(),
        "remoteUrl": build_remote_url(),
        "sources": next_sources,
    }
    save_meta(meta)


def refresh_loop() -> None:
    while True:
        try:
            fetch_and_refresh_cache()
            print(f"[cache] refreshed at {utc_now_iso()}")
        except Exception as exc:  # noqa: BLE001
            failed_sources = {
                key: {"ok": False, "updatedAt": utc_now_iso(), "rowCount": 0, "error": str(exc)} for key in SOURCE_KEYS
            }
            meta = {
                "ok": False,
                "updatedAt": utc_now_iso(),
                "remoteUrl": REMOTE_BASE_URL,
                "sources": failed_sources,
            }
            save_meta(meta)
            print(f"[cache] refresh failed: {exc}")
        time.sleep(REFRESH_SECONDS)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/__ios_performance_dump_health":
            self.serve_health()
            return

        if self.path.startswith("/__dump_cache/") and self.path.endswith(".csv"):
            source_key = self.path[len("/__dump_cache/") : -len(".csv")]
            self.serve_source_csv(source_key)
            return

        super().do_GET()

    def serve_source_csv(self, source_key: str) -> None:
        cache_path = CACHE_FILES.get(source_key)
        if not cache_path:
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"unknown source")
            return
        if not cache_path.exists():
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        data = cache_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_health(self) -> None:
        with meta_lock:
            payload = json.dumps(runtime_meta, ensure_ascii=True).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    thread = threading.Thread(target=refresh_loop, daemon=True)
    thread.start()

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"serving http://localhost:{PORT} from {PUBLIC_DIR}")
    print(f"health endpoint: http://localhost:{PORT}/__ios_performance_dump_health")
    server.serve_forever()


if __name__ == "__main__":
    main()
