'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { timetableForStudent, timetableForFaculty } = require('../lib/queries');
const { likeContains, clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notifyMany } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

// ---- overview ----------------------------------------------------------
router.get('/', (req, res) => {
  const schools = all(`SELECT * FROM School ORDER BY School_Name`);
  const departments = all(
    `SELECT d.*, s.School_Name,
       (SELECT COUNT(*) FROM Program p WHERE p.Department_ID = d.Department_ID) AS program_count,
       (SELECT COUNT(*) FROM Course  c WHERE c.Department_ID = d.Department_ID) AS course_count,
       (SELECT COUNT(*) FROM Faculty f WHERE f.Department_ID = d.Department_ID) AS faculty_count
     FROM Department d JOIN School s ON s.School_ID = d.School_ID
     ORDER BY s.School_Name, d.Department_Name`
  );
  const buildings = all(
    `SELECT b.*, (SELECT COUNT(*) FROM Room r WHERE r.Building_ID = b.Building_ID) AS room_count
       FROM Building b ORDER BY b.Building_Name`
  );
  res.render('academic/index', { title: 'Academic', schools, departments, buildings });
});

// ---- department ------------------------------------------------------
router.get('/departments/:id', (req, res) => {
  const dep = get(
    `SELECT d.*, s.School_Name, s.School_ID FROM Department d
       JOIN School s ON s.School_ID = d.School_ID WHERE d.Department_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!dep) return res.status(404).render('error', { title: 'Not found', message: 'No such department.' });
  const programs = all(`SELECT * FROM Program WHERE Department_ID = ? ORDER BY Program_Name`, [dep.Department_ID]);
  const courses = all(`SELECT * FROM Course WHERE Department_ID = ? ORDER BY Semester, Course_Code`, [dep.Department_ID]);
  const faculty = all(
    `SELECT f.*, u.Full_Name, u.Email FROM Faculty f JOIN "User" u ON u.User_ID = f.User_ID
      WHERE f.Department_ID = ? ORDER BY u.Full_Name`,
    [dep.Department_ID]
  );
  res.render('academic/department', { title: dep.Department_Name, dep, programs, courses, faculty });
});

// ---- program -------------------------------------------------------
router.get('/programs/:id', (req, res) => {
  const prog = get(
    `SELECT p.*, d.Department_Name, d.Department_ID, s.School_Name FROM Program p
       JOIN Department d ON d.Department_ID = p.Department_ID
       JOIN School s ON s.School_ID = d.School_ID WHERE p.Program_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!prog) return res.status(404).render('error', { title: 'Not found', message: 'No such program.' });
  const courses = all(`SELECT * FROM Course WHERE Program_ID = ? ORDER BY Semester, Course_Code`, [prog.Program_ID]);
  const bySem = {};
  courses.forEach((c) => { (bySem[c.Semester || 0] = bySem[c.Semester || 0] || []).push(c); });
  const studentCount = get(`SELECT COUNT(*) AS n FROM Student WHERE Program_ID = ?`, [prog.Program_ID]).n;
  res.render('academic/program', { title: prog.Program_Name, prog, bySem, studentCount });
});

