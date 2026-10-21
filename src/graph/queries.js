'use strict';
/**
 * DA3 — the graph queries (Cypher) shown in the app and in the demo.
 * `me` / `other` are Campus Connect User_IDs, which map to (:Person {userId}).
 */

const QUERIES = {
  // 1. Who is closest to me? (multi-hop pattern over 4 relationship types)
  closest: {
    title: 'People who share the most with you',
    blurb: 'Counts the clubs, communities, projects and courses you have in common.',
    cypher: `MATCH (me:Person {userId: $me})-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES]->(x)
      <-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES]-(o:Person)
WHERE o <> me
RETURN o.userId AS userId, o.name AS name, count(DISTINCT x) AS shared,
       collect(DISTINCT x.name)[..4] AS via
ORDER BY shared DESC, name
LIMIT 8`,
  },

  // 2. Friends of friends — a 2-hop traversal (painful as a self-join in SQL)
  fof: {
    title: 'People you may know',
    blurb: 'Friends-of-friends: connected to people you know, but not to you yet — ranked by mutual connections.',
    cypher: `MATCH (me:Person {userId: $me})-[:CONNECTED]-(f:Person)-[:CONNECTED]-(fof:Person)
WHERE fof <> me AND NOT (me)-[:CONNECTED]-(fof)
RETURN fof.userId AS userId, fof.name AS name,
       count(DISTINCT f) AS mutual, collect(DISTINCT f.name)[..3] AS through
ORDER BY mutual DESC, name
LIMIT 8`,
  },

  // 3. Recommendation — clubs that my connections are in and I am not
  clubs: {
    title: 'Clubs worth a look',
    blurb: 'Clubs your connections belong to that you have not joined.',
    cypher: `MATCH (me:Person {userId: $me})-[:CONNECTED]-(f:Person)-[:MEMBER_OF]->(c:Club)
WHERE NOT (me)-[:MEMBER_OF]->(c)
RETURN c.clubId AS id, c.name AS name, c.category AS category,
       count(DISTINCT f) AS connections
ORDER BY connections DESC, name
LIMIT 6`,
  },

  // 4. Shortest path between two people
  path: {
    title: 'Shortest path between two people',
    blurb: 'How many introductions separate two students? (shortestPath over CONNECTED)',
    cypher: `MATCH (a:Person {userId: $me}), (b:Person {userId: $other}),
      p = shortestPath((a)-[:CONNECTED*..6]-(b))
RETURN [n IN nodes(p) | n.name] AS people, length(p) AS hops`,
  },

  // 5. Centrality — who is the best-connected person on campus?
  central: {
    title: 'Best-connected people on campus',
    blurb: 'Degree centrality: the number of direct connections.',
    cypher: `MATCH (p:Person)-[c:CONNECTED]-()
RETURN p.userId AS userId, p.name AS name, count(c) AS connections,
       p.synthetic AS synthetic
ORDER BY connections DESC, name
LIMIT 6`,
  },

  // 6. Club overlap — which two clubs share the most members?
  overlap: {
    title: 'Clubs with the most shared members',
    blurb: 'Pairs of clubs whose members overlap — useful for joint events.',
    cypher: `MATCH (a:Club)<-[:MEMBER_OF]-(p:Person)-[:MEMBER_OF]->(b:Club)
WHERE a.clubId < b.clubId
RETURN a.name AS clubA, b.name AS clubB, count(DISTINCT p) AS shared
ORDER BY shared DESC
LIMIT 5`,
  },

  // 7. Schema overview
  nodeStats: {
    title: 'Nodes by label',
    cypher: 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC',
  },
  relStats: {
    title: 'Relationships by type',
    cypher: 'MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS n ORDER BY n DESC',
  },
  people: {
    title: 'All people',
    cypher: 'MATCH (p:Person) RETURN p.userId AS userId, p.name AS name ORDER BY p.name',
  },
  ego: {
    title: 'My neighbourhood',
    cypher: `MATCH (me:Person {userId: $me})-[c:CONNECTED]-(o:Person)
RETURN o.userId AS userId, o.name AS name, c.shared AS shared
ORDER BY shared DESC, name LIMIT 12`,
  },
};

module.exports = { QUERIES };
