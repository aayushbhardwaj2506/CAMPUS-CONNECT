'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { loadUser } = require('../lib/roles');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');
const { feedPosts } = require('../lib/queries');
const { membershipReason } = require('../lib/groups');
const { scoreForUser } = require('../lib/engagement');

const router = express.Router();

function profilePayload(targetUser, viewerId) {
  const groups = all(
    `SELECT g.Group_ID, g.Group_Name, g.Group_Type, g.Scope_Type, gm.Role
       FROM Group_Membership gm JOIN "Group" g ON g.Group_ID = gm.Group_ID
      WHERE gm.User_ID = ? AND gm.Membership_Status = 'ACTIVE'
      ORDER BY g.Group_Name`,
    [targetUser.User_ID]
  ).map((g) => ({ ...g, reason: membershipReason(g) }));

  const communities = all(
    `SELECT c.Community_ID, c.Community_Name, m.Membership_Role
       FROM Community_Membership m JOIN Community c ON c.Community_ID = m.Community_ID
      WHERE m.User_ID = ? AND m.Membership_Status = 'ACTIVE'`,
    [targetUser.User_ID]
  );
  const clubs = all(
    `SELECT c.Club_ID, c.Club_Name, c.Category, m.Membership_Role
       FROM Club_Membership m JOIN Club c ON c.Club_ID = m.Club_ID
      WHERE m.User_ID = ? AND m.Membership_Status = 'ACTIVE'`,
    [targetUser.User_ID]
  );
  const projects = all(
    `SELECT DISTINCT pj.Project_ID, pj.Project_Name, pj.Project_Status
       FROM Project pj
       LEFT JOIN Project_Team pt ON pt.Project_ID = pj.Project_ID
       LEFT JOIN Project_Membership pm ON pm.Project_Team_ID = pt.Project_Team_ID
      WHERE pj.User_ID = ? OR pm.User_ID = ?`,
    [targetUser.User_ID, targetUser.User_ID]
  );
  const posts = feedPosts(viewerId, { limit: 10, authorId: targetUser.User_ID });
  const counts = {
    posts: get('SELECT COUNT(*) AS n FROM Post WHERE User_ID = ?', [targetUser.User_ID]).n,
    comments: get('SELECT COUNT(*) AS n FROM Comment WHERE User_ID = ?', [targetUser.User_ID]).n,
    groups: groups.length,
  };
  return { groups, communities, clubs, projects, posts, counts, score: scoreForUser(targetUser.User_ID) };
}

// my profile
router.get('/profile', requireAuth, (req, res) => {
  const data = profilePayload(req.currentUser, req.currentUser.User_ID);
  res.render('profile/show', { title: 'Your profile', person: req.currentUser, isSelf: true, ...data });
});

// someone else's profile
router.get('/u/:id', requireAuth, (req, res) => {
  const person = loadUser(parseInt(req.params.id, 10));
  if (!person) return res.status(404).render('error', { title: 'Not found', message: 'No such user.' });
  const isSelf = person.User_ID === req.currentUser.User_ID;
  const data = profilePayload(person, req.currentUser.User_ID);
  res.render('profile/show', { title: person.Full_Name, person, isSelf, ...data });
});

router.get('/profile/edit', requireAuth, (req, res) => {
  res.render('profile/edit', { title: 'Edit profile', person: req.currentUser });
});

router.post('/profile', requireAuth, (req, res) => {
  const b = req.body;
  const uid = req.currentUser.User_ID;

  run(`UPDATE "User" SET Full_Name = ?, Phone_Number = ? WHERE User_ID = ?`, [
    clean(b.full_name) || req.currentUser.Full_Name,
    clean(b.phone) || null,
    uid,
  ]);

  const hasProfile = get('SELECT 1 FROM Profile WHERE User_ID = ?', [uid]);
  const vals = [
    clean(b.profile_image) || null,
    clean(b.bio) || null,
    clean(b.dob) || null,
    clean(b.gender) || null,
  ];
  if (hasProfile) {
    run(`UPDATE Profile SET Profile_Image = ?, Bio = ?, Date_Of_Birth = ?, Gender = ? WHERE User_ID = ?`, [...vals, uid]);
  } else {
    run(`INSERT INTO Profile (User_ID, Profile_Image, Bio, Date_Of_Birth, Gender) VALUES (?,?,?,?,?)`, [uid, ...vals]);
  }

  // role-specific editable fields
  if (req.currentUser.role === 'student' && b.current_semester) {
    run(`UPDATE Student SET Current_Semester = ? WHERE User_ID = ?`, [parseInt(b.current_semester, 10) || req.currentUser.student.Current_Semester, uid]);
  }
  if (req.currentUser.role === 'faculty') {
    run(`UPDATE Faculty SET Designation = ?, Specialization = ? WHERE User_ID = ?`, [
      clean(b.designation) || req.currentUser.faculty.Designation,
      clean(b.specialization) || null,
      uid,
    ]);
  }

  audit(req, 'UPDATE', 'Profile', uid);
  req.flash('success', 'Profile updated.');
  res.redirect('/profile');
});

module.exports = router;
