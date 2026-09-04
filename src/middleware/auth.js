'use strict';
const { get } = require('../db');
const { loadUser } = require('../lib/roles');

/** Adds req.flash(type,msg) and exposes queued messages to the next render. */
function flash(req, res, next) {
  if (!req.session.flash) req.session.flash = [];
  req.flash = (type, message) => req.session.flash.push({ type, message });
  res.locals.flash = req.session.flash;
  req.session.flash = [];
  next();
}

/** Loads the logged-in user (with role + academic identity) onto req/res. */
function attachUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.unreadCount = 0;
  res.locals.path = req.path;
  if (req.session && req.session.userId) {
    const u = loadUser(req.session.userId);
    if (u) {
      req.currentUser = u;
      res.locals.currentUser = u;
      const n = get(
        'SELECT COUNT(*) AS n FROM Notification WHERE User_ID = ? AND Is_Read = 0',
        [u.User_ID]
      );
      res.locals.unreadCount = n ? n.n : 0;
    } else {
      req.session.userId = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.currentUser) return next();
  req.flash('error', 'Please sign in to continue.');
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

/** requireRole('faculty') or requireRole('faculty','staff') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.currentUser) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login');
    }
    if (roles.includes(req.currentUser.role)) return next();
    res.status(403).render('error', {
      title: 'Not allowed',
      message: `This area is for ${roles.join(' / ')} accounts.`,
    });
  };
}

/** Blocks suspended / deactivated accounts from anything but logout. */
function requireActive(req, res, next) {
  if (
    req.currentUser &&
    req.currentUser.Account_Status &&
    req.currentUser.Account_Status !== 'ACTIVE'
  ) {
    if (req.path === '/logout') return next();
    return res.status(403).render('error', {
      title: 'Account ' + req.currentUser.Account_Status.toLowerCase(),
      message:
        'Your account is ' +
        req.currentUser.Account_Status.toLowerCase() +
        '. Contact a campus administrator.',
    });
  }
  next();
}

module.exports = { flash, attachUser, requireAuth, requireRole, requireActive };
