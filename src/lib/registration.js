'use strict';
/**
 * Class registration — the VTOP-style flow:  pick a SLOT, then a COURSE, then a
 * FACULTY. Registering joins the student to that class's group (so they are
 * "auto-grouped" with the teacher and everyone else in the class) and, because
 * a student's timetable is built from the classes they belong to, their
 * timetable is generated from the class's slot.
 *
 * Registration state is Group_Membership in the class's CLASS-scope group — no
 * extra table. Only classes that have a Slot_Code are registrable.
 */
const { db, get, all, run } = require('../db');
const { meetingsFor, overlaps, isLabSlot, describe } = require('./slots');
const { getOrCreateScopeGroup, classGroupName } = require('./groups');
const { nowIso } = require('./util');

/** Run fn atomically; joins an already-open transaction (e.g. the seed's) instead of nesting. */
function atomically(fn) {
  let started = false;
  try { db.exec('BEGIN'); started = true; } catch (_e) { /* already inside a transaction */ }
  try {
    const out = fn();
    if (started) db.exec('COMMIT');
    return out;
  } catch (err) {
    if (started) db.exec('ROLLBACK');
    throw err;
  }
}

/** Timetable rows of one class as [{day,start,end}] */
function meetingsOfClass(classId) {
  return all('SELECT Day_Of_Week AS day, Start_Time AS start, End_Time AS end FROM Timetable WHERE Class_ID = ?', [classId]);
}

/** Every registrable class (or just the given class ids) with course, faculty, room and meetings. */
function catalogue(onlyIds) {
  const idFilter = onlyIds ? `AND c.Class_ID IN (${onlyIds.map(Number).join(',') || 'NULL'})` : '';
  const rows = all(
    `SELECT c.Class_ID AS id, c.Section AS classNo, c.Slot_Code AS slot,
            co.Course_ID AS courseId, co.Course_Code AS code, co.Course_Name AS title,
            u.Full_Name AS faculty,
            (SELECT b.Block || '-' || r.Room_Number
               FROM Timetable t JOIN Room r ON r.Room_ID = t.Room_ID
               JOIN Building b ON b.Building_ID = r.Building_ID
              WHERE t.Class_ID = c.Class_ID LIMIT 1) AS room
       FROM Class c
       JOIN Course co ON co.Course_ID = c.Course_ID
       JOIN Faculty f ON f.Faculty_ID = c.Faculty_ID
       JOIN "User" u ON u.User_ID = f.User_ID
      WHERE c.Slot_Code IS NOT NULL ${idFilter}
      ORDER BY co.Course_Code, c.Slot_Code, u.Full_Name`
  );
  return rows.map((r) => {
    const meetings = meetingsFor(r.slot);
    return { ...r, kind: isLabSlot(r.slot) ? 'lab' : 'theory', meetings, when: describe(meetings) };
  });
}

/** Slot-registered classes the user is currently in. */
function registeredClasses(userId) {
  const ids = all(
    `SELECT c.Class_ID AS id
       FROM Group_Membership gm
       JOIN "Group" g ON g.Group_ID = gm.Group_ID AND g.Scope_Type = 'CLASS'
       JOIN Class c ON c.Class_ID = g.Scope_ID
      WHERE gm.User_ID = ? AND gm.Membership_Status = 'ACTIVE' AND c.Slot_Code IS NOT NULL`,
    [userId]
  ).map((r) => r.id);
  if (!ids.length) return [];
  return catalogue(ids);
}

/** Meetings of the slot-registered classes the user belongs to (used for clash checks). */
function allMeetings(userId) {
  return all(
    `SELECT t.Day_Of_Week AS day, t.Start_Time AS start, t.End_Time AS end,
            co.Course_Code AS code, c.Class_ID AS classId
       FROM Timetable t
       JOIN Class c ON c.Class_ID = t.Class_ID
       JOIN Course co ON co.Course_ID = c.Course_ID
      WHERE c.Slot_Code IS NOT NULL AND c.Class_ID IN (
        SELECT g.Scope_ID FROM Group_Membership gm
          JOIN "Group" g ON g.Group_ID = gm.Group_ID
         WHERE gm.User_ID = ? AND gm.Membership_Status = 'ACTIVE' AND g.Scope_Type = 'CLASS')`,
    [userId]
  );
}

function addMembership(groupId, userId, role = 'MEMBER') {
  const ex = get('SELECT * FROM Group_Membership WHERE Group_ID = ? AND User_ID = ?', [groupId, userId]);
  if (ex) {
    if (ex.Membership_Status !== 'ACTIVE') {
      run('UPDATE Group_Membership SET Membership_Status = ? WHERE Membership_ID = ?', ['ACTIVE', ex.Membership_ID]);
    }
    return;
  }
  run(
    `INSERT INTO Group_Membership (Group_ID, User_ID, Role, Joined_At, Membership_Status)
     VALUES (?, ?, ?, ?, 'ACTIVE')`,
    [groupId, userId, role, nowIso()]
  );
}

