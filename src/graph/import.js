'use strict';
/**
 * DA3 — IMPORT: copy the relational Campus Connect data (SQLite) into Neo4j
 * as a property graph, then derive CONNECTED relationships.
 *
 *   npm run graph:import            import + synthetic extra sample records
 *   npm run graph:import -- --no-extra   import only
 *
 * Safe to re-run: the graph is wiped and rebuilt from SQLite each time.
 */
const { all } = require('../db');
const graph = require('./neo4j');
const { createExtraDataset } = require('./extra');

const BATCH = 500;

async function unwind(cypher, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await graph.write(`UNWIND $rows AS row ${cypher}`, { rows: rows.slice(i, i + BATCH) });
  }
  return rows.length;
}

async function createConstraints() {
  const cs = [
    ['School', 'schoolId'], ['Department', 'deptId'], ['Program', 'programId'],
    ['Course', 'courseId'], ['Person', 'userId'], ['Club', 'clubId'],
    ['Community', 'communityId'], ['Event', 'eventId'], ['Project', 'projectId'],
    ['Group', 'groupId'], ['Class', 'classId'],
  ];
  for (const [label, prop] of cs) {
    await graph.write(
      `CREATE CONSTRAINT ${label.toLowerCase()}_${prop} IF NOT EXISTS
       FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE`
    );
  }
}

