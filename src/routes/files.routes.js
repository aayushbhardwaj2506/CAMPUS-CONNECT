'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso } = require('../lib/util');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const TYPES = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'Image', 'Code / ZIP', 'Video', 'Other'];

router.get('/', (req, res) => {
  const uid = req.currentUser.User_ID;
  const files = all(
    `SELECT File_ID, File_Name, File_Type, File_Size, Uploaded_At
       FROM "File" WHERE User_ID = ? ORDER BY Uploaded_At DESC`,
    [uid]
  );
  const totalBytes = files.reduce((s, f) => s + (f.File_Size || 0), 0);
  res.render('files/index', { title: 'Files', files, totalBytes, types: TYPES });
});

router.post('/', (req, res) => {
  const name = clean(req.body.file_name);
  const type = clean(req.body.file_type) || 'Other';
  let size = parseInt(req.body.file_size, 10);
  if (!Number.isFinite(size) || size < 0) size = 0;
  if (!name) { req.flash('error', 'File needs a name.'); return res.redirect('/files'); }
  const safe = name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-');
  const id = run(
    `INSERT INTO "File" (User_ID, File_Name, File_Type, File_Size, Storage_Path, Uploaded_At)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.currentUser.User_ID, name, type, size, `/vault/${req.currentUser.User_ID}/${Date.now()}-${safe}`, nowIso()]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'File', id);
  req.flash('success', 'File registered in your vault.');
  res.redirect('/files');
});

router.post('/:id/delete', (req, res) => {
  const f = get(`SELECT * FROM "File" WHERE File_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!f) return res.redirect('/files');
  if (f.User_ID !== req.currentUser.User_ID) return res.status(403).render('error', { title: 'Not allowed', message: 'You can only remove your own files.' });
  run(`DELETE FROM "File" WHERE File_ID = ?`, [f.File_ID]);
  audit(req, 'DELETE', 'File', f.File_ID);
  req.flash('success', 'File removed.');
  res.redirect('/files');
});

module.exports = router;
