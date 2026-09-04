'use strict';
const { get, all } = require('../db');

/** Posts visible to `viewer`, newest first, with author + counts + viewer's reaction. */
function feedPosts(viewerId, { limit = 30, authorId = null } = {}) {
  const params = [viewerId];
  let where = `WHERE (p.Visibility IN ('PUBLIC','CAMPUS') OR p.User_ID = ?)`;
  if (authorId) {
    where += ` AND p.User_ID = ?`;
    params.push(authorId);
  }
  params.push(limit);
  return all(
    `SELECT p.*, u.Full_Name AS author_name, u.User_ID AS author_id,
            pr.Profile_Image AS author_img,
            (SELECT COUNT(*) FROM Comment c  WHERE c.Post_ID = p.Post_ID)  AS comment_count,
            (SELECT COUNT(*) FROM Reaction r WHERE r.Post_ID = p.Post_ID)  AS reaction_count,
            (SELECT Reaction_Type FROM Reaction r
               WHERE r.Post_ID = p.Post_ID AND r.User_ID = ${Number(viewerId)}) AS my_reaction
       FROM Post p
       JOIN "User" u    ON u.User_ID = p.User_ID
       LEFT JOIN Profile pr ON pr.User_ID = p.User_ID
       ${where}
       ORDER BY p.Created_At DESC
       LIMIT ?`,
    params
  );
}

/** Non-expired stories, newest first. */
function activeStories(limit = 20) {
  return all(
    `SELECT s.*, u.Full_Name AS author_name, u.User_ID AS author_id
       FROM Story s JOIN "User" u ON u.User_ID = s.User_ID
      WHERE s.Expires_At > ?
      ORDER BY s.Created_At DESC
      LIMIT ?`,
    [new Date().toISOString(), limit]
  );
}

/** Groups the user is an active member of, with scope info. */
function myGroups(userId) {
  return all(
    `SELECT g.*, gm.Role, gm.Joined_At,
            (SELECT COUNT(*) FROM Group_Membership x
               WHERE x.Group_ID = g.Group_ID AND x.Membership_Status = 'ACTIVE') AS member_count
       FROM Group_Membership gm
       JOIN "Group" g ON g.Group_ID = gm.Group_ID
      WHERE gm.User_ID = ? AND gm.Membership_Status = 'ACTIVE'
      ORDER BY
        CASE g.Scope_Type
          WHEN 'STUDENT_ONLY' THEN 1 WHEN 'SCHOOL' THEN 2 WHEN 'DEPARTMENT' THEN 3
          WHEN 'PROGRAM' THEN 4 WHEN 'YEAR' THEN 5 WHEN 'COURSE' THEN 6
          WHEN 'CLASS' THEN 7 ELSE 8 END, g.Group_Name`,
    [userId]
  );
}

/** Today's timetable rows for a student (derived via program + current semester). */
function timetableForStudent(student) {
  if (!student) return [];
  return all(
    `SELECT t.*, c.Section, c.Academic_Year, co.Course_Code, co.Course_Name,
            r.Room_Number, b.Building_Name, b.Block,
            fu.Full_Name AS faculty_name
       FROM Timetable t
       JOIN Class c   ON c.Class_ID = t.Class_ID
       JOIN Course co ON co.Course_ID = c.Course_ID
       JOIN Room r    ON r.Room_ID = t.Room_ID
       JOIN Building b ON b.Building_ID = r.Building_ID
       JOIN Faculty f ON f.Faculty_ID = c.Faculty_ID
       JOIN "User" fu ON fu.User_ID = f.User_ID
      WHERE co.Program_ID = ? AND (c.Semester = ? OR c.Semester IS NULL)
      ORDER BY
        CASE t.Day_Of_Week
          WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,
        t.Start_Time`,
    [student.Program_ID, student.Current_Semester]
  );
}

/** Timetable rows for classes a faculty teaches. */
function timetableForFaculty(faculty) {
  if (!faculty) return [];
  return all(
    `SELECT t.*, c.Section, c.Academic_Year, co.Course_Code, co.Course_Name,
            r.Room_Number, b.Building_Name, b.Block
       FROM Timetable t
       JOIN Class c   ON c.Class_ID = t.Class_ID
       JOIN Course co ON co.Course_ID = c.Course_ID
       JOIN Room r    ON r.Room_ID = t.Room_ID
       JOIN Building b ON b.Building_ID = r.Building_ID
      WHERE c.Faculty_ID = ?
      ORDER BY
        CASE t.Day_Of_Week
          WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,
        t.Start_Time`,
    [faculty.Faculty_ID]
  );
}

module.exports = {
  feedPosts,
  activeStories,
  myGroups,
  timetableForStudent,
  timetableForFaculty,
};