/** Register a student for a class. Returns { ok, message }. */
function register(userId, classId) {
  const cl = get(
    `SELECT c.*, co.Course_Code, co.Course_Name FROM Class c
       JOIN Course co ON co.Course_ID = c.Course_ID WHERE c.Class_ID = ?`, [classId]);
  if (!cl || !cl.Slot_Code) return { ok: false, message: 'That class cannot be registered.' };

  const mine = registeredClasses(userId);
  if (mine.some((c) => c.id === cl.Class_ID)) return { ok: false, message: 'You are already registered for that class.' };

  const kind = isLabSlot(cl.Slot_Code) ? 'lab' : 'theory';
  const dup = mine.find((c) => c.courseId === cl.Course_ID && c.kind === kind);
  if (dup) {
    return { ok: false, message: `You already registered ${cl.Course_Code} ${kind} (${dup.slot}, ${dup.faculty}). Drop it first to change.` };
  }

  const wanted = meetingsFor(cl.Slot_Code);
  const clash = allMeetings(userId).find((m) => overlaps(wanted, [m]));
  if (clash) {
    return { ok: false, message: `Slot clash: ${cl.Slot_Code} overlaps ${clash.code} on ${clash.day} ${clash.start}.` };
  }

  atomically(() => {
    const classGroup = getOrCreateScopeGroup(
      'CLASS', cl.Class_ID, classGroupName(cl.Course_Code, cl),
      `Class group for ${cl.Course_Code} ${cl.Slot_Code}.`, cl.Course_ID
    ).Group_ID;
    addMembership(classGroup, userId);
    const courseGroup = getOrCreateScopeGroup(
      'COURSE', cl.Course_ID, `${cl.Course_Code} ${cl.Course_Name}`,
      `Course group for ${cl.Course_Code} — ${cl.Course_Name}.`, cl.Course_ID
    ).Group_ID;
    addMembership(courseGroup, userId);
  });
  return { ok: true, message: `Registered for ${cl.Course_Code} (${cl.Slot_Code}). You were added to the class group.` };
}

/** Drop a registered class. Returns { ok, message }. */
function drop(userId, classId) {
  const cl = get(
    `SELECT c.*, co.Course_Code FROM Class c JOIN Course co ON co.Course_ID = c.Course_ID WHERE c.Class_ID = ?`, [classId]);
  if (!cl || !cl.Slot_Code) return { ok: false, message: 'That class cannot be dropped here.' };
  const classGroup = get(`SELECT Group_ID FROM "Group" WHERE Scope_Type = 'CLASS' AND Scope_ID = ?`, [classId]);
  if (!classGroup) return { ok: false, message: 'You are not registered for that class.' };

  atomically(() => {
    run('DELETE FROM Group_Membership WHERE Group_ID = ? AND User_ID = ?', [classGroup.Group_ID, userId]);
    const left = registeredClasses(userId).filter((c) => c.courseId === cl.Course_ID);
    if (!left.length) {
      const cg = get(`SELECT Group_ID FROM "Group" WHERE Scope_Type = 'COURSE' AND Scope_ID = ?`, [cl.Course_ID]);
      if (cg) run('DELETE FROM Group_Membership WHERE Group_ID = ? AND User_ID = ?', [cg.Group_ID, userId]);
    }
  });
  return { ok: true, message: `Dropped ${cl.Course_Code} (${cl.Slot_Code}).` };
}

/** Small deterministic PRNG (mulberry32). */
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

/**
 * Give a student a valid random timetable: for each course pick a theory class
 * (and the same teacher's lab where one exists) that does not clash with what
 * they already have. Used by the seed so every student starts with classes.
 */
function allotRandomly(userId, rand, courseCodes) {
  const cat = catalogue();
  const byCourse = new Map();
  for (const c of cat) {
    if (courseCodes && !courseCodes.includes(c.code)) continue;
    (byCourse.get(c.code) || byCourse.set(c.code, []).get(c.code)).push(c);
  }
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  let registered = 0;
  for (const [, classes] of byCourse) {
    const theory = classes.filter((c) => c.kind === 'theory');
    const labs = classes.filter((c) => c.kind === 'lab');
    for (let attempt = 0; attempt < 40; attempt++) {
      const t = theory.length ? pick(theory) : null;
      if (t && !register(userId, t.id).ok) continue;
      let ok = true;
      if (labs.length) {
        const sameTeacher = t ? labs.filter((l) => l.faculty === t.faculty) : [];
        const pool = sameTeacher.length ? sameTeacher : labs;
        let placed = false;
        for (let k = 0; k < 15 && !placed; k++) placed = register(userId, pick(pool).id).ok;
        ok = placed || Boolean(t); // a theory-only registration is still fine
        if (!placed && t && !theory.length) ok = false;
      }
      if (ok) { registered++; break; }
      if (t) drop(userId, t.id); // theory fitted but nothing else did: retry
    }
  }
  return registered;
}

module.exports = { catalogue, registeredClasses, allMeetings, register, drop, allotRandomly, rng, meetingsOfClass };
