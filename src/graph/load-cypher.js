'use strict';
/**
 * DA3 — LOAD: run a Cypher script (default neo4j/campus_graph.cypher, the exported
 * Campus Connect graph) against the configured Neo4j, one statement at a time.
 *
 *   npm run graph:load                      load into an EMPTY database
 *   npm run graph:load -- --wipe            clear the database first, then load
 *   npm run graph:load -- path/to/file.cypher
 *
 * Safe by default: it refuses to load into a database that already has nodes.
 */
const fs = require('fs');
const path = require('path');
const graph = require('./neo4j');

const args = process.argv.slice(2);
const wipe = args.includes('--wipe');
const file = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', '..', 'neo4j', 'campus_graph.cypher'));

/** Split a script into statements: a statement ends with ';' at the end of a line; // comment lines are dropped. */
function statements(text) {
  return text
    .split(/;[ \t]*\r?\n/)
    .map((s) => s.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n').trim().replace(/;$/, ''))
    .filter(Boolean);
}

(async () => {
  if (!fs.existsSync(file)) { console.error('File not found: ' + file); process.exit(1); }
  if (!(await graph.isUp())) {
    console.error('Neo4j is not reachable at ' + graph.URI + '. Start Neo4j and check .env.local (see .env.example).');
    process.exit(1);
  }
  const existing = (await graph.read('MATCH (n) RETURN count(n) AS n'))[0].n;
  if (existing > 0 && !wipe) {
    console.error(`The database already has ${existing} nodes. Use an empty database, or run: npm run graph:load -- --wipe`);
    process.exit(1);
  }
  if (wipe) { console.log('[graph] clearing the database...'); await graph.write('MATCH (n) DETACH DELETE n'); }

  const list = statements(fs.readFileSync(file, 'utf8'));
  console.log(`[graph] running ${list.length} statements from ${path.relative(process.cwd(), file)} ...`);
  const t0 = Date.now();
  for (const s of list) await graph.write(s);

  const nodes = (await graph.read('MATCH (n) RETURN count(n) AS n'))[0].n;
  const rels = (await graph.read('MATCH ()-[r]->() RETURN count(r) AS n'))[0].n;
  console.log(`[graph] loaded ${nodes} nodes and ${rels} relationships in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await graph.close();
})().catch((e) => { console.error('[graph] load failed:', e.message); process.exit(1); });
