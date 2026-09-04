-- ===========================================================================
-- CAMPUS CONNECT  --  DATABASE SCHEMA
-- ---------------------------------------------------------------------------
-- This file implements the FINALIZED DA1 relational design (36 relations)
-- for SQLite. Table names, column names, primary keys, foreign keys and
-- UNIQUE / alternate keys are preserved exactly as in RELATIONAL SCHEMA.txt.
--
-- SQLite notes:
--   * `int ... AUTO_INCREMENT`  ->  `INTEGER PRIMARY KEY AUTOINCREMENT`
--   * `varchar(n)` / `text` / `timestamp` / `date` / `time`  ->  TEXT
--   * `boolean`  ->  INTEGER (0/1)
--   * identifiers that collide with keywords are quoted ("Group").
--
-- Every deviation from DA1 is additive only (new nullable columns / new
-- tables), never a rename or removal, and is tagged  [DA2 EXTENSION]  with
-- the justification. See README.md section "Schema extensions".
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- MODULE 1 : ACADEMIC STRUCTURE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS School (
  School_ID       INTEGER PRIMARY KEY AUTOINCREMENT,
  School_Name     TEXT,
  School_Code     TEXT UNIQUE,                 -- AK
  Address         TEXT,
  Contact_Email   TEXT,
  Contact_Number  TEXT
);

CREATE TABLE IF NOT EXISTS Department (
  Department_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  School_ID        INTEGER NOT NULL REFERENCES School(School_ID),
  Department_Name  TEXT,
  Department_Code  TEXT UNIQUE,                 -- AK
  Description      TEXT
);

CREATE TABLE IF NOT EXISTS Program (
  Program_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Department_ID INTEGER NOT NULL REFERENCES Department(Department_ID),
  Program_Name  TEXT,
  Program_Code  TEXT UNIQUE,                    -- AK
  Degree_Level  TEXT,
  Duration      INTEGER
);

CREATE TABLE IF NOT EXISTS Course (
  Course_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  Department_ID INTEGER NOT NULL REFERENCES Department(Department_ID),
  Program_ID    INTEGER NOT NULL REFERENCES Program(Program_ID),
  Course_Code   TEXT UNIQUE,                    -- AK
  Course_Name   TEXT,
  Credits       INTEGER,
  Semester      INTEGER
);

CREATE TABLE IF NOT EXISTS Building (
  Building_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Building_Name TEXT,
  Block         TEXT,
  Campus        TEXT
);

CREATE TABLE IF NOT EXISTS Room (
  Room_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  Building_ID INTEGER NOT NULL REFERENCES Building(Building_ID),
  Room_Number TEXT,
  Floor       INTEGER,
  Capacity    INTEGER
);

-- ---------------------------------------------------------------------------
-- MODULE 2 : IDENTITY & ROLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "User" (
  User_ID        INTEGER PRIMARY KEY AUTOINCREMENT,
  Full_Name      TEXT,
  Email          TEXT UNIQUE,                   -- AK
  Password_Hash  TEXT,
  Phone_Number   TEXT,
  Account_Status TEXT,                          -- ACTIVE | SUSPENDED | DEACTIVATED
  Created_At     TEXT
);

CREATE TABLE IF NOT EXISTS Profile (
  Profile_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID       INTEGER NOT NULL UNIQUE REFERENCES "User"(User_ID),  -- AK, weak entity of User
  Profile_Image TEXT,
  Bio           TEXT,
  Date_Of_Birth TEXT,
  Gender        TEXT
);

CREATE TABLE IF NOT EXISTS Student (
  Student_ID          INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID             INTEGER NOT NULL UNIQUE REFERENCES "User"(User_ID),      -- AK
  Program_ID          INTEGER NOT NULL REFERENCES Program(Program_ID),
  Registration_Number TEXT UNIQUE,                                             -- AK
  Admission_Year      INTEGER,
  Current_Semester    INTEGER
);

