'use strict';
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify, notifyMany } = require('../lib/notify');
const { membershipReason } = require('../lib/groups');

const router = express.Router();
router.use(requireAuth);

function membership(groupId, userId) {
  return get(`SELECT * FROM Group_Membership WHERE Group_ID = ? AND User_ID = ?`, [groupId, userId]);
}
function activeMemberIds(groupId) {
  return all(
    `SELECT User_ID FROM Group_Membership WHERE Group_ID = ? AND Membership_Status = 'ACTIVE'`,
    [groupId]
  ).map((r) => r.User_ID);
}

// ---- list / discover ----------------------------------------------
router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const mine = all(
    `SELECT g.*, gm.Role,
       (SELECT COUNT(*) FROM Group_Membership x WHERE x.Group_ID = g.Group_ID AND x.Membership_Status='ACTIVE') AS member_count
       FROM Group_Membership gm JOIN "Group" g ON g.Group_ID = gm.Group_ID
      WHERE gm.User_ID = ? AND gm.Membership_Status = 'ACTIVE'
      ORDER BY CASE g.Scope_Type
        WHEN 'STUDENT_ONLY' THEN 1 WHEN 'SCHOOL' THEN 2 WHEN 'DEPARTMENT' THEN 3
        WHEN 'PROGRAM' THEN 4 WHEN 'YEAR' THEN 5 WHEN 'COURSE' THEN 6 WHEN 'CLASS' THEN 7 ELSE 8 END,
        g.Group_Name`,
    [uid]
  ).map((g) => ({ ...g, reason: membershipReason(g) }));

  const discover = all(
    `SELECT g.*,
       (SELECT COUNT(*) FROM Group_Membership x WHERE x.Group_ID = g.Group_ID AND x.Membership_Status='ACTIVE') AS member_count
       FROM "Group" g
      WHERE g.Group_ID NOT IN (
        SELECT Group_ID FROM Group_Membership WHERE User_ID = ? AND Membership_Status = 'ACTIVE')
      ORDER BY (g.Group_Type = 'INTEREST') DESC, g.Group_Name`,
    [uid]
  );
  res.render('groups/index', { title: 'Groups', mine, discover });
});

// ---- create interest group -----------------------------------
router.post('/', (req, res) => {
  const name = clean(req.body.name);
  const description = clean(req.body.description) || null;
  if (!name) { req.flash('error', 'Give your group a name.'); return res.redirect('/groups'); }
  const id = tx(() => {
    const gid = run(
      `INSERT INTO "Group" (Course_ID, Group_Name, Group_Type, Description, Created_At, Scope_Type, Scope_ID)
       VALUES (NULL, ?, 'INTEREST', ?, ?, NULL, NULL)`,
      [name, description, nowIso()]
    ).lastInsertRowid;
    run(
      `INSERT INTO Group_Membership (Group_ID, User_ID, Role, Joined_At, Membership_Status)
       VALUES (?, ?, 'ADMIN', ?, 'ACTIVE')`,
      [gid, req.currentUser.User_ID, nowIso()]
    );
    return gid;
  });
  audit(req, 'CREATE', 'Group', id);
  req.flash('success', 'Group created.');
  res.redirect('/groups/' + id);
});

// ---- group detail --------------------------------------
router.get('/:id', (req, res) => {
  const g = get(`SELECT * FROM "Group" WHERE Group_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!g) return res.status(404).render('error', { title: 'Not found', message: 'No such group.' });

  const me = membership(g.Group_ID, req.currentUser.User_ID);
  const isMember = me && me.Membership_Status === 'ACTIVE';
  const members = all(
    `SELECT gm.Role, gm.Joined_At, u.User_ID, u.Full_Name, pr.Profile_Image,
            (SELECT 1 FROM Student s WHERE s.User_ID = u.User_ID) AS is_student,
            (SELECT 1 FROM Faculty f WHERE f.User_ID = u.User_ID) AS is_faculty
       FROM Group_Membership gm
       JOIN "User" u ON u.User_ID = gm.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
      WHERE gm.Group_ID = ? AND gm.Membership_Status = 'ACTIVE'
      ORDER BY (gm.Role IN ('ADMIN','MODERATOR')) DESC, u.Full_Name`,
    [g.Group_ID]
  );
  const announcements = all(
    `SELECT a.*, u.Full_Name AS faculty_name, f.Designation FROM Announcement a
       JOIN Faculty f ON f.Faculty_ID = a.Faculty_ID JOIN "User" u ON u.User_ID = f.User_ID
      WHERE a.Group_ID = ? ORDER BY a.Is_Official DESC, a.Published_At DESC`,
    [g.Group_ID]
  );
  const conv = get(`SELECT * FROM Conversation WHERE Group_ID = ?`, [g.Group_ID]);
  let messages = [];
  if (conv) {
    messages = all(
      `SELECT m.*, u.Full_Name, u.User_ID, pr.Profile_Image FROM Message m
         JOIN "User" u ON u.User_ID = m.User_ID
         LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
        WHERE m.Conversation_ID = ? ORDER BY m.Sent_At ASC LIMIT 100`,
      [conv.Conversation_ID]
    );
  }
  const canAnnounce =
    req.currentUser.role === 'faculty' && isMember;

  res.render('groups/show', {
    title: g.Group_Name,
    g, me, isMember, members, announcements, messages,
    reason: isMember ? membershipReason(g) : null,
    canAnnounce,
  });
});

// ---- join / leave -------------------------------------
router.post('/:id/join', (req, res) => {
  const g = get(`SELECT * FROM "Group" WHERE Group_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!g) return res.redirect('/groups');
  const existing = membership(g.Group_ID, req.currentUser.User_ID);
  if (existing) {
    run(`UPDATE Group_Membership SET Membership_Status = 'ACTIVE' WHERE Membership_ID = ?`, [existing.Membership_ID]);
  } else {
    run(
      `INSERT INTO Group_Membership (Group_ID, User_ID, Role, Joined_At, Membership_Status)
       VALUES (?, ?, 'MEMBER', ?, 'ACTIVE')`,
      [g.Group_ID, req.currentUser.User_ID, nowIso()]
    );
  }
  audit(req, 'JOIN', 'Group', g.Group_ID);
  req.flash('success', `Joined ${g.Group_Name}.`);
  res.redirect('/groups/' + g.Group_ID);
});

