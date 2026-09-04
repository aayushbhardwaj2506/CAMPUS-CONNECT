'use strict';
const express = require('express');
const { get, all } = require('../db');
const { feedPosts, activeStories, myGroups, timetableForStudent, timetableForFaculty } = require('../lib/queries');
const { membershipReason } = require('../lib/groups');
const { leaderboard, scoreForUser, EXPLANATION } = require('../lib/engagement');

const router = express.Router();

router.get('/', (req, res) => {
  if (!req.currentUser) return res.render('landing', { title: 'Welcome', bare: true });

  const u = req.currentUser;
  const uid = u.User_ID;

  const posts = feedPosts(uid, { limit: 6 });
  const stories = activeStories(12);
  const groups = myGroups(uid).map((g) => ({ ...g, reason: membershipReason(g) }));

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  let timetable = [];
  if (u.role === 'student') timetable = timetableForStudent(u.student);
  else if (u.role === 'faculty') timetable = timetableForFaculty(u.faculty);
  const todayClasses = timetable.filter((t) => t.Day_Of_Week === today);

  const notifications = all(
    `SELECT * FROM Notification WHERE User_ID = ? ORDER BY Created_At DESC LIMIT 5`,
    [uid]
  );

  const communities = all(
    `SELECT c.*, m.Membership_Role FROM Community_Membership m
       JOIN Community c ON c.Community_ID = m.Community_ID
      WHERE m.User_ID = ? AND m.Membership_Status = 'ACTIVE' ORDER BY c.Community_Name`,
    [uid]
  );
  const clubs = all(
    `SELECT c.*, m.Membership_Role FROM Club_Membership m
       JOIN Club c ON c.Club_ID = m.Club_ID
      WHERE m.User_ID = ? AND m.Membership_Status = 'ACTIVE' ORDER BY c.Club_Name`,
    [uid]
  );
  const events = all(
    `SELECT e.*, c.Community_Name FROM Event e
       JOIN Community c ON c.Community_ID = e.Community_ID
      WHERE date(e.Event_Date) >= date('now')
      ORDER BY e.Event_Date LIMIT 5`
  );
  const myRequests = all(
    `SELECT r.*, rc.Category_Name FROM Request r
       JOIN Request_Category rc ON rc.Request_Category_ID = r.Request_Category_ID
      WHERE r.User_ID = ? ORDER BY r.Created_At DESC LIMIT 5`,
    [uid]
  );
  const myProjects = all(
    `SELECT DISTINCT pj.*, pt.Team_Name FROM Project pj
       LEFT JOIN Project_Team pt ON pt.Project_ID = pj.Project_ID
       LEFT JOIN Project_Membership pm ON pm.Project_Team_ID = pt.Project_Team_ID
      WHERE pj.User_ID = ? OR pm.User_ID = ?
      ORDER BY pj.Start_Date DESC LIMIT 5`,
    [uid, uid]
  );

  const announcements = all(
    `SELECT a.*, g.Group_Name, fu.Full_Name AS faculty_name, f.Designation
       FROM Announcement a
       JOIN "Group" g   ON g.Group_ID = a.Group_ID
       JOIN Faculty f   ON f.Faculty_ID = a.Faculty_ID
       JOIN "User" fu   ON fu.User_ID = f.User_ID
      WHERE a.Group_ID IN (
        SELECT Group_ID FROM Group_Membership WHERE User_ID = ? AND Membership_Status = 'ACTIVE'
      )
      ORDER BY a.Is_Official DESC, a.Published_At DESC
      LIMIT 6`,
    [uid]
  );

  const board = leaderboard(8);
  const myScore = scoreForUser(uid);
  const myRank = board.findIndex((b) => b.userId === uid);

  res.render('dashboard', {
    title: 'Dashboard',
    posts, stories, groups, timetable, todayClasses, today,
    notifications, communities, clubs, events, myRequests, myProjects, announcements,
    board, myScore, myRank, engagementExplain: EXPLANATION,
  });
});

module.exports = router;
