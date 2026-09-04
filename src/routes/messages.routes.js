'use strict';
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso, likeContains } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

function isParticipant(convId, userId) {
  return !!get(
    `SELECT 1 FROM Conversation_Participant WHERE Conversation_ID = ? AND User_ID = ?`,
    [convId, userId]
  );
}

/** Find an existing 1:1 DIRECT conversation between exactly these two users. */
function findDirect(a, b) {
  return get(
    `SELECT c.* FROM Conversation c
      WHERE c.Conversation_Type = 'DIRECT'
        AND (SELECT COUNT(*) FROM Conversation_Participant p WHERE p.Conversation_ID = c.Conversation_ID) = 2
        AND EXISTS (SELECT 1 FROM Conversation_Participant p WHERE p.Conversation_ID = c.Conversation_ID AND p.User_ID = ?)
        AND EXISTS (SELECT 1 FROM Conversation_Participant p WHERE p.Conversation_ID = c.Conversation_ID AND p.User_ID = ?)
      LIMIT 1`,
    [a, b]
  );
}

// ---- inbox ---------------------------------------------------------
router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const convos = all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM Message m WHERE m.Conversation_ID = c.Conversation_ID) AS msg_count,
       (SELECT m.Message_Content FROM Message m WHERE m.Conversation_ID = c.Conversation_ID ORDER BY m.Sent_At DESC LIMIT 1) AS last_msg,
       (SELECT m.Sent_At FROM Message m WHERE m.Conversation_ID = c.Conversation_ID ORDER BY m.Sent_At DESC LIMIT 1) AS last_at
     FROM Conversation c
     WHERE c.Conversation_ID IN (SELECT Conversation_ID FROM Conversation_Participant WHERE User_ID = ?)
     ORDER BY COALESCE(
       (SELECT m.Sent_At FROM Message m WHERE m.Conversation_ID = c.Conversation_ID ORDER BY m.Sent_At DESC LIMIT 1),
       c.Created_At) DESC`,
    [uid]
  );
  for (const c of convos) {
    if (c.Conversation_Type === 'DIRECT') {
      const other = get(
        `SELECT u.User_ID, u.Full_Name, pr.Profile_Image FROM Conversation_Participant p
           JOIN "User" u ON u.User_ID = p.User_ID
           LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
          WHERE p.Conversation_ID = ? AND p.User_ID <> ? LIMIT 1`,
        [c.Conversation_ID, uid]
      );
      c.display = other ? other.Full_Name : (c.Title || 'Direct message');
      c.other = other;
    } else {
      c.display = c.Title || 'Group conversation';
    }
  }
  res.render('messages/index', { title: 'Messages', convos });
});

// ---- start a new conversation ----------------------------------
router.get('/new', (req, res) => {
  const q = clean(req.query.q);
  const to = parseInt(req.query.to, 10) || null;
  let people = [];
  if (q) {
    people = all(
      `SELECT User_ID, Full_Name, Email FROM "User"
        WHERE User_ID <> ? AND (Full_Name LIKE ? ESCAPE '\\' OR Email LIKE ? ESCAPE '\\')
        ORDER BY Full_Name LIMIT 15`,
      [req.currentUser.User_ID, likeContains(q), likeContains(q)]
    );
  }
  const toUser = to ? get(`SELECT User_ID, Full_Name FROM "User" WHERE User_ID = ?`, [to]) : null;
  res.render('messages/new', { title: 'New message', q, people, toUser });
});

router.post('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const toId = parseInt(req.body.to, 10);
  const body = clean(req.body.body);
  const other = toId && get(`SELECT * FROM "User" WHERE User_ID = ?`, [toId]);
  if (!other || toId === uid) { req.flash('error', 'Pick someone to message.'); return res.redirect('/messages/new'); }
  if (!body) { req.flash('error', 'Write a message.'); return res.redirect('/messages/new?to=' + toId); }

  const convId = tx(() => {
    let c = findDirect(uid, toId);
    if (!c) {
      const id = run(
        `INSERT INTO Conversation (Conversation_Type, Title, Created_At, Group_ID) VALUES ('DIRECT', NULL, ?, NULL)`,
        [nowIso()]
      ).lastInsertRowid;
      run(`INSERT INTO Conversation_Participant (Conversation_ID, User_ID, Joined_At) VALUES (?,?,?)`, [id, uid, nowIso()]);
      run(`INSERT INTO Conversation_Participant (Conversation_ID, User_ID, Joined_At) VALUES (?,?,?)`, [id, toId, nowIso()]);
      c = { Conversation_ID: id };
    }
    run(
      `INSERT INTO Message (Conversation_ID, User_ID, Message_Content, Message_Type, Sent_At, Edited_At)
       VALUES (?, ?, ?, 'TEXT', ?, NULL)`,
      [c.Conversation_ID, uid, body, nowIso()]
    );
    return c.Conversation_ID;
  });
  audit(req, 'MESSAGE', 'Conversation', convId);
  notify(toId, 'New message', `${req.currentUser.Full_Name} sent you a message.`, 'SOCIAL');
  res.redirect('/messages/' + convId);
});

// ---- thread ---------------------------------------------------
router.get('/:id', (req, res) => {
  const c = get(`SELECT * FROM Conversation WHERE Conversation_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.status(404).render('error', { title: 'Not found', message: 'No such conversation.' });
  const uid = req.currentUser.User_ID;
  if (!isParticipant(c.Conversation_ID, uid)) {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You are not in this conversation.' });
  }
  const participants = all(
    `SELECT u.User_ID, u.Full_Name, pr.Profile_Image FROM Conversation_Participant p
       JOIN "User" u ON u.User_ID = p.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
      WHERE p.Conversation_ID = ? ORDER BY u.Full_Name`,
    [c.Conversation_ID]
  );
  const messages = all(
    `SELECT m.*, u.Full_Name, pr.Profile_Image FROM Message m
       JOIN "User" u ON u.User_ID = m.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
      WHERE m.Conversation_ID = ? ORDER BY m.Sent_At ASC`,
    [c.Conversation_ID]
  );
  let heading = c.Title;
  if (c.Conversation_Type === 'DIRECT') {
    const other = participants.find((p) => p.User_ID !== uid);
    heading = other ? other.Full_Name : 'Direct message';
  } else if (!heading) heading = 'Group conversation';
  res.render('messages/thread', { title: heading, c, heading, participants, messages });
});

router.post('/:id/messages', (req, res) => {
  const c = get(`SELECT * FROM Conversation WHERE Conversation_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!c) return res.redirect('/messages');
  const uid = req.currentUser.User_ID;
  if (!isParticipant(c.Conversation_ID, uid)) {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You are not in this conversation.' });
  }
  const body = clean(req.body.body);
  if (!body) return res.redirect('/messages/' + c.Conversation_ID);
  run(
    `INSERT INTO Message (Conversation_ID, User_ID, Message_Content, Message_Type, Sent_At, Edited_At)
     VALUES (?, ?, ?, 'TEXT', ?, NULL)`,
    [c.Conversation_ID, uid, body, nowIso()]
  );
  audit(req, 'MESSAGE', 'Conversation', c.Conversation_ID);
  all(`SELECT User_ID FROM Conversation_Participant WHERE Conversation_ID = ? AND User_ID <> ?`, [c.Conversation_ID, uid])
    .forEach((p) => notify(p.User_ID, 'New message', `${req.currentUser.Full_Name}: ${body.slice(0, 80)}`, 'SOCIAL'));
  res.redirect('/messages/' + c.Conversation_ID + '#end');
});

module.exports = router;
