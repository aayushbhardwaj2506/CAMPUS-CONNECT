'use strict';
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso, likeContains } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

function loadProject(id) {
  return get(
    `SELECT pj.*, u.Full_Name AS owner_name, u.User_ID AS owner_id
       FROM Project pj JOIN "User" u ON u.User_ID = pj.User_ID WHERE pj.Project_ID = ?`,
    [id]
  );
}
function teamsFor(projectId) {
  const teams = all(`SELECT * FROM Project_Team WHERE Project_ID = ? ORDER BY Created_At`, [projectId]);
  for (const t of teams) {
    t.members = all(
      `SELECT pm.*, u.Full_Name, u.User_ID, pr.Profile_Image
         FROM Project_Membership pm JOIN "User" u ON u.User_ID = pm.User_ID
         LEFT JOIN Profile pr ON pr.User_ID = u.User_ID
        WHERE pm.Project_Team_ID = ?
        ORDER BY (pm.Team_Role = 'LEAD') DESC, pm.Membership_Status, u.Full_Name`,
      [t.Project_Team_ID]
    );
  }
  return teams;
}

// ---- list / discover -------------------------------------------------
router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const q = clean(req.query.q);
  const mine = all(
    `SELECT DISTINCT pj.*, u.Full_Name AS owner_name,
       (pj.User_ID = ?) AS is_owner
       FROM Project pj JOIN "User" u ON u.User_ID = pj.User_ID
       LEFT JOIN Project_Team pt ON pt.Project_ID = pj.Project_ID
       LEFT JOIN Project_Membership pm ON pm.Project_Team_ID = pt.Project_Team_ID AND pm.User_ID = ?
      WHERE pj.User_ID = ? OR pm.User_ID = ?
      ORDER BY pj.Start_Date DESC`,
    [uid, uid, uid, uid]
  );
  const mineIds = new Set(mine.map((p) => p.Project_ID));
  let discover = all(
    `SELECT pj.*, u.Full_Name AS owner_name,
       (SELECT COUNT(*) FROM Project_Team pt WHERE pt.Project_ID = pj.Project_ID) AS team_count
       FROM Project pj JOIN "User" u ON u.User_ID = pj.User_ID
      ${q ? `WHERE pj.Project_Name LIKE ? ESCAPE '\\' OR pj.Description LIKE ? ESCAPE '\\' OR pj.Project_Status LIKE ? ESCAPE '\\'` : ''}
      ORDER BY pj.Start_Date DESC LIMIT 50`,
    q ? [likeContains(q), likeContains(q), likeContains(q)] : []
  ).filter((p) => !mineIds.has(p.Project_ID));
  res.render('projects/index', { title: 'Projects', mine, discover, q, statuses: STATUSES });
});

router.get('/new', (req, res) => {
  res.render('projects/new', { title: 'New project', statuses: STATUSES, form: {} });
});

