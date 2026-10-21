'use strict';
/**
 * DA3 — thin Neo4j access layer for Campus Connect.
 * Neo4j is an ADDITIONAL store used for relationship queries; SQLite remains
 * the system of record for the application.
 */
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');

// Optional git-ignored .env.local (NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD).
// Real environment variables win over the file.
try {
  const file = path.join(__dirname, '..', '..', '.env.local');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch (_e) { /* no .env.local — use defaults / real env */ }

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'campus-graph-123';

let driver = null;
function getDriver() {
  if (!driver) {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
      connectionTimeout: 15000,
      connectionAcquisitionTimeout: 15000,
      maxTransactionRetryTime: 15000,
    });
  }
  return driver;
}

/** Convert neo4j Integers (and nested lists / maps) into plain JS values. */
function plain(v) {
  if (neo4j.isInt(v)) return v.inSafeRange() ? v.toNumber() : v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = plain(v[k]);
    return out;
  }
  return v;
}

async function exec(cypher, params = {}, mode = 'READ') {
  const session = getDriver().session({
    defaultAccessMode: mode === 'WRITE' ? neo4j.session.WRITE : neo4j.session.READ,
  });
  try {
    const res = await session.run(cypher, params);
    return res.records.map((r) => plain(r.toObject()));
  } finally {
    await session.close();
  }
}

const read = (cypher, params) => exec(cypher, params, 'READ');
const write = (cypher, params) => exec(cypher, params, 'WRITE');

/** true when the server answers; never throws. */
async function isUp() {
  try {
    await getDriver().verifyConnectivity();
    return true;
  } catch (_e) {
    return false;
  }
}

async function close() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = { read, write, isUp, close, URI };
