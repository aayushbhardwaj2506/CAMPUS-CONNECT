'use strict';

// --- Auto-enable SQLite on Node 22.5-22.11 if host runs plain "node server.js" ---
try {
  require('node:sqlite');
} catch (err) {
  if (err && err.code === 'ERR_UNKNOWN_BUILTIN_MODULE' && !process.env._SQLITE_RESPAWNED) {
    const { spawn } = require('child_process');
    console.log('[boot] Auto-enabling --experimental-sqlite flag for cloud container...');
    const child = spawn(
      process.execPath,
      ['--experimental-sqlite', '--disable-warning=ExperimentalWarning', ...process.execArgv, ...process.argv.slice(1)],
      {
        stdio: 'inherit',
        env: { ...process.env, _SQLITE_RESPAWNED: '1' },
      }
    );
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
    return;
  }
  throw err;
}

const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const morgan = require('morgan');

const { initSchema, isSeeded } = require('./src/db');
const { seed } = require('./src/db/seed');
const { flash, attachUser, requireActive } = require('./src/middleware/auth');
const { timeAgo, fmtDate, initials } = require('./src/lib/util');

// --- one-time DB bootstrap ------------------------------------------------
try {
  initSchema();
  if (!isSeeded()) {
    console.log('[db] empty database detected - seeding demo data...');
    const counts = seed();
    console.log('[db] seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  }
} catch (dbErr) {
  console.warn('[db] Schema/constraint issue detected (' + dbErr.message + '). Performing clean database reseed...');
  try {
    const counts = seed();
    console.log('[db] Clean reseed complete:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } catch (fatalErr) {
    console.error('[db] Fatal database initialization error:', fatalErr);
  }
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'campus-connect-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(flash);
app.use(attachUser);
app.use(requireActive);

// view helpers available in every template
app.use((req, res, next) => {
  res.locals.timeAgo = timeAgo;
  res.locals.fmtDate = fmtDate;
  res.locals.initials = initials;
  res.locals.query = req.query;
  next();
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/about', require('./src/routes/about.routes'));
app.use('/', require('./src/routes/auth.routes'));
app.use('/', require('./src/routes/dashboard.routes'));
app.use('/', require('./src/routes/profile.routes'));
app.use('/academic', require('./src/routes/academic.routes'));
app.use('/feed', require('./src/routes/feed.routes'));
app.use('/groups', require('./src/routes/groups.routes'));
app.use('/notifications', require('./src/routes/notifications.routes'));
app.use('/search', require('./src/routes/search.routes'));
app.use('/messages', require('./src/routes/messages.routes'));
app.use('/communities', require('./src/routes/communities.routes'));
app.use('/clubs', require('./src/routes/clubs.routes'));
app.use('/events', require('./src/routes/events.routes'));
app.use('/projects', require('./src/routes/projects.routes'));
app.use('/requests', require('./src/routes/requests.routes'));
app.use('/files', require('./src/routes/files.routes'));
app.use('/', require('./src/routes/moderation.routes'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: 'That page does not exist.' });
});

// 500
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    message: process.env.NODE_ENV === 'production' ? 'Internal error.' : err.message,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Campus Connect running →  http://localhost:${PORT}\n`);
  });
}

module.exports = app;