CREATE TABLE IF NOT EXISTS Faculty (
  Faculty_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID        INTEGER NOT NULL UNIQUE REFERENCES "User"(User_ID),           -- AK
  Department_ID  INTEGER NOT NULL REFERENCES Department(Department_ID),
  Employee_ID    TEXT UNIQUE,                                                  -- AK
  Designation    TEXT,
  Specialization TEXT
);

CREATE TABLE IF NOT EXISTS Class (
  Class_ID      INTEGER PRIMARY KEY AUTOINCREMENT,
  Course_ID     INTEGER NOT NULL REFERENCES Course(Course_ID),
  Faculty_ID    INTEGER NOT NULL REFERENCES Faculty(Faculty_ID),
  Section       TEXT,
  Academic_Year TEXT,
  Semester      INTEGER
);

CREATE TABLE IF NOT EXISTS Timetable (
  Timetable_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Class_ID     INTEGER NOT NULL REFERENCES Class(Class_ID),
  Room_ID      INTEGER NOT NULL REFERENCES Room(Room_ID),
  Day_Of_Week  TEXT,
  Start_Time   TEXT,
  End_Time     TEXT
);

-- ---------------------------------------------------------------------------
-- MODULE 3 : COMMUNICATION & LEARNING RESOURCES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Group" (
  Group_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Course_ID   INTEGER REFERENCES Course(Course_ID),   -- [DA2 EXTENSION] nullable (was NOT NULL):
                                                      --   allows class/program/department/school/year/
                                                      --   student-only groups (product spec section 4).
  Group_Name  TEXT,
  Group_Type  TEXT,
  Description TEXT,
  Created_At  TEXT,
  Scope_Type  TEXT,    -- [DA2 EXTENSION] nullable: COURSE|CLASS|PROGRAM|DEPARTMENT|SCHOOL|YEAR|STUDENT_ONLY
  Scope_ID    INTEGER  -- [DA2 EXTENSION] nullable: PK of the scoping row (Class_ID / Program_ID / ...),
                       --   or the admission-year integer when Scope_Type = 'YEAR'.
);

CREATE TABLE IF NOT EXISTS Group_Membership (
  Membership_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  Group_ID          INTEGER NOT NULL REFERENCES "Group"(Group_ID),
  User_ID           INTEGER NOT NULL REFERENCES "User"(User_ID),
  Role              TEXT,
  Joined_At         TEXT,
  Membership_Status TEXT
);

CREATE TABLE IF NOT EXISTS Conversation (
  Conversation_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Conversation_Type TEXT,
  Title             TEXT,
  Created_At        TEXT,
  Group_ID          INTEGER REFERENCES "Group"(Group_ID)  -- [DA2 EXTENSION] nullable: links a group
                                                          --   discussion thread to its Group (spec section 4/5).
);

-- [DA2 EXTENSION] new table: resolves conversation membership, which the DA1
-- design left implicit (only inferable from who had sent a Message). Needed
-- for direct messages and group chat rosters (spec section 2/4/5).
CREATE TABLE IF NOT EXISTS Conversation_Participant (
  Conversation_Participant_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Conversation_ID INTEGER NOT NULL REFERENCES Conversation(Conversation_ID),
  User_ID         INTEGER NOT NULL REFERENCES "User"(User_ID),
  Joined_At       TEXT,
  UNIQUE (Conversation_ID, User_ID)
);

CREATE TABLE IF NOT EXISTS Message (
  Message_ID      INTEGER PRIMARY KEY AUTOINCREMENT,
  Conversation_ID INTEGER NOT NULL REFERENCES Conversation(Conversation_ID),
  User_ID         INTEGER NOT NULL REFERENCES "User"(User_ID),
  Message_Content TEXT,
  Message_Type    TEXT,
  Sent_At         TEXT,
  Edited_At       TEXT
);

