# DA3 — Campus Connect + Neo4j (graph database)

**Project:** Campus Connect — a university social & academic platform for the SCOPE community (VIT Chennai).
**DA3 technology:** Neo4j 5 (graph database).
**Role in the system:** SQLite stays the system of record (DA1/DA2). Neo4j is an additional store used for *relationship* questions.

## 1. Why a graph database for Campus Connect

Campus Connect is mostly about **relationships**: who is in which club, who takes which course, who works on which project, who knows whom. Questions such as "people you may know" or "how are these two students connected?" need multi-hop traversals.

| Question | Relational (SQLite) | Neo4j |
|---|---|---|
| Friends of friends | self-joins on membership tables, grows with each hop | `(me)-[:CONNECTED]-()-[:CONNECTED]-(fof)` |
| Shortest path between two students | recursive CTE, awkward and slow | `shortestPath((a)-[:CONNECTED*..6]-(b))` |
| Clubs my connections are in | 4-way join + NOT EXISTS | one `MATCH … WHERE NOT (me)-[:MEMBER_OF]->(c)` |
| Add a new relationship type | new junction table + schema change | just create the relationship |

Trade-off (be honest in the viva): graph databases are weaker for bulk reporting/aggregation and strict multi-row transactions, which is why SQLite remains the main store.

## 2. Graph model (schema design)

**Nodes (labels):** `School`, `Department`, `Program`, `Course`, `Person` (+ `Student` / `Faculty`), `Club`, `Community`, `Event`, `Project`, `Group`.

**Relationships:**

| Relationship | From → To | Comes from (SQLite) |
|---|---|---|
| `PART_OF` | Department → School | Department.School_ID |
| `OFFERED_BY` | Program → Department | Program.Department_ID |
| `OWNED_BY` | Course → Department | Course.Department_ID |
| `PART_OF_PROGRAM` | Course → Program | Course.Program_ID |
| `ENROLLED_IN` | Student → Program | Student.Program_ID |
| `WORKS_IN` | Faculty → Department | Faculty.Department_ID |
| `TAKES` | Student → Course | derived: program + current semester |
| `TEACHES` | Faculty → Course | Class.Faculty_ID, Class.Course_ID |
| `MEMBER_OF {role}` | Person → Club / Community | Club_Membership, Community_Membership |
| `HOSTS` | Community → Event | Event.Community_ID |
| `OWNS` | Person → Project | Project.User_ID |
| `WORKS_ON {role}` | Person → Project | Project_Membership + Project_Team |
| `IN_GROUP` | Person → Group | Group_Membership |
| `CONNECTED {shared, via}` | Person — Person | **derived**: share a club, community, project or course |

Why relational tables became relationships: each junction table (Club_Membership, Community_Membership, Project_Membership, Group_Membership, Class) is a many-to-many link — in a graph that is just an edge, with the extra columns (role) stored as edge properties.

Constraints: a uniqueness constraint on each node's id (`Person.userId`, `Club.clubId`, …).

## 3. Sample dataset (create + import)

- **Import:** `npm run graph:import` reads the SQLite database and loads it into Neo4j (`src/graph/import.js`). It is re-runnable (wipes and rebuilds).
- **Create:** `src/graph/extra.js` creates 30 **synthetic** sample students that exist only in the graph, each flagged `synthetic: true`, with random-but-deterministic clubs, communities, courses and projects. The SQLite demo has only 7 students, which is too small to show multi-hop queries.
- **Derive:** `CONNECTED` relationships are generated with one Cypher statement after loading. Two people are connected when they share **at least two** of: a club, community, project, or course (one shared item would connect almost everyone — 491 edges for 41 people, every path 1 hop; with the threshold it is 190 edges and paths of 1–3 hops).
- **Result:** 41 `Person` nodes (7 students + 4 faculty from SQLite, 30 synthetic), 29 `Group`, 13 `Course`, 8 `Program`, 8 `Club`, 7 `Department`, 7 `Event`, 5 `Community`, 4 `Project`, 3 `School`; 190 `CONNECTED` relationships.

## 4. Run it

**Where Neo4j runs:** Neo4j **AuraDB Free** (cloud). Connection settings are read from a git-ignored `.env.local`
(`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`), or from real environment variables. Without them the code defaults
to a local Neo4j at `bolt://localhost:7687`. `docker-compose.neo4j.yml` is an alternative for running Neo4j locally in Docker.
On Render, set the same three variables in the service's Environment settings — otherwise `/graph` shows a
"graph database isn't running" message and the rest of the app is unaffected.

```bash
npm run graph:import    # SQLite → Neo4j (wipes and rebuilds the graph)
npm run graph:demo      # CREATE / READ / UPDATE / DELETE + queries in the terminal
npm start               # app → sidebar "Campus graph"  (http://localhost:3000/graph)
```

Neo4j Browser (visual explorer): from the Aura console → your instance → **Open** (log in with the instance credentials).
Handy query to *see* the graph there: `MATCH (p:Person)-[c:CONNECTED]-(q:Person) RETURN p, c, q LIMIT 60`

## 5. Queries (also shown in the app, with their Cypher)

1. People who share the most with you — 4 relationship types in one pattern.
2. People you may know — friends-of-friends, ranked by mutual connections.
3. Clubs worth a look — recommendation from your connections' memberships.
4. Shortest path between two people — `shortestPath`.
5. Best-connected people — degree centrality.
6. Clubs with the most shared members.

Core operations (CREATE / READ / UPDATE / DELETE) are demonstrated by `npm run graph:demo`.

## 6. Demo script (≈3 minutes)

1. Open Neo4j Browser → run the "see the graph" query → "this is our relational data as a graph".
2. In the app → **Campus graph** → show the neighbourhood diagram and node/relationship counts.
3. Show "People you may know", expand **Cypher** → explain the 2-hop pattern.
4. Change the **shortest path** target → "how many introductions between two students".
5. Terminal → `npm run graph:demo` → CREATE, READ, UPDATE, DELETE.
6. Close with the comparison table (section 1).

## 7. Handwritten report outline

1. Title, team, project (Campus Connect), technology (Neo4j) — 2. Why a graph DB (section 1 table) —
3. Graph model diagram (draw nodes as circles, relationships as arrows, per section 2) —
4. Relational → graph mapping table — 5. Implementation steps (Docker, import, constraints) —
6. Sample data (import + synthetic) — 7. Cypher queries with a sample result each —
8. CRUD operations — 9. Comparison and limitations — 10. Conclusion.
