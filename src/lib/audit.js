'use strict';
const { run } = require('../db');
const { nowIso } = require('./util');

/**
 * Append a row to AUDIT_LOG. `entity` is the polymorphic reference
 * (Entity_Name + Entity_ID) exactly as modelled in DA1.
 *
 * audit(req, 'LOGIN', 'User', userId)
 */
function audit(req, actionType, entityName, entityId) {
  try {
    const userId =
      (req && req.session && req.session.userId) ||
      (req && req.user && req.user.User_ID) ||
      null;
    if (!userId) return;
    const ip =
      (req && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress)) || null;
    run(
      `INSERT INTO Audit_Log (User_ID, Action_Type, Entity_Name, Entity_ID, Action_Time, IP_Address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, actionType, entityName || null, entityId || null, nowIso(), ip]
    );
  } catch (err) {
    // Auditing must never break the request.
    console.error('[audit] failed:', err.message);
  }
}

module.exports = { audit };
