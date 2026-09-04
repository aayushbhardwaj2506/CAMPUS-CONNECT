'use strict';
const { run } = require('../db');
const { nowIso } = require('./util');

/**
 * Create a NOTIFICATION for one user.
 * type: SYSTEM | GROUP | SOCIAL | ACADEMIC | REQUEST | REPORT | PROJECT | COMMUNITY
 */
function notify(userId, title, message, type = 'SYSTEM') {
  if (!userId) return;
  run(
    `INSERT INTO Notification
       (User_ID, Notification_Title, Notification_Message, Notification_Type, Is_Read, Created_At)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [userId, title, message, type, nowIso()]
  );
}

/** Notify every user id in the list (deduplicated, skips falsy). */
function notifyMany(userIds, title, message, type = 'SYSTEM') {
  const seen = new Set();
  for (const id of userIds || []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    notify(id, title, message, type);
  }
}

module.exports = { notify, notifyMany };
