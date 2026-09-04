'use strict';
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { clean, nowIso, isoPlusHours } = require('../lib/util');
const { audit } = require('../lib/audit');
const { notify, notifyMany } = require('../lib/notify');
const { feedPosts, activeStories } = require('../lib/queries');

const router = express.Router();
router.use(requireAuth);

const REACTIONS = ['LIKE', 'CELEBRATE', 'SUPPORT', 'INSIGHTFUL', 'CURIOUS'];

// ---- feed list -------------------------------------------------------
router.get('/', (req, res) => {
  const posts = feedPosts(req.currentUser.User_ID, { limit: 40 });
  const stories = activeStories(15);
  res.render('feed/index', { title: 'Feed', posts, stories, reactions: REACTIONS });
});

// ---- create post --------------------------------------------------
router.post('/', (req, res) => {
  const content = clean(req.body.content);
  const title = clean(req.body.title) || null;
  const visibility = ['PUBLIC', 'CAMPUS', 'PRIVATE'].includes(req.body.visibility) ? req.body.visibility : 'CAMPUS';
  if (!content) {
    req.flash('error', 'Write something before posting.');
    return res.redirect('back');
  }
  const t = nowIso();
  const id = run(
    `INSERT INTO Post (User_ID, Title, Content, Visibility, Created_At, Updated_At) VALUES (?,?,?,?,?,?)`,
    [req.currentUser.User_ID, title, content, visibility, t, t]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Post', id);
  req.flash('success', 'Posted.');
  res.redirect('/feed');
});

// ---- create story ----------------------------------------------
router.post('/stories', (req, res) => {
  const caption = clean(req.body.caption);
  const media = clean(req.body.media_url) || `https://picsum.photos/seed/s${Date.now()}/480/720`;
  if (!caption && !clean(req.body.media_url)) {
    req.flash('error', 'Add a caption or a media URL for your story.');
    return res.redirect('back');
  }
  const t = nowIso();
  const id = run(
    `INSERT INTO Story (User_ID, Media_URL, Caption, Visibility, Expires_At, Created_At) VALUES (?,?,?,?,?,?)`,
    [req.currentUser.User_ID, media, caption || null, 'CAMPUS', isoPlusHours(24), t]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Story', id);
  req.flash('success', 'Story added — it will disappear in 24 hours.');
  res.redirect('back');
});

// ---- single post + comments ----------------------------------
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = get(
    `SELECT p.*, u.Full_Name AS author_name, u.User_ID AS author_id, pr.Profile_Image AS author_img
       FROM Post p JOIN "User" u ON u.User_ID = p.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = p.User_ID
      WHERE p.Post_ID = ?`,
    [id]
  );
  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'That post does not exist.' });
  if (post.Visibility === 'PRIVATE' && post.author_id !== req.currentUser.User_ID) {
    return res.status(403).render('error', { title: 'Private', message: 'This post is private.' });
  }
  const comments = all(
    `SELECT c.*, u.Full_Name AS author_name, u.User_ID AS author_id, pr.Profile_Image AS author_img
       FROM Comment c JOIN "User" u ON u.User_ID = c.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = c.User_ID
      WHERE c.Post_ID = ? ORDER BY c.Created_At ASC`,
    [id]
  );
  const reactions = all(
    `SELECT r.Reaction_Type, u.Full_Name, u.User_ID FROM Reaction r
       JOIN "User" u ON u.User_ID = r.User_ID WHERE r.Post_ID = ? ORDER BY r.Reacted_At DESC`,
    [id]
  );
  const myReaction = (reactions.find((r) => r.User_ID === req.currentUser.User_ID) || {}).Reaction_Type || null;
  res.render('feed/post', { title: post.Title || 'Post', post, comments, reactions, myReaction, reactionTypes: REACTIONS });
});

// ---- edit post -----------------------------------------------
router.get('/:id/edit', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'No such post.' });
  if (post.User_ID !== req.currentUser.User_ID) {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You can only edit your own posts.' });
  }
  res.render('feed/edit', { title: 'Edit post', post });
});

router.post('/:id/edit', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post || post.User_ID !== req.currentUser.User_ID) {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You can only edit your own posts.' });
  }
  const content = clean(req.body.content);
  if (!content) { req.flash('error', 'Post cannot be empty.'); return res.redirect('back'); }
  run(`UPDATE Post SET Title = ?, Content = ?, Visibility = ?, Updated_At = ? WHERE Post_ID = ?`, [
    clean(req.body.title) || null,
    content,
    ['PUBLIC', 'CAMPUS', 'PRIVATE'].includes(req.body.visibility) ? req.body.visibility : post.Visibility,
    nowIso(),
    post.Post_ID,
  ]);
  audit(req, 'UPDATE', 'Post', post.Post_ID);
  req.flash('success', 'Post updated.');
  res.redirect('/feed/' + post.Post_ID);
});