CREATE TABLE IF NOT EXISTS Announcement (
  Announcement_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Group_ID        INTEGER NOT NULL REFERENCES "Group"(Group_ID),
  Faculty_ID      INTEGER NOT NULL REFERENCES Faculty(Faculty_ID),
  Title           TEXT,
  Content         TEXT,
  Published_At    TEXT,
  Expiry_Date     TEXT,
  Is_Official     INTEGER DEFAULT 0   -- [DA2 EXTENSION] 0/1: marks Dean/HOD/office notices
                                      --   vs. ordinary faculty announcements (spec section 16).
);

CREATE TABLE IF NOT EXISTS Study_Material (
  Study_Material_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Course_ID  INTEGER NOT NULL REFERENCES Course(Course_ID),
  Faculty_ID INTEGER NOT NULL REFERENCES Faculty(Faculty_ID),
  Title       TEXT,
  Description TEXT,
  File_URL    TEXT,
  Uploaded_At TEXT
);

-- ---------------------------------------------------------------------------
-- MODULE 4 : SOCIAL CONTENT
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Post (
  Post_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID    INTEGER NOT NULL REFERENCES "User"(User_ID),
  Title      TEXT,
  Content    TEXT,
  Visibility TEXT,
  Created_At TEXT,
  Updated_At TEXT
);

CREATE TABLE IF NOT EXISTS Story (
  Story_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID    INTEGER NOT NULL REFERENCES "User"(User_ID),
  Media_URL  TEXT,
  Caption    TEXT,
  Visibility TEXT,
  Expires_At TEXT,     -- BR1: Expires_At = Created_At + 24h (set by application on insert)
  Created_At TEXT
);

CREATE TABLE IF NOT EXISTS Comment (
  Comment_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Post_ID      INTEGER NOT NULL REFERENCES Post(Post_ID),
  User_ID      INTEGER NOT NULL REFERENCES "User"(User_ID),
  Comment_Text TEXT,
  Created_At   TEXT,
  Updated_At   TEXT
);

CREATE TABLE IF NOT EXISTS Reaction (
  Reaction_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Post_ID       INTEGER NOT NULL REFERENCES Post(Post_ID),
  User_ID       INTEGER NOT NULL REFERENCES "User"(User_ID),
  Reaction_Type TEXT,
  Reacted_At    TEXT,
  UNIQUE (Post_ID, User_ID)   -- [DA2 EXTENSION] enforces DA1 assumption A5
                              --   (at most one reaction per user per post).
);

-- ---------------------------------------------------------------------------
-- MODULE 5 : ORGANIZATION & COLLABORATION
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Community (
  Community_ID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Community_Name TEXT,
  Community_Type TEXT,
  Description    TEXT,
  Created_At     TEXT
);

CREATE TABLE IF NOT EXISTS Community_Membership (
  Community_Membership_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Community_ID      INTEGER NOT NULL REFERENCES Community(Community_ID),
  User_ID           INTEGER NOT NULL REFERENCES "User"(User_ID),
  Membership_Role   TEXT,
  Joined_At         TEXT,
  Membership_Status TEXT
);

CREATE TABLE IF NOT EXISTS Club (
  Club_ID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Club_Name  TEXT,
  Category   TEXT,
  Description TEXT,
  Created_At TEXT
);

CREATE TABLE IF NOT EXISTS Club_Membership (
  Club_Membership_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Club_ID           INTEGER NOT NULL REFERENCES Club(Club_ID),
  User_ID           INTEGER NOT NULL REFERENCES "User"(User_ID),
  Membership_Role   TEXT,
  Joined_At         TEXT,
  Membership_Status TEXT
);

CREATE TABLE IF NOT EXISTS Event (
  Event_ID          INTEGER PRIMARY KEY AUTOINCREMENT,
  Community_ID       INTEGER NOT NULL REFERENCES Community(Community_ID),
  Event_Title       TEXT,
  Event_Description  TEXT,
  Event_Date        TEXT,
  Event_Time        TEXT,
  Event_Location    TEXT
);

-- ---------------------------------------------------------------------------
-- MODULE 6 : SUPPORTING SERVICES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Request_Category (
  Request_Category_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Category_Name       TEXT,
  Description         TEXT
);