async function importFromSqlite() {
  const counts = {};

  counts.School = await unwind(
    'CREATE (:School {schoolId: row.id, name: row.name, code: row.code})',
    all('SELECT School_ID id, School_Name name, School_Code code FROM School')
  );

  counts.Department = await unwind(
    `CREATE (d:Department {deptId: row.id, name: row.name, code: row.code})
     WITH d, row MATCH (s:School {schoolId: row.school}) CREATE (d)-[:PART_OF]->(s)`,
    all('SELECT Department_ID id, Department_Name name, Department_Code code, School_ID school FROM Department')
  );

  counts.Program = await unwind(
    `CREATE (p:Program {programId: row.id, name: row.name, code: row.code, level: row.level})
     WITH p, row MATCH (d:Department {deptId: row.dept}) CREATE (p)-[:OFFERED_BY]->(d)`,
    all('SELECT Program_ID id, Program_Name name, Program_Code code, Degree_Level level, Department_ID dept FROM Program')
  );

  counts.Course = await unwind(
    `CREATE (c:Course {courseId: row.id, code: row.code, title: row.title,
                       name: row.code + ' ' + row.title, credits: row.credits, semester: row.sem})
     WITH c, row
     MATCH (d:Department {deptId: row.dept}) CREATE (c)-[:OWNED_BY]->(d)
     WITH c, row
     MATCH (p:Program {programId: row.prog}) CREATE (c)-[:PART_OF_PROGRAM]->(p)`,
    all(`SELECT Course_ID id, Course_Code code, Course_Name title, Credits credits, Semester sem,
                Department_ID dept, Program_ID prog FROM Course`)
  );

  // People (students and faculty are both :Person, plus a role label)
  const students = all(`SELECT u.User_ID id, u.Full_Name name, u.Email email, u.Account_Status status,
                               s.Registration_Number reg, s.Admission_Year batch, s.Current_Semester sem,
                               s.Program_ID prog
                          FROM Student s JOIN "User" u ON u.User_ID = s.User_ID`);
  counts.Student = await unwind(
    `CREATE (p:Person:Student {userId: row.id, name: row.name, email: row.email, status: row.status,
                               regNo: row.reg, batch: row.batch, semester: row.sem, synthetic: false})
     WITH p, row MATCH (pr:Program {programId: row.prog}) CREATE (p)-[:ENROLLED_IN]->(pr)`,
    students
  );

  const faculty = all(`SELECT u.User_ID id, u.Full_Name name, u.Email email, u.Account_Status status,
                              f.Designation desig, f.Specialization spec, f.Department_ID dept
                         FROM Faculty f JOIN "User" u ON u.User_ID = f.User_ID`);
  counts.Faculty = await unwind(
    `CREATE (p:Person:Faculty {userId: row.id, name: row.name, email: row.email, status: row.status,
                               designation: row.desig, specialization: row.spec, synthetic: false})
     WITH p, row MATCH (d:Department {deptId: row.dept}) CREATE (p)-[:WORKS_IN]->(d)`,
    faculty
  );

  // Student TAKES Course — derived exactly like the app does it: program + current semester
  const takes = [];
  for (const s of students) {
    for (const c of all('SELECT Course_ID id FROM Course WHERE Program_ID = ? AND Semester = ?', [s.prog, s.sem])) {
      takes.push({ user: s.id, course: c.id });
    }
  }
  counts.TAKES = await unwind(
    'MATCH (p:Person {userId: row.user}), (c:Course {courseId: row.course}) CREATE (p)-[:TAKES]->(c)',
    takes
  );

  // Faculty TEACHES Course (through the Class relation)
  counts.TEACHES = await unwind(
    `MATCH (p:Person:Faculty {userId: row.user}), (c:Course {courseId: row.course})
     MERGE (p)-[:TEACHES]->(c)`,
    all(`SELECT DISTINCT f.User_ID user, cl.Course_ID course
           FROM Class cl JOIN Faculty f ON f.Faculty_ID = cl.Faculty_ID`)
  );

  // Clubs, communities, events
  counts.Club = await unwind(
    'CREATE (:Club {clubId: row.id, name: row.name, category: row.category})',
    all('SELECT Club_ID id, Club_Name name, Category category FROM Club')
  );
  counts.ClubMembership = await unwind(
    `MATCH (p:Person {userId: row.user}), (c:Club {clubId: row.club})
     CREATE (p)-[:MEMBER_OF {role: row.role}]->(c)`,
    all(`SELECT User_ID user, Club_ID club, Membership_Role role
           FROM Club_Membership WHERE Membership_Status = 'ACTIVE'`)
  );

  counts.Community = await unwind(
    'CREATE (:Community {communityId: row.id, name: row.name, type: row.type})',
    all('SELECT Community_ID id, Community_Name name, Community_Type type FROM Community')
  );
  counts.CommunityMembership = await unwind(
    `MATCH (p:Person {userId: row.user}), (c:Community {communityId: row.com})
     CREATE (p)-[:MEMBER_OF {role: row.role}]->(c)`,
    all(`SELECT User_ID user, Community_ID com, Membership_Role role
           FROM Community_Membership WHERE Membership_Status = 'ACTIVE'`)
  );
  counts.Event = await unwind(
    `CREATE (e:Event {eventId: row.id, name: row.name, date: row.date})
     WITH e, row MATCH (c:Community {communityId: row.com}) CREATE (c)-[:HOSTS]->(e)`,
    all('SELECT Event_ID id, Event_Title name, Event_Date date, Community_ID com FROM Event')
  );

  // Projects: owner + team members
  counts.Project = await unwind(
    `CREATE (pr:Project {projectId: row.id, name: row.name, status: row.status})
     WITH pr, row MATCH (p:Person {userId: row.owner}) CREATE (p)-[:OWNS]->(pr)`,
    all('SELECT Project_ID id, Project_Name name, Project_Status status, User_ID owner FROM Project')
  );
  counts.ProjectMembership = await unwind(
    `MATCH (p:Person {userId: row.user}), (pr:Project {projectId: row.project})
     MERGE (p)-[w:WORKS_ON]->(pr) SET w.role = row.role`,
    all(`SELECT pm.User_ID user, pt.Project_ID project, pm.Team_Role role
           FROM Project_Membership pm JOIN Project_Team pt ON pt.Project_Team_ID = pm.Project_Team_ID
          WHERE pm.Membership_Status = 'ACTIVE'`)
  );

  // Groups (auto-allocated academic groups + interest groups)
  counts.Group = await unwind(
    'CREATE (:Group {groupId: row.id, name: row.name, type: row.type})',
    all('SELECT Group_ID id, Group_Name name, Group_Type type FROM "Group"')
  );
  counts.GroupMembership = await unwind(
    `MATCH (p:Person {userId: row.user}), (g:Group {groupId: row.grp})
     CREATE (p)-[:IN_GROUP]->(g)`,
    all(`SELECT User_ID user, Group_ID grp FROM Group_Membership WHERE Membership_Status = 'ACTIVE'`)
  );

  // Slot-registered classes (course + slot + faculty): who teaches them, who registered
  counts.Class = await unwind(
    `CREATE (cl:Class {classId: row.id, number: row.num, slot: row.slot,
                       name: row.code + ' · ' + row.slot + ' · ' + row.faculty})
     WITH cl, row MATCH (co:Course {courseId: row.course}) CREATE (cl)-[:OF_COURSE]->(co)`,
    all(`SELECT c.Class_ID AS id, c.Section AS num, c.Slot_Code AS slot, c.Course_ID AS course,
                co.Course_Code AS code, u.Full_Name AS faculty
           FROM Class c JOIN Course co ON co.Course_ID = c.Course_ID
           JOIN Faculty f ON f.Faculty_ID = c.Faculty_ID JOIN "User" u ON u.User_ID = f.User_ID
          WHERE c.Slot_Code IS NOT NULL`)
  );
  counts.TeachesClass = await unwind(
    `MATCH (p:Person:Faculty {userId: row.user}), (cl:Class {classId: row.cls}) CREATE (p)-[:TEACHES_CLASS]->(cl)`,
    all(`SELECT f.User_ID AS user, c.Class_ID AS cls
           FROM Class c JOIN Faculty f ON f.Faculty_ID = c.Faculty_ID WHERE c.Slot_Code IS NOT NULL`)
  );
  counts.RegisteredIn = await unwind(
    `MATCH (p:Person:Student {userId: row.user}), (cl:Class {classId: row.cls}) CREATE (p)-[:REGISTERED_IN]->(cl)`,
    all(`SELECT gm.User_ID AS user, g.Scope_ID AS cls
           FROM Group_Membership gm
           JOIN "Group" g ON g.Group_ID = gm.Group_ID AND g.Scope_Type = 'CLASS'
           JOIN Class c ON c.Class_ID = g.Scope_ID AND c.Slot_Code IS NOT NULL
           JOIN Student s ON s.User_ID = gm.User_ID
          WHERE gm.Membership_Status = 'ACTIVE'`)
  );

  return counts;
}

