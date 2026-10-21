'use strict';
/**
 * DA3 — CREATE: synthetic sample students that exist ONLY in the graph, so
 * relationship queries have a meaningful network to work on (the SQLite demo
 * has only 7 students). Deterministic, and every node is flagged
 * synthetic:true so it can never be mistaken for real data.
 */
const { all } = require('../db');
const graph = require('./neo4j');

const FIRST = ['Aditya', 'Bhavna', 'Chirag', 'Deepa', 'Eshan', 'Farah', 'Gautam', 'Harini', 'Ishaan', 'Jaya',
  'Karthik', 'Lavanya', 'Mohit', 'Nisha', 'Omkar', 'Pooja', 'Qadir', 'Riya', 'Sanjay', 'Tanvi',
  'Uday', 'Varsha', 'Wasim', 'Yamini', 'Zubin', 'Arjun', 'Brinda', 'Chetan', 'Divya', 'Eklavya'];
const LAST = ['Menon', 'Gupta', 'Pillai', 'Joshi', 'Nair', 'Das', 'Kulkarni', 'Rao', 'Singh', 'Iyer'];

// small deterministic PRNG so every import gives the same graph
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickN(r, arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

async function createExtraDataset(count = 30) {
  const r = rng(2026);
  const programs = all(`SELECT Program_ID id FROM Program WHERE Program_Code LIKE 'BTECH-CSE%'`).map((p) => p.id);
  const clubs = all('SELECT Club_ID id, Category cat FROM Club');
  const techClubs = clubs.filter((c) => c.cat === 'Technical').map((c) => c.id);
  const otherClubs = clubs.filter((c) => c.cat !== 'Technical').map((c) => c.id);
  const comms = all('SELECT Community_ID id FROM Community').map((c) => c.id);
  const projects = all('SELECT Project_ID id FROM Project').map((p) => p.id);
  const courseRows = all('SELECT Course_ID id, Program_ID prog, Semester sem FROM Course');

  const people = [];
  const takes = [];
  const memberClub = [];
  const memberCom = [];
  const works = [];

  for (let i = 0; i < count; i++) {
    const userId = 1001 + i;
    const prog = pick(r, programs);
    const batch = pick(r, [2022, 2023, 2024]);
    const sem = pick(r, [3, 5, 7]);
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(r() * LAST.length)]}`;
    people.push({ userId, name, prog, batch, sem, email: `sample${i + 1}@graph.sample` });

    for (const c of courseRows) if (c.prog === prog && c.sem === sem) takes.push({ user: userId, course: c.id });
    for (const c of pickN(r, techClubs, 1 + Math.floor(r() * 2))) memberClub.push({ user: userId, club: c });
    if (r() < 0.4) memberClub.push({ user: userId, club: pick(r, otherClubs) });
    for (const c of pickN(r, comms, 1 + Math.floor(r() * 2))) memberCom.push({ user: userId, com: c });
    if (r() < 0.35) works.push({ user: userId, project: pick(r, projects) });
  }

  await graph.write(
    `UNWIND $rows AS row
     CREATE (p:Person:Student {userId: row.userId, name: row.name, email: row.email, status: 'ACTIVE',
                               batch: row.batch, semester: row.sem, synthetic: true})
     WITH p, row MATCH (pr:Program {programId: row.prog}) CREATE (p)-[:ENROLLED_IN]->(pr)`,
    { rows: people }
  );
  await graph.write(
    `UNWIND $rows AS row
     MATCH (p:Person {userId: row.user}), (c:Course {courseId: row.course}) CREATE (p)-[:TAKES]->(c)`,
    { rows: takes }
  );
  await graph.write(
    `UNWIND $rows AS row
     MATCH (p:Person {userId: row.user}), (c:Club {clubId: row.club}) MERGE (p)-[:MEMBER_OF {role: 'MEMBER'}]->(c)`,
    { rows: memberClub }
  );
  await graph.write(
    `UNWIND $rows AS row
     MATCH (p:Person {userId: row.user}), (c:Community {communityId: row.com}) MERGE (p)-[:MEMBER_OF {role: 'MEMBER'}]->(c)`,
    { rows: memberCom }
  );
  await graph.write(
    `UNWIND $rows AS row
     MATCH (p:Person {userId: row.user}), (pr:Project {projectId: row.project}) MERGE (p)-[:WORKS_ON {role: 'MEMBER'}]->(pr)`,
    { rows: works }
  );
  return people.length;
}

module.exports = { createExtraDataset };
