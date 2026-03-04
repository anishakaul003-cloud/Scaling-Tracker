"use strict";

const { kv } = require("@vercel/kv");
const { getSourceKeys } = require("../_lib/dump-source");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const source = String(req.query?.source || "").trim();
  if (!source || !getSourceKeys().includes(source)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(404).send("unknown source");
  }

  const csvText = await kv.get(`dump:csv:${source}`);
  if (!csvText) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).send("");
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(String(csvText));
};
