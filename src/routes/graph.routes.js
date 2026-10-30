'use strict';
/**
 * DA3 — "Campus graph" page: relationship queries answered by Neo4j.
 * The rest of the app keeps using SQLite; if Neo4j is not running this page
 * shows setup instructions instead of failing.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const graph = require('../graph/neo4j');
const { QUERIES } = require('../graph/queries');

const router = express.Router();
router.use(requireAuth);

/** "Dr. Suresh Rao" -> "Dr. Rao", "Diya Patel" -> "Diya" */
function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (/^dr\.?$/i.test(parts[0]) && parts.length > 1) return 'Dr. ' + parts[parts.length - 1];
  return parts[0];
}

/**
 * Layout for the "my neighbourhood" SVG. Closeness = how many things are
 * shared, so closer people sit nearer the centre and get a bigger node and a
 * thicker line.
 */
function radialLayout(centre, ring) {
  const W = 560, H = 400, cx = W / 2, cy = H / 2, RX = 215, RY = 150;
  const shared = ring.map((p) => p.shared);
  const max = Math.max(1, ...shared);
  const min = ring.length ? Math.min(...shared) : 0;
  const nodes = ring.map((p, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(ring.length, 1);
    const ux = Math.cos(a), uy = Math.sin(a);
    const closeness = max === min ? 0.5 : (p.shared - min) / (max - min); // 1 = closest
    const k = 1 - 0.4 * closeness; // 0.6 (closest) .. 1.0 (furthest)
    const x = Math.round(cx + RX * k * ux), y = Math.round(cy + RY * k * uy);
    const r = Math.round(18 + closeness * 5);
    return {
      ...p, x, y, r,
      width: Math.min(8, 1.2 + p.shared * 1.1).toFixed(1),
      lx: Math.round(x + ux * (r + 8)), ly: Math.round(y + uy * (r + 8) + 4),
      anchor: ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
      label: shortName(p.name),
      type: p.faculty ? 'faculty' : 'student',
      via: (p.via || []).slice(0, 4).join(' · '),
    };
  });
  const guides = [0.6, 1.0].map((k) => ({ rx: Math.round(RX * k), ry: Math.round(RY * k) }));
  return { W, H, cx, cy, centre, nodes, guides };
}

router.get('/', async (req, res, next) => {
  try {
    const up = await graph.isUp();
    if (!up) {
      return res.render('graph/index', { title: 'Campus graph', down: true, uri: graph.URI });
    }

    // `people` = everyone with at least one connection (the path picker); being in the
    // graph at all is a separate question, because someone can exist with no connections yet.
    const people = await graph.read(QUERIES.people.cypher);
    const meId = req.currentUser.User_ID;
    const exists = await graph.read('MATCH (p:Person {userId: $id}) RETURN p.name AS name', { id: meId });
    const inGraph = exists.length > 0;
    const focus = inGraph ? meId : (people[0] && people[0].userId);
    const focusName = inGraph ? exists[0].name
      : ((people.find((p) => p.userId === focus) || {}).name || '');

    const [closest, fof, clubs, central, overlap, nodeStats, relStats, ego] = await Promise.all([
      graph.read(QUERIES.closest.cypher, { me: focus }),
      graph.read(QUERIES.fof.cypher, { me: focus }),
      graph.read(QUERIES.clubs.cypher, { me: focus }),
      graph.read(QUERIES.central.cypher),
      graph.read(QUERIES.overlap.cypher),
      graph.read(QUERIES.nodeStats.cypher),
      graph.read(QUERIES.relStats.cypher),
      graph.read(QUERIES.ego.cypher, { me: focus }),
    ]);

    // shortest path target: ?to=ID, else the best "person you may know", else anyone else
    let to = parseInt(req.query.to, 10);
    if (!Number.isFinite(to) || to === focus || !people.some((p) => p.userId === to)) {
      // default to someone who is actually reachable: a friend-of-friend, else a direct connection
      to = (fof[0] && fof[0].userId) || (closest[0] && closest[0].userId)
        || (people.find((p) => p.userId !== focus) || {}).userId;
    }
    let path = null;
    if (to != null) {
      const rows = await graph.read(QUERIES.path.cypher, { me: focus, other: to });
      path = rows[0] || { people: [], hops: null };
    }
    const toName = (people.find((p) => p.userId === to) || {}).name || '';

    res.render('graph/index', {
      title: 'Campus graph',
      down: false,
      uri: graph.URI,
      inGraph, focus, focusName, people, to, toName, path,
      closest, fof, clubs, central, overlap, nodeStats, relStats,
      ego: radialLayout(focusName, ego),
      Q: QUERIES,
    });
  } catch (err) {
    next(err);
  }
});

// "Sync graph": rebuild Neo4j from the current SQLite data (one click).
// Only one sync at a time, and a short cool-down so it can't be spammed.
let lastSyncAt = 0;
router.post('/sync', async (req, res) => {
  const { syncGraph, isSyncing } = require('../graph/import');
  if (isSyncing()) {
    req.flash('error', 'A sync is already running — give it a few seconds.');
    return res.redirect('/graph');
  }
  if (Date.now() - lastSyncAt < 8000) {
    req.flash('error', 'The graph was just synced. Try again in a few seconds.');
    return res.redirect('/graph');
  }
  if (!(await graph.isUp())) {
    req.flash('error', 'Could not reach Neo4j, so nothing was synced.');
    return res.redirect('/graph');
  }
  try {
    const r = await syncGraph();
    lastSyncAt = Date.now();
    const people = (r.nodes.find((n) => n.label === 'Person') || {}).n || 0;
    req.flash('success',
      `Graph synced from the app database in ${(r.ms / 1000).toFixed(1)}s — ${people} people, ${r.connections} connections.`);
  } catch (err) {
    console.error('[graph] sync failed:', err.message);
    req.flash('error', 'Sync failed: ' + err.message);
  }
  res.redirect('/graph');
});

module.exports = router;
