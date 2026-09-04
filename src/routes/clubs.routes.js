'use strict';
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Hobby', 'Wellness', 'Literary', 'Social Service', 'Custom'];

function myRole(clubId, userId) {
  return get(`SELECT * FROM Club_Membership WHERE Club_ID = ? AND User_ID = ?`, [clubId, userId]);
}

router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const rows = all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM Club_Membership m WHERE m.Club_ID = c.Club_ID AND m.Membership_Status='ACTIVE') AS member_count,
       (SELECT Membership_Role FROM Club_Membership m WHERE m.Club_ID = c.Club_ID AND m.User_ID = ? AND m.Membership_Status='ACTIVE') AS my_role
     FROM Club c ORDER BY c.Category, c.Club_Name`,
    [uid]
  );
  const byCat = {};
  rows.forEach((r) => { (byCat[r.Category || 'Other'] = byCat[r.Category || 'Other'] || []).push(r); });
  res.render('clubs/index', { title: 'Clubs', rows, byCat, categories: CATEGORIES });
});

router.post('/', (req, res) => {
  const name = clean(req.body.name);
  let category = clean(req.body.category);
  if (category === 'Custom') category = clean(req.body.custom_category) || 'Custom';
  if (!name) { req.flash('error', 'Club needs a name.'); return res.redirect('/clubs'); }
  const id = tx(() => {
    const cid = run(
      `INSERT INTO Club (Club_Name, Category, Description, Created_At) VALUES (?,?,?,?)`,
      [name, category || 'Other', clean(req.body.description) || null, nowIso()]
    ).lastInsertRowid;
    run(
      `INSERT INTO Club_Membership (Club_ID, User_ID, Membership_Role, Joined_At, Membership_Status)
       VALUES (?, ?, 'ADMIN', ?, 'ACTIVE')`,
      [cid, req.currentUser.User_ID, nowIso()]
    );
    return cid;
  });
  audit(req, 'CREATE', 'Club', id);
  req.flash('success', 'Club created — you are its admin.');
  res.redirect('/clubs/' + id);
});

router.get('/:id', (req, res) => {
  const c = get(`SELECT * FROM Club WHERE Club_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.status(404).render('error', { title: 'Not found', message: 'No such club.' });
  const mine = myRole(c.Club_ID, req.currentUser.User_ID);
  const isMember = mine && mine.Membership_Status === 'ACTIVE';
  const members = all(
    `SELECT m.Membership_Role, m.Joined_At, u.User_ID, u.Full_Name, pr.Profile_Image
       FROM Club_Membership m JOIN "User" u ON u.User_ID = m.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
      WHERE m.Club_ID = ? AND m.Membership_Status = 'ACTIVE'
      ORDER BY (m.Membership_Role IN ('ADMIN','CORE','CAPTAIN')) DESC, u.Full_Name`,
    [c.Club_ID]
  );
  res.render('clubs/show', { title: c.Club_Name, c, mine, isMember, members });
});

router.post('/:id/join', (req, res) => {
  const c = get(`SELECT * FROM Club WHERE Club_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/clubs');
  const ex = myRole(c.Club_ID, req.currentUser.User_ID);
  if (ex) run(`UPDATE Club_Membership SET Membership_Status='ACTIVE' WHERE Club_Membership_ID = ?`, [ex.Club_Membership_ID]);
  else run(
    `INSERT INTO Club_Membership (Club_ID, User_ID, Membership_Role, Joined_At, Membership_Status)
     VALUES (?, ?, 'MEMBER', ?, 'ACTIVE')`,
    [c.Club_ID, req.currentUser.User_ID, nowIso()]
  );
  audit(req, 'JOIN', 'Club', c.Club_ID);
  req.flash('success', `Joined ${c.Club_Name}.`);
  res.redirect('/clubs/' + c.Club_ID);
});

router.post('/:id/leave', (req, res) => {
  const c = get(`SELECT * FROM Club WHERE Club_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/clubs');
  const ex = myRole(c.Club_ID, req.currentUser.User_ID);
  if (ex) { run(`UPDATE Club_Membership SET Membership_Status='LEFT' WHERE Club_Membership_ID = ?`, [ex.Club_Membership_ID]); audit(req, 'LEAVE', 'Club', c.Club_ID); }
  req.flash('success', `Left ${c.Club_Name}.`);
  res.redirect('/clubs/' + c.Club_ID);
});

module.exports = router;