router.post('/', (req, res) => {
  const name = clean(req.body.name);
  if (!name) { req.flash('error', 'Project needs a name.'); return res.redirect('/projects/new'); }
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'PLANNING';
  const id = tx(() => {
    const pid = run(
      `INSERT INTO Project (User_ID, Project_Name, Description, Start_Date, End_Date, Project_Status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.currentUser.User_ID, name, clean(req.body.description) || null,
       clean(req.body.start_date) || null, clean(req.body.end_date) || null, status]
    ).lastInsertRowid;
    const tid = run(
      `INSERT INTO Project_Team (Project_ID, Team_Name, Team_Description, Created_At) VALUES (?, 'Core Team', ?, ?)`,
      [pid, 'Default team for ' + name, nowIso()]
    ).lastInsertRowid;
    run(
      `INSERT INTO Project_Membership (Project_Team_ID, User_ID, Team_Role, Joined_At, Membership_Status)
       VALUES (?, ?, 'LEAD', ?, 'ACTIVE')`,
      [tid, req.currentUser.User_ID, nowIso()]
    );
    return pid;
  });
  audit(req, 'CREATE', 'Project', id);
  req.flash('success', 'Project created with a Core Team.');
  res.redirect('/projects/' + id);
});

// ---- detail ---------------------------------------------------
router.get('/:id', (req, res) => {
  const pj = loadProject(parseInt(req.params.id, 10));
  if (!pj) return res.status(404).render('error', { title: 'Not found', message: 'No such project.' });
  const teams = teamsFor(pj.Project_ID);
  const uid = req.currentUser.User_ID;
  const isOwner = pj.owner_id === uid;
  const myMemberships = {};
  teams.forEach((t) => {
    const m = t.members.find((x) => x.User_ID === uid);
    if (m) myMemberships[t.Project_Team_ID] = m;
  });
  res.render('projects/show', { title: pj.Project_Name, pj, teams, isOwner, myMemberships, statuses: STATUSES });
});

router.post('/:id/status', (req, res) => {
  const pj = loadProject(parseInt(req.params.id, 10));
  if (!pj) return res.redirect('/projects');
  if (pj.owner_id !== req.currentUser.User_ID) return res.status(403).render('error', { title: 'Not allowed', message: 'Only the owner can change project status.' });
  const status = STATUSES.includes(req.body.status) ? req.body.status : pj.Project_Status;
  run(`UPDATE Project SET Project_Status = ?, End_Date = ? WHERE Project_ID = ?`,
    [status, clean(req.body.end_date) || pj.End_Date, pj.Project_ID]);
  audit(req, 'UPDATE', 'Project', pj.Project_ID);
  req.flash('success', 'Project updated.');
  res.redirect('/projects/' + pj.Project_ID);
});

router.post('/:id/teams', (req, res) => {
  const pj = loadProject(parseInt(req.params.id, 10));
  if (!pj) return res.redirect('/projects');
  if (pj.owner_id !== req.currentUser.User_ID) return res.status(403).render('error', { title: 'Not allowed', message: 'Only the owner can add teams.' });
  const name = clean(req.body.team_name);
  if (!name) { req.flash('error', 'Team needs a name.'); return res.redirect('/projects/' + pj.Project_ID); }
  const tid = run(
    `INSERT INTO Project_Team (Project_ID, Team_Name, Team_Description, Created_At) VALUES (?,?,?,?)`,
    [pj.Project_ID, name, clean(req.body.team_description) || null, nowIso()]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Project_Team', tid);
  req.flash('success', 'Team added.');
  res.redirect('/projects/' + pj.Project_ID);
});

// ---- co-work: request to join a team ------------------------
router.post('/teams/:tid/join', (req, res) => {
  const t = get(
    `SELECT pt.*, pj.Project_ID, pj.Project_Name, pj.User_ID AS owner_id
       FROM Project_Team pt JOIN Project pj ON pj.Project_ID = pt.Project_ID
      WHERE pt.Project_Team_ID = ?`,
    [parseInt(req.params.tid, 10)]
  );
  if (!t) return res.redirect('/projects');
  const uid = req.currentUser.User_ID;
  const ex = get(`SELECT * FROM Project_Membership WHERE Project_Team_ID = ? AND User_ID = ?`, [t.Project_Team_ID, uid]);
  if (ex && ex.Membership_Status === 'ACTIVE') { req.flash('info', 'You are already on this team.'); return res.redirect('/projects/' + t.Project_ID); }
  const status = t.owner_id === uid ? 'ACTIVE' : 'PENDING';
  if (ex) run(`UPDATE Project_Membership SET Membership_Status = ?, Team_Role = COALESCE(Team_Role,'MEMBER') WHERE Project_Membership_ID = ?`, [status, ex.Project_Membership_ID]);
  else run(
    `INSERT INTO Project_Membership (Project_Team_ID, User_ID, Team_Role, Joined_At, Membership_Status)
     VALUES (?, ?, 'MEMBER', ?, ?)`,
    [t.Project_Team_ID, uid, nowIso(), status]
  );
  audit(req, 'JOIN_REQUEST', 'Project_Team', t.Project_Team_ID);
  if (status === 'PENDING') {
    notify(t.owner_id, 'Request to co-work',
      `${req.currentUser.Full_Name} asked to join "${t.Team_Name}" on ${t.Project_Name}.`, 'PROJECT');
    req.flash('success', 'Request sent to the project owner.');
  } else {
    req.flash('success', 'You joined the team.');
  }
  res.redirect('/projects/' + t.Project_ID);
});

router.post('/members/:mid/approve', (req, res) => {
  const m = get(
    `SELECT pm.*, pt.Project_ID, pj.User_ID AS owner_id, u.Full_Name AS member_name, pt.Team_Name
       FROM Project_Membership pm
       JOIN Project_Team pt ON pt.Project_Team_ID = pm.Project_Team_ID
       JOIN Project pj ON pj.Project_ID = pt.Project_ID
       JOIN "User" u ON u.User_ID = pm.User_ID
      WHERE pm.Project_Membership_ID = ?`,
    [parseInt(req.params.mid, 10)]
  );
  if (!m) return res.redirect('/projects');
  if (m.owner_id !== req.currentUser.User_ID) return res.status(403).render('error', { title: 'Not allowed', message: 'Only the owner can approve members.' });
  const decision = req.body.decision === 'reject' ? 'REJECTED' : 'ACTIVE';
  run(`UPDATE Project_Membership SET Membership_Status = ? WHERE Project_Membership_ID = ?`, [decision, m.Project_Membership_ID]);
  audit(req, decision === 'ACTIVE' ? 'APPROVE' : 'REJECT', 'Project_Membership', m.Project_Membership_ID);
  notify(m.User_ID,
    decision === 'ACTIVE' ? 'You were added to a team' : 'Team request declined',
    `Your request to join ${m.Team_Name} was ${decision === 'ACTIVE' ? 'approved' : 'declined'}.`, 'PROJECT');
  req.flash('success', 'Done.');
  res.redirect('/projects/' + m.Project_ID);
});

router.post('/members/:mid/leave', (req, res) => {
  const m = get(
    `SELECT pm.*, pt.Project_ID FROM Project_Membership pm
       JOIN Project_Team pt ON pt.Project_Team_ID = pm.Project_Team_ID
      WHERE pm.Project_Membership_ID = ?`,
    [parseInt(req.params.mid, 10)]
  );
  if (!m) return res.redirect('/projects');
  if (m.User_ID !== req.currentUser.User_ID) return res.status(403).render('error', { title: 'Not allowed', message: 'You can only remove yourself.' });
  run(`UPDATE Project_Membership SET Membership_Status = 'LEFT' WHERE Project_Membership_ID = ?`, [m.Project_Membership_ID]);
  audit(req, 'LEAVE', 'Project_Team', m.Project_Team_ID);
  req.flash('success', 'You left the team.');
  res.redirect('/projects/' + m.Project_ID);
});

module.exports = router;
