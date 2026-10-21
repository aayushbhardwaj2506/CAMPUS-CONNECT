'use strict';
/**
 * DA3 — core operations demo (CREATE / READ / UPDATE / DELETE) on the graph,
 * printed step by step so it can be shown live:   npm run graph:demo
 */
const graph = require('./neo4j');
const { QUERIES } = require('./queries');

async function step(title, cypher, params = {}, write = false) {
  console.log(`\n-- ${title}`);
  console.log(cypher.trim().split('\n').map((l) => '   ' + l).join('\n'));
  const rows = await (write ? graph.write : graph.read)(cypher, params);
  if (rows.length) console.table(rows);
  else console.log('   (ok)');
  return rows;
}

async function main() {
  if (!(await graph.isUp())) {
    console.error('Neo4j is not reachable. Run: docker compose -f docker-compose.neo4j.yml up -d');
    process.exit(1);
  }

  console.log('=== CREATE ===');
  await step('Create a new student node and link them to a club',
    `CREATE (s:Person:Student {userId: 9001, name: 'Demo Student', synthetic: true})
WITH s
MATCH (c:Club) WITH s, c ORDER BY c.clubId LIMIT 1
CREATE (s)-[:MEMBER_OF {role: 'MEMBER'}]->(c)
RETURN s.name AS student, c.name AS joined`, {}, true);

  console.log('\n=== READ ===');
  await step('Find the new student and their clubs',
    `MATCH (s:Person {userId: 9001})-[:MEMBER_OF]->(c:Club)
RETURN s.name AS student, c.name AS club`);

  console.log('\n=== UPDATE ===');
  await step('Rename the student and change the membership role',
    `MATCH (s:Person {userId: 9001})-[m:MEMBER_OF]->(:Club)
SET s.name = 'Demo Student (updated)', m.role = 'CORE'
RETURN s.name AS student, m.role AS role`, {}, true);

  console.log('\n=== DELETE ===');
  await step('Remove the node and all its relationships',
    `MATCH (s:Person {userId: 9001}) DETACH DELETE s`, {}, true);
  await step('Confirm it is gone',
    `MATCH (s:Person {userId: 9001}) RETURN count(s) AS remaining`);

  console.log('\n=== TECHNOLOGY-SPECIFIC QUERIES (graph traversal) ===');
  const me = (await graph.read('MATCH (p:Person) WHERE p.synthetic = false RETURN p.userId AS id ORDER BY id LIMIT 1'))[0];
  const other = (await graph.read(
    'MATCH (p:Person) WHERE p.synthetic = true RETURN p.userId AS id ORDER BY id DESC LIMIT 1'))[0];
  for (const key of ['closest', 'fof', 'clubs']) {
    await step(QUERIES[key].title, QUERIES[key].cypher, { me: me.id });
  }
  await step(QUERIES.path.title, QUERIES.path.cypher, { me: me.id, other: other.id });
  await step(QUERIES.central.title, QUERIES.central.cypher);
  await step(QUERIES.overlap.title, QUERIES.overlap.cypher);

  await graph.close();
}

main().catch((e) => { console.error('[graph:demo] failed:', e.message); process.exit(1); });
