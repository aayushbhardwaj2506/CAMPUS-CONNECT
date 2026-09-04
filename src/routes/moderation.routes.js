'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify } = require('../lib/notify');

const router = express.Router();

const R_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];
const R_TYPES = ['POST', 'COMMENT', 'USER', 'GROUP', 'MESSAGE', 'BUG', 'OTHER'];

// ---- anyone can file a report -------------------------------------
router.post('/report', requireAuth, (req, res) => {
  const type = R_TYPES.includes(req.body.type) ? req.body.type : 'OTHER';
  const reason = clean(req.body.reason);
  const ref = clean(req.body.ref);
  if (!reason) { req.flash('error', 'Please describe the problem.'); return res.redirect(req.get('referer') || '/'); }
  const id = run(
    `INSERT INTO Report (User_ID, Report_Type, Report_Reason, Report_Status, Submitted_At, Resolved_At)
     VALUES (?, ?, ?, 'OPEN', ?, NULL)`,
    [req.currentUser.User_ID, type, (ref ? ref + ' — ' : '') + reason, nowIso()]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Report', id);
  req.flash('success', 'Report submitted to the moderation desk. Thank you.');
  res.redirect(req.get('referer') || '/');
});

// ---- moderation queue (staff only) --------------------------------
router.get('/moderation', requireAuth, requireRole('staff'), (req, res) => {
  const status = R_STATUSES.includes(req.query.status) ? req.query.status : null;
  const rows = all(
    `SELECT rp.*, u.Full_Name AS reporter_name
       FROM Report rp JOIN "User" u ON u.User_ID = rp.User_ID
      ${status ? 'WHERE rp.Report_Status = ?' : ''}
      ORDER BY (rp.Report_Status IN ('OPEN','REVIEWING')) DESC, rp.Submitted_At DESC`,
    status ? [status] : []
  );
  const counts = {};
  all(`SELECT Report_Status AS s, COUNT(*) AS n FROM Report GROUP BY Report_Status`).forEach((r) => (counts[r.s] = r.n));
  res.render('moderation/index', { title: 'Moderation', rows, status, counts, statuses: R_STATUSES });
});

router.get('/moderation/:id', requireAuth, requireRole('staff'), (req, res) => {
  const rp = get(
    `SELECT rp.*, u.Full_Name AS reporter_name, u.User_ID AS reporter_id
       FROM Report rp JOIN "User" u ON u.User_ID = rp.User_ID WHERE rp.Report_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!rp) return res.status(404).render('error', { title: 'Not found', message: 'No such report.' });
  res.render('moderation/show', { title: 'Report #' + rp.Report_ID, rp, statuses: R_STATUSES });
});

router.post('/moderation/:id/status', requireAuth, requireRole('staff'), (req, res) => {
  const rp = get(`SELECT * FROM Report WHERE Report_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!rp) return res.redirect('/moderation');
  const status = R_STATUSES.includes(req.body.status) ? req.body.status : rp.Report_Status;
  const resolved = status === 'RESOLVED' || status === 'DISMISSED';
  run(`UPDATE Report SET Report_Status = ?, Resolved_At = ? WHERE Report_ID = ?`,
    [status, resolved ? nowIso() : null, rp.Report_ID]);
  audit(req, 'MODERATE', 'Report', rp.Report_ID);
  notify(rp.User_ID, 'Update on your report',
    `A moderator set your report (#${rp.Report_ID}) to ${status}.`, 'REPORT');
  req.flash('success', `Report marked ${status}.`);
  res.redirect('/moderation/' + rp.Report_ID);
});

// ---- audit log viewer (staff only) ------------------------------
router.get('/audit', requireAuth, requireRole('staff'), (req, res) => {
  const action = clean(req.query.action);
  const entity = clean(req.query.entity);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 50;
  const where = ['1=1'];
  const params = [];
  if (action) { where.push('a.Action_Type = ?'); params.push(action); }
  if (entity) { where.push('a.Entity_Name = ?'); params.push(entity); }
  const total = get(`SELECT COUNT(*) AS n FROM Audit_Log a WHERE ${where.join(' AND ')}`, params).n;
  const rows = all(
    `SELECT a.*, u.Full_Name FROM Audit_Log a JOIN "User" u ON u.User_ID = a.User_ID
      WHERE ${where.join(' AND ')}
      ORDER BY a.Action_Time DESC, a.Audit_Log_ID DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  );
  const actions = all(`SELECT DISTINCT Action_Type AS v FROM Audit_Log ORDER BY v`).map((r) => r.v);
  const entities = all(`SELECT DISTINCT Entity_Name AS v FROM Audit_Log WHERE Entity_Name IS NOT NULL ORDER BY v`).map((r) => r.v);
  res.render('moderation/audit', {
    title: 'Audit log', rows, actions, entities, action, entity,
    page, perPage, total, pages: Math.max(1, Math.ceil(total / perPage)),
  });
});

module.exports = router;
