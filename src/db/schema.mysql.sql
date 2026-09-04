-- ===========================================================================
-- CAMPUS CONNECT — MySQL / MariaDB DDL
-- ---------------------------------------------------------------------------
-- This is the finalized DA1 schema (36 relations) verbatim from
-- "VIT SOCIAL DATABASE.sql", PLUS the three additive DA2 extensions
-- (tagged  -- [DA2 EXTENSION]  ). The running application uses the SQLite
-- translation in schema.sql; this file is provided so the design can also be
-- created on a MySQL server unchanged.
--
-- Additive changes only — nothing renamed, nothing removed:
--   1. `Group`.`Course_ID`            made NULLable  (non-course groups)
--   2. `Group`.`Scope_Type` / `Scope_ID`  new NULL columns  (group scoping)
--   3. `Conversation`.`Group_ID`      new NULL column  (link group chat)
--   4. `Conversation_Participant`     new table        (conversation roster)
--   5. `Announcement`.`Is_Official`   new column, default 0  (official notices)
--   6. UNIQUE(`Post_ID`,`User_ID`) on `Reaction`  (enforces DA1 assumption A5)
-- ===========================================================================

CREATE TABLE `School` (
  `School_ID` int PRIMARY KEY AUTO_INCREMENT,
  `School_Name` varchar(255),
  `School_Code` varchar(255) UNIQUE,
  `Address` text,
  `Contact_Email` varchar(255),
  `Contact_Number` varchar(255)
);

CREATE TABLE `Department` (
  `Department_ID` int PRIMARY KEY AUTO_INCREMENT,
  `School_ID` int NOT NULL,
  `Department_Name` varchar(255),
  `Department_Code` varchar(255) UNIQUE,
  `Description` text
);

CREATE TABLE `Program` (
  `Program_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Department_ID` int NOT NULL,
  `Program_Name` varchar(255),
  `Program_Code` varchar(255) UNIQUE,
  `Degree_Level` varchar(255),
  `Duration` int
);

CREATE TABLE `Course` (
  `Course_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Department_ID` int NOT NULL,
  `Program_ID` int NOT NULL,
  `Course_Code` varchar(255) UNIQUE,
  `Course_Name` varchar(255),
  `Credits` int,
  `Semester` int
);

CREATE TABLE `Building` (
  `Building_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Building_Name` varchar(255),
  `Block` varchar(255),
  `Campus` varchar(255)
);

CREATE TABLE `Room` (
  `Room_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Building_ID` int NOT NULL,
  `Room_Number` varchar(255),
  `Floor` int,
  `Capacity` int
);

CREATE TABLE `User` (
  `User_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Full_Name` varchar(255),
  `Email` varchar(255) UNIQUE,
  `Password_Hash` varchar(255),
  `Phone_Number` varchar(255),
  `Account_Status` varchar(255),
  `Created_At` timestamp
);

CREATE TABLE `Profile` (
  `Profile_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int UNIQUE NOT NULL,
  `Profile_Image` varchar(255),
  `Bio` text,
  `Date_Of_Birth` date,
  `Gender` varchar(255)
);

CREATE TABLE `Student` (
  `Student_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int UNIQUE NOT NULL,
  `Program_ID` int NOT NULL,
  `Registration_Number` varchar(255) UNIQUE,
  `Admission_Year` int,
  `Current_Semester` int
);

