'use strict';
/**
 * Campus engagement score — an APPLICATION-LEVEL derived metric.
 * The DA1 schema stores no points/score column, so nothing is written back;
 * this is computed on demand from real activity already in the database.
 */
const { all } = require('../db');

const WEIGHTS = {
  post: 5,
  comment: 2,
  reaction_given: 1,
  reaction_received: 2,
  group: 1,
  community: 3,
  club: 3,
  project: 4,
  study_material: 6,
  announcement: 4,
};

const EXPLANATION = [
  ['Post created', WEIGHTS.post],
  ['Comment written', WEIGHTS.comment],
  ['Reaction given', WEIGHTS.reaction_given],
  ['Reaction received on your post', WEIGHTS.reaction_received],
  ['Academic group membership', WEIGHTS.group],
  ['Community membership', WEIGHTS.community],
  ['Club membership', WEIGHTS.club],
  ['Project team membership', WEIGHTS.project],
  ['Study material shared (faculty)', WEIGHTS.study_material],
  ['Announcement published (faculty)', WEIGHTS.announcement],
];

function leaderboard(limit = 10) {
  const rows = all(`
    SELECT u.User_ID, u.Full_Name,
      (SELECT COUNT(*) FROM Post p WHERE p.User_ID = u.User_ID)                      AS posts,
      (SELECT COUNT(*) FROM Comment c WHERE c.User_ID = u.User_ID)                   AS comments,
      (SELECT COUNT(*) FROM Reaction r WHERE r.User_ID = u.User_ID)                  AS reacts_given,
      (SELECT COUNT(*) FROM Reaction r JOIN Post p ON p.Post_ID = r.Post_ID
         WHERE p.User_ID = u.User_ID)                                               AS reacts_recv,
      (SELECT COUNT(*) FROM Group_Membership g WHERE g.User_ID = u.User_ID
         AND g.Membership_Status = 'ACTIVE')                                        AS groups_n,
      (SELECT COUNT(*) FROM Community_Membership m WHERE m.User_ID = u.User_ID
         AND m.Membership_Status = 'ACTIVE')                                        AS comms_n,
      (SELECT COUNT(*) FROM Club_Membership m WHERE m.User_ID = u.User_ID
         AND m.Membership_Status = 'ACTIVE')                                        AS clubs_n,
      (SELECT COUNT(*) FROM Project_Membership m WHERE m.User_ID = u.User_ID
         AND m.Membership_Status = 'ACTIVE')                                        AS proj_n,
      (SELECT COUNT(*) FROM Study_Material s JOIN Faculty f ON f.Faculty_ID = s.Faculty_ID
         WHERE f.User_ID = u.User_ID)                                              AS sm_n,
      (SELECT COUNT(*) FROM Announcement a JOIN Faculty f ON f.Faculty_ID = a.Faculty_ID
         WHERE f.User_ID = u.User_ID)                                              AS ann_n
    FROM "User" u
  `);

  return rows
    .map((r) => {
      const score =
        r.posts * WEIGHTS.post +
        r.comments * WEIGHTS.comment +
        r.reacts_given * WEIGHTS.reaction_given +
        r.reacts_recv * WEIGHTS.reaction_received +
        r.groups_n * WEIGHTS.group +
        r.comms_n * WEIGHTS.community +
        r.clubs_n * WEIGHTS.club +
        r.proj_n * WEIGHTS.project +
        r.sm_n * WEIGHTS.study_material +
        r.ann_n * WEIGHTS.announcement;
      return { userId: r.User_ID, name: r.Full_Name, score, parts: r };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function scoreForUser(userId) {
  const row = leaderboard(9999).find((x) => x.userId === userId);
  return row ? row.score : 0;
}

module.exports = { leaderboard, scoreForUser, EXPLANATION, WEIGHTS };
