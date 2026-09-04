'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso, likeContains } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const catId = parseInt(req.query.category, 10) || null;
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const q = clean(req.query.q);

  const categories = all(
    `SELECT rc.*, (SELECT COUNT(*) FROM Request r WHERE r.Request_Category_ID = rc.Request_Category_ID) AS n
       FROM Request_Category rc ORDER BY rc.Category_Name`
  );

  const where = ['1=1'];
  const params = [];
  if (catId) { where.push('r.Request_Category_ID = ?'); params.push(catId); }
  if (status) { where.push('r.Status = ?'); params.push(status); }
  if (q) { where.push(`(r.Request_Title LIKE ? ESCAPE '\\' OR r.Request_Description LIKE ? ESCAPE '\\')`); params.push(likeContains(q), likeContains(q)); }

  const browse = all(
    `SELECT r.*, rc.Category_Name, u.Full_Name AS owner_name
       FROM Request r
       JOIN Request_Category rc ON rc.Request_Category_ID = r.Request_Category_ID
       JOIN "User" u ON u.User_ID = r.User_ID
      WHERE ${where.join(' AND ')}
      ORDER BY (r.Status='OPEN') DESC,
        CASE r.Priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        r.Created_At DESC
      LIMIT 100`,
    params
  );
  const mine = all(
    `SELECT r.*, rc.Category_Name FROM Request r
       JOIN Request_Category rc ON rc.Request_Category_ID = r.Request_Category_ID
      WHERE r.User_ID = ? ORDER BY r.Created_At DESC`,
    [uid]
  );
  res.render('requests/index', {
    title: 'Requests', categories, browse, mine, catId, status, q, PRIORITIES, STATUSES,
  });
});

router.get('/new', (req, res) => {
  res.render('requests/new', {
    title: 'Raise a request',
    categories: all(`SELECT * FROM Request_Category ORDER BY Category_Name`),
    PRIORITIES, form: { category: req.query.category || '' },
  });
});

router.post('/', (req, res) => {
  const categoryId = parseInt(req.body.category_id, 10);
  const title = clean(req.body.title);
  const desc = clean(req.body.description);
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'MEDIUM';
  const cat = categoryId && get(`SELECT * FROM Request_Category WHERE Request_Category_ID = ?`, [categoryId]);
  if (!cat || !title || !desc) {
    req.flash('error', 'Category, title and description are all required.');
    return res.redirect('/requests/new');
  }
  const t = nowIso();
  const id = run(
    `INSERT INTO Request (Request_Category_ID, User_ID, Request_Title, Request_Description, Priority, Status, Created_At, Updated_At)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [categoryId, req.currentUser.User_ID, title, desc, priority, t, t]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Request', id);
  req.flash('success', 'Request posted. Campus can now see it and respond.');
  res.redirect('/requests/' + id);
});

router.get('/:id', (req, res) => {
  const r = get(
    `SELECT r.*, rc.Category_Name, rc.Description AS category_description,
            u.Full_Name AS owner_name, u.User_ID AS owner_id
       FROM Request r
       JOIN Request_Category rc ON rc.Request_Category_ID = r.Request_Category_ID
       JOIN "User" u ON u.User_ID = r.User_ID
      WHERE r.Request_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!r) return res.status(404).render('error', { title: 'Not found', message: 'No such request.' });
  const isOwner = r.owner_id === req.currentUser.User_ID;
  res.render('requests/show', { title: r.Request_Title, r, isOwner, PRIORITIES, STATUSES });
});

router.post('/:id/status', (req, res) => {
  const r = get(`SELECT * FROM Request WHERE Request_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!r) return res.redirect('/requests');
  const isOwner = r.User_ID === req.currentUser.User_ID;
  if (!isOwner && req.currentUser.role !== 'staff') {
    return res.status(403).render('error', { title: 'Not allowed', message: 'Only the requester (or campus staff) can update this.' });
  }
  const status = STATUSES.includes(req.body.status) ? req.body.status : r.Status;
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : r.Priority;
  run(`UPDATE Request SET Status = ?, Priority = ?, Updated_At = ? WHERE Request_ID = ?`,
    [status, priority, nowIso(), r.Request_ID]);
  audit(req, 'UPDATE', 'Request', r.Request_ID);
  req.flash('success', 'Request updated.');
  res.redirect('/requests/' + r.Request_ID);
});

// respond / offer help / offer to join a carpool
router.post('/:id/offer', (req, res) => {
  const r = get(
    `SELECT r.*, u.Full_Name AS owner_name FROM Request r JOIN "User" u ON u.User_ID = r.User_ID WHERE r.Request_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!r) return res.redirect('/requests');
  if (r.User_ID === req.currentUser.User_ID) { req.flash('info', 'This is your own request.'); return res.redirect('/requests/' + r.Request_ID); }
  const note = clean(req.body.note);
  notify(
    r.User_ID,
    'Someone responded to your request',
    `${req.currentUser.Full_Name} offered to help with "${r.Request_Title}".` + (note ? ` Note: ${note}` : '') +
      ` Reply at /u/${req.currentUser.User_ID} or via Messages.`,
    'REQUEST'
  );
  if (r.Status === 'OPEN') run(`UPDATE Request SET Status='IN_PROGRESS', Updated_At=? WHERE Request_ID=?`, [nowIso(), r.Request_ID]);
  audit(req, 'RESPOND', 'Request', r.Request_ID);
  req.flash('success', `Your offer was sent to ${r.owner_name}.`);
  res.redirect('/requests/' + r.Request_ID);
});

module.exports = router;
