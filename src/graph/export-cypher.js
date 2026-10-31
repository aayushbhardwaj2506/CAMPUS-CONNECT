'use strict';
/**
 * DA3 — EXPORT: write the whole Neo4j graph to one plain Cypher script,
 * neo4j/campus_graph.cypher, so the graph itself (not only the code that builds
 * it) can be stored in git and loaded into any empty Neo4j database:
 *
 *   npm run graph:export     read the running Neo4j  ->  neo4j/campus_graph.cypher
 *   npm run graph:load       neo4j/campus_graph.cypher  ->  an empty Neo4j database
 *
 * The script creates the constraints, every node (batched, one statement per set
 * of labels), every relationship, and removes its own helper label/property at the end.
 */
const fs = require('fs');
const path = require('path');
require('./neo4j'); // loads .env.local into process.env
const neo4j = require('neo4j-driver');

const BATCH = 150;
const OUT = path.join(__dirname, '..', '..', 'neo4j', 'campus_graph.cypher');
const CONSTRAINTS = [
  ['School', 'schoolId'], ['Department', 'deptId'], ['Program', 'programId'],
  ['Course', 'courseId'], ['Person', 'userId'], ['Club', 'clubId'],
  ['Community', 'communityId'], ['Event', 'eventId'], ['Project', 'projectId'],
  ['Group', 'groupId'], ['Class', 'classId'],
];

const isId = (k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k);
const key = (k) => (isId(k) ? k : '`' + k.replace(/`/g, '``') + '`');

/** One value as a Cypher literal (JSON string escapes are valid Cypher escapes). */
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (neo4j.isInt(v)) return v.toString();
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(1) : String(v); // a float stays a float
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
  throw new Error('unsupported property value: ' + typeof v);
}
const map = (o) => '{' + Object.keys(o).filter((k) => o[k] !== null && o[k] !== undefined).sort().map((k) => key(k) + ': ' + lit(o[k])).join(', ') + '}';

(async () => {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'campus-graph-123')
  );
  const session = driver.session({ defaultAccessMode: neo4j.session.READ, ...(process.env.NEO4J_DATABASE ? { database: process.env.NEO4J_DATABASE } : {}) });
  try {
    const nodes = (await session.run('MATCH (n) RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props ORDER BY id')).records;
    const rels = (await session.run('MATCH (a)-[r]->(b) RETURN elementId(a) AS a, elementId(b) AS b, type(r) AS type, properties(r) AS props ORDER BY elementId(r)')).records;

    const eid = new Map(); // server id -> small export id
    nodes.forEach((r, i) => eid.set(r.get('id'), i));

    const out = [];
    out.push(`// Campus Connect: the DA3 graph (${nodes.length} nodes, ${rels.length} relationships), exported from Neo4j.`);
    out.push('// Load into an EMPTY Neo4j database:  npm run graph:load   (or paste into Neo4j Browser / cypher-shell -f).');
    out.push('// It uses a temporary helper label (_X) and property (_eid); both are removed in the last statements.');
    out.push('');
    for (const [label, prop] of CONSTRAINTS) {
      out.push(`CREATE CONSTRAINT ${label.toLowerCase()}_${prop} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE;`);
    }
    out.push('CREATE INDEX x_eid IF NOT EXISTS FOR (n:_X) ON (n._eid);');
    out.push('');

    // nodes, grouped by their set of labels
    const groups = new Map();
    for (const r of nodes) {
      const labels = r.get('labels').slice().sort();
      const k = labels.join(':');
      if (!groups.has(k)) groups.set(k, { labels, rows: [] });
      groups.get(k).rows.push({ i: eid.get(r.get('id')), p: r.get('props') });
    }
    for (const { labels, rows } of groups.values()) {
      for (let s = 0; s < rows.length; s += BATCH) {
        const chunk = rows.slice(s, s + BATCH).map((x) => `{i: ${x.i}, p: ${map(x.p)}}`).join(',\n  ');
        out.push(`UNWIND [\n  ${chunk}\n] AS r CREATE (n:${labels.map(key).join(':')}:_X) SET n = r.p SET n._eid = r.i;`);
      }
    }
    out.push('');

    // relationships, grouped by type
    const byType = new Map();
    for (const r of rels) {
      const t = r.get('type');
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(`[${eid.get(r.get('a'))}, ${eid.get(r.get('b'))}, ${map(r.get('props'))}]`);
    }
    for (const [type, rows] of byType) {
      for (let s = 0; s < rows.length; s += BATCH * 2) {
        out.push(`UNWIND [\n  ${rows.slice(s, s + BATCH * 2).join(',\n  ')}\n] AS r MATCH (a:_X {_eid: r[0]}) MATCH (b:_X {_eid: r[1]}) CREATE (a)-[e:${key(type)}]->(b) SET e = r[2];`);
      }
    }
    out.push('');
    out.push('MATCH (n:_X) REMOVE n:_X, n._eid;');
    out.push('DROP INDEX x_eid IF EXISTS;');
    out.push('');

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, out.join('\n'), 'utf8');
    console.log(`[graph] exported ${nodes.length} nodes and ${rels.length} relationships (${byType.size} types) to ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  } finally {
    await session.close();
    await driver.close();
  }
})().catch((e) => { console.error('[graph] export failed:', e.message); process.exit(1); });
