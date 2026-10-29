'use strict';
/**
 * Run SQL on the Campus Connect database (campus_connect.db) one query at a time.
 *
 *   npm run sql                      -> interactive prompt (type a query, end it with ;)
 *   npm run sql -- "SELECT ..."      -> run one query and exit
 *
 * READ-ONLY on purpose: only SELECT / WITH / PRAGMA / EXPLAIN are allowed, so a
 * typo during the demo can never change or delete data.
 *
 * Prompt commands:
 *   .tables            list all tables
 *   .columns Student   show the columns of a table
 *   .exit              leave
 */
const readline = require('readline');
const { all } = require('../db');

const READ_ONLY = /^\s*(select|with|pragma|explain)\b/i;
const MAX_ROWS = 50;

function runQuery(sql) {
  const q = sql.trim().replace(/;+\s*$/, '');
  if (!q) return;
  if (!READ_ONLY.test(q)) {
    console.log('  Only SELECT queries are allowed here (this demo is read-only).');
    return;
  }
  try {
    const rows = all(q);
    if (!rows.length) { console.log('  (no rows)'); return; }
    console.table(rows.slice(0, MAX_ROWS));
    console.log(`  ${rows.length} row${rows.length === 1 ? '' : 's'}` + (rows.length > MAX_ROWS ? ` (showing the first ${MAX_ROWS})` : ''));
  } catch (e) {
    console.log('  SQL error: ' + e.message);
  }
}

function dotCommand(line) {
  const [cmd, arg] = line.trim().split(/\s+/);
  if (cmd === '.tables') {
    const t = all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    console.log('  ' + t.map((r) => r.name).join(', '));
  } else if (cmd === '.columns' && arg) {
    const cols = all(`PRAGMA table_info("${arg.replace(/"/g, '')}")`);
    if (cols.length) console.table(cols.map((c) => ({ column: c.name, type: c.type, not_null: c.notnull, primary_key: c.pk })));
    else console.log('  no such table: ' + arg);
  } else if (cmd === '.help') {
    console.log('  .tables | .columns <table> | .exit  -- or type a SELECT and end it with ;');
  } else {
    console.log('  unknown command (try .help)');
  }
}

const argSql = process.argv.slice(2).join(' ').trim();
if (argSql) {
  runQuery(argSql);
} else {
  console.log('Campus Connect SQL prompt (read-only).  Type a query and end it with ;');
  console.log('Try:  .tables    .columns Student    SELECT COUNT(*) FROM Student;    .exit\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sql> ' });
  let buf = '';
  rl.prompt();
  rl.on('line', (line) => {
    const t = line.trim();
    if (!buf && (t === '.exit' || t === '.quit')) { rl.close(); return; }
    if (!buf && t.startsWith('.')) {
      dotCommand(t);
    } else {
      buf += line + '\n';
      if (t.endsWith(';')) { runQuery(buf); buf = ''; }
    }
    rl.setPrompt(buf ? '...> ' : 'sql> ');
    rl.prompt();
  });
  rl.on('close', () => { console.log('bye'); process.exit(0); });
}
