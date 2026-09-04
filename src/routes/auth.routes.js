'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { get, all, run, tx } = require('../db');
const { nowIso, clean } = require('../lib/util');
const { loadUser } = require('../lib/roles');
const { syncMembershipsForUser } = require('../lib/groups');
const { audit } = require('../lib/audit');
const { notify } = require('../lib/notify');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.currentUser) return res.redirect('/');
  res.render('auth/login', { title: 'Sign in', bare: true, next: req.query.next || '' });
});

router.post('/login', (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = req.body.password || '';
  const user = get('SELECT * FROM "User" WHERE lower(Email) = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.Password_Hash || '')) {
    req.flash('error', 'Incorrect email or password.');
    return res.redirect('/login');
  }
  if (user.Account_Status && user.Account_Status !== 'ACTIVE') {
    req.flash('error', `This account is ${user.Account_Status.toLowerCase()}.`);
    return res.redirect('/login');
  }
  req.session.userId = user.User_ID;
  audit({ session: { userId: user.User_ID }, headers: req.headers, socket: req.socket }, 'LOGIN', 'User', user.User_ID);
  // keep auto-allocation current on every login
  try { syncMembershipsForUser(loadUser(user.User_ID)); } catch (e) { console.error(e); }
  const dest = clean(req.body.next) || '/';
  req.flash('success', `Welcome back, ${user.Full_Name.split(' ')[0]}.`);
  res.redirect(dest.startsWith('/') ? dest : '/');
});

router.get('/register', (req, res) => {
  if (req.currentUser) return res.redirect('/');
  res.render('auth/register', {
    title: 'Create account',
    bare: true,
    programs: all(`SELECT p.Program_ID, p.Program_Name, p.Program_Code
                     FROM Program p ORDER BY p.Program_Name`),
    departments: all(`SELECT Department_ID, Department_Name FROM Department ORDER BY Department_Name`),
    form: {},
  });
});

router.post('/register', (req, res) => {
  const b = req.body;
  const form = {
    Full_Name: clean(b.full_name),
    Email: clean(b.email).toLowerCase(),
    Phone_Number: clean(b.phone),
    account_type: b.account_type === 'faculty' ? 'faculty' : 'student',
    Bio: clean(b.bio),
    Date_Of_Birth: clean(b.dob) || null,
    Gender: clean(b.gender) || null,
  };
  const errors = [];
  if (!form.Full_Name) errors.push('Full name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.Email)) errors.push('A valid email is required.');
  if ((b.password || '').length < 6) errors.push('Password must be at least 6 characters.');
  if (get('SELECT 1 FROM "User" WHERE lower(Email) = ?', [form.Email])) errors.push('That email is already registered.');

  let programId, departmentId;
  if (form.account_type === 'student') {
    programId = parseInt(b.program_id, 10);
    if (!programId || !get('SELECT 1 FROM Program WHERE Program_ID = ?', [programId]))
      errors.push('Choose your program.');
    if (!clean(b.registration_number)) errors.push('Registration number is required.');
    else if (get('SELECT 1 FROM Student WHERE Registration_Number = ?', [clean(b.registration_number)]))
      errors.push('That registration number is already in use.');
  } else {
    departmentId = parseInt(b.department_id, 10);
    if (!departmentId || !get('SELECT 1 FROM Department WHERE Department_ID = ?', [departmentId]))
      errors.push('Choose your department.');
    if (!clean(b.employee_id)) errors.push('Employee ID is required.');
    else if (get('SELECT 1 FROM Faculty WHERE Employee_ID = ?', [clean(b.employee_id)]))
      errors.push('That employee ID is already in use.');
  }

  if (errors.length) {
    return res.status(400).render('auth/register', {
      title: 'Create account', bare: true,
      programs: all(`SELECT Program_ID, Program_Name, Program_Code FROM Program ORDER BY Program_Name`),
      departments: all(`SELECT Department_ID, Department_Name FROM Department ORDER BY Department_Name`),
      form: b, errors,
    });
  }

  const newUserId = tx(() => {
    const uid = run(
      `INSERT INTO "User" (Full_Name, Email, Password_Hash, Phone_Number, Account_Status, Created_At)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
      [form.Full_Name, form.Email, bcrypt.hashSync(b.password, 10), form.Phone_Number || null, nowIso()]
    ).lastInsertRowid;

    run(
      `INSERT INTO Profile (User_ID, Profile_Image, Bio, Date_Of_Birth, Gender)
       VALUES (?, NULL, ?, ?, ?)`,
      [uid, form.Bio || null, form.Date_Of_Birth, form.Gender]
    );

    if (form.account_type === 'student') {
      run(
        `INSERT INTO Student (User_ID, Program_ID, Registration_Number, Admission_Year, Current_Semester)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uid, programId, clean(b.registration_number),
          parseInt(b.admission_year, 10) || new Date().getFullYear(),
          parseInt(b.current_semester, 10) || 1,
        ]
      );
    } else {
      run(
        `INSERT INTO Faculty (User_ID, Department_ID, Employee_ID, Designation, Specialization)
         VALUES (?, ?, ?, ?, ?)`,
        [uid, departmentId, clean(b.employee_id), clean(b.designation) || 'Faculty', clean(b.specialization) || null]
      );
    }
    return uid;
  });

  const full = loadUser(newUserId);
  const added = syncMembershipsForUser(full);
  audit({ session: { userId: newUserId }, headers: req.headers, socket: req.socket }, 'CREATE', 'User', newUserId);
  notify(
    newUserId,
    'Welcome to Campus Connect',
    added.length
      ? `You were automatically added to ${added.length} academic group(s) based on your ${full.role} profile.`
      : 'Your account is ready. Complete your profile to get started.',
    'SYSTEM'
  );

  req.session.userId = newUserId;
  req.flash('success', 'Account created. You are all set.');
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  if (req.currentUser) audit(req, 'LOGOUT', 'User', req.currentUser.User_ID);
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
