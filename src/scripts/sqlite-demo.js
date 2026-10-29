'use strict';
/**
 * ===========================================================================
 *  SQL DEMO for Campus Connect  (the website's main database: SQLite)
 * ===========================================================================
 *  Run with:   npm run sqlite:demo
 *
 *  What this file does, in one line:
 *    it connects to our database file (campus_connect.db), runs a set of SQL
 *    queries, and prints the results as tables so we can explain each one.
 *
 *  SQL is the language; SQLite is the database engine that runs it.
 *  (In DA2 the same kind of SQL ran on Oracle.)
 *
 *  It only READS data. The last section tries to break the rules on purpose,
 *  and the database refuses; that attempt is rolled back, so nothing changes.
 * ===========================================================================
 */

// `db`  = the open database connection (used for the BEGIN / ROLLBACK demo)
// `all` = run a SELECT and get ALL rows back
// `get` = run a SELECT and get ONE row back
// (these helpers live in src/db/index.js and wrap Node's built-in SQLite)
const { db, all, get } = require('../db');

// ---- small helpers so the output is easy to read -------------------------

// Prints a big heading line like:  ====== 2. QUERYING ... ======
const line = (t) => console.log('\n' + '='.repeat(72) + '\n' + t + '\n' + '='.repeat(72));

// Runs one SQL query, prints the SQL text first (so we can read it out),
// then prints the result rows as a table. `params` fills the "?" placeholders
// in the SQL, which keeps the values safe and separate from the query text.
function show(title, sql, params = []) {
  console.log('\n-- ' + title);
  console.log(sql.trim().split('\n').map((l) => '   ' + l).join('\n'));
  const rows = all(sql, params);
  if (rows.length) console.table(rows);
  else console.log('   (no rows)');
  return rows;
}

// The logged-in demo student we use in the examples (Aayush, user id 1).
// This is a tiny SELECT that looks up his User_ID from his email.
const me = get(`SELECT User_ID AS id FROM "User" WHERE Email = 'aayush@campus.edu'`).id;

// ===========================================================================
// 1. THE DATABASE
//    Point to make: the whole database is ONE file made of relational TABLES.
// ===========================================================================
line('1. THE DATABASE: one file, relational tables (DA1 design, 36 relations + extensions)');

// sqlite_master is SQLite's own catalogue: it lists every table that exists.
const tables = all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
console.log(`   ${tables.length} tables in campus_connect.db`);
console.log('   ' + tables.map((t) => t.name).join(', '));

// COUNT(*) counts rows. UNION ALL stacks several small SELECTs into one list,
// so we get one row per table: table name + how many rows it holds.
show('Row counts of the main tables', `
SELECT 'User' AS tbl, COUNT(*) AS n FROM "User"
UNION ALL SELECT 'Student', COUNT(*) FROM Student
UNION ALL SELECT 'Faculty', COUNT(*) FROM Faculty
UNION ALL SELECT 'Course', COUNT(*) FROM Course
UNION ALL SELECT 'Class', COUNT(*) FROM Class
UNION ALL SELECT 'Timetable', COUNT(*) FROM Timetable
UNION ALL SELECT '"Group"', COUNT(*) FROM "Group"
UNION ALL SELECT 'Group_Membership', COUNT(*) FROM Group_Membership`);

// ===========================================================================
// 2. QUERYING WITH JOINS
//    Point to make: data is split across tables (to avoid repetition), and a
//    JOIN puts it back together using the foreign keys.
// ===========================================================================
line('2. QUERYING: joins across tables (the academic structure)');

// Program -> Department -> School: each JOIN follows one foreign key.
//   Program.Department_ID  points to  Department
//   Department.School_ID   points to  School
// ORDER BY sorts the result; LIMIT 8 keeps only the first 8 rows.
show('Programmes and the department / school they belong to', `
SELECT p.Program_Code, d.Department_Name, s.School_Code
FROM Program p
JOIN Department d ON d.Department_ID = p.Department_ID
JOIN School s ON s.School_ID = d.School_ID
ORDER BY s.School_Code, p.Program_Code LIMIT 8`);