/**
 * Derive CONNECTED between two people who share AT LEAST TWO of: a club,
 * community, project, course taken/taught, or registered class (same section) (a single shared item is too weak
 * and would connect almost everyone to everyone).
 * (Big academic groups are NOT used — everyone is in
 * "All Students", which would connect the whole campus to itself.)
 */
async function deriveConnections() {
  await graph.write('MATCH ()-[c:CONNECTED]-() DELETE c');
  await graph.write(`
    MATCH (a:Person)-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]->(x)<-[:MEMBER_OF|WORKS_ON|TAKES|TEACHES|REGISTERED_IN|TEACHES_CLASS]-(b:Person)
    WHERE a.userId < b.userId
    WITH a, b, collect(DISTINCT x.name) AS via, count(DISTINCT x) AS shared
    WHERE shared >= 2
    MERGE (a)-[c:CONNECTED]-(b)
    SET c.shared = shared, c.via = via[..8]
  `);
  const r = await graph.read('MATCH ()-[c:CONNECTED]->() RETURN count(c) AS n');
  return r[0].n;
}

let syncing = false;

/**
 * Wipe and rebuild the whole graph from SQLite. Used by the CLI and by the
 * "Sync graph" button. Only one sync runs at a time.
 */
async function syncGraph({ withExtra = true, log = () => {} } = {}) {
  if (syncing) throw new Error('A sync is already running.');
  syncing = true;
  const t0 = Date.now();
  try {
    log('[graph] clearing existing graph...');
    await graph.write('MATCH (n) DETACH DELETE n');
    await createConstraints();

    log('[graph] importing from SQLite...');
    const counts = await importFromSqlite();
    log('[graph] imported: ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join(' '));

    let extra = 0;
    if (withExtra) {
      extra = await createExtraDataset();
      log('[graph] created ' + extra + ' synthetic sample students (flagged synthetic:true)');
    }

    const connections = await deriveConnections();
    log('[graph] derived CONNECTED relationships: ' + connections);

    const nodes = await graph.read('MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC');
    log('[graph] nodes: ' + nodes.map((s) => s.label + '=' + s.n).join(' '));
    return { counts, extra, connections, nodes, ms: Date.now() - t0 };
  } finally {
    syncing = false;
  }
}

const isSyncing = () => syncing;

async function main() {
  const withExtra = !process.argv.includes('--no-extra');
  if (!(await graph.isUp())) {
    console.error('Neo4j is not reachable at ' + graph.URI + '.');
    console.error('Check your .env.local / NEO4J_* settings, or start a local Neo4j.');
    process.exit(1);
  }
  await syncGraph({ withExtra, log: console.log });
  await graph.close();
}

if (require.main === module) {
  main().catch((e) => { console.error('[graph] import failed:', e.message); process.exit(1); });
}

module.exports = { importFromSqlite, deriveConnections, syncGraph, isSyncing };
