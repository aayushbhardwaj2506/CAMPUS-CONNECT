// Campus Connect, DA3: every Cypher statement used in the report, ready to run in Neo4j
// (Neo4j Desktop > Query tab, Neo4j Browser, or cypher-shell). Run them ONE AT A TIME and look at the result.
//
// Needs the graph loaded first:  npm run graph:import   (from SQLite)   or   npm run graph:load   (from neo4j/campus_graph.cypher)
// The demonstration account is Aayush Bhardwaj, userId 1. Each query has a table version and, where useful, a graph version
// (switch the result to the Graph tab). Sections match the report: 5 (implementation), 7 (CRUD), 8 (queries).

// Note: queries 8.4, 8.7 and 8.10 use shortestPath, which returns ONE of the equally short routes, so the people in the
// middle of a path can differ from the report (the number of hops is always the same). Query 8.2 shows the first three of an
// unordered list in its "through" column, so those names can differ too. The counts and rankings do not.

// ============================================================ 5. Implementation: structure of the database

// The 11 uniqueness constraints
SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties
RETURN labelsOrTypes[0] AS label, properties[0] AS property ORDER BY label;

// Node labels and relationship types that exist
CALL db.labels();
CALL db.relationshipTypes();

// Size of the graph
MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC;
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS n ORDER BY n DESC;

// ============================================================ 7. Core operations: create, read, update, delete (run in this order)

// CREATE a student and link them to a club
CREATE (s:Person:Student {userId: 9001, name: 'Demo Student'})
WITH s MATCH (c:Club) WITH s, c ORDER BY c.clubId LIMIT 1
CREATE (s)-[m:MEMBER_OF {role: 'MEMBER'}]->(c)
RETURN s, m, c;

// READ it back
MATCH (s:Person {userId: 9001})-[m:MEMBER_OF]->(c:Club) RETURN s, m, c;

// UPDATE a node property and a relationship property
MATCH (s:Person {userId: 9001})-[m:MEMBER_OF]->(c:Club)
SET s.name = 'Demo Student (updated)', m.role = 'CORE'
RETURN s, m, c;

// DELETE the node together with its relationships
MATCH (s:Person {userId: 9001}) DETACH DELETE s;

// VERIFY it is gone (remaining = 0)
MATCH (s:Person {userId: 9001}) RETURN count(s) AS remaining;

// ============================================================ 8.1 People who share the most with you

MATCH (me:Person {userId: 1})-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]->(x)<-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]-(o:Person)
WHERE o <> me
RETURN o.name AS name, count(DISTINCT x) AS shared, collect(DISTINCT x.name)[..4] AS via
ORDER BY shared DESC, name LIMIT 8;

// graph version
MATCH (me:Person {userId: 1})-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]->(x)<-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]-(o:Person)
WHERE o <> me
WITH me, o, count(DISTINCT x) AS shared ORDER BY shared DESC LIMIT 3
MATCH p = (me)-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]->(x)<-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]-(o)
RETURN p LIMIT 40;

// ============================================================ 8.2 People you may know (friends of friends)

MATCH (me:Person {userId: 1})-[:CONNECTED]-(f:Person)-[:CONNECTED]-(fof:Person)
WHERE fof <> me AND NOT (me)-[:CONNECTED]-(fof)
RETURN fof.name AS name, count(DISTINCT f) AS mutual, collect(DISTINCT f.name)[..3] AS through
ORDER BY mutual DESC, name LIMIT 8;

// graph version
MATCH (me:Person {userId: 1})-[:CONNECTED]-(f:Person)-[:CONNECTED]-(fof:Person)
WHERE fof <> me AND NOT (me)-[:CONNECTED]-(fof)
WITH me, fof, count(DISTINCT f) AS mutual ORDER BY mutual DESC LIMIT 1
MATCH p = (me)-[:CONNECTED]-(f:Person)-[:CONNECTED]-(fof)
RETURN p LIMIT 15;

// ============================================================ 8.3 Clubs worth a look

MATCH (me:Person {userId: 1})-[:CONNECTED]-(f:Person)-[:MEMBER_OF]->(c:Club)
WHERE NOT (me)-[:MEMBER_OF]->(c)
RETURN c.name AS club, c.category AS category, count(DISTINCT f) AS connections
ORDER BY connections DESC, club LIMIT 6;

// graph version
MATCH (me:Person {userId: 1})-[:CONNECTED]-(f:Person)-[:MEMBER_OF]->(c:Club)
WHERE NOT (me)-[:MEMBER_OF]->(c)
WITH me, c, count(DISTINCT f) AS k ORDER BY k DESC LIMIT 1
MATCH p = (me)-[:CONNECTED]-(f:Person)-[:MEMBER_OF]->(c)
RETURN p LIMIT 15;

// ============================================================ 8.4 Shortest path between two people

MATCH (a:Person {userId: 1}), (b:Person {name: 'Bhavna Menon'}),
      p = shortestPath((a)-[:CONNECTED*..6]-(b))