CREATE TABLE `Faculty` (
  `Faculty_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int UNIQUE NOT NULL,
  `Department_ID` int NOT NULL,
  `Employee_ID` varchar(255) UNIQUE,
  `Designation` varchar(255),
  `Specialization` varchar(255)
);

CREATE TABLE `Class` (
  `Class_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Course_ID` int NOT NULL,
  `Faculty_ID` int NOT NULL,
  `Section` varchar(255),
  `Academic_Year` varchar(255),
  `Semester` int
);

CREATE TABLE `Timetable` (
  `Timetable_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Class_ID` int NOT NULL,
  `Room_ID` int NOT NULL,
  `Day_Of_Week` varchar(255),
  `Start_Time` time,
  `End_Time` time
);

CREATE TABLE `Group` (
  `Group_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Course_ID` int NULL,                         -- [DA2 EXTENSION] was NOT NULL
  `Group_Name` varchar(255),
  `Group_Type` varchar(255),
  `Description` text,
  `Created_At` timestamp,
  `Scope_Type` varchar(32) NULL,                -- [DA2 EXTENSION]
  `Scope_ID` int NULL                           -- [DA2 EXTENSION]
);

CREATE TABLE `Group_Membership` (
  `Membership_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Group_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Role` varchar(255),
  `Joined_At` timestamp,
  `Membership_Status` varchar(255)
);

CREATE TABLE `Conversation` (
  `Conversation_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Conversation_Type` varchar(255),
  `Title` varchar(255),
  `Created_At` timestamp,
  `Group_ID` int NULL                           -- [DA2 EXTENSION]
);

-- [DA2 EXTENSION] new table
CREATE TABLE `Conversation_Participant` (
  `Conversation_Participant_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Conversation_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Joined_At` timestamp,
  UNIQUE (`Conversation_ID`, `User_ID`)
);

CREATE TABLE `Message` (
  `Message_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Conversation_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Message_Content` text,
  `Message_Type` varchar(255),
  `Sent_At` timestamp,
  `Edited_At` timestamp
);

CREATE TABLE `Announcement` (
  `Announcement_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Group_ID` int NOT NULL,
  `Faculty_ID` int NOT NULL,
  `Title` varchar(255),
  `Content` text,
  `Published_At` timestamp,
  `Expiry_Date` date,
  `Is_Official` tinyint(1) NOT NULL DEFAULT 0   -- [DA2 EXTENSION]
);

CREATE TABLE `Study_Material` (
  `Study_Material_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Course_ID` int NOT NULL,
  `Faculty_ID` int NOT NULL,
  `Title` varchar(255),
  `Description` text,
  `File_URL` varchar(255),
  `Uploaded_At` timestamp
);

CREATE TABLE `Post` (
  `Post_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Title` varchar(255),
  `Content` text,
  `Visibility` varchar(255),
  `Created_At` timestamp,
  `Updated_At` timestamp
);

CREATE TABLE `Story` (
  `Story_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Media_URL` varchar(255),
  `Caption` text,
  `Visibility` varchar(255),
  `Expires_At` timestamp,
  `Created_At` timestamp
);

CREATE TABLE `Comment` (
  `Comment_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Post_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Comment_Text` text,
  `Created_At` timestamp,
  `Updated_At` timestamp
);

CREATE TABLE `Reaction` (
  `Reaction_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Post_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Reaction_Type` varchar(255),
  `Reacted_At` timestamp,
  UNIQUE (`Post_ID`, `User_ID`)                 -- [DA2 EXTENSION] enforces assumption A5
);

CREATE TABLE `Community` (
  `Community_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Community_Name` varchar(255),
  `Community_Type` varchar(255),
  `Description` text,
  `Created_At` timestamp
);

CREATE TABLE `Community_Membership` (
  `Community_Membership_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Community_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Membership_Role` varchar(255),
  `Joined_At` timestamp,
  `Membership_Status` varchar(255)
);

CREATE TABLE `Club` (
  `Club_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Club_Name` varchar(255),
  `Category` varchar(255),
  `Description` text,
  `Created_At` timestamp
);

CREATE TABLE `Club_Membership` (
  `Club_Membership_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Club_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Membership_Role` varchar(255),
  `Joined_At` timestamp,
  `Membership_Status` varchar(255)
);

CREATE TABLE `Event` (
  `Event_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Community_ID` int NOT NULL,
  `Event_Title` varchar(255),
  `Event_Description` text,
  `Event_Date` date,
  `Event_Time` time,
  `Event_Location` varchar(255)
);

CREATE TABLE `Request_Category` (
  `Request_Category_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Category_Name` varchar(255),
  `Description` text
);

CREATE TABLE `Request` (
  `Request_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Request_Category_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Request_Title` varchar(255),
  `Request_Description` text,
  `Priority` varchar(255),
  `Status` varchar(255),
  `Created_At` timestamp,
  `Updated_At` timestamp
);

CREATE TABLE `Project` (
  `Project_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Project_Name` varchar(255),
  `Description` text,
  `Start_Date` date,
  `End_Date` date,
  `Project_Status` varchar(255)
);

CREATE TABLE `Project_Team` (
  `Project_Team_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Project_ID` int NOT NULL,
  `Team_Name` varchar(255),
  `Team_Description` text,
  `Created_At` timestamp
);

CREATE TABLE `Project_Membership` (
  `Project_Membership_ID` int PRIMARY KEY AUTO_INCREMENT,
  `Project_Team_ID` int NOT NULL,
  `User_ID` int NOT NULL,
  `Team_Role` varchar(255),
  `Joined_At` timestamp,
  `Membership_Status` varchar(255)
);

CREATE TABLE `File` (
  `File_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `File_Name` varchar(255),
  `File_Type` varchar(255),
  `File_Size` bigint,
  `Storage_Path` varchar(255),
  `Uploaded_At` timestamp
);

CREATE TABLE `Notification` (
  `Notification_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Notification_Title` varchar(255),
  `Notification_Message` text,
  `Notification_Type` varchar(255),
  `Is_Read` boolean,
  `Created_At` timestamp
);

CREATE TABLE `Report` (
  `Report_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Report_Type` varchar(255),
  `Report_Reason` text,
  `Report_Status` varchar(255),
  `Submitted_At` timestamp,
  `Resolved_At` timestamp
);

