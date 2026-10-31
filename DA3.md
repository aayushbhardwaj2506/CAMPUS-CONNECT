# DA3 — Campus Connect + Neo4j (graph database)

**Project:** Campus Connect — a university social & academic platform for the SCOPE community (VIT Chennai).
**DA3 technology:** Neo4j (graph database), run as a local Neo4j Desktop instance (server 2026.10.0, Cypher).
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

**Nodes (labels):** `School`, `Department`, `Program`, `Course`, `Person` (+ `Student` / `Faculty`), `Club`, `Community`, `Event`, `Project`, `Group`, `Class` (a course + slot + faculty section).

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
| `OF_COURSE` | Class → Course | Class.Course_ID |
| `TEACHES_CLASS` | Faculty → Class | Class.Faculty_ID (slot-registered classes) |
| `REGISTERED_IN` | Student → Class | Group_Membership in the class's CLASS group (the student's slot → course → faculty registration) |
| `CONNECTED {shared, via}` | Person — Person | **derived**: share (at least two of) a club, community, project, course or registered class |

Why relational tables became relationships: each junction table (Club_Membership, Community_Membership, Project_Membership, Group_Membership, Class) is a many-to-many link — in a graph that is just an edge, with the extra columns (role) stored as edge properties.

Constraints: a uniqueness constraint on each node's id (`Person.userId`, `Club.clubId`, …).

## 3. Sample dataset (create + import)

- **Import:** `npm run graph:import` reads the SQLite database and loads it into Neo4j (`src/graph/import.js`). It is re-runnable (wipes and rebuilds).
- **Create:** `src/lib/sample-students.js` creates 30 **sample student accounts** (fictional names) in SQLite, each with a full profile, club / community / project memberships, auto-allocated groups, a slot-based class registration and a feed post. The seed runs it (`npm run seed`); on an existing database use `npm run seed:samples`. Login: `<first>.<last>@campus.edu` / `campus123`. The SQLite demo alone has too few students to show multi-hop queries.
- **Derive:** `CONNECTED` relationships are generated with one Cypher statement after loading. Two people are connected when they share **at least two** of: a club, community, project, or course (one shared item would connect almost everyone — 491 edges for 41 people, every path 1 hop; with the threshold it is 190 edges and paths of 1–3 hops).
- **Result (current):** 1,324 nodes and 7,482 relationships: 408 `Person` nodes (96 students including the 30 sample accounts, 312 faculty), 450 `Group`, 400 `Class`, 20 `Course`, plus clubs, communities, events, projects, programmes and departments; 1,881 `CONNECTED` relationships. All 96 students are connected; a teacher is connected only if they share two or more classes with someone. From a student, other people are 1–3 hops away.

## 4. Run it

**Where Neo4j runs:** a **local Neo4j Desktop** instance (`bolt://localhost:7687`), so the demo works offline. Connection settings are read from a git-ignored `.env.local` (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`). The earlier **Neo4j AuraDB Free** (cloud) login is kept as a backup in `.env.aura` — to switch back, copy its contents into `.env.local`. Before the demo: open Neo4j Desktop and **Start** the instance until it says Running, then `npm start`.
On Render, set the same three variables in the service's Environment settings (a cloud database such as Aura is needed there; a laptop's local Neo4j can't be reached from Render) — otherwise `/graph` shows a "graph database isn't running" message and the rest of the app is unaffected.

```bash
npm run graph:import    # SQLite → Neo4j (wipes and rebuilds the graph)
npm run graph:load      # alternative: neo4j/campus_graph.cypher → an EMPTY Neo4j database (add "-- --wipe" to clear it first)
npm run graph:export    # write the running Neo4j graph to neo4j/campus_graph.cypher
npm run graph:demo      # CREATE / READ / UPDATE / DELETE + queries in the terminal
npm start               # app → sidebar "Campus graph"  (http://localhost:3000/graph)
```

Neo4j Desktop → **Query** tab (or Neo4j Browser at http://localhost:7474 when using the Docker setup): log in with your instance credentials. (With the optional Aura cloud database: Aura console → your instance → **Open**.)
Handy query to *see* the graph there: `MATCH (p:Person)-[c:CONNECTED]-(q:Person) RETURN p, c, q LIMIT 60`

**Keeping the graph up to date:** the app writes to SQLite; Neo4j is a copy. The **⟳ Sync graph** button on the Campus graph page (`POST /graph/sync`) re-copies the current SQLite data into Neo4j in a few seconds (same code as `npm run graph:import`). Example for the demo: register a new student → they are not in the graph → click Sync graph → they appear.

## 5. Queries (also shown in the app, with their Cypher)

1. People who share the most with you — 4 relationship types in one pattern.
2. People you may know — friends-of-friends, ranked by mutual connections.
3. Clubs worth a look — recommendation from your connections' memberships.
4. Shortest path between two people — `shortestPath`.
5. Best-connected people — degree centrality.
6. Clubs with the most shared members.

Core operations (CREATE / READ / UPDATE / DELETE) are demonstrated by `npm run graph:demo`.

### The `neo4j/` folder

- `neo4j/campus_graph.cypher` — the whole graph (1,324 nodes, 7,482 relationships, 11 uniqueness constraints) as one plain Cypher script, so the graph itself is stored in the repository and not only the code that builds it. Verified by loading it into a second, empty database and comparing it with the original: every node (labels and properties) and every relationship (type, endpoints and properties) was identical.
- `neo4j/report_queries.cypher` — every statement used in the report (structure, CRUD, queries 8.1–8.10 in table and graph form), ready to run one at a time. Note: `shortestPath` returns one of several equally short routes, so the people in the middle of a path can differ from the report; the number of hops, counts and rankings do not.

## 6. Demo script (≈3 minutes)

1. Open Neo4j Browser → run the "see the graph" query → "this is our relational data as a graph".
2. In the app → **Campus graph** → show the neighbourhood diagram and node/relationship counts.
3. Show "People you may know", expand **Cypher** → explain the 2-hop pattern.
4. Change the **shortest path** target → "how many introductions between two students".
5. Terminal → `npm run graph:demo` → CREATE, READ, UPDATE, DELETE.
6. Close with the comparison table (section 1).

## 7. The digital report

The submitted report is **[DA3_Report_Final.pdf](DA3_Report_Final.pdf)** (Word copy: `DA3_Report_Final.docx`); the Neo4j and terminal screenshots it uses are in `report screenshots/`. Its structure:

1. Introduction · 2. Overview of the whole application (stack, architecture, the 37 SQLite tables, features) ·
3. Why a graph database · 4. Graph model / schema design (diagram, node and relationship tables, `CONNECTED`, design decisions, constraints) ·
5. Implementation in Neo4j · 6. Creation and import of the dataset · 7. CRUD operations ·
8. Ten Cypher queries, each with its table and graph result · 9. Neo4j inside the application (Campus graph page) ·
10. Project demonstration · 11. Comparison with the relational design · 12. Conclusion.