RETURN [n IN nodes(p) | n.name] AS people, length(p) AS hops;

// graph version
MATCH (a:Person {userId: 1}), (b:Person {name: 'Bhavna Menon'}),
      p = shortestPath((a)-[:CONNECTED*..6]-(b))
RETURN p;

// ============================================================ 8.5 Best-connected people (degree centrality)

MATCH (p:Person)-[c:CONNECTED]-()
RETURN p.name AS name, count(c) AS connections
ORDER BY connections DESC, name LIMIT 6;

// graph version
MATCH (p:Person)-[c:CONNECTED]-()
WITH p, count(c) AS k ORDER BY k DESC LIMIT 1
MATCH q = (p)-[:CONNECTED]-(o:Person)
RETURN q LIMIT 30;

// ============================================================ 8.6 Clubs with the most shared members

MATCH (a:Club)<-[:MEMBER_OF]-(p:Person)-[:MEMBER_OF]->(b:Club)
WHERE a.clubId < b.clubId
RETURN a.name AS clubA, b.name AS clubB, count(DISTINCT p) AS shared
ORDER BY shared DESC LIMIT 5;

// graph version
MATCH (a:Club)<-[:MEMBER_OF]-(p:Person)-[:MEMBER_OF]->(b:Club)
WHERE a.clubId < b.clubId
WITH a, b, count(DISTINCT p) AS k ORDER BY k DESC LIMIT 1
MATCH q = (a)<-[:MEMBER_OF]-(p:Person)-[:MEMBER_OF]->(b)
RETURN q;

// ============================================================ 8.7 Who can introduce me? (filtering on path length, students only)

MATCH (a:Student {userId: 1}), (b:Student)
WHERE b <> a AND NOT (a)-[:CONNECTED]-(b)
MATCH p = shortestPath((a)-[:CONNECTED*..4]-(b))
WHERE all(n IN nodes(p) WHERE n:Student)
WITH b, p, length(p) AS hops
RETURN b.name AS person, hops, [n IN nodes(p)[1..-1] | n.name] AS introducedBy
ORDER BY hops DESC, person LIMIT 10;

// graph version: a three-hop chain
MATCH (a:Student {userId: 1}), (b:Student)
WHERE b <> a AND NOT (a)-[:CONNECTED]-(b)
MATCH p = shortestPath((a)-[:CONNECTED*..4]-(b))
WHERE all(n IN nodes(p) WHERE n:Student)
WITH p, length(p) AS hops WHERE hops = 3
RETURN p LIMIT 1;

// ============================================================ 8.8 Study buddies (filter on an aggregate)

MATCH (me:Student {userId: 1})-[:REGISTERED_IN]->(c:Class)<-[:REGISTERED_IN]-(o:Student)
WITH me, o, count(c) AS sharedClasses WHERE sharedClasses >= 2
MATCH (me)-[:MEMBER_OF]->(club:Club)<-[:MEMBER_OF]-(o)
RETURN o.name AS student, sharedClasses, collect(club.name) AS sharedClubs
ORDER BY sharedClasses DESC, student LIMIT 10;

// graph version
MATCH (me:Student {userId: 1})-[:REGISTERED_IN]->(c:Class)<-[:REGISTERED_IN]-(o:Student)
WITH me, o, count(c) AS sharedClasses WHERE sharedClasses >= 2
MATCH p = (me)-[:REGISTERED_IN]->(c2:Class)<-[:REGISTERED_IN]-(o)
RETURN p;

// ============================================================ 8.9 Clubmates I am not connected to (negative pattern)

MATCH (me:Student {userId: 1})-[:MEMBER_OF]->(c)<-[:MEMBER_OF]-(o:Student)
WHERE NOT (me)-[:CONNECTED]-(o)
RETURN o.name AS student, collect(DISTINCT c.name) AS inCommon
ORDER BY student LIMIT 10;

// graph version
MATCH p = (me:Student {userId: 1})-[:MEMBER_OF]->(c)<-[:MEMBER_OF]-(o:Student)
WHERE NOT (me)-[:CONNECTED]-(o)
RETURN p;

// ============================================================ 8.10 How can I reach this person? (route with the reason for each step)

MATCH (a:Student {userId: 1}), (b:Student {name: 'T A Karpaga Valli'}),
      p = shortestPath((a)-[:CONNECTED*..6]-(b))
WHERE all(n IN nodes(p) WHERE n:Student)
UNWIND range(0, length(p) - 1) AS i
RETURN i + 1 AS step, nodes(p)[i].name AS fromPerson,
       nodes(p)[i + 1].name AS toPerson, relationships(p)[i].via AS because;

// graph version
MATCH (a:Student {userId: 1}), (b:Student {name: 'T A Karpaga Valli'}),
      p = shortestPath((a)-[:CONNECTED*..6]-(b))
WHERE all(n IN nodes(p) WHERE n:Student)
RETURN p;
