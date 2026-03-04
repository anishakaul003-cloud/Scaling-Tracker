"use strict";

const { kv } = require("@vercel/kv");
const {
  utcNowIso,
  getSourceKeys,
  getRemoteConfig,
  buildRemoteUrl,
  fetchSourceSnapshot,
} = require("../_lib/dump-source");

function getBearerToken(authHeader) {
  const value = String(authHeader || "");
  const prefix = "Bearer ";
  if (!value.startsWith(prefix)) {
    return "";
  }
  return value.slice(prefix.length).trim();
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    return Boolean(req.headers["x-vercel-cron"]);
  }

  const bearer = getBearerToken(req.headers.authorization);
  if (bearer && bearer === secret) {
    return true;
  }

  const cronHeader = req.headers["x-vercel-cron"];
  const querySecret = String(req.query?.secret || "");
  return Boolean(cronHeader) && querySecret === secret;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const sourceKeys = getSourceKeys();
  const { remoteUrl, token } = getRemoteConfig();
  const nextSources = {};

  for (const sourceKey of sourceKeys) {
    try {
      const snapshot = await fetchSourceSnapshot(sourceKey);
      await kv.set(`dump:csv:${sourceKey}`, snapshot.csvText);
      nextSources[sourceKey] = {
        ok: true,
        updatedAt: snapshot.updatedAt,
        rowCount: snapshot.rowCount,
        error: "",
      };
    } catch (error) {
      nextSources[sourceKey] = {
        ok: false,
        updatedAt: utcNowIso(),
        rowCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const updatedAt = utcNowIso();
  const meta = {
    ok: sourceKeys.every((key) => nextSources[key]?.ok),
    updatedAt,
    remoteUrl: buildRemoteUrl({ remoteUrl, token, sourceKey: null }),
    sources: nextSources,
  };

  await kv.set("dump:meta", meta);

  const successCount = sourceKeys.filter((key) => nextSources[key]?.ok).length;
  const failureCount = sourceKeys.length - successCount;
  const statusCode = successCount === 0 ? 500 : 200;

  return res.status(statusCode).json({
    ok: successCount > 0,
    updatedAt,
    successCount,
    failureCount,
    sources: nextSources,
  });
};