// ---- course ------------------------------------------------------
router.get('/courses/:id', (req, res) => {
  const course = get(
    `SELECT c.*, p.Program_Name, p.Program_ID, d.Department_Name, d.Department_ID
       FROM Course c
       JOIN Program p ON p.Program_ID = c.Program_ID
       JOIN Department d ON d.Department_ID = c.Department_ID
      WHERE c.Course_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!course) return res.status(404).render('error', { title: 'Not found', message: 'No such course.' });
  const classes = all(
    `SELECT cl.*, u.Full_Name AS faculty_name, u.User_ID AS faculty_user_id, f.Designation, f.Faculty_ID
       FROM Class cl JOIN Faculty f ON f.Faculty_ID = cl.Faculty_ID
       JOIN "User" u ON u.User_ID = f.User_ID
      WHERE cl.Course_ID = ? ORDER BY cl.Academic_Year DESC, cl.Section`,
    [course.Course_ID]
  );
  for (const cl of classes) {
    cl.slots = all(
      `SELECT t.*, r.Room_Number, b.Building_Name, b.Block FROM Timetable t
         JOIN Room r ON r.Room_ID = t.Room_ID JOIN Building b ON b.Building_ID = r.Building_ID
        WHERE t.Class_ID = ?
        ORDER BY CASE t.Day_Of_Week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.Start_Time`,
      [cl.Class_ID]
    );
  }
  const materials = all(
    `SELECT sm.*, u.Full_Name AS faculty_name FROM Study_Material sm
       JOIN Faculty f ON f.Faculty_ID = sm.Faculty_ID JOIN "User" u ON u.User_ID = f.User_ID
      WHERE sm.Course_ID = ? ORDER BY sm.Uploaded_At DESC`,
    [course.Course_ID]
  );
  const courseGroup = get(`SELECT * FROM "Group" WHERE Scope_Type = 'COURSE' AND Scope_ID = ?`, [course.Course_ID]);
  res.render('academic/course', { title: course.Course_Code, course, classes, materials, courseGroup });
});

// ---- my timetable ---------------------------------------------
router.get('/timetable', (req, res) => {
  const u = req.currentUser;
  let rows = [];
  if (u.role === 'student') rows = timetableForStudent(u.student);
  else if (u.role === 'faculty') rows = timetableForFaculty(u.faculty);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = {};
  days.forEach((d) => (byDay[d] = []));
  rows.forEach((r) => { if (byDay[r.Day_Of_Week]) byDay[r.Day_Of_Week].push(r); });
  res.render('academic/timetable', { title: 'Timetable', byDay, days, hasAny: rows.length > 0 });
});

// ---- study materials library --------------------------------
router.get('/materials', (req, res) => {
  const q = (req.query.q || '').trim();
  const courseId = parseInt(req.query.course, 10) || null;
  const params = [];
  let where = 'WHERE 1=1';
  if (courseId) { where += ' AND sm.Course_ID = ?'; params.push(courseId); }
  if (q) { where += ' AND (sm.Title LIKE ? ESCAPE \'\\\' OR sm.Description LIKE ? ESCAPE \'\\\')'; params.push(likeContains(q), likeContains(q)); }
  const materials = all(
    `SELECT sm.*, c.Course_Code, c.Course_Name, u.Full_Name AS faculty_name
       FROM Study_Material sm
       JOIN Course c ON c.Course_ID = sm.Course_ID
       JOIN Faculty f ON f.Faculty_ID = sm.Faculty_ID
       JOIN "User" u ON u.User_ID = f.User_ID
       ${where}
      ORDER BY sm.Uploaded_At DESC`,
    params
  );
  const courses = all(`SELECT Course_ID, Course_Code, Course_Name FROM Course ORDER BY Course_Code`);
  res.render('academic/materials', { title: 'Study materials', materials, courses, q, courseId });
});

// ---- faculty: upload study material ------------------------
function facultyCourses(faculty) {
  return all(
    `SELECT DISTINCT c.Course_ID, c.Course_Code, c.Course_Name
       FROM Class cl JOIN Course c ON c.Course_ID = cl.Course_ID
      WHERE cl.Faculty_ID = ? ORDER BY c.Course_Code`,
    [faculty.Faculty_ID]
  );
}

router.get('/materials/new', requireRole('faculty'), (req, res) => {
  const mine = facultyCourses(req.currentUser.faculty);
  const all_courses = all(`SELECT Course_ID, Course_Code, Course_Name FROM Course ORDER BY Course_Code`);
  res.render('academic/material-new', {
    title: 'Upload study material',
    courses: mine.length ? mine : all_courses,
    preselect: parseInt(req.query.course, 10) || null,
    form: {},
  });
});

router.post('/materials', requireRole('faculty'), (req, res) => {
  const courseId = parseInt(req.body.course_id, 10);
  const title = clean(req.body.title);
  const course = courseId && get(`SELECT * FROM Course WHERE Course_ID = ?`, [courseId]);
  if (!course || !title) {
    req.flash('error', 'Course and title are required.');
    return res.redirect('/academic/materials/new');
  }
  const fileName = clean(req.body.file_name) || (title.replace(/[^a-z0-9]+/gi, '-') + '.pdf');
  const fileType = clean(req.body.file_type) || 'application/pdf';
  const fileSize = parseInt(req.body.file_size, 10) || 250000;
  const t = nowIso();

  run(
    `INSERT INTO "File" (User_ID, File_Name, File_Type, File_Size, Storage_Path, Uploaded_At)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.currentUser.User_ID, fileName, fileType, fileSize,
     `/vault/${req.currentUser.User_ID}/${Date.now()}-${fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-')}`, t]
  );
  const id = run(
    `INSERT INTO Study_Material (Course_ID, Faculty_ID, Title, Description, File_URL, Uploaded_At)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [courseId, req.currentUser.faculty.Faculty_ID, title, clean(req.body.description) || null,
     '/files/' + fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-'), t]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Study_Material', id);

  // notify the course group members
  const g = get(`SELECT Group_ID FROM "Group" WHERE Scope_Type = 'COURSE' AND Scope_ID = ?`, [courseId]);
  if (g) {
    const members = all(
      `SELECT User_ID FROM Group_Membership WHERE Group_ID = ? AND Membership_Status = 'ACTIVE' AND User_ID <> ?`,
      [g.Group_ID, req.currentUser.User_ID]
    ).map((r) => r.User_ID);
    notifyMany(members, 'New study material',
      `${req.currentUser.Full_Name} uploaded "${title}" for ${course.Course_Code}.`, 'ACADEMIC');
  }
  req.flash('success', 'Study material published.');
  res.redirect('/academic/courses/' + courseId);
});

// ---- buildings & rooms -------------------------------------
router.get('/buildings', (req, res) => {
  const buildings = all(`SELECT * FROM Building ORDER BY Building_Name`);
  for (const b of buildings) {
    b.rooms = all(`SELECT * FROM Room WHERE Building_ID = ? ORDER BY Floor, Room_Number`, [b.Building_ID]);
  }
  res.render('academic/buildings', { title: 'Buildings & rooms', buildings });
});

module.exports = router;
