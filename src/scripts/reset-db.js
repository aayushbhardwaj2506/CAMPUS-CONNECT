'use strict';
/**
 * Delete the SQLite database files so the next start/seed rebuilds from zero.
 *
 * Note: `npm run seed` already fully wipes and re-inserts every table inside a
 * transaction, so you rarely need this. It exists for a truly clean slate.
 *
 * On Windows + OneDrive the .db file can be transiently locked by the sync
 * client; we retry a few times and, failing that, tell you to close anything
 * using it (a running server, DB Browser) and try again.
 */
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../db');

function rmWithRetry(file, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      if (!fs.existsSync(file)) return true;
      fs.rmSync(file);
      return true;
    } catch (err) {
      if (i === tries - 1) {
        console.error(`Could not remove ${path.basename(file)} (${err.code}).`);
        console.error('Close the running server / any DB viewer and retry, or just run "npm run seed".');
        return false;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); // 300ms sleep
    }
  }
}

let ok = true;
for (const f of [DB_PATH + '-wal', DB_PATH + '-shm', DB_PATH]) {
  if (!rmWithRetry(f)) ok = false;
  else if (!fs.existsSync(f)) console.log('removed', path.basename(f));
}
console.log(ok ? '\nDatabase cleared. Run "npm run seed" to rebuild.' : '\nPartial clear — see messages above.');
process.exit(ok ? 0 : 1);
