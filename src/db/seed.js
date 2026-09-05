'use strict';
/**
 * Deterministic demo seed for Campus Connect.
 * Every password is:  campus123
 *
 * Run with:  npm run seed        (wipes + re-inserts)
 */
const bcrypt = require('bcryptjs');
const { db, get, all, run, tx, initSchema } = require('./index');
const { nowIso, isoPlusHours } = require('../lib/util');
const { loadUser } = require('../lib/roles');
const { syncMembershipsForUser, getOrCreateScopeGroup } = require('../lib/groups');

// Pre-computed bcrypt hash for 'campus123' (cost 10) to avoid freezing low-CPU containers
const HASH = '$2a$10$pAo90si5O7n2qgwejrv7UeJ/IFCxNt782jxwyFcpw1vxnWAkUcina';

const TABLES_IN_WIPE_ORDER = [
  'Audit_Log', 'Report', 'Notification', 'File',
  'Project_Membership', 'Project_Team', 'Project',
  'Request', 'Request_Category',
  'Event', 'Club_Membership', 'Club', 'Community_Membership', 'Community',
  'Reaction', 'Comment', 'Story', 'Post',
  'Study_Material', 'Announcement', 'Message', 'Conversation_Participant',
  'Conversation', 'Group_Membership', '"Group"',
  'Timetable', 'Class', 'Faculty', 'Student', 'Profile', '"User"',
  'Room', 'Building', 'Course', 'Program', 'Department', 'School',
];

function wipe() {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of TABLES_IN_WIPE_ORDER) {
    db.exec(`DROP TABLE IF EXISTS ${t};`);
  }
  try { db.exec('DELETE FROM sqlite_sequence;'); } catch {}
  db.exec('PRAGMA foreign_keys = ON;');
}

