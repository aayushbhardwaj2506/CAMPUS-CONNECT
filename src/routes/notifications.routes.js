'use strict';
const express = require('express');
const { all, run, get } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const filter = req.query.filter === 'unread' ? 'unread' : 'all';
  const rows = all(
    `SELECT * FROM Notification WHERE User_ID = ?
       ${filter === 'unread' ? 'AND Is_Read = 0' : ''}
     ORDER BY Created_At DESC LIMIT 100`,
    [req.currentUser.User_ID]
  );
  const unread = get(`SELECT COUNT(*) AS n FROM Notification WHERE User_ID = ? AND Is_Read = 0`, [req.currentUser.User_ID]).n;
  res.render('notifications/index', { title: 'Notifications', rows, filter, unread });
});

router.post('/:id/read', (req, res) => {
  run(`UPDATE Notification SET Is_Read = 1 WHERE Notification_ID = ? AND User_ID = ?`,
    [parseInt(req.params.id, 10), req.currentUser.User_ID]);
  res.redirect('/notifications');
});

router.post('/read-all', (req, res) => {
  run(`UPDATE Notification SET Is_Read = 1 WHERE User_ID = ? AND Is_Read = 0`, [req.currentUser.User_ID]);
  req.flash('success', 'All caught up.');
  res.redirect('/notifications');
});

module.exports = router;