// A bigger join: 9 tables. Reading it top to bottom:
//   a student's membership in a CLASS group  ->  the class (slot + course)
//   ->  the faculty who teaches it  ->  the room it is held in.
// The slot code (like D2+TD2) is what generates the timetable.
// GROUP BY c.Class_ID gives one row per class even though a class meets on
// several days (it has several Timetable rows).
show("A student's registered classes with slot, teacher and room (this builds the timetable)", `
SELECT co.Course_Code, c.Slot_Code AS slot, u.Full_Name AS faculty,
       b.Block || '-' || r.Room_Number AS room
FROM Group_Membership gm
JOIN "Group" g  ON g.Group_ID = gm.Group_ID AND g.Scope_Type = 'CLASS'
JOIN Class c    ON c.Class_ID = g.Scope_ID AND c.Slot_Code IS NOT NULL
JOIN Course co  ON co.Course_ID = c.Course_ID
JOIN Faculty f  ON f.Faculty_ID = c.Faculty_ID
JOIN "User" u   ON u.User_ID = f.User_ID
JOIN Timetable t ON t.Class_ID = c.Class_ID
JOIN Room r     ON r.Room_ID = t.Room_ID
JOIN Building b ON b.Building_ID = r.Building_ID
WHERE gm.User_ID = ?
GROUP BY c.Class_ID
ORDER BY co.Course_Code`, [me]);

// ===========================================================================
// 3. REPORTS
//    Point to make: totals and summaries (GROUP BY + COUNT) are what a
//    relational database does best, so SQL stays our main store.
// ===========================================================================
line('3. REPORTS: aggregation is where a relational database is strong');

// COUNT(DISTINCT ...) counts each student once per course.
// GROUP BY collapses the rows into one row per course; ORDER BY ... DESC
// puts the most popular course first.
show('Students registered per course (top 5)', `
SELECT co.Course_Code, co.Course_Name, COUNT(DISTINCT gm.User_ID) AS students
FROM Group_Membership gm
JOIN "Group" g ON g.Group_ID = gm.Group_ID AND g.Scope_Type = 'CLASS'
JOIN Class c   ON c.Class_ID = g.Scope_ID AND c.Slot_Code IS NOT NULL
JOIN Course co ON co.Course_ID = c.Course_ID
JOIN Student s ON s.User_ID = gm.User_ID
WHERE gm.Membership_Status = 'ACTIVE'
GROUP BY co.Course_ID ORDER BY students DESC LIMIT 5`);

// The simplest GROUP BY: how many faculty does each department have?
show('Faculty per department', `
SELECT d.Department_Name, COUNT(*) AS faculty
FROM Faculty f JOIN Department d ON d.Department_ID = f.Department_ID
GROUP BY d.Department_ID ORDER BY faculty DESC`);

// ===========================================================================
// 4. RELATIONSHIP QUESTIONS IN SQL
//    Point to make: SQL CAN answer "who is connected to whom", but the query
//    gets long. Neo4j answers the same questions in a few lines. This is the
//    reason we added a graph database in DA3.
// ===========================================================================
line('4. RELATIONSHIP QUESTIONS IN SQL (compare with the Cypher versions in Neo4j)');

// Self-join: the Group_Membership table is joined to ITSELF (a and b).
// "a" is me, "b" is someone else in the same class group.
// HAVING COUNT(*) >= 2 keeps only people who share two or more classes with me.
show('People who share 2+ classes with me  (Neo4j: one MATCH pattern)', `
SELECT u.Full_Name AS person, COUNT(*) AS shared_classes
FROM Group_Membership a
JOIN "Group" g ON g.Group_ID = a.Group_ID AND g.Scope_Type = 'CLASS'
JOIN Group_Membership b ON b.Group_ID = a.Group_ID AND b.User_ID <> a.User_ID
JOIN "User" u ON u.User_ID = b.User_ID
WHERE a.User_ID = ? AND a.Membership_Status = 'ACTIVE' AND b.Membership_Status = 'ACTIVE'
GROUP BY u.User_ID HAVING COUNT(*) >= 2
ORDER BY shared_classes DESC, person LIMIT 8`, [me]);

