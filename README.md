

# Campus Connect
site link : https://campus-connect-latest.onrender.com *(live demo on Render's free tier, which can take about a minute to wake up; it has no Neo4j, so the Campus graph page shows "graph database isn't running", and it uses the demo and sample accounts only. Run it locally for the full project.)*

> **DA3: Neo4j graph database.** This branch (`da3-neo4j-graph`) extends the project with **Neo4j**: SQLite stays the
> system of record, and a graph copy of the relationship data powers the **Campus graph** page (connections, people
> you may know, shortest path, recommendations). Everything for DA3 is in this repository:
> the report **[DA3_Report_Final.pdf](DA3_Report_Final.pdf)** (screenshots in `report screenshots/`), the write-up
> **[DA3.md](DA3.md)**, the Neo4j code in `src/graph/`, and the graph itself plus every Cypher query of the report in
> **[`neo4j/`](neo4j/)**. Quick start: `npm start` runs the app (SQLite, no setup). The graph page also needs Neo4j,
> see [DA3 — Neo4j graph database](#da3--neo4j-graph-database).

A campus **social + academic networking platform** — students, faculty, academic
groups, study material, a social feed, communities, clubs, projects, peer help
and campus services in one app.

Built on the **finalized DA1 relational design (36 relations)**. Table names,
columns, primary keys, foreign keys and UNIQUE/alternate keys are preserved
exactly. Seven small **additive** changes were made for features the brief asks
for that the base schema could not express — see [Schema extensions](#schema-extensions).

> **Build status: complete.** Every module from the brief is implemented with
> working create / read / update / join / respond flows — auth, profile, the
> academic module (incl. faculty study-material upload), academic groups with
> auto-allocation, the social feed, direct + group messaging, communities,
> clubs, events, projects & co-work, requests / peer-help / carpool, a personal
> file vault, notifications, search, the dashboard, a staff moderation console
> and a staff audit-log viewer. All 36 relations are used. Tested end-to-end
> (see [Verification](#verification-this-build)).

---

## Stack

| | |
|---|---|
| Runtime | Node.js **≥ 22.5** (tested on v24). Uses the built-in `node:sqlite` — **no native build step** |
| Server | Express 4 + EJS server-rendered views |
| DB | SQLite file (`campus_connect.db`), created and seeded automatically on first run |
| Auth | `express-session` cookie sessions + `bcryptjs` password hashing |
| Front-end | Server-rendered HTML + one small `public/js/app.js` for progressive enhancement. Works with JavaScript disabled. |

No build tools and no bundler. The app itself needs no external service; the only optional one is **Neo4j** (DA3), used just by the Campus graph page. All packages are pure JavaScript, and `node_modules` is included in the repository.

---

## Run it

```bash
git clone --branch da3-neo4j-graph https://github.com/aayushbhardwaj2506/CAMPUS-CONNECT.git
cd CAMPUS-CONNECT
npm install      # optional: node_modules is already included in the repository
npm start
```

Needs Node.js 22.5 or newer. Open **http://localhost:3000** and sign in with a test account below.

On first start the app creates the SQLite schema and loads the demo seed
automatically. To reseed at any time:

```bash
npm run seed
```

Other scripts:

| script | what it does |
|---|---|
| `npm start` | run the app (auto-creates + auto-seeds an empty DB) |
| `npm run dev` | same, with `--watch` auto-restart |
| `npm run init-db` | create the schema only, no data |
| `npm run seed` | wipe every table and reload the demo data (transactional) |
| `npm run seed:samples` | add the 30 sample student accounts to the current database (skips ones that exist; nothing is wiped) |
| `npm run reset-db` | delete the `.db` files for a bare-metal reset |

> **Windows + OneDrive note:** the project sits inside a OneDrive folder, which
> occasionally holds a lock on `campus_connect.db` and makes `npm run reset-db`
> report `EPERM`. This is harmless — use `npm run seed`, which rebuilds every
> table inside a transaction without needing to delete the file.

### Run it in a container (no Node.js needed on your machine)

- **GitHub Codespaces / VS Code Dev Containers.** [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) builds a
  Node.js 22 container, runs `npm install` and `npm start`, forwards port 3000 and opens the app in the browser.
  On GitHub: **Code → Codespaces → Create codespace on `da3-neo4j-graph`**.
- **Docker.** `docker compose up --build` builds the app from the `Dockerfile` and puts it behind nginx
  ([`docker-compose.yml`](docker-compose.yml), [`nginx/nginx.conf`](nginx/nginx.conf)); open **http://localhost:8080**.

Neo4j is not part of these containers, so the **Campus graph** page shows "graph database isn't running" until a Neo4j is
connected (see [DA3 — Neo4j graph database](#da3--neo4j-graph-database)); every other page works.

---

## Test accounts

All passwords: **`campus123`**

| Email | Role | Notes |
|---|---|---|
| `aayush@campus.edu` | Student | Aayush Bhardwaj · B.Tech CSE, batch 2022, semester 5 — richest demo account |
| `diya@campus.edu` | Student | B.Tech CSE, sem 5 |
| `rohan@campus.edu` | Student | B.Tech CSE, sem 5 |
| `ananya@campus.edu` | Student | B.Tech ECE, sem 5 |
| `kabir@campus.edu` | Student | Final-year CSE, owns a project |
| `meera@campus.edu` | Student | M.Tech Software Engineering, sem 1 |
| `sana@campus.edu` | Student | **SUSPENDED** — demonstrates blocked login |
| `dean@campus.edu` | Faculty | Designation **Dean** — can post *official* announcements |
| `suresh.rao@campus.edu` | Faculty | **Professor & HOD**, teaches DBMS — official announcements + study material |
| `latha.menon@campus.edu` | Faculty | Associate Professor, teaches OS / ML |
| `vikram.bose@campus.edu` | Faculty | Assistant Professor, ECE |
| `admin@campus.edu` | Staff | No Student/Faculty record → treated as campus **staff / moderator** |

You can also register a brand-new student or faculty account from `/register` and
watch group auto-allocation run.

---

## What's implemented

### Authentication & account
- Register (student or faculty) with validation, login, logout, session cookies
- `Account_Status` respected — suspended/deactivated accounts cannot sign in or act
- Passwords stored as bcrypt hashes in `User.Password_Hash`
- Every login/logout/create/update writes an `Audit_Log` row

### Profile
- View own profile and any other user's (`/u/:id`)
- Edit name, phone, bio ("About me", hostel/day-scholar text, etc.), date of birth
  ("birthday"), gender, profile image URL
- Students see program / department / school / registration no. / admission year /
  current semester; faculty see designation / department / employee ID / specialization
- Fixed academic records (program, reg. number) are read-only; students can update
  current semester, faculty can update designation/specialization
- Per-user **engagement score** (see [Leaderboard](#leaderboard))

### Academic module
- Browse Schools → Departments → Programs → Courses
- Department page: programs, courses, faculty
- Program page: curriculum grouped by semester, enrolled-student count
- Course page: sections/classes with faculty and timetable slots, study material,
  link to the course group
- **My timetable** — a full week view, derived for students via program + current
  semester, and for faculty from the classes they teach
- **Study materials library** with search + course filter
- Buildings & rooms directory

### Academic groups + auto-allocation
- On registration **and on every login**, a student is placed into their
  **student-only**, **school**, **department**, **program**, **batch/year**,
  **course** and **class/section** groups. Faculty are placed into their school,
  department, and the course/class groups they teach (as `MODERATOR`).
- Groups are **created on demand** the first time someone is eligible — nothing
  random is ever generated. Each group carries `Scope_Type` + `Scope_ID`.
- The UI shows **why** you're in each group ("Auto-added: this course is in your
  current semester", etc.)
- Group page: about, member list (with student/faculty badges), announcements,
  and a **discussion thread** (backed by `Conversation` + `Message`, linked to the
  group via the DA2 `Conversation.Group_ID`, roster in `Conversation_Participant`)
- Join / leave; create your own **interest group** (`Group_Type = 'INTEREST'`)
- **Faculty announcements** posted to a group, with an **Official** flag that only
  takes effect if the poster's designation is Dean / HOD / Head / Director /
  Registrar / Principal — notifies every other group member

### Social feed
- Create / edit / delete posts, with `PUBLIC` / `CAMPUS` / `PRIVATE` visibility
- Comment (create / edit / delete), reply notifications to the post author
- React (Like / Celebrate / Support / Insightful / Curious) — **one reaction per
  user per post**, toggling and switching handled; author is notified
- **Stories** — 24-hour expiry set by the app on insert (`Expires_At = now + 24h`);
  expired stories are filtered out of every read
- **Report** a post → creates a `Report` row for the moderation desk

### Messaging
- **Direct messages** — start from any profile or `/messages/new`, one DIRECT
  `Conversation` per pair (reused if it exists), roster in `Conversation_Participant`
- **Group conversations** — the group discussion threads appear in the same inbox
- Thread view with chat bubbles, participant chips, send box; recipients notified

### Communities
- Browse / create communities (`Community_Type` categories), join / leave with
  `Membership_Role` + `Membership_Status`, member list
- **Community events** — members add events (`Event` belongs to a `Community`),
  every other member is notified

### Clubs
- Browse clubs grouped by `Category`, create a club (categories include a
  **Custom** free-text option for interests like badminton, cricket, photography,
  morning walk, gym…), join / leave, member roster with roles

### Events
- Campus-wide upcoming / past event lists, event detail with host community and a
  "join the community to take part" path

### Projects & co-work
- Create a project (auto-creates a "Core Team" with you as `LEAD`), project detail
  with all teams and members (role + `Membership_Status`)
- Owner: change status / end date, add more teams, **approve / decline** join requests
- **Co-work** — anyone can *ask to co-work* on a team → `Membership_Status = 'PENDING'`,
  owner is notified, approval flips it to `ACTIVE`; members can leave
- **Project lookup** — search projects by name / description / status

### Requests, peer help & carpool
- `Request_Category` list with counts (Academic Help, Campus Help, Technical Help,
  Carpool / Ride-share, Peer Mentoring, General…)
- Raise a request (category, title, description, priority); request dashboard with
  *your requests* + a filterable campus browse (category / status / priority / search)
- Request detail tracks status + timestamps; owner updates status/priority; anyone
  else can **offer to help / join** (e.g. share a carpool) — the requester is
  notified and the request auto-moves to `IN_PROGRESS`

### File vault
- Personal file registry (`File`): register file metadata (name, type, size),
  list with human-readable sizes, remove. Storage paths are generated internally
  and never shown. Faculty study-material uploads also drop a `File` row here.

### Reporting & moderation (staff)
- Anyone can file a `Report` (on a post, a user account, or a general problem)
- **Moderation console** (`/moderation`, staff only): queue with status filter and
  counts, report detail, status workflow `OPEN → REVIEWING → RESOLVED / DISMISSED`
  — resolving stamps `Resolved_At` and notifies the reporter

### Audit log viewer (staff)
- `/audit` (staff only): every `Audit_Log` row with filters by action type and
  entity, paginated, showing user / action / polymorphic entity ref / IP / time

### Notifications
- Notification centre with all / unread filter, unread badge in the top bar,
  mark-one-read and mark-all-read
- Generated by real events: welcome + auto-group summary on signup, new comment,
  new reaction, group announcement, new study material, project join request +
  approval, event created, request response, moderation decision, new message

### Search & discovery
- One search box over people, courses, groups, communities, clubs, projects,
  events, study materials and requests — every result links to its real page

### Dashboard
- Greeting with academic identity + role badge
- Stories strip, quick-compose box, announcements for you (official first)
- Recent feed, today's classes, your groups (with the "why"), engagement
  leaderboard, upcoming events, your communities/clubs, your requests, your
  projects, recent notifications — every card links through to its real page

### Role-aware experience
- **Student**: academic identity + timetable, student/course groups, feed,
  projects, requests/peer-help, communities/clubs, messaging
- **Faculty**: department/course/class info, **study-material upload**, group
  **announcements** (with the official flag when Dean/HOD/Head/Director), student
  messaging, community/club participation
- **Staff** (a `User` with no Student/Faculty row): everything above **plus** the
  moderation console and the audit-log viewer. One platform, `requireRole` gates
  the staff-only areas (students/faculty get a 403).

### Leaderboard
`src/lib/engagement.js` — an **application-level derived metric**. The DA1 schema
has no points column, so nothing is written back. The score is computed on demand
from real rows: posts ×5, comments ×2, reactions given ×1, reactions received ×2,
group memberships ×1, community ×3, club ×3, project-team ×4, study material ×6,
announcement ×4. The dashboard shows the full breakdown.

---

## Feature status — all complete

| Module | Pages | Actions that hit the DB |
|---|:---:|---|
| Auth / session | ✅ | register, login, logout, suspended-account block |
| Profile | ✅ | view, edit, message another user, report account |
| Academic (schools→rooms, timetable) | ✅ | browse tree, derived timetable |
| Study materials | ✅ | browse/filter, **faculty upload** (+ File row + group notify) |
| Academic groups + auto-allocation | ✅ | auto-join, join/leave, create interest group, discussion, faculty announce (official) |
| Social feed | ✅ | post CRUD, comment CRUD, react (unique/toggle), stories (24h), report |
| Messaging | ✅ | start DM, send in DM + group thread |
| Communities | ✅ | create, join/leave, add events |
| Clubs | ✅ | create (Custom category), join/leave |
| Events | ✅ | browse upcoming/past, detail, join host community |
| Projects & co-work | ✅ | create (+Core Team), add teams, ask to co-work, approve/decline, leave, status, search |
| Requests / peer-help / carpool | ✅ | raise, browse/filter, update status, offer help/join |
| File vault | ✅ | register metadata, remove |
| Notifications | ✅ | list, filter, mark one / all read |
| Search | ✅ | 9 entity types, links to real pages |
| Moderation console (staff) | ✅ | queue + filter, status workflow, notify reporter |
| Audit log viewer (staff) | ✅ | filter by action/entity, paginate |
| Dashboard | ✅ | aggregates all of the above |

---

## DA3 — Neo4j graph database

DA3 extends the same project with **Neo4j** (a graph database). SQLite stays the app's main
database; Neo4j holds a copy of the *relationship* data (people, classes, clubs, projects…) so
questions like friends-of-friends, shortest path and recommendations are short Cypher queries.
Full write-up (model, relational→graph mapping, comparison, structure of the report): **[DA3.md](DA3.md)**.
Demo walk-through: **[DA3_DEMO_SCRIPT.txt](DA3_DEMO_SCRIPT.txt)**.

**Set up**
1. Run Neo4j: Neo4j Desktop (create a local instance, set a password, Start) or a free Neo4j Aura instance.
2. Create `.env.local` (git-ignored) with `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (see `.env.example`).
3. `npm run graph:import` — copies SQLite → Neo4j (people, classes, clubs, projects…) and derives the `CONNECTED` links.
4. `npm start` → open **Campus graph** (`/graph`). The **⟳ Sync graph** button repeats step 3.

| Command | What it does |
|---|---|
| `npm run graph:import` | rebuild the graph from the current SQLite data |
| `npm run graph:load` | load the stored graph, [`neo4j/campus_graph.cypher`](neo4j/campus_graph.cypher), into an **empty** Neo4j database (no SQLite import needed; add `-- --wipe` to clear a database first) |
| `npm run graph:export` | write the running Neo4j graph back to `neo4j/campus_graph.cypher` |
| `npm run graph:demo` | create / read / update / delete + the six Cypher queries, printed in the terminal |
| `npm run sqlite:demo` | prepared SQL demo on the SQLite database (joins, reports, constraints) |
| `npm run sql` | read-only SQL prompt for running your own queries |

Without Neo4j configured the rest of the app works normally; `/graph` shows a "graph database
isn't running" message.

**The `neo4j/` folder** holds the Neo4j side of the project as plain text, so it can be read and run without the app:
- [`neo4j/campus_graph.cypher`](neo4j/campus_graph.cypher): the whole graph (1,324 nodes, 7,482 relationships, 11 constraints) as one Cypher script. Load it with `npm run graph:load`, or paste it into Neo4j Browser / `cypher-shell -f`. It was loaded into a second database and compared with the original: every node, relationship and property was identical.
- [`neo4j/report_queries.cypher`](neo4j/report_queries.cypher): every Cypher statement of the report (structure, create/read/update/delete, and the ten queries in table and graph form), ready to run one at a time.

Neo4j can be run with Neo4j Desktop (used for the report, server 2026.10.0), with the Docker file `docker-compose.neo4j.yml`
(`npm run graph:up`, Neo4j 5 Community), or with a free Neo4j Aura instance. The scripts above are plain Cypher and work on all of them.
Set `NEO4J_DATABASE` in `.env.local` only if the graph should go into a database other than the default one.

**Seed data (`data/`):** the class list (`d2-slot.json`), the Fall 2026-27 teacher list
(`fall26-faculty.json`) and the class catalogue (`fall26-classes.json`) used for the real student,
teacher and class-registration data are in the `data/` folder. `npm run seed` loads them automatically
if they are present; without them it creates only the demo accounts. Either way it also adds 30 sample student accounts (fictional names, `<first>.<last>@campus.edu` / `campus123`). Passwords and database
files (`.env.local`, `.env.aura`, `campus_connect.db`) are NOT in the repository.

---

## Schema extensions

All additive. Nothing in the finalized DA1 design was renamed or removed.
Both `src/db/schema.sql` (SQLite, used at runtime) and `src/db/schema.mysql.sql`
(the finalized MySQL DDL + these changes) tag every one with `[DA2 EXTENSION]`.

| # | Change | Why | Reversible? |
|---|---|---|---|
| 1 | `Group.Course_ID` → **NULLable** (was `NOT NULL`) | Brief §4 wants class-, department-, school-, year- and student-only groups. The base schema tied every group to one course. | Yes — re-add `NOT NULL` once only course groups are needed. |
| 2 | `Group.Scope_Type`, `Group.Scope_ID` — new NULL columns | Records what a non-course group is scoped to (`PROGRAM` → `Program_ID`, `YEAR` → admission year, …) so auto-allocation is deterministic and idempotent. | Yes — drop the two columns. |
| 3 | `Conversation.Group_ID` — new NULL column | Brief §4/§5: groups must support discussion. `Message` only linked to `Conversation`; there was no `Group ↔ Conversation` link. | Yes — drop the column. |
| 4 | `Conversation_Participant` — new table (`Conversation_ID`, `User_ID`, `Joined_At`, UNIQUE pair) | The Chen model itself flags that conversation membership was only inferable from who had sent a message. Needed for group-chat and DM rosters. | Yes — drop the table. |
| 5 | `Announcement.Is_Official` — new column, default `0` | Brief §16: distinguish Dean/HOD/office notices from ordinary faculty announcements. | Yes — drop the column. |
| 6 | `UNIQUE (Post_ID, User_ID)` on `Reaction` | Enforces DA1's own documented assumption **A5** ("at most one reaction per user per post"). | Yes — drop the constraint. |
| 7 | `Class.Slot_Code` — new NULL column (e.g. `D2+TD2`, `L7+L8`) | Course registration works by slot: a student picks slot → course → faculty. The slot code lets the app generate a class's `Timetable` rows from the slot chart (`src/lib/slots.js`). Registration itself needs no new table: it is `Group_Membership` in the class's `CLASS`-scope group. Classes without a slot code are still auto-allocated by program + semester. | Yes — drop the column. |

No DA1 decision was changed silently. `Course.Department_ID` + `Course.Program_ID`
redundancy, `Student.Current_Semester` as stored (not derived), and the
Student/Faculty-as-1:1 (not EER ISA) modelling are all left exactly as finalized.

---

## Database → feature map (all 36 relations)

| Relation(s) | Used by |
|---|---|
| `School`, `Department`, `Program`, `Course`, `Building`, `Room` | Academic browse pages, program curriculum, department directory, buildings page |
| `User`, `Profile` | Auth, profile view/edit, avatars, engagement, search |
| `Student`, `Faculty` | Role derivation, academic identity, timetable derivation, group auto-allocation, faculty announcement + study-material rights |
| `Class`, `Timetable` | Course page sections, "My timetable", today's classes on dashboard |
| `Group`, `Group_Membership` | Groups list/detail, auto-allocation, join/leave, interest groups, discussion rosters |
| `Conversation`, `Conversation_Participant`, `Message` | Messages inbox, direct-message threads, group discussion threads |
| `Announcement` | Group announcements, dashboard "Announcements for you", official badge |
| `Study_Material` | Study-materials library, course page materials, faculty upload |
| `File` | Personal file vault; a row is also written on every faculty study-material upload |
| `Post`, `Comment`, `Reaction`, `Story` | Feed, single-post page, dashboard stories/feed, profile posts |
| `Community`, `Community_Membership` | Communities list/detail, create, join/leave, member roster |
| `Event` | Events list/detail, "upcoming events" on dashboard, created from within a community |
| `Club`, `Club_Membership` | Clubs list (by category, incl. Custom) / detail, create, join/leave |
| `Project`, `Project_Team`, `Project_Membership` | Projects list/detail, create, teams, co-work request → approve/decline, project search, engagement score |
| `Request_Category`, `Request` | Requests dashboard, raise, browse/filter, status workflow, offer-to-help / carpool response |
| `Notification` | Notification centre, top-bar badge, ~11 event triggers |
| `Report` | "Report this post" on the feed, "report account" on profiles, moderation console |
| `Audit_Log` | Written on login/logout/create/update/join/leave/message/announce/upload/respond/approve/moderate; staff audit-log viewer |

---

## Verification (this build)

**Database**
- 36 DA1 relations created with original names, PKs, FKs and UNIQUE/AK constraints — see `src/db/schema.sql`
- 7 additive items above, each tagged `[DA2 EXTENSION]` in both schema files
- Fresh seed (without `data/`): 42 users (12 demo accounts + 30 sample students), 3 schools / 3 departments / 3 programs / 8 courses, 7 classes, 36 auto-created scope groups, 321 group memberships, plus feed / message / community / club / event / project / request / file / notification / report / audit rows

**Application — tested end-to-end via HTTP against a running server**
- **Auth**: student / faculty / staff login, registration + validation, suspended-account block, unauthenticated → `/login?next=…`, logout
- **Role gating**: student hitting `/moderation` or `/audit` → **403**; faculty-only `/academic/materials/new` enforced
- **Student flow**: dashboard → profile → academic identity → program / course pages → timetable → all group pages
- **Faculty flow**: faculty dashboard → course group announcement (official flag correctly gated on designation) → **study-material upload** (creates `Study_Material` + `File` + notifies course group)
- **Auto-allocation**: new registration lands in All-Students + program / department / school / batch / course / class groups with visible reasons
- **Feed**: post create/edit/delete, comment (author notified), react (toggle + `UNIQUE` enforced), story create, expired story hidden, report post
- **Messaging**: start DM (reuses existing pair conversation), send in DM thread and in a group thread, recipients notified
- **Communities**: create, join, add event (members notified); **Clubs**: create with a Custom category, join; **Events**: upcoming/past lists, detail
- **Projects**: create (auto Core Team as LEAD), add team, ask-to-co-work → `PENDING` + owner notified, owner approve → `ACTIVE`, project search
- **Requests**: raise, filterable browse, owner status update, non-owner "offer to help" → requester notified + auto `IN_PROGRESS`
- **File vault**: register metadata, list with human sizes, remove
- **Moderation (staff)**: queue + status filter, report detail, `OPEN → RESOLVED` stamps `Resolved_At` + notifies reporter
- **Audit viewer (staff)**: filter by action / entity, pagination; confirmed rows for every new action type (`CREATE Study_Material`, `MESSAGE Conversation`, `APPROVE Project_Membership`, `RESPOND Request`, `MODERATE Report`, `CREATE File`, …)
- **Search**: all 9 entity types return and link to real pages
- 404 for unknown routes, 204 for `/favicon.ico`, no 500s in the server log

---

## Project layout

```
server.js                     app entry, middleware, route mounting, auto-seed
src/
  db/
    index.js                  node:sqlite wrapper: get / all / run / tx / initSchema
    schema.sql                SQLite DDL (DA1 + tagged extensions)  ← used at runtime
    schema.mysql.sql          finalized MySQL DDL + tagged extensions (reference)
    seed.js                   deterministic demo data
  lib/
    util.js                   time formatting, sanitising, LIKE-escaping
    roles.js                  loadUser() → user + profile + student/faculty + derived role
    groups.js                 auto-allocation: eligible groups, sync, membership reasons
    engagement.js             derived leaderboard score
    queries.js                shared read queries (feed, stories, my-groups, timetable)
    audit.js / notify.js      Audit_Log and Notification helpers
  middleware/auth.js          flash, attachUser, requireAuth, requireRole, requireActive
  routes/                     auth, dashboard, profile, academic, feed, groups,
                              notifications, search, messages, communities, clubs,
                              events, projects, requests, files, moderation
  scripts/                    init-db, seed, reset-db  (npm run targets)
views/                        EJS templates (partials/ + one folder per module)
public/css/style.css          single stylesheet
public/js/app.js              progressive-enhancement helpers
```

---

## Known limitations

- **File "uploads" are metadata only** — `File.Storage_Path` / `Study_Material.File_URL`
  are recorded (the schema has no BLOB column and the brief says not to expose
  storage paths), no bytes are written to disk. The vault and the study-material
  library work fully on the metadata.
- **Request responses have no dedicated table** in DA1, so "offer to help / join a
  carpool" is modelled as a notification to the requester plus an automatic
  `Status → IN_PROGRESS` move, rather than a threaded response list. A follow-up
  conversation happens over Messages.
- **Conversation membership for group chat** is seeded/added lazily — a group member
  who has never opened the discussion is added to `Conversation_Participant` the
  first time they post.
- **Sessions use the default in-memory store** (fine for a single-process demo;
  a persistent store would be needed for production / multiple workers).
- **Moderation actions** update the `Report` row and notify the reporter; they do
  not auto-hide or delete the reported content (a moderator still deletes a post
  manually from the feed).
- `node:sqlite` prints one `ExperimentalWarning` on some Node versions; the npm
  scripts pass `--disable-warning=ExperimentalWarning` to suppress it.
- `npm run reset-db` can hit `EPERM` because the DB file is inside a OneDrive-synced
  folder; use `npm run seed`, which does a full transactional wipe + reload.