CREATE TABLE `Audit_Log` (
  `Audit_Log_ID` int PRIMARY KEY AUTO_INCREMENT,
  `User_ID` int NOT NULL,
  `Action_Type` varchar(255),
  `Entity_Name` varchar(255),
  `Entity_ID` int,
  `Action_Time` timestamp,
  `IP_Address` varchar(255)
);

-- ---- Foreign keys (DA1) --------------------------------------------------
ALTER TABLE `Department` ADD FOREIGN KEY (`School_ID`) REFERENCES `School` (`School_ID`);
ALTER TABLE `Program` ADD FOREIGN KEY (`Department_ID`) REFERENCES `Department` (`Department_ID`);
ALTER TABLE `Course` ADD FOREIGN KEY (`Department_ID`) REFERENCES `Department` (`Department_ID`);
ALTER TABLE `Course` ADD FOREIGN KEY (`Program_ID`) REFERENCES `Program` (`Program_ID`);
ALTER TABLE `Room` ADD FOREIGN KEY (`Building_ID`) REFERENCES `Building` (`Building_ID`);
ALTER TABLE `Student` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Student` ADD FOREIGN KEY (`Program_ID`) REFERENCES `Program` (`Program_ID`);
ALTER TABLE `Faculty` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Faculty` ADD FOREIGN KEY (`Department_ID`) REFERENCES `Department` (`Department_ID`);
ALTER TABLE `Profile` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Class` ADD FOREIGN KEY (`Course_ID`) REFERENCES `Course` (`Course_ID`);
ALTER TABLE `Class` ADD FOREIGN KEY (`Faculty_ID`) REFERENCES `Faculty` (`Faculty_ID`);
ALTER TABLE `Timetable` ADD FOREIGN KEY (`Class_ID`) REFERENCES `Class` (`Class_ID`);
ALTER TABLE `Timetable` ADD FOREIGN KEY (`Room_ID`) REFERENCES `Room` (`Room_ID`);
ALTER TABLE `Group` ADD FOREIGN KEY (`Course_ID`) REFERENCES `Course` (`Course_ID`);
ALTER TABLE `Group_Membership` ADD FOREIGN KEY (`Group_ID`) REFERENCES `Group` (`Group_ID`);
ALTER TABLE `Group_Membership` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Message` ADD FOREIGN KEY (`Conversation_ID`) REFERENCES `Conversation` (`Conversation_ID`);
ALTER TABLE `Message` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Announcement` ADD FOREIGN KEY (`Group_ID`) REFERENCES `Group` (`Group_ID`);
ALTER TABLE `Announcement` ADD FOREIGN KEY (`Faculty_ID`) REFERENCES `Faculty` (`Faculty_ID`);
ALTER TABLE `Study_Material` ADD FOREIGN KEY (`Course_ID`) REFERENCES `Course` (`Course_ID`);
ALTER TABLE `Study_Material` ADD FOREIGN KEY (`Faculty_ID`) REFERENCES `Faculty` (`Faculty_ID`);
ALTER TABLE `Post` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Story` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Comment` ADD FOREIGN KEY (`Post_ID`) REFERENCES `Post` (`Post_ID`);
ALTER TABLE `Comment` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Reaction` ADD FOREIGN KEY (`Post_ID`) REFERENCES `Post` (`Post_ID`);
ALTER TABLE `Reaction` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Community_Membership` ADD FOREIGN KEY (`Community_ID`) REFERENCES `Community` (`Community_ID`);
ALTER TABLE `Community_Membership` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Club_Membership` ADD FOREIGN KEY (`Club_ID`) REFERENCES `Club` (`Club_ID`);
ALTER TABLE `Club_Membership` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Event` ADD FOREIGN KEY (`Community_ID`) REFERENCES `Community` (`Community_ID`);
ALTER TABLE `Request` ADD FOREIGN KEY (`Request_Category_ID`) REFERENCES `Request_Category` (`Request_Category_ID`);
ALTER TABLE `Request` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Project` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Project_Team` ADD FOREIGN KEY (`Project_ID`) REFERENCES `Project` (`Project_ID`);
ALTER TABLE `Project_Membership` ADD FOREIGN KEY (`Project_Team_ID`) REFERENCES `Project_Team` (`Project_Team_ID`);
ALTER TABLE `Project_Membership` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `File` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Notification` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Report` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
ALTER TABLE `Audit_Log` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);

-- ---- Foreign keys (DA2 additive) --------------------------------------
ALTER TABLE `Conversation` ADD FOREIGN KEY (`Group_ID`) REFERENCES `Group` (`Group_ID`);
ALTER TABLE `Conversation_Participant` ADD FOREIGN KEY (`Conversation_ID`) REFERENCES `Conversation` (`Conversation_ID`);
ALTER TABLE `Conversation_Participant` ADD FOREIGN KEY (`User_ID`) REFERENCES `User` (`User_ID`);
