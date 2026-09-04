'use strict';
/**
 * Academic group auto-allocation.
 *
 * Groups are scoped with the DA2 additive columns "Group".Scope_Type /
 * Scope_ID. A student/faculty is auto-placed into every group their academic
 * record implies, and the UI shows *why* (membershipReason). Nothing random is
 * ever created.
 *
 * Course/class links for a student are derived through Program + Semester,
 * because the DA1 design has no student<->course enrolment table (and the brief
 * says not to invent one when a derivation is enough).
 */
const { get, all, run } = require('../db');
const { nowIso } = require('./util');

const STUDENT_ONLY_SCOPE_ID = 0;

/** Find, or create, the single group for a (Scope_Type, Scope_ID) pair. */
function getOrCreateScopeGroup(scopeType, scopeId, name, description, courseId = null) {
  let g = get(
    'SELECT * FROM "Group" WHERE Scope_Type = ? AND Scope_ID = ?',
    [scopeType, scopeId]
  );
  if (g) return g;
  const info = run(
    `INSERT INTO "Group" (Course_ID, Group_Name, Group_Type, Description, Created_At, Scope_Type, Scope_ID)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [courseId, name, scopeType, description || null, nowIso(), scopeType, scopeId]
  );
  return get('SELECT * FROM "Group" WHERE Group_ID = ?', [info.lastInsertRowid]);
}

/** Courses a student is expected to be taking right now (program + current semester). */
function coursesForStudent(student) {
  if (!student) return [];
  return all(
    `SELECT * FROM Course
      WHERE Program_ID = ?
        AND (Semester = ? OR ? IS NULL)
      ORDER BY Course_Code`,
    [student.Program_ID, student.Current_Semester, student.Current_Semester]
  );
}

/** Build the list of {scopeType, scopeId, name, description, courseId, role} a student should be in. */
function eligibleGroupsForStudent(student) {
  const out = [];
  out.push({
    scopeType: 'STUDENT_ONLY',
    scopeId: STUDENT_ONLY_SCOPE_ID,
    name: 'All Students',
    description: 'Campus-wide student-only communication group.',
    courseId: null,
    role: 'MEMBER',
  });
  if (student.School_ID) {
    out.push({
      scopeType: 'SCHOOL',
      scopeId: student.School_ID,
      name: `${student.School_Name} — School Group`,
      description: `Everyone in ${student.School_Name}.`,
      courseId: null,
      role: 'MEMBER',
    });
  }
  if (student.Department_ID) {
    out.push({
      scopeType: 'DEPARTMENT',
      scopeId: student.Department_ID,
      name: `${student.Department_Name} — Department Group`,
      description: `Students & faculty of the ${student.Department_Name} department.`,
      courseId: null,
      role: 'MEMBER',
    });
  }
  out.push({
    scopeType: 'PROGRAM',
    scopeId: student.Program_ID,
    name: `${student.Program_Name} — Program Group`,
    description: `All students of ${student.Program_Name} (${student.Program_Code}).`,
    courseId: null,
    role: 'MEMBER',
  });
  if (student.Admission_Year) {
    out.push({
      scopeType: 'YEAR',
      scopeId: student.Admission_Year,
      name: `Batch of ${student.Admission_Year}`,
      description: `Students admitted in ${student.Admission_Year}.`,
      courseId: null,
      role: 'MEMBER',
    });
  }
  for (const c of coursesForStudent(student)) {
    out.push({
      scopeType: 'COURSE',
      scopeId: c.Course_ID,
      name: `${c.Course_Code} ${c.Course_Name}`,
      description: `Course group for ${c.Course_Code} — ${c.Course_Name}.`,
      courseId: c.Course_ID,
      role: 'MEMBER',
    });
    const classes = all(
      `SELECT * FROM Class WHERE Course_ID = ? AND (Semester = ? OR Semester IS NULL)`,
      [c.Course_ID, student.Current_Semester]
    );
    for (const cl of classes) {
      out.push({
        scopeType: 'CLASS',
        scopeId: cl.Class_ID,
        name: `${c.Course_Code} — Section ${cl.Section} (${cl.Academic_Year})`,
        description: `Class/section group for ${c.Course_Code} section ${cl.Section}.`,
        courseId: c.Course_ID,
        role: 'MEMBER',
      });
    }
  }
  return out;
}

/** Groups a faculty member should be in: their school, department, and the courses/classes they teach. */
function eligibleGroupsForFaculty(faculty) {
  const out = [];
  if (faculty.School_ID) {
    out.push({
      scopeType: 'SCHOOL',
      scopeId: faculty.School_ID,
      name: `${faculty.School_Name} — School Group`,
      description: `Everyone in ${faculty.School_Name}.`,
      courseId: null,
      role: 'MEMBER',
    });
  }
  out.push({
    scopeType: 'DEPARTMENT',
    scopeId: faculty.Department_ID,
    name: `${faculty.Department_Name} — Department Group`,
    description: `Students & faculty of the ${faculty.Department_Name} department.`,
    courseId: null,
    role: 'MODERATOR',
  });
  const classes = all(
    `SELECT cl.*, c.Course_Code, c.Course_Name
       FROM Class cl JOIN Course c ON c.Course_ID = cl.Course_ID
      WHERE cl.Faculty_ID = ?`,
    [faculty.Faculty_ID]
  );
  const seenCourse = new Set();
  for (const cl of classes) {
    if (!seenCourse.has(cl.Course_ID)) {
      seenCourse.add(cl.Course_ID);
      out.push({
        scopeType: 'COURSE',
        scopeId: cl.Course_ID,
        name: `${cl.Course_Code} ${cl.Course_Name}`,
        description: `Course group for ${cl.Course_Code} — ${cl.Course_Name}.`,
        courseId: cl.Course_ID,
        role: 'MODERATOR',
      });
    }
    out.push({
      scopeType: 'CLASS',
      scopeId: cl.Class_ID,
      name: `${cl.Course_Code} — Section ${cl.Section} (${cl.Academic_Year})`,
      description: `Class/section group for ${cl.Course_Code} section ${cl.Section}.`,
      courseId: cl.Course_ID,
      role: 'MODERATOR',
    });
  }
  return out;
}

/**
 * Ensure every eligible group exists and the user has an ACTIVE membership in it.
 * Returns the list of groups the user was *newly* added to (for notifications).
 */
function syncMembershipsForUser(fullUser) {
  const specs =
    fullUser.role === 'faculty'
      ? eligibleGroupsForFaculty(fullUser.faculty)
      : fullUser.role === 'student'
      ? eligibleGroupsForStudent(fullUser.student)
      : [];

  const added = [];
  for (const s of specs) {
    const group = getOrCreateScopeGroup(s.scopeType, s.scopeId, s.name, s.description, s.courseId);
    const existing = get(
      'SELECT * FROM Group_Membership WHERE Group_ID = ? AND User_ID = ?',
      [group.Group_ID, fullUser.User_ID]
    );
    if (existing) {
      if (existing.Membership_Status !== 'ACTIVE') {
        run('UPDATE Group_Membership SET Membership_Status = ? WHERE Membership_ID = ?', [
          'ACTIVE',
          existing.Membership_ID,
        ]);
      }
      continue;
    }
    run(
      `INSERT INTO Group_Membership (Group_ID, User_ID, Role, Joined_At, Membership_Status)
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      [group.Group_ID, fullUser.User_ID, s.role, nowIso()]
    );
    added.push(group);
  }
  return added;
}

/** Human-readable explanation of why a user is in a group. */
function membershipReason(group) {
  switch (group.Scope_Type) {
    case 'STUDENT_ONLY':
      return 'Auto-added: every student account joins the campus student group.';
    case 'SCHOOL':
      return 'Auto-added: your school.';
    case 'DEPARTMENT':
      return 'Auto-added: your department.';
    case 'PROGRAM':
      return 'Auto-added: you are enrolled in this program.';
    case 'YEAR':
      return 'Auto-added: your admission batch.';
    case 'COURSE':
      return 'Auto-added: this course is in your current semester.';
    case 'CLASS':
      return 'Auto-added: your class/section for this course.';
    default:
      return group.Group_Type === 'INTEREST'
        ? 'You joined this group.'
        : 'Member of this group.';
  }
}

module.exports = {
  STUDENT_ONLY_SCOPE_ID,
  getOrCreateScopeGroup,
  coursesForStudent,
  eligibleGroupsForStudent,
  eligibleGroupsForFaculty,
  syncMembershipsForUser,
  membershipReason,
};
