'use strict';
const { get } = require('../db');

/**
 * Load a user together with their role-specific record.
 *
 * Role is derived, not stored (the DA1 schema has no role column):
 *   - a User with a Student row  -> role 'student'
 *   - a User with a Faculty row  -> role 'faculty'
 *   - a User with neither        -> role 'staff'  (campus office / moderator)
 * A user can in principle have both; 'student' is reported first if so.
 */
function loadUser(userId) {
  if (!userId) return null;
  const user = get('SELECT * FROM "User" WHERE User_ID = ?', [userId]);
  if (!user) return null;

  const profile = get('SELECT * FROM Profile WHERE User_ID = ?', [userId]);

  const student = get(
    `SELECT s.*, p.Program_Name, p.Program_Code, p.Degree_Level, p.Duration,
            d.Department_ID, d.Department_Name, d.Department_Code,
            sc.School_ID, sc.School_Name
       FROM Student s
       JOIN Program p     ON p.Program_ID = s.Program_ID
       JOIN Department d  ON d.Department_ID = p.Department_ID
       JOIN School sc     ON sc.School_ID = d.School_ID
      WHERE s.User_ID = ?`,
    [userId]
  );

  const faculty = get(
    `SELECT f.*, d.Department_Name, d.Department_Code,
            sc.School_ID, sc.School_Name
       FROM Faculty f
       JOIN Department d ON d.Department_ID = f.Department_ID
       JOIN School sc    ON sc.School_ID = d.School_ID
      WHERE f.User_ID = ?`,
    [userId]
  );

  let role = 'staff';
  if (student) role = 'student';
  else if (faculty) role = 'faculty';

  return {
    ...user,
    profile: profile || null,
    student: student || null,
    faculty: faculty || null,
    role,
    isStudent: !!student,
    isFaculty: !!faculty,
    isStaff: role === 'staff',
  };
}

module.exports = { loadUser };