CREATE TABLE IF NOT EXISTS Request (
  Request_ID          INTEGER PRIMARY KEY AUTOINCREMENT,
  Request_Category_ID INTEGER NOT NULL REFERENCES Request_Category(Request_Category_ID),
  User_ID             INTEGER NOT NULL REFERENCES "User"(User_ID),
  Request_Title       TEXT,
  Request_Description TEXT,
  Priority            TEXT,
  Status              TEXT,
  Created_At          TEXT,
  Updated_At          TEXT
);

CREATE TABLE IF NOT EXISTS Project (
  Project_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID        INTEGER NOT NULL REFERENCES "User"(User_ID),
  Project_Name   TEXT,
  Description    TEXT,
  Start_Date     TEXT,
  End_Date       TEXT,
  Project_Status TEXT
);

CREATE TABLE IF NOT EXISTS Project_Team (
  Project_Team_ID  INTEGER PRIMARY KEY AUTOINCREMENT,
  Project_ID       INTEGER NOT NULL REFERENCES Project(Project_ID),
  Team_Name        TEXT,
  Team_Description TEXT,
  Created_At       TEXT
);

CREATE TABLE IF NOT EXISTS Project_Membership (
  Project_Membership_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Project_Team_ID   INTEGER NOT NULL REFERENCES Project_Team(Project_Team_ID),
  User_ID           INTEGER NOT NULL REFERENCES "User"(User_ID),
  Team_Role         TEXT,
  Joined_At         TEXT,
  Membership_Status TEXT
);

CREATE TABLE IF NOT EXISTS "File" (
  File_ID      INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID      INTEGER NOT NULL REFERENCES "User"(User_ID),
  File_Name    TEXT,
  File_Type    TEXT,
  File_Size    INTEGER,
  Storage_Path TEXT,
  Uploaded_At  TEXT
);

CREATE TABLE IF NOT EXISTS Notification (
  Notification_ID      INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID              INTEGER NOT NULL REFERENCES "User"(User_ID),
  Notification_Title   TEXT,
  Notification_Message TEXT,
  Notification_Type    TEXT,
  Is_Read              INTEGER,
  Created_At           TEXT
);

CREATE TABLE IF NOT EXISTS Report (
  Report_ID     INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID       INTEGER NOT NULL REFERENCES "User"(User_ID),
  Report_Type   TEXT,
  Report_Reason TEXT,
  Report_Status TEXT,
  Submitted_At  TEXT,
  Resolved_At   TEXT
);

CREATE TABLE IF NOT EXISTS Audit_Log (
  Audit_Log_ID INTEGER PRIMARY KEY AUTOINCREMENT,
  User_ID      INTEGER NOT NULL REFERENCES "User"(User_ID),
  Action_Type  TEXT,
  Entity_Name  TEXT,
  Entity_ID    INTEGER,
  Action_Time  TEXT,
  IP_Address   TEXT
);

-- ---------------------------------------------------------------------------
-- Helpful indexes (performance only - no effect on the logical design)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_user     ON Student(User_ID);
CREATE INDEX IF NOT EXISTS idx_faculty_user     ON Faculty(User_ID);
CREATE INDEX IF NOT EXISTS idx_gm_group         ON Group_Membership(Group_ID);
CREATE INDEX IF NOT EXISTS idx_gm_user          ON Group_Membership(User_ID);
CREATE INDEX IF NOT EXISTS idx_group_scope      ON "Group"(Scope_Type, Scope_ID);
CREATE INDEX IF NOT EXISTS idx_comment_post     ON Comment(Post_ID);
CREATE INDEX IF NOT EXISTS idx_reaction_post    ON Reaction(Post_ID);
CREATE INDEX IF NOT EXISTS idx_notif_user       ON Notification(User_ID, Is_Read);
CREATE INDEX IF NOT EXISTS idx_msg_conv         ON Message(Conversation_ID);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON Audit_Log(Entity_Name, Entity_ID);
