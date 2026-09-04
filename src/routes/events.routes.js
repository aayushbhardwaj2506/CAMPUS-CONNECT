'use strict';
const express = require('express');
const { get, all } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const scope = req.query.when === 'past' ? 'past' : 'upcoming';
  const cmp = scope === 'past' ? '<' : '>=';
  const order = scope === 'past' ? 'DESC' : 'ASC';
  const rows = all(
    `SELECT e.*, c.Community_ID, c.Community_Name, c.Community_Type
       FROM Event e JOIN Community c ON c.Community_ID = e.Community_ID
      WHERE date(e.Event_Date) ${cmp} date('now')
      ORDER BY e.Event_Date ${order}, e.Event_Time ${order}`
  );
  res.render('events/index', { title: 'Events', rows, scope });
});

router.get('/:id', (req, res) => {
  const e = get(
    `SELECT e.*, c.Community_ID, c.Community_Name, c.Community_Type
       FROM Event e JOIN Community c ON c.Community_ID = e.Community_ID
      WHERE e.Event_ID = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (!e) return res.status(404).render('error', { title: 'Not found', message: 'No such event.' });
  const isMember = !!get(
    `SELECT 1 FROM Community_Membership WHERE Community_ID = ? AND User_ID = ? AND Membership_Status='ACTIVE'`,
    [e.Community_ID, req.currentUser.User_ID]
  );
  res.render('events/show', { title: e.Event_Title, e, isMember });
});

module.exports = router;
