'use strict';
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notifyMany } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

const TYPES = ['ACADEMIC', 'SPORTS', 'HOBBY', 'CULTURAL', 'SOCIAL', 'WELLNESS', 'OTHER'];

function myRole(communityId, userId) {
  return get(
    `SELECT * FROM Community_Membership WHERE Community_ID = ? AND User_ID = ?`,
    [communityId, userId]
  );
}
function activeMemberIds(communityId) {
  return all(
    `SELECT User_ID FROM Community_Membership WHERE Community_ID = ? AND Membership_Status = 'ACTIVE'`,
    [communityId]
  ).map((r) => r.User_ID);
}

router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const rows = all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM Community_Membership m WHERE m.Community_ID = c.Community_ID AND m.Membership_Status='ACTIVE') AS member_count,
       (SELECT COUNT(*) FROM Event e WHERE e.Community_ID = c.Community_ID) AS event_count,
       (SELECT Membership_Role FROM Community_Membership m WHERE m.Community_ID = c.Community_ID AND m.User_ID = ? AND m.Membership_Status='ACTIVE') AS my_role
     FROM Community c ORDER BY c.Community_Name`,
    [uid]
  );
  res.render('communities/index', { title: 'Communities', rows, types: TYPES });
});

router.post('/', (req, res) => {
  const name = clean(req.body.name);
  const type = TYPES.includes(req.body.type) ? req.body.type : 'OTHER';
  const description = clean(req.body.description) || null;
  if (!name) { req.flash('error', 'Community needs a name.'); return res.redirect('/communities'); }
  const id = tx(() => {
    const cid = run(
      `INSERT INTO Community (Community_Name, Community_Type, Description, Created_At) VALUES (?,?,?,?)`,
      [name, type, description, nowIso()]
    ).lastInsertRowid;
    run(
      `INSERT INTO Community_Membership (Community_ID, User_ID, Membership_Role, Joined_At, Membership_Status)
       VALUES (?, ?, 'ADMIN', ?, 'ACTIVE')`,
      [cid, req.currentUser.User_ID, nowIso()]
    );
    return cid;
  });
  audit(req, 'CREATE', 'Community', id);
  req.flash('success', 'Community created.');
  res.redirect('/communities/' + id);
});

router.get('/:id', (req, res) => {
  const c = get(`SELECT * FROM Community WHERE Community_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.status(404).render('error', { title: 'Not found', message: 'No such community.' });
  const mine = myRole(c.Community_ID, req.currentUser.User_ID);
  const isMember = mine && mine.Membership_Status === 'ACTIVE';
  const isAdmin = isMember && (mine.Membership_Role === 'ADMIN' || mine.Membership_Role === 'MODERATOR');
  const members = all(
    `SELECT m.Membership_Role, m.Joined_At, u.User_ID, u.Full_Name, pr.Profile_Image
       FROM Community_Membership m JOIN "User" u ON u.User_ID = m.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
      WHERE m.Community_ID = ? AND m.Membership_Status = 'ACTIVE'
      ORDER BY (m.Membership_Role IN ('ADMIN','MODERATOR')) DESC, u.Full_Name`,
    [c.Community_ID]
  );
  const events = all(
    `SELECT * FROM Event WHERE Community_ID = ? ORDER BY Event_Date DESC, Event_Time DESC`,
    [c.Community_ID]
  );
  res.render('communities/show', { title: c.Community_Name, c, mine, isMember, isAdmin, members, events });
});

router.post('/:id/join', (req, res) => {
  const c = get(`SELECT * FROM Community WHERE Community_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/communities');
  const ex = myRole(c.Community_ID, req.currentUser.User_ID);
  if (ex) run(`UPDATE Community_Membership SET Membership_Status='ACTIVE' WHERE Community_Membership_ID = ?`, [ex.Community_Membership_ID]);
  else run(
    `INSERT INTO Community_Membership (Community_ID, User_ID, Membership_Role, Joined_At, Membership_Status)
     VALUES (?, ?, 'MEMBER', ?, 'ACTIVE')`,
    [c.Community_ID, req.currentUser.User_ID, nowIso()]
  );
  audit(req, 'JOIN', 'Community', c.Community_ID);
  req.flash('success', `Joined ${c.Community_Name}.`);
  res.redirect('/communities/' + c.Community_ID);
});

router.post('/:id/leave', (req, res) => {
  const c = get(`SELECT * FROM Community WHERE Community_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/communities');
  const ex = myRole(c.Community_ID, req.currentUser.User_ID);
  if (ex) { run(`UPDATE Community_Membership SET Membership_Status='LEFT' WHERE Community_Membership_ID = ?`, [ex.Community_Membership_ID]); audit(req, 'LEAVE', 'Community', c.Community_ID); }
  req.flash('success', `Left ${c.Community_Name}.`);
  res.redirect('/communities/' + c.Community_ID);
});

router.post('/:id/events', (req, res) => {
  const c = get(`SELECT * FROM Community WHERE Community_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/communities');
  const mine = myRole(c.Community_ID, req.currentUser.User_ID);
  if (!mine || mine.Membership_Status !== 'ACTIVE') {
    req.flash('error', 'Join the community to add an event.');
    return res.redirect('/communities/' + c.Community_ID);
  }
  const title = clean(req.body.title);
  const date = clean(req.body.date);
  if (!title || !date) { req.flash('error', 'Event needs at least a title and date.'); return res.redirect('/communities/' + c.Community_ID); }
  const id = run(
    `INSERT INTO Event (Community_ID, Event_Title, Event_Description, Event_Date, Event_Time, Event_Location)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [c.Community_ID, title, clean(req.body.description) || null, date, clean(req.body.time) || null, clean(req.body.location) || null]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Event', id);
  notifyMany(
    activeMemberIds(c.Community_ID).filter((x) => x !== req.currentUser.User_ID),
    'New event: ' + title,
    `${c.Community_Name} scheduled "${title}" for ${date}.`,
    'COMMUNITY'
  );
  req.flash('success', 'Event added.');
  res.redirect('/communities/' + c.Community_ID);
});

module.exports = router;
