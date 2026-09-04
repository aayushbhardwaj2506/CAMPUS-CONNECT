'use strict';
const express = require('express');
const { all } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { likeContains, clean } = require('../lib/util');

const router = express.Router();
router.use(requireAuth);

const ESC = " ESCAPE '\\'";

router.get('/', (req, res) => {
  const q = clean(req.query.q);
  let results = null;
  if (q) {
    const p = likeContains(q);
    results = {
      people: all(
        `SELECT u.User_ID, u.Full_Name, u.Email,
                (SELECT 1 FROM Student s WHERE s.User_ID=u.User_ID) AS is_student,
                (SELECT 1 FROM Faculty f WHERE f.User_ID=u.User_ID) AS is_faculty
           FROM "User" u WHERE u.Full_Name LIKE ?${ESC} OR u.Email LIKE ?${ESC}
          ORDER BY u.Full_Name LIMIT 12`, [p, p]),
      courses: all(
        `SELECT Course_ID, Course_Code, Course_Name FROM Course
          WHERE Course_Code LIKE ?${ESC} OR Course_Name LIKE ?${ESC} ORDER BY Course_Code LIMIT 12`, [p, p]),
      groups: all(
        `SELECT Group_ID, Group_Name, Group_Type FROM "Group"
          WHERE Group_Name LIKE ?${ESC} OR Description LIKE ?${ESC} ORDER BY Group_Name LIMIT 12`, [p, p]),
      communities: all(
        `SELECT Community_ID, Community_Name, Community_Type FROM Community
          WHERE Community_Name LIKE ?${ESC} OR Description LIKE ?${ESC} LIMIT 12`, [p, p]),
      clubs: all(
        `SELECT Club_ID, Club_Name, Category FROM Club
          WHERE Club_Name LIKE ?${ESC} OR Description LIKE ?${ESC} LIMIT 12`, [p, p]),
      projects: all(
        `SELECT Project_ID, Project_Name, Project_Status FROM Project
          WHERE Project_Name LIKE ?${ESC} OR Description LIKE ?${ESC} LIMIT 12`, [p, p]),
      events: all(
        `SELECT e.Event_ID, e.Event_Title, e.Event_Date, c.Community_Name
           FROM Event e JOIN Community c ON c.Community_ID = e.Community_ID
          WHERE e.Event_Title LIKE ?${ESC} OR e.Event_Description LIKE ?${ESC} LIMIT 12`, [p, p]),
      materials: all(
        `SELECT sm.Study_Material_ID, sm.Title, c.Course_Code, c.Course_ID
           FROM Study_Material sm JOIN Course c ON c.Course_ID = sm.Course_ID
          WHERE sm.Title LIKE ?${ESC} OR sm.Description LIKE ?${ESC} LIMIT 12`, [p, p]),
      requests: all(
        `SELECT Request_ID, Request_Title, Status, Priority FROM Request
          WHERE Request_Title LIKE ?${ESC} OR Request_Description LIKE ?${ESC} LIMIT 12`, [p, p]),
    };
  }
  res.render('search', { title: q ? `Search: ${q}` : 'Search', q, results });
});

module.exports = router;