router.post('/:id/delete', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post) return res.redirect('/feed');
  const canDelete = post.User_ID === req.currentUser.User_ID || req.currentUser.role === 'staff';
  if (!canDelete) return res.status(403).render('error', { title: 'Not allowed', message: 'You cannot delete this post.' });
  run(`DELETE FROM Reaction WHERE Post_ID = ?`, [post.Post_ID]);
  run(`DELETE FROM Comment WHERE Post_ID = ?`, [post.Post_ID]);
  run(`DELETE FROM Post WHERE Post_ID = ?`, [post.Post_ID]);
  audit(req, 'DELETE', 'Post', post.Post_ID);
  req.flash('success', 'Post deleted.');
  res.redirect('/feed');
});

// ---- comment -----------------------------------------------
router.post('/:id/comment', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post) return res.status(404).render('error', { title: 'Not found', message: 'No such post.' });
  const text = clean(req.body.text);
  if (!text) { req.flash('error', 'Comment cannot be empty.'); return res.redirect('/feed/' + post.Post_ID); }
  const t = nowIso();
  const id = run(
    `INSERT INTO Comment (Post_ID, User_ID, Comment_Text, Created_At, Updated_At) VALUES (?,?,?,?,?)`,
    [post.Post_ID, req.currentUser.User_ID, text, t, t]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Comment', id);
  if (post.User_ID !== req.currentUser.User_ID) {
    notify(post.User_ID, 'New comment on your post',
      `${req.currentUser.Full_Name} commented on your post.`, 'SOCIAL');
  }
  res.redirect('/feed/' + post.Post_ID + '#c' + id);
});

router.post('/comments/:cid/edit', (req, res) => {
  const c = get(`SELECT * FROM Comment WHERE Comment_ID = ?`, [parseInt(req.params.cid, 10)]);
  if (!c || c.User_ID !== req.currentUser.User_ID) {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You can only edit your own comments.' });
  }
  const text = clean(req.body.text);
  if (text) {
    run(`UPDATE Comment SET Comment_Text = ?, Updated_At = ? WHERE Comment_ID = ?`, [text, nowIso(), c.Comment_ID]);
    audit(req, 'UPDATE', 'Comment', c.Comment_ID);
  }
  res.redirect('/feed/' + c.Post_ID);
});

router.post('/comments/:cid/delete', (req, res) => {
  const c = get(`SELECT * FROM Comment WHERE Comment_ID = ?`, [parseInt(req.params.cid, 10)]);
  if (!c) return res.redirect('back');
  if (c.User_ID !== req.currentUser.User_ID && req.currentUser.role !== 'staff') {
    return res.status(403).render('error', { title: 'Not allowed', message: 'You cannot delete this comment.' });
  }
  run(`DELETE FROM Comment WHERE Comment_ID = ?`, [c.Comment_ID]);
  audit(req, 'DELETE', 'Comment', c.Comment_ID);
  res.redirect('/feed/' + c.Post_ID);
});

// ---- react (toggle) --------------------------------------
router.post('/:id/react', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post) return res.redirect('/feed');
  const type = REACTIONS.includes(req.body.type) ? req.body.type : 'LIKE';
  const existing = get(`SELECT * FROM Reaction WHERE Post_ID = ? AND User_ID = ?`, [post.Post_ID, req.currentUser.User_ID]);
  if (existing && existing.Reaction_Type === type) {
    run(`DELETE FROM Reaction WHERE Reaction_ID = ?`, [existing.Reaction_ID]);       // toggle off
  } else if (existing) {
    run(`UPDATE Reaction SET Reaction_Type = ?, Reacted_At = ? WHERE Reaction_ID = ?`, [type, nowIso(), existing.Reaction_ID]);
  } else {
    run(`INSERT INTO Reaction (Post_ID, User_ID, Reaction_Type, Reacted_At) VALUES (?,?,?,?)`,
      [post.Post_ID, req.currentUser.User_ID, type, nowIso()]);
    if (post.User_ID !== req.currentUser.User_ID) {
      notify(post.User_ID, 'New reaction',
        `${req.currentUser.Full_Name} reacted "${type.toLowerCase()}" to your post.`, 'SOCIAL');
    }
  }
  const back = req.get('referer') || '/feed';
  res.redirect(back.includes('/feed/' + post.Post_ID) ? '/feed/' + post.Post_ID : back);
});

// ---- report content ------------------------------------
router.post('/:id/report', (req, res) => {
  const post = get(`SELECT * FROM Post WHERE Post_ID = ?`, [parseInt(req.params.id, 10)]);
  if (!post) return res.redirect('/feed');
  const reason = clean(req.body.reason) || 'No reason given';
  const id = run(
    `INSERT INTO Report (User_ID, Report_Type, Report_Reason, Report_Status, Submitted_At, Resolved_At)
     VALUES (?, 'POST', ?, 'OPEN', ?, NULL)`,
    [req.currentUser.User_ID, `Post #${post.Post_ID}: ${reason}`, nowIso()]
  ).lastInsertRowid;
  audit(req, 'CREATE', 'Report', id);
  req.flash('success', 'Report submitted to the moderation desk.');
  res.redirect('/feed/' + post.Post_ID);
});

module.exports = router;