function insert(table, obj) {
  const cols = Object.keys(obj);
  const q = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')})
             VALUES (${cols.map(() => '?').join(',')})`;
  return run(q, cols.map((c) => obj[c])).lastInsertRowid;
}

function seed() {
  wipe();
  initSchema();
  tx(() => {

    // ---- MODULE 1 : ACADEMIC STRUCTURE -----------------------------------
    // Modelled on the real School of Computer Science and Engineering (SCOPE)
    // at VIT Chennai: one school, six academic departments, and the B.Tech CSE
    // family of specialisations. SENSE / SELECT are seeded lightly so that
    // cross-school discovery is realistic. Course codes are illustrative.
    const schoolSCOPE = insert('School', {
      School_Name: 'School of Computer Science and Engineering',
      School_Code: 'SCOPE',
      Address: 'Vandalur – Kelambakkam Road, Chennai 600127',
      Contact_Email: 'scope.office@campus.edu',
      Contact_Number: '+91-9000000001',
    });
    const schoolSENSE = insert('School', {
      School_Name: 'School of Electronics Engineering',
      School_Code: 'SENSE',
      Address: 'Vandalur – Kelambakkam Road, Chennai 600127',
      Contact_Email: 'sense.office@campus.edu',
      Contact_Number: '+91-9000000002',
    });
    const schoolSELECT = insert('School', {
      School_Name: 'School of Electrical Engineering',
      School_Code: 'SELECT',
      Address: 'Vandalur – Kelambakkam Road, Chennai 600127',
      Contact_Email: 'select.office@campus.edu',
      Contact_Number: '+91-9000000003',
    });

    // The six SCOPE departments. `deptCSE` stays the "home" of core B.Tech CSE
    // and of the DBMS course thread that the demo revolves around.
    const deptCSE = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Database Systems',
      Department_Code: 'DBS', Description: 'Data storage, querying, transactions and large-scale data platforms.',
    });
    const deptCI = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Computational Intelligence',
      Department_Code: 'CI', Description: 'Machine learning, deep learning, computer vision and applied AI.',
    });
    const deptSWS = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Software Systems',
      Department_Code: 'SWS', Description: 'Software engineering, programming languages and systems.',
    });
    const deptIS = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Information Security',
      Department_Code: 'IS', Description: 'Cryptography, network and systems security, and cyber defence.',
    });
    const deptAN = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Analytics',
      Department_Code: 'AN', Description: 'Data science, statistical modelling, visualisation and big-data analytics.',
    });
    const deptIOT = insert('Department', {
      School_ID: schoolSCOPE, Department_Name: 'Internet of Things',
      Department_Code: 'IOT', Description: 'Embedded devices, sensor networks and cyber-physical systems.',
    });
    const deptECE = insert('Department', {
      School_ID: schoolSENSE, Department_Name: 'Electronics & Communication Engineering',
      Department_Code: 'ECE', Description: 'Electronics, VLSI and communication systems.',
    });

    // B.Tech CSE plus the SCOPE specialisation tracks, an integrated M.Tech,
    // an M.Tech and the MCA.
    const progCSE = insert('Program', {
      Department_ID: deptCSE, Program_Name: 'B.Tech Computer Science and Engineering',
      Program_Code: 'BTECH-CSE', Degree_Level: 'Undergraduate', Duration: 4,
    });
    const progAIML = insert('Program', {
      Department_ID: deptCI, Program_Name: 'B.Tech CSE (Artificial Intelligence and Machine Learning)',
      Program_Code: 'BTECH-CSE-AIML', Degree_Level: 'Undergraduate', Duration: 4,
    });
    const progCY = insert('Program', {
      Department_ID: deptIS, Program_Name: 'B.Tech CSE (Cyber Security)',
      Program_Code: 'BTECH-CSE-CY', Degree_Level: 'Undergraduate', Duration: 4,
    });
    const progDS = insert('Program', {
      Department_ID: deptAN, Program_Name: 'B.Tech CSE (Data Science)',
      Program_Code: 'BTECH-CSE-DS', Degree_Level: 'Undergraduate', Duration: 4,
    });
    const progIMSE = insert('Program', {
      Department_ID: deptSWS, Program_Name: 'Integrated M.Tech Software Engineering',
      Program_Code: 'IMTECH-SE', Degree_Level: 'Integrated', Duration: 5,
    });
    const progMSE = insert('Program', {
      Department_ID: deptCSE, Program_Name: 'M.Tech Computer Science and Engineering',
      Program_Code: 'MTECH-CSE', Degree_Level: 'Postgraduate', Duration: 2,
    });
    const progMCA = insert('Program', {
      Department_ID: deptSWS, Program_Name: 'Master of Computer Applications (MCA)',
      Program_Code: 'MCA', Degree_Level: 'Postgraduate', Duration: 2,
    });
    const progECE = insert('Program', {
      Department_ID: deptECE, Program_Name: 'B.Tech Electronics and Communication Engineering',
      Program_Code: 'BTECH-ECE', Degree_Level: 'Undergraduate', Duration: 4,
    });

    const C = {}; // code -> Course_ID
    const courseRows = [
      ['CSE2001', 'Data Structures and Algorithms', deptCSE, progCSE, 4, 3],
      ['CSE3001', 'Database Management Systems', deptCSE, progCSE, 4, 5],
      ['CSE3002', 'Operating Systems', deptCSE, progCSE, 4, 5],
      ['CSE3003', 'Computer Networks', deptCSE, progCSE, 3, 5],
      ['CSE3004', 'Theory of Computation', deptCSE, progCSE, 3, 5],
      ['CSE4001', 'Machine Learning', deptCI, progCSE, 4, 7],
      ['AIN3001', 'Artificial Intelligence', deptCI, progAIML, 4, 5],
      ['SEC3001', 'Cryptography and Network Security', deptIS, progCY, 4, 5],
      ['DSN3001', 'Data Visualization', deptAN, progDS, 3, 5],
      ['IOT3001', 'Internet of Things', deptIOT, progAIML, 3, 5],
      ['ECE2001', 'Digital Logic Design', deptECE, progECE, 4, 3],
      ['ECE3001', 'Signals and Systems', deptECE, progECE, 4, 5],
      ['SWE5001', 'Software Architecture', deptSWS, progIMSE, 3, 1],
    ];
    for (const [code, name, dep, prog, cr, sem] of courseRows) {
      C[code] = insert('Course', {
        Department_ID: dep, Program_ID: prog, Course_Code: code,
        Course_Name: name, Credits: cr, Semester: sem,
      });
    }

    const bAB1 = insert('Building', { Building_Name: 'Academic Block 1', Block: 'AB1', Campus: 'VIT Chennai' });
    const bAB2 = insert('Building', { Building_Name: 'Academic Block 2', Block: 'AB2', Campus: 'VIT Chennai' });
    const bTP = insert('Building', { Building_Name: 'Technology Park', Block: 'TP', Campus: 'VIT Chennai' });
    const rooms = {
      'AB1-101': insert('Room', { Building_ID: bAB1, Room_Number: '101', Floor: 1, Capacity: 60 }),
      'AB1-410': insert('Room', { Building_ID: bAB1, Room_Number: '410', Floor: 4, Capacity: 45 }),
      'AB2-215': insert('Room', { Building_ID: bAB2, Room_Number: '215', Floor: 2, Capacity: 70 }),
      'AB2-505': insert('Room', { Building_ID: bAB2, Room_Number: '505', Floor: 5, Capacity: 40 }),
      'TP-012': insert('Room', { Building_ID: bTP, Room_Number: '012', Floor: 0, Capacity: 30 }),
    };

    // ---- MODULE 2 : USERS / STUDENTS / FACULTY --------------------------
    function mkUser(name, email, phone, status = 'ACTIVE') {
      return insert('User', {
        Full_Name: name, Email: email, Password_Hash: HASH, Phone_Number: phone,
        Account_Status: status, Created_At: nowIso(),
      });
    }
    function mkProfile(userId, bio, dob, gender) {
      return insert('Profile', {
        User_ID: userId, Profile_Image: null, Bio: bio, Date_Of_Birth: dob, Gender: gender,
      });
    }

    const U = {};
    // students
    U.aarav = mkUser('Aarav Sharma', 'aarav@campus.edu', '+91-9810000001');
    U.diya = mkUser('Diya Patel', 'diya@campus.edu', '+91-9810000002');
    U.rohan = mkUser('Rohan Verma', 'rohan@campus.edu', '+91-9810000003');
    U.ananya = mkUser('Ananya Iyer', 'ananya@campus.edu', '+91-9810000004');
    U.kabir = mkUser('Kabir Nair', 'kabir@campus.edu', '+91-9810000005');
    U.meera = mkUser('Meera Reddy', 'meera@campus.edu', '+91-9810000006');
    U.sana = mkUser('Sana Khan', 'sana@campus.edu', '+91-9810000007', 'SUSPENDED');
    // faculty
    U.dean = mkUser('Dr. Anil Kapoor', 'dean@campus.edu', '+91-9820000000');
    U.rao = mkUser('Dr. Suresh Rao', 'suresh.rao@campus.edu', '+91-9820000001');
    U.menon = mkUser('Dr. Latha Menon', 'latha.menon@campus.edu', '+91-9820000002');
    U.bose = mkUser('Dr. Vikram Bose', 'vikram.bose@campus.edu', '+91-9820000003');
    // staff / admin (no Student or Faculty row -> role 'staff')
    U.admin = mkUser('Campus Admin', 'admin@campus.edu', '+91-9830000000');

    mkProfile(U.aarav, 'SCOPE · B.Tech CSE, Sem 5. Into databases and backend. Building the DA-2 project.', '2004-03-14', 'Male');
    mkProfile(U.diya, 'SCOPE · B.Tech CSE, Sem 5. Frontend + design. Photography club core.', '2004-07-02', 'Female');
    mkProfile(U.rohan, 'SCOPE · B.Tech CSE, Sem 5. Competitive programming, Codeforces grind, chess.', '2003-11-20', 'Male');
    mkProfile(U.ananya, 'SENSE · B.Tech ECE, Sem 5. Robotics Club. Works with SCOPE folks on CPS projects.', '2004-01-09', 'Female');
    mkProfile(U.kabir, 'SCOPE · B.Tech CSE, final year. Data Science track. Smart India Hackathon finalist.', '2003-05-27', 'Male');
    mkProfile(U.meera, 'SCOPE · M.Tech CSE, Sem 1. Ex-SDE intern. Distributed systems and consensus.', '2000-09-16', 'Female');
    mkProfile(U.sana, 'SCOPE · B.Tech CSE, Sem 5.', '2004-04-04', 'Female');
    mkProfile(U.dean, 'Dean, School of Computer Science and Engineering (SCOPE), VIT Chennai.', '1972-02-01', 'Male');
    mkProfile(U.rao, 'Professor & Head, Department of Database Systems, SCOPE. Research: query optimization, storage engines.', '1975-08-19', 'Male');
    mkProfile(U.menon, 'Associate Professor, Department of Computational Intelligence, SCOPE. Research: ML systems, scheduling.', '1980-12-05', 'Female');
    mkProfile(U.bose, 'Assistant Professor, Dept. of ECE, SENSE. Research: VLSI design.', '1983-06-30', 'Male');
    mkProfile(U.admin, 'Campus Connect administration & moderation desk.', null, null);

    const S = {};
    function mkStudent(userId, prog, reg, year, sem) {
      return insert('Student', {
        User_ID: userId, Program_ID: prog, Registration_Number: reg,
        Admission_Year: year, Current_Semester: sem,
      });
    }
    S.aarav = mkStudent(U.aarav, progCSE, '22BCE1001', 2022, 5);
    S.diya = mkStudent(U.diya, progCSE, '22BCE1002', 2022, 5);
    S.rohan = mkStudent(U.rohan, progCSE, '22BCE1003', 2022, 5);
    S.ananya = mkStudent(U.ananya, progECE, '22BEC1001', 2022, 5);
    S.kabir = mkStudent(U.kabir, progCSE, '21BCE1050', 2021, 7);
    S.meera = mkStudent(U.meera, progMSE, '24MCS1001', 2024, 1);
    S.sana = mkStudent(U.sana, progCSE, '22BCE1099', 2022, 5);

    const F = {};
    function mkFaculty(userId, dept, emp, desig, spec) {
      return insert('Faculty', {
        User_ID: userId, Department_ID: dept, Employee_ID: emp,
        Designation: desig, Specialization: spec,
      });
    }
    F.dean = mkFaculty(U.dean, deptCSE, 'EMP-SCOPE-00', 'Dean, SCOPE', 'Distributed Systems');
    F.rao = mkFaculty(U.rao, deptCSE, 'EMP-DBS-01', 'Professor & Head — Database Systems', 'Database Systems, Query Optimization');
    F.menon = mkFaculty(U.menon, deptCI, 'EMP-CI-04', 'Associate Professor — Computational Intelligence', 'Machine Learning, Operating Systems');
    F.bose = mkFaculty(U.bose, deptECE, 'EMP-ECE-01', 'Assistant Professor — ECE', 'VLSI Design');

    // ---- CLASSES + TIMETABLE ------------------------------------------
    const CL = {};
    function mkClass(course, faculty, section, ay, sem) {
      return insert('Class', {
        Course_ID: course, Faculty_ID: faculty, Section: section,
        Academic_Year: ay, Semester: sem,
      });
    }
    CL.dbms = mkClass(C['CSE3001'], F.rao, 'A', '2025-26', 5);
    CL.os = mkClass(C['CSE3002'], F.menon, 'A', '2025-26', 5);
    CL.cn = mkClass(C['CSE3003'], F.rao, 'A', '2025-26', 5);
    CL.toc = mkClass(C['CSE3004'], F.rao, 'A', '2025-26', 5);
    CL.ml = mkClass(C['CSE4001'], F.menon, 'A', '2025-26', 7);
    CL.dld = mkClass(C['ECE2001'], F.bose, 'A', '2025-26', 3);
    CL.sig = mkClass(C['ECE3001'], F.bose, 'A', '2025-26', 5);
    CL.swa = mkClass(C['SWE5001'], F.rao, 'A', '2025-26', 1);

    function mkSlot(cls, room, day, s, e) {
      return insert('Timetable', {
        Class_ID: cls, Room_ID: room, Day_Of_Week: day, Start_Time: s, End_Time: e,
      });
    }
    mkSlot(CL.dbms, rooms['AB1-101'], 'Monday', '09:00', '09:50');
    mkSlot(CL.dbms, rooms['AB1-101'], 'Wednesday', '09:00', '09:50');
    mkSlot(CL.dbms, rooms['AB2-215'], 'Friday', '11:00', '12:40');
    mkSlot(CL.os, rooms['AB2-215'], 'Tuesday', '10:00', '10:50');
    mkSlot(CL.os, rooms['AB2-215'], 'Thursday', '10:00', '10:50');
    mkSlot(CL.cn, rooms['AB1-410'], 'Monday', '14:00', '14:50');
    mkSlot(CL.toc, rooms['AB1-101'], 'Wednesday', '11:00', '11:50');
    mkSlot(CL.toc, rooms['AB1-410'], 'Friday', '14:00', '14:50');
    mkSlot(CL.ml, rooms['TP-012'], 'Wednesday', '15:00', '16:40');
    mkSlot(CL.dld, rooms['AB1-410'], 'Tuesday', '09:00', '09:50');
    mkSlot(CL.sig, rooms['AB2-505'], 'Thursday', '11:00', '11:50');
    mkSlot(CL.swa, rooms['TP-012'], 'Friday', '09:00', '10:40');

    // ---- AUTO GROUP ALLOCATION --------------------------------------
    // Build scope groups + memberships for every student and faculty.
    for (const key of Object.keys(U)) {
      const full = loadUser(U[key]);
      if (full && (full.role === 'student' || full.role === 'faculty')) {
        syncMembershipsForUser(full);
      }
    }

    // A couple of INTEREST groups (student-created, not auto). These use the
    // DA2 Scope_Type='STUDENT_ONLY'-style pattern but Group_Type='INTEREST'.
    const gStudy = insert('"Group"', {
      Course_ID: null, Group_Name: 'DA-2 Study Circle', Group_Type: 'INTEREST',
      Description: 'Peer study group for the database DA-2 project.',
      Created_At: nowIso(), Scope_Type: null, Scope_ID: null,
    });
    for (const u of [U.aarav, U.diya, U.rohan, U.kabir]) {
      insert('Group_Membership', {
        Group_ID: gStudy, User_ID: u, Role: u === U.aarav ? 'ADMIN' : 'MEMBER',
        Joined_At: nowIso(), Membership_Status: 'ACTIVE',
      });
    }

    // ---- ANNOUNCEMENTS (incl. official) ----------------------------
    const gDeptCSE = getOrCreateScopeGroup('DEPARTMENT', deptCSE, 'Database Systems — Department Group').Group_ID;
    const gSchoolSCOPE = getOrCreateScopeGroup('SCHOOL', schoolSCOPE, 'SCOPE — School Group').Group_ID;
    const gCourseDBMS = getOrCreateScopeGroup('COURSE', C['CSE3001'], 'CSE3001 Database Management Systems').Group_ID;

    function mkAnn(group, faculty, title, content, official, daysAgo = 0) {
      return insert('Announcement', {
        Group_ID: group, Faculty_ID: faculty, Title: title, Content: content,
        Published_At: isoPlusHours(-24 * daysAgo - 1),
        Expiry_Date: isoPlusHours(24 * 30), Is_Official: official,
      });
    }
    mkAnn(gSchoolSCOPE, F.dean,
      'FFCS course registration for the Winter Semester opens Monday',
      'Slot booking for Winter Semester 2025–26 opens on the academic portal from Monday 9:00 AM, batch-wise. Plan your credits with your faculty advisor before your slot. Prerequisite clashes will not be waived after registration closes.',
      1, 1);
    mkAnn(gSchoolSCOPE, F.dean,
      'CAT-2 timetable released — all SCOPE programmes',
      'The Continuous Assessment Test II schedule is on the portal. It covers Sem 3, 5 and 7 theory courses. Raise clashes with your class coordinator within 48 hours.',
      1, 3);
    mkAnn(gDeptCSE, F.rao,
      'Guest lecture: Vector Databases in Production',
      'The Department of Database Systems invites all SCOPE students to a guest lecture on vector databases and retrieval-augmented systems this Thursday, 3 PM, Academic Block 1 Auditorium.',
      1, 2);
    mkAnn(gCourseDBMS, F.rao,
      'DA-2 submission window extended by 48 hours',
      'Given the portal downtime, the DA-2 (Campus Connect build) deadline is extended. FAT practical demo slots are unchanged.',
      0, 0);
    mkAnn(gCourseDBMS, F.rao,
      'Bring laptops to Friday lab',
      'We will do live normalization exercises. Install SQLite / DB Browser beforehand.',
      0, 0);

    // ---- GROUP CONVERSATION (DA2 link) ---------------------------
    const convDBMS = insert('Conversation', {
      Conversation_Type: 'GROUP', Title: 'CSE3001 DBMS — Section A',
      Created_At: nowIso(), Group_ID: gCourseDBMS,
    });
    const dbmsMembers = all(
      'SELECT User_ID FROM Group_Membership WHERE Group_ID = ? AND Membership_Status = ?',
      [gCourseDBMS, 'ACTIVE']
    ).map((r) => r.User_ID);
    for (const uid of dbmsMembers) {
      insert('Conversation_Participant', {
        Conversation_ID: convDBMS, User_ID: uid, Joined_At: nowIso(),
      });
    }
    function mkMsg(conv, user, text, minsAgo) {
      return insert('Message', {
        Conversation_ID: conv, User_ID: user, Message_Content: text,
        Message_Type: 'TEXT', Sent_At: isoPlusHours(-minsAgo / 60), Edited_At: null,
      });
    }
    mkMsg(convDBMS, U.rao, 'Posted the DA-2 rubric in Study Material. Questions here.', 220);
    mkMsg(convDBMS, U.aarav, 'Sir, does the ER need to be in Chen notation or crow’s foot?', 200);
    mkMsg(convDBMS, U.rao, 'Chen for the conceptual model, as covered in class.', 180);
    mkMsg(convDBMS, U.diya, 'Thanks! Starting the relational mapping now.', 90);

    // ---- STUDY MATERIAL + FILES --------------------------------
    function mkFile(owner, name, type, size) {
      return insert('"File"', {
        User_ID: owner, File_Name: name, File_Type: type, File_Size: size,
        Storage_Path: '/uploads/' + name.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
        Uploaded_At: nowIso(),
      });
    }
    function mkSM(course, faculty, title, desc, fileName) {
      mkFile(faculty === F.rao ? U.rao : U.menon, fileName, 'application/pdf', 240000 + Math.floor(Math.random() * 800000));
      return insert('Study_Material', {
        Course_ID: course, Faculty_ID: faculty, Title: title, Description: desc,
        File_URL: '/files/' + fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
        Uploaded_At: nowIso(),
      });
    }
    mkSM(C['CSE3001'], F.rao, 'ER Modelling — lecture slides', 'Entities, relationships, weak entities, EER.', 'ER-Modelling.pdf');
    mkSM(C['CSE3001'], F.rao, 'Normalization worked examples', '1NF through BCNF with campus dataset.', 'Normalization-Examples.pdf');
    mkSM(C['CSE3001'], F.rao, 'DA-2 rubric', 'Marking scheme for the Campus Connect build.', 'DA2-Rubric.pdf');
    mkSM(C['CSE3002'], F.menon, 'CPU Scheduling notes', 'FCFS, SJF, RR, MLFQ with Gantt charts.', 'OS-Scheduling.pdf');
    mkSM(C['CSE4001'], F.menon, 'Linear models', 'Regression, regularization, gradient descent.', 'ML-Linear-Models.pdf');

    // ---- SOCIAL : POSTS / COMMENTS / REACTIONS / STORIES ---------
    function mkPost(user, title, content, vis, hoursAgo) {
      const t = isoPlusHours(-hoursAgo);
      return insert('Post', {
        User_ID: user, Title: title, Content: content, Visibility: vis,
        Created_At: t, Updated_At: t,
      });
    }
    const P = {};
    P.a = mkPost(U.aarav, null, 'Anyone else stuck on the DA-2 normalization question? BCNF vs 3NF is melting my brain.', 'CAMPUS', 6);
    P.d = mkPost(U.diya, 'Lost umbrella', 'Left a black umbrella near the AB1 porch this morning. DM if found!', 'CAMPUS', 20);
    P.k = mkPost(U.kabir, 'SIH finals!', 'Our team cleared into the Smart India Hackathon grand finale. Grateful to the SCOPE mentors 🙌', 'PUBLIC', 30);
    P.r = mkPost(U.rao, null, 'Reminder: academic integrity workshop this Friday. Attendance counts towards the non-graded requirement.', 'CAMPUS', 45);
    P.m = mkPost(U.meera, null, 'Looking for 1–2 people interested in a small distributed KV-store project this sem.', 'CAMPUS', 52);

    function mkComment(post, user, text, hoursAgo) {
      const t = isoPlusHours(-hoursAgo);
      return insert('Comment', {
        Post_ID: post, User_ID: user, Comment_Text: text, Created_At: t, Updated_At: t,
      });
    }
    mkComment(P.a, U.rohan, 'If every determinant is a candidate key you are already in BCNF. Check the FDs again.', 5);
    mkComment(P.a, U.diya, 'Same. Study circle at 8 in the library?', 4);
    mkComment(P.k, U.aarav, 'Congrats! Well deserved.', 28);
    mkComment(P.k, U.rao, 'Excellent work. Represent the department well.', 26);
    mkComment(P.m, U.aarav, 'Interested — I have done some Raft reading.', 40);

    function mkReaction(post, user, type) {
      return insert('Reaction', {
        Post_ID: post, User_ID: user, Reaction_Type: type, Reacted_At: nowIso(),
      });
    }
    mkReaction(P.a, U.diya, 'LIKE');
    mkReaction(P.a, U.rohan, 'LIKE');
    mkReaction(P.k, U.aarav, 'CELEBRATE');
    mkReaction(P.k, U.diya, 'CELEBRATE');
    mkReaction(P.k, U.rohan, 'LIKE');
    mkReaction(P.k, U.rao, 'CELEBRATE');
    mkReaction(P.r, U.aarav, 'LIKE');
    mkReaction(P.m, U.kabir, 'LIKE');

    function mkStory(user, caption, hoursAgoCreated) {
      const created = isoPlusHours(-hoursAgoCreated);
      return insert('Story', {
        User_ID: user, Media_URL: 'https://picsum.photos/seed/story' + user + '/480/720',
        Caption: caption, Visibility: 'CAMPUS',
        Expires_At: isoPlusHours(24 - hoursAgoCreated), Created_At: created,
      });
    }
    mkStory(U.kabir, 'Finale prep 🚀', 2);
    mkStory(U.diya, 'Library grind', 5);
    mkStory(U.ananya, 'Robotics lab late night', 40); // already expired -> must NOT show

    // ---- COMMUNITIES / CLUBS / EVENTS ---------------------------
    function mkCommunity(name, type, desc) {
      return insert('Community', {
        Community_Name: name, Community_Type: type, Description: desc, Created_At: nowIso(),
      });
    }
    // Communities lean into what a SCOPE student actually spends time on.
    const comCoders = mkCommunity('Competitive Programming — VITC', 'ACADEMIC', 'Codeforces / LeetCode ladders, weekly contests, and ICPC & Smart India Hackathon prep.');
    const comAI = mkCommunity('AI & ML Circle', 'ACADEMIC', 'Paper reading, model builds, Kaggle teams and GPU-lab study sessions.');
    const comSec = mkCommunity('CTF & Cybersecurity', 'ACADEMIC', 'Capture-the-flag practice across web, pwn, crypto and forensics — beginners welcome.');
    const comSports = mkCommunity('Campus Sports', 'SPORTS', 'Pick-up games, tournaments and fitness meetups across campus.');
    const comPhoto = mkCommunity('Photography Circle', 'HOBBY', 'Photowalks, critique threads and gear talk.');

    function joinCommunity(com, user, role) {
      return insert('Community_Membership', {
        Community_ID: com, User_ID: user, Membership_Role: role,
        Joined_At: nowIso(), Membership_Status: 'ACTIVE',
      });
    }
    joinCommunity(comCoders, U.kabir, 'ADMIN');
    joinCommunity(comCoders, U.aarav, 'MEMBER');
    joinCommunity(comCoders, U.rohan, 'MEMBER');
    joinCommunity(comCoders, U.meera, 'MEMBER');
    joinCommunity(comAI, U.kabir, 'ADMIN');
    joinCommunity(comAI, U.diya, 'MEMBER');
    joinCommunity(comAI, U.meera, 'MEMBER');
    joinCommunity(comSec, U.rohan, 'ADMIN');
    joinCommunity(comSec, U.aarav, 'MEMBER');
    joinCommunity(comSports, U.rohan, 'ADMIN');
    joinCommunity(comSports, U.ananya, 'MEMBER');
    joinCommunity(comPhoto, U.diya, 'ADMIN');
    joinCommunity(comPhoto, U.ananya, 'MEMBER');

    function mkEvent(com, title, desc, date, time, loc) {
      return insert('Event', {
        Community_ID: com, Event_Title: title, Event_Description: desc,
        Event_Date: date, Event_Time: time, Event_Location: loc,
      });
    }
    const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    mkEvent(comCoders, 'Vihaan — 24-Hour Hackathon', 'The campus flagship hackathon. Build anything; mentors, food and prizes. Teams of up to 4.', inDays(9), '09:00', 'Academic Block 1 — Ground Floor Labs');
    mkEvent(comCoders, 'Smart India Hackathon — Internal Round', 'Pitch and shortlist for the SIH nomination from SCOPE. Problem statements are on the portal.', inDays(6), '10:00', 'Academic Block 2 Auditorium');
    mkEvent(comCoders, 'Intro to System Design', 'Whiteboard session on scaling web apps and databases.', inDays(3), '18:00', 'AB2-215');
    mkEvent(comAI, 'Kaggle Kickoff Workshop', 'Form teams, set up the GPU lab environment, and start on the current competition.', inDays(4), '17:00', 'Technology Park — GPU Lab');
    mkEvent(comSec, 'CTF Night: web + crypto', 'A beginner-friendly capture-the-flag. Bring a laptop with a Linux VM.', inDays(8), '19:00', 'AB1-410');
    mkEvent(comSports, 'Inter-Department Cricket Cup', 'Round-robin league. Register your department team.', inDays(14), '07:00', 'Main Ground');
    mkEvent(comPhoto, 'Golden Hour Photowalk', 'Meet at the amphitheatre. Bring any camera, phones welcome.', inDays(5), '05:30', 'Amphitheatre');

    function mkClub(name, category, desc) {
      return insert('Club', {
        Club_Name: name, Category: category, Description: desc, Created_At: nowIso(),
      });
    }
    const clubs = {
      ieee: mkClub('IEEE Computer Society — VITC', 'Technical', 'Talks, paper reading, project grants and the CS technical calendar.'),
      gdg: mkClub('GDG on Campus — VIT Chennai', 'Technical', 'Google developer community: study jams, build days and the Solution Challenge.'),
      ospc: mkClub('Open Source Programming Club', 'Technical', 'Contributing to open source, Hacktoberfest, and maintainer talks.'),
      hack: mkClub('The Hack Club', 'Technical', 'Ship small projects together, weekly build nights and hackathon teams.'),
      iot: mkClub('IOTHINC — IoT Community', 'Technical', 'Hardware builds, sensor networks and cyber-physical projects.'),
      music: mkClub('Rhythm — Music Club', 'Cultural', 'Jam sessions, open mics and the annual concert.'),
      badminton: mkClub('Smashers — Badminton Club', 'Sports', 'Weekly courts, ladder ranking and inter-college fixtures.'),
      walkers: mkClub('Dawn Walkers', 'Wellness', 'Morning walk and jog group. All fitness levels.'),
    };
    function joinClub(club, user, role) {
      return insert('Club_Membership', {
        Club_ID: club, User_ID: user, Membership_Role: role,
        Joined_At: nowIso(), Membership_Status: 'ACTIVE',
      });
    }
    joinClub(clubs.ieee, U.aarav, 'MEMBER');
    joinClub(clubs.ieee, U.kabir, 'CORE');
    joinClub(clubs.gdg, U.diya, 'CORE');
    joinClub(clubs.gdg, U.aarav, 'MEMBER');
    joinClub(clubs.ospc, U.rohan, 'MEMBER');
    joinClub(clubs.hack, U.kabir, 'CORE');
    joinClub(clubs.iot, U.ananya, 'MEMBER');
    joinClub(clubs.music, U.diya, 'MEMBER');
    joinClub(clubs.badminton, U.rohan, 'CAPTAIN');
    joinClub(clubs.badminton, U.aarav, 'MEMBER');
    joinClub(clubs.walkers, U.meera, 'MEMBER');
    joinClub(clubs.walkers, U.ananya, 'MEMBER');

    // ---- REQUESTS -----------------------------------------------
    const RC = {};
    for (const [name, desc] of [
      ['Academic Help', 'Doubts, concepts, DA / CAT / FAT prep, lab work.'],
      ['FFCS & Course Registration', 'Slot clashes, prerequisites, credit planning and faculty-advisor questions.'],
      ['Internship & Placement Prep', 'Resume reviews, DSA practice, mock interviews and referrals.'],
      ['Campus Help', 'Directions, facilities, lost & found, general campus questions.'],
      ['Technical Help', 'Wi-Fi, portal, lab machines, GPU-lab and software access.'],
      ['Carpool / Ride-share', 'Share a ride to the airport, station or city.'],
      ['Peer Mentoring', 'Longer-term guidance from a senior or peer.'],
      ['General Assistance', 'Anything that does not fit the other categories.'],
    ]) {
      RC[name] = insert('Request_Category', { Category_Name: name, Description: desc });
    }
    function mkRequest(cat, user, title, desc, prio, status, daysAgo) {
      const created = isoPlusHours(-24 * daysAgo);
      return insert('Request', {
        Request_Category_ID: cat, User_ID: user, Request_Title: title,
        Request_Description: desc, Priority: prio, Status: status,
        Created_At: created, Updated_At: created,
      });
    }
    mkRequest(RC['Academic Help'], U.aarav, 'Need help understanding lossless-join decomposition',
      'Can someone walk me through checking the lossless-join property for a 3-relation decomposition? It is on the CSE3001 DA-2.', 'MEDIUM', 'OPEN', 1);
    mkRequest(RC['FFCS & Course Registration'], U.diya, 'AI elective clashes with a core lab slot',
      'The AI elective I want (L slot) overlaps my CSE3002 lab. Has anyone found a section that fits a Sem 5 core timetable?', 'MEDIUM', 'OPEN', 1);
    mkRequest(RC['Internship & Placement Prep'], U.rohan, 'Mock interview partner for DSA (this weekend)',
      'Prepping for off-campus SDE interviews. Looking for someone to trade 45-min mock rounds — graphs and DP.', 'MEDIUM', 'OPEN', 2);
    mkRequest(RC['Technical Help'], U.meera, 'GPU-lab environment resets between sessions',
      'The conda env I set up in the Technology Park GPU lab is gone the next day. Is there a persistent home directory or should I use a container?', 'HIGH', 'IN_PROGRESS', 2);
    mkRequest(RC['Campus Help'], U.ananya, 'Where do I collect a bonafide certificate?',
      'Need it for a bank account. Which office and what timings?', 'LOW', 'RESOLVED', 6);
    mkRequest(RC['Peer Mentoring'], U.rohan, 'Looking for an ML mentor (final-year or M.Tech)',
      'Want to go from coursework to a small research-style project over the semester.', 'MEDIUM', 'OPEN', 3);

    // ---- PROJECTS ---------------------------------------------
    function mkProject(owner, name, desc, status, startDays, endDays) {
      return insert('Project', {
        User_ID: owner, Project_Name: name, Description: desc,
        Start_Date: inDays(startDays), End_Date: endDays == null ? null : inDays(endDays),
        Project_Status: status,
      });
    }
    const projLF = mkProject(U.kabir, 'Campus Lost & Found', 'A lightweight web app to log and match lost/found items across campus, with pickup verification.', 'ACTIVE', -20, 40);
    const projKV = mkProject(U.meera, 'MiniKV — a distributed key-value store', 'Educational Raft-based KV store with a REST front-end and a chaos-testing harness. Aimed at the M.Tech distributed-systems track.', 'PLANNING', 2, 120);
    const projPortal = mkProject(U.rao, 'Open Course Feedback Portal', 'Anonymous mid-semester feedback with sentiment summaries for faculty.', 'ACTIVE', -60, 30);
    const projEdge = mkProject(U.menon, 'EdgeSense — anomaly detection for campus IoT', 'Streaming anomaly detection on sensor data from the cyber-physical systems lab. Faculty-mentored; open to Sem 5+ students across SCOPE.', 'ACTIVE', -10, 90);

    function mkTeam(project, name, desc) {
      return insert('Project_Team', {
        Project_ID: project, Team_Name: name, Team_Description: desc, Created_At: nowIso(),
      });
    }
    const teamLF = mkTeam(projLF, 'Core Team', 'Full-stack build team.');
    const teamKV = mkTeam(projKV, 'Founding Team', 'Design + implementation.');
    const teamPortal = mkTeam(projPortal, 'Dev Team', 'Student developers under faculty guidance.');
    const teamEdge = mkTeam(projEdge, 'Lab Team', 'Faculty mentor + student developers.');

    function joinTeam(team, user, role, status) {
      return insert('Project_Membership', {
        Project_Team_ID: team, User_ID: user, Team_Role: role,
        Joined_At: nowIso(), Membership_Status: status || 'ACTIVE',
      });
    }
    joinTeam(teamLF, U.kabir, 'LEAD');
    joinTeam(teamLF, U.aarav, 'BACKEND');
    joinTeam(teamLF, U.diya, 'FRONTEND');
    joinTeam(teamKV, U.meera, 'LEAD');
    joinTeam(teamKV, U.rohan, 'MEMBER', 'PENDING');
    joinTeam(teamPortal, U.rao, 'MENTOR');
    joinTeam(teamPortal, U.kabir, 'MEMBER');
    joinTeam(teamEdge, U.menon, 'MENTOR');
    joinTeam(teamEdge, U.ananya, 'MEMBER');
    joinTeam(teamEdge, U.aarav, 'MEMBER', 'PENDING');

    // ---- NOTIFICATIONS --------------------------------------
    function mkNotif(user, title, msg, type, read, hoursAgo) {
      return insert('Notification', {
        User_ID: user, Notification_Title: title, Notification_Message: msg,
        Notification_Type: type, Is_Read: read ? 1 : 0, Created_At: isoPlusHours(-hoursAgo),
      });
    }
    mkNotif(U.aarav, 'Added to your academic groups', 'You were auto-added to your SCOPE school, Database Systems department, B.Tech CSE program, Batch of 2022 and your Semester 5 course groups.', 'GROUP', 1, 72);
    mkNotif(U.aarav, 'New comment on your post', 'Rohan Verma replied to your post about normalization.', 'SOCIAL', 0, 5);
    mkNotif(U.aarav, 'New study material', 'Dr. Suresh Rao uploaded "DA-2 rubric" for CSE3001.', 'ACADEMIC', 0, 3);
    mkNotif(U.diya, 'Your request is live', 'Your carpool request is visible to campus. 0 responses so far.', 'REQUEST', 0, 2);
    mkNotif(U.kabir, 'New reaction', 'Dr. Suresh Rao celebrated your post.', 'SOCIAL', 0, 26);
    mkNotif(U.meera, 'Join request pending', 'Rohan Verma asked to join Founding Team on MiniKV.', 'PROJECT', 0, 10);
    mkNotif(U.rao, 'Announcement published', 'Your announcement "DA-2 submission window extended" is live in the CSE3001 group.', 'ACADEMIC', 1, 1);

    // ---- REPORTS -------------------------------------------
    insert('Report', {
      User_ID: U.rohan, Report_Type: 'POST',
      Report_Reason: 'Suspected spam / off-topic promotion in the campus feed.',
      Report_Status: 'OPEN', Submitted_At: isoPlusHours(-12), Resolved_At: null,
    });
    insert('Report', {
      User_ID: U.diya, Report_Type: 'USER',
      Report_Reason: 'Account "Sana Khan" sending repetitive DMs.',
      Report_Status: 'RESOLVED', Submitted_At: isoPlusHours(-96), Resolved_At: isoPlusHours(-70),
    });

    // ---- AUDIT LOG (a few historical entries) -------------
    function mkAudit(user, action, entity, entityId, hoursAgo) {
      return insert('Audit_Log', {
        User_ID: user, Action_Type: action, Entity_Name: entity, Entity_ID: entityId,
        Action_Time: isoPlusHours(-hoursAgo), IP_Address: '127.0.0.1',
      });
    }
    mkAudit(U.rao, 'CREATE', 'Announcement', 1, 48);
    mkAudit(U.rao, 'CREATE', 'Study_Material', 1, 47);
    mkAudit(U.aarav, 'CREATE', 'Post', P.a, 6);
    mkAudit(U.kabir, 'LOGIN', 'User', U.kabir, 30);
    mkAudit(U.admin, 'RESOLVE', 'Report', 2, 70);
  });

  const counts = {};
  for (const t of ['School', 'Department', 'Program', 'Course', 'Building', 'Room',
    'User', 'Profile', 'Student', 'Faculty', 'Class', 'Timetable',
    'Group', 'Group_Membership', 'Conversation', 'Message', 'Announcement', 'Study_Material',
    'Post', 'Comment', 'Reaction', 'Story',
    'Community', 'Club', 'Event', 'Request', 'Project', 'Notification', 'Report', 'Audit_Log']) {
    counts[t] = get(`SELECT COUNT(*) AS n FROM "${t}"`).n;
  }
  return counts;
}

module.exports = { seed };
