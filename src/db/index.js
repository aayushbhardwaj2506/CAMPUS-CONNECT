'use strict';
/**
 * Thin wrapper around Node's built-in synchronous SQLite driver (`node:sqlite`,
 * available on Node >= 22.5). Chosen over better-sqlite3 so the project installs
 * with zero native build steps.
 *
 * Exposes: db (raw handle), get(), all(), run(), tx(), and initSchema().
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH =
  process.env.CAMPUS_DB_PATH || path.join(__dirname, '..', '..', 'campus_connect.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** Normalise params so callers can pass (sql), (sql, [a,b]) or (sql, {name:v}). */
function bind(stmt, params) {
  if (params === undefined || params === null) return stmt;
  if (Array.isArray(params)) return { call: (m) => stmt[m](...params) };
  if (typeof params === 'object') return { call: (m) => stmt[m](params) };
  return { call: (m) => stmt[m](params) };
}

function get(sql, params) {
  const stmt = db.prepare(sql);
  return params === undefined ? stmt.get() : bind(stmt, params).call('get');
}

function all(sql, params) {
  const stmt = db.prepare(sql);
  return params === undefined ? stmt.all() : bind(stmt, params).call('all');
}

function run(sql, params) {
  const stmt = db.prepare(sql);
  const r = params === undefined ? stmt.run() : bind(stmt, params).call('run');
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Run fn() inside a transaction; rolls back on throw. */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Create every table if it does not already exist. Safe to call repeatedly. */
function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

/** True once the core tables are present AND the standard demo accounts exist. */
function isSeeded() {
  try {
    const row = get('SELECT COUNT(*) AS n FROM "User"');
    const demo = get('SELECT 1 FROM "User" WHERE lower(Email) = ?', ['aarav@campus.edu']);
    return Boolean(row && row.n >= 10 && demo);
  } catch {
    return false;
  }
}

module.exports = { db, get, all, run, tx, initSchema, isSeeded, DB_PATH };
