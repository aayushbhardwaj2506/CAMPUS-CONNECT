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

/** radial layout for the "my neighbourhood" SVG (centre = focus person) */
function radialLayout(centre, ring) {
  const W = 520, H = 360, cx = W / 2, cy = H / 2, rx = 200, ry = 135;
  const nodes = ring.map((p, i) => {
    const a = (-Math.PI / 2) + (2 * Math.PI * i) / Math.max(ring.length, 1);
    return { ...p, x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) };
  });
  return { W, H, cx, cy, centre, nodes };
}

router.get('/', async (req, res, next) => {
  try {
    const up = await graph.isUp();
    if (!up) {
      return res.render('graph/index', { title: 'Campus graph', down: true, uri: graph.URI });
    }

    const people = await graph.read(QUERIES.people.cypher);
    const meId = req.currentUser.User_ID;
    const inGraph = people.some((p) => p.userId === meId);
    const focus = inGraph ? meId : (people[0] && people[0].userId);
    const focusName = (people.find((p) => p.userId === focus) || {}).name || '';

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
    if (!Number.isFinite(to) || to === focus) {
      to = (fof[0] && fof[0].userId) || (people.find((p) => p.userId !== focus) || {}).userId;
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

module.exports = router;