router.post('/:id/leave', (req, res) => {
  const g = get(`SELECT * FROM "Group" WHERE Group_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!g) return res.redirect('/groups');
  const existing = membership(g.Group_ID, req.currentUser.User_ID);
  if (existing) {
    run(`UPDATE Group_Membership SET Membership_Status = 'LEFT' WHERE Membership_ID = ?`, [existing.Membership_ID]);
    audit(req, 'LEAVE', 'Group', g.Group_ID);
  }
  if (g.Scope_Type) {
    req.flash('info', 'You left this auto-allocated group. It may be re-added next time you sign in if you are still eligible.');
  } else {
    req.flash('success', `Left ${g.Group_Name}.`);
  }
  res.redirect('/groups/' + g.Group_ID);
});

// ---- group discussion message ----------------------
router.post('/:id/message', (req, res) => {
  const g = get(`SELECT * FROM "Group" WHERE Group_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!g) return res.redirect('/groups');
  const me = membership(g.Group_ID, req.currentUser.User_ID);
  if (!me || me.Membership_Status !== 'ACTIVE') {
    req.flash('error', 'Join the group to post in the discussion.');
    return res.redirect('/groups/' + g.Group_ID);
  }
  const text = clean(req.body.text);
  if (!text) return res.redirect('/groups/' + g.Group_ID);

  tx(() => {
    let conv = get(`SELECT * FROM Conversation WHERE Group_ID = ?`, [g.Group_ID]);
    if (!conv) {
      const cid = run(
        `INSERT INTO Conversation (Conversation_Type, Title, Created_At, Group_ID) VALUES ('GROUP', ?, ?, ?)`,
        [g.Group_Name, nowIso(), g.Group_ID]
      ).lastInsertRowid;
      conv = { Conversation_ID: cid };
      for (const uidm of activeMemberIds(g.Group_ID)) {
        run(`INSERT OR IGNORE INTO Conversation_Participant (Conversation_ID, User_ID, Joined_At) VALUES (?,?,?)`,
          [cid, uidm, nowIso()]);
      }
    } else {
      run(`INSERT OR IGNORE INTO Conversation_Participant (Conversation_ID, User_ID, Joined_At) VALUES (?,?,?)`,
        [conv.Conversation_ID, req.currentUser.User_ID, nowIso()]);
    }
    run(
      `INSERT INTO Message (Conversation_ID, User_ID, Message_Content, Message_Type, Sent_At, Edited_At)
       VALUES (?, ?, ?, 'TEXT', ?, NULL)`,
      [conv.Conversation_ID, req.currentUser.User_ID, text, nowIso()]
    );
  });
  audit(req, 'MESSAGE', 'Group', g.Group_ID);
  res.redirect('/groups/' + g.Group_ID + '#discussion');
});

// ---- faculty announcement --------------------------
router.post('/:id/announce', (req, res) => {
  const g = get(`SELECT * FROM "Group" WHERE Group_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!g) return res.redirect('/groups');
  if (req.currentUser.role !== 'faculty') {
    return res.status(403).render('error', { title: 'Faculty only', message: 'Only faculty can publish announcements.' });
  }
  const me = membership(g.Group_ID, req.currentUser.User_ID);
  if (!me || me.Membership_Status !== 'ACTIVE') {
    req.flash('error', 'You must be a member of this group to post an announcement.');
    return res.redirect('/groups/' + g.Group_ID);
  }
  const title = clean(req.body.title);
  const content = clean(req.body.content);
  if (!title || !content) {
    req.flash('error', 'Announcement needs a title and content.');
    return res.redirect('/groups/' + g.Group_ID);
  }
  const isOfficial =
    req.body.is_official === 'on' &&
    /dean|hod|head|director|registrar|principal/i.test(req.currentUser.faculty.Designation || '')
      ? 1 : 0;

  const id = run(
    `INSERT INTO Announcement (Group_ID, Faculty_ID, Title, Content, Published_At, Expiry_Date, Is_Official)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [g.Group_ID, req.currentUser.faculty.Faculty_ID, title, content, nowIso(),
     req.body.expiry_date || null, isOfficial]
  ).lastInsertRowid;

  audit(req, 'CREATE', 'Announcement', id);
  const recipients = activeMemberIds(g.Group_ID).filter((x) => x !== req.currentUser.User_ID);
  notifyMany(recipients, (isOfficial ? '[Official] ' : '') + 'Announcement: ' + title,
    `${req.currentUser.Full_Name} posted in ${g.Group_Name}.`, 'ACADEMIC');
  req.flash('success', 'Announcement published to the group.');
  res.redirect('/groups/' + g.Group_ID);
});

module.exports = router;