// Friends of friends = two hops. We first build a temporary result called
// "conn" (a WITH / CTE) that lists every pair of people sharing 2+ classes.
// Then we join conn to ITSELF: me -> my connection (c1) -> their connection (c2),
// and drop anyone I am already connected to (NOT IN ...).
// Notice how long this is. Each extra hop means another join.
show('Friends of friends (by shared classes)  -- notice how long this gets in SQL', `
WITH conn AS (
  SELECT a.User_ID AS u1, b.User_ID AS u2
  FROM Group_Membership a
  JOIN "Group" g ON g.Group_ID = a.Group_ID AND g.Scope_Type = 'CLASS'
  JOIN Group_Membership b ON b.Group_ID = a.Group_ID AND b.User_ID <> a.User_ID
  WHERE a.Membership_Status = 'ACTIVE' AND b.Membership_Status = 'ACTIVE'
  GROUP BY a.User_ID, b.User_ID HAVING COUNT(*) >= 2
)
SELECT u.Full_Name AS person, COUNT(DISTINCT c1.u2) AS mutual
FROM conn c1
JOIN conn c2 ON c2.u1 = c1.u2 AND c2.u2 <> c1.u1
JOIN "User" u ON u.User_ID = c2.u2
WHERE c1.u1 = ? AND c2.u2 NOT IN (SELECT u2 FROM conn WHERE u1 = ?)
GROUP BY c2.u2 ORDER BY mutual DESC, person LIMIT 5`, [me, me]);
console.log('\n   (In Neo4j the same idea is 3 lines:  (me)-[:CONNECTED]-(f)-[:CONNECTED]-(fof) )');

// ===========================================================================
// 5. INTEGRITY (constraints)
//    Point to make: the database protects the data. It refuses rows that break
//    the rules we defined in the schema (foreign keys, unique keys).
// ===========================================================================
line('5. INTEGRITY: the database refuses bad data (rolled back, nothing is changed)');

// Tries an INSERT that SHOULD fail. We wrap it in a transaction:
//   BEGIN     -> start a transaction
//   run it    -> the database either accepts it or throws an error
//   ROLLBACK  -> undo everything, so even a successful insert would not stay
function tryBad(title, sql, params) {
  console.log('\n-- ' + title);
  console.log('   ' + sql.trim().replace(/\s+/g, ' '));
  db.exec('BEGIN');
  try {
    db.prepare(sql).run(...params);
    console.log('   (the database accepted it)');
  } catch (e) {
    console.log('   REJECTED -> ' + e.message);   // the constraint that stopped it
  } finally {
    db.exec('ROLLBACK');
  }
}

// FOREIGN KEY: Club_Membership.Club_ID must point to a real Club.
// Club 9999 does not exist, so the insert is rejected.
tryBad('Foreign key: join a club that does not exist',
  `INSERT INTO Club_Membership (Club_ID, User_ID, Membership_Role, Joined_At, Membership_Status) VALUES (9999, ?, 'MEMBER', '2026-10-21', 'ACTIVE')`, [me]);

// UNIQUE constraint: one reaction per user per post.
// We take a reaction that already exists and try to insert the same pair again.
const dup = get(`SELECT Post_ID AS p, User_ID AS u FROM Reaction LIMIT 1`);
if (dup) {
  tryBad('Unique constraint: react twice to the same post (DA1 assumption A5)',
    `INSERT INTO Reaction (Post_ID, User_ID, Reaction_Type, Reacted_At) VALUES (?, ?, 'LIKE', '2026-10-21')`, [dup.p, dup.u]);
}

// ===========================================================================
// SUMMARY (what to say at the end)
// ===========================================================================
line('SUMMARY');
console.log('   SQLite: the app\'s main store - structured data, joins, reports, constraints.');
console.log('   Neo4j : added in DA3 for relationship questions (friends of friends, shortest path).');
