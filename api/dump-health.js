"use strict";

const { kv } = require("@vercel/kv");
const { getSourceKeys } = require("./_lib/dump-source");

function buildDefaultMeta() {
  const sources = {};
  for (const key of getSourceKeys()) {
    sources[key] = {
      ok: false,
      updatedAt: null,
      rowCount: 0,
      error: "not-initialized",
    };
  }
  return {
    ok: false,
    updatedAt: null,
    remoteUrl: process.env.IOS_DUMP_REMOTE_URL || "",
    sources,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const meta = await kv.get("dump:meta");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(meta || buildDefaultMeta());
};
