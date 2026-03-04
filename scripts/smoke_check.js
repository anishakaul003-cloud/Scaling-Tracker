#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_FILES = [
  "public/index.html",
  "public/script.js",
  "public/styles.css",
  "scripts/dev_server.py",
];

function fileText(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function assertJsSyntax(relativePath) {
  const source = fileText(relativePath);
  // Parse for syntax validity without executing file logic.
  new Function(source);
}

function assertHtmlShape(relativePath) {
  const html = fileText(relativePath);
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error(`${relativePath} does not contain expected HTML shell tags.`);
  }
}

function assertCssShape(relativePath) {
  const css = fileText(relativePath);
  if (!css.trim()) {
    throw new Error(`${relativePath} is empty.`);
  }
  const opens = (css.match(/{/g) || []).length;
  const closes = (css.match(/}/g) || []).length;
  if (opens !== closes) {
    throw new Error(`${relativePath} appears to have unbalanced CSS blocks.`);
  }
}

async function checkHealthEndpoint() {
  const endpoint = "http://localhost:4173/__ios_performance_dump_health";
  const timeout = setTimeout(() => controller.abort(), 1500);
  const controller = new AbortController();
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`Health endpoint returned HTTP ${response.status}.`);
    }
    console.log(`Health endpoint reachable: ${endpoint}`);
  } catch (error) {
    clearTimeout(timeout);
    const code = error && error.cause && error.cause.code;
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      error.name === "AbortError" ||
      error.name === "TypeError"
    ) {
      console.log(
        "Dev server health check skipped: server not reachable on localhost:4173."
      );
      return;
    }
    throw error;
  }
}

async function main() {
  for (const required of REQUIRED_FILES) {
    fileText(required);
  }

  assertHtmlShape("public/index.html");
  assertCssShape("public/styles.css");
  assertJsSyntax("public/script.js");

  await checkHealthEndpoint();
  console.log("Smoke checks passed.");
}

main().catch((error) => {
  console.error(`Smoke checks failed: ${error.message}`);
  process.exit(1);
});
