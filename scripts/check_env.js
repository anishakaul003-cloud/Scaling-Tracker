#!/usr/bin/env node
"use strict";

const { execSync } = require("node:child_process");

function getMajor(versionText) {
  const match = String(versionText).trim().match(/(\d+)(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

function readCommandVersion(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch (error) {
    return null;
  }
}

const failures = [];

const nodeVersion = process.version;
const nodeMajor = getMajor(nodeVersion);
if (nodeMajor !== 24) {
  failures.push(
    `Node.js 24 LTS is required. Found ${nodeVersion || "unknown version"}.`
  );
}

const npmVersion = readCommandVersion("npm --version");
const npmMajor = getMajor(npmVersion || "");
if (!npmVersion) {
  failures.push("npm is not available in PATH.");
} else if (npmMajor !== 11) {
  failures.push(`npm 11 is expected with Node 24 setup. Found ${npmVersion}.`);
}

const pythonVersion = readCommandVersion("python3 --version");
const pythonMajor = getMajor(pythonVersion || "");
if (!pythonVersion) {
  failures.push("python3 is not available in PATH.");
} else if (pythonMajor !== 3) {
  failures.push(`Python 3 is required. Found ${pythonVersion}.`);
}

if (failures.length > 0) {
  console.error("Environment check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Environment check passed.");
console.log(`- Node.js: ${nodeVersion}`);
console.log(`- npm: ${npmVersion}`);
console.log(`- python3: ${pythonVersion}`);
