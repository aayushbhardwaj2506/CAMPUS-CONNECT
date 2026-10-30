'use strict';
/**
 * 30 sample student accounts (fictional names) with complete profiles: programme,
 * registration number, bio, club / community / project memberships, auto-allocated
 * groups, a slot-based class registration and a feed post. They give the campus
 * network enough people for the graph queries in DA3.
 *
 * Safe to run on an existing database: accounts that already exist are skipped, so
 * it never touches other data.
 *   - npm run seed          runs it at the end of the seed
 *   - npm run seed:samples  adds them to the current database
 * Login: <first>.<last>@campus.edu / campus123
 */
const { get, all, run, tx } = require('../db');
const { nowIso, isoPlusHours } = require('./util');
const { loadUser } = require('./roles');
const { syncMembershipsForUser } = require('./groups');
const { allotRandomly, rng } = require('./registration');

// bcrypt hash of 'campus123' (same one the seed uses)
const HASH = '$2a$10$pAo90si5O7n2qgwejrv7UeJ/IFCxNt782jxwyFcpw1vxnWAkUcina';

const PEOPLE = [
  ['Aditya', 'M'], ['Bhavna', 'F'], ['Chirag', 'M'], ['Deepa', 'F'], ['Eshan', 'M'],
  ['Farah', 'F'], ['Gautam', 'M'], ['Harini', 'F'], ['Ishaan', 'M'], ['Jaya', 'F'],
  ['Karthik', 'M'], ['Lavanya', 'F'], ['Mohit', 'M'], ['Nisha', 'F'], ['Omkar', 'M'],
  ['Pooja', 'F'], ['Qadir', 'M'], ['Riya', 'F'], ['Sanjay', 'M'], ['Tanvi', 'F'],
  ['Uday', 'M'], ['Varsha', 'F'], ['Wasim', 'M'], ['Yamini', 'F'], ['Zubin', 'M'],
  ['Arjun', 'M'], ['Brinda', 'F'], ['Chetan', 'M'], ['Divya', 'F'], ['Eklavya', 'M'],
];
const LAST = ['Menon', 'Gupta', 'Pillai', 'Joshi', 'Nair', 'Das', 'Kulkarni', 'Rao', 'Singh', 'Iyer'];
const INTERESTS = ['databases and backend', 'machine learning', 'web development', 'cybersecurity and CTFs',
  'competitive programming', 'IoT and embedded systems', 'open source', 'UI/UX and design',
  'cloud and DevOps', 'data analytics'];
const POSTS = [
  'Anyone up for a study group before CAT-2? Library, 8 pm.',
  'Finally understood joins after drawing them on paper. Highly recommend.',
  'Looking for teammates for the next hackathon. Frontend or backend, both welcome.',
  'The AB1 canteen queue at 1 pm is a lab in itself.',
  'Just pushed my first open-source pull request. Small fix, big smile.',
  'Which slot are you all in for Database Systems? Trying to find classmates.',
  'Morning walk with Dawn Walkers was worth waking up for.',
  'Sharing my OS notes in the course group tonight.',
  'Does anyone have a good resource for indexing and B+ trees?',
  'Weekend plan: finish the DA, then sleep.',
];

const insert = (table, obj) => {
  const cols = Object.keys(obj);
  return run(
    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map((c) => obj[c])
  ).lastInsertRowid;
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickN(r, arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
const two = (n) => String(n).padStart(2, '0');

/** Create the sample students that do not exist yet. Returns { added, skipped }. */
function addSampleStudents() {
  const r = rng(2026);
  const rand = rng(2026); // class registration
  const programs = all(`SELECT Program_ID id, Program_Code code, Program_Name name FROM Program WHERE Program_Code IN ('BTECH-CSE','BTECH-CSE-AIML','BTECH-CSE-CY')`);
  const cse = programs.find((p) => p.code === 'BTECH-CSE') || programs[0];
  const progPool = programs.length ? [cse, cse, cse, ...programs.filter((p) => p !== cse)] : []; // mostly core CSE
  const clubs = all('SELECT Club_ID id, Category cat, Club_Name name FROM Club');
  const techClubs = clubs.filter((c) => c.cat === 'Technical');
  const otherClubs = clubs.filter((c) => c.cat !== 'Technical');
  const comms = all('SELECT Community_ID id FROM Community').map((c) => c.id);
  const teams = all('SELECT Project_Team_ID id FROM Project_Team').map((t) => t.id);
  if (!progPool.length) return { added: 0, skipped: 0, note: 'no programmes found; run the seed first' };

  const usedReg = new Set(all('SELECT Registration_Number n FROM Student').map((s) => s.n));
  let added = 0, skipped = 0;

  PEOPLE.forEach(([first, gender], i) => {
    // every random choice is drawn even for skipped people, so results do not depend on what exists
    const last = pick(r, LAST);
    const prog = pick(r, progPool);
    const sem = pick(r, [3, 5, 7]);
    const myClubs = pickN(r, techClubs, 1 + Math.floor(r() * 2));
    if (r() < 0.4 && otherClubs.length) myClubs.push(pick(r, otherClubs));
    const myComms = pickN(r, comms, 1 + Math.floor(r() * 2));
    const team = r() < 0.35 && teams.length ? pick(r, teams) : null;
    const interest = pick(r, INTERESTS);
    const writesPost = r() < 0.55;
    const postText = pick(r, POSTS);
    const postHours = 3 + Math.floor(r() * 200);
    const dobMonth = 1 + Math.floor(r() * 12), dobDay = 1 + Math.floor(r() * 28);
    const phone = '+91-98' + String(Math.floor(r() * 1e8)).padStart(8, '0');

    const name = `${first} ${last}`;
    const email = `${first}.${last}`.toLowerCase() + '@campus.edu';
    if (get('SELECT 1 AS x FROM "User" WHERE lower(Email) = ?', [email])) { skipped++; return; }

    const batch = 2026 - (sem - 1) / 2; // sem 3 -> 2025, 5 -> 2024, 7 -> 2023
    let n = 3001 + i, reg;
    do { reg = `${String(batch).slice(2)}BCE${n++}`; } while (usedReg.has(reg));
    usedReg.add(reg);
    const clubNames = myClubs.map((c) => c.name);

    const userId = tx(() => {
      const uid = insert('User', {
        Full_Name: name, Email: email, Password_Hash: HASH, Phone_Number: phone,
        Account_Status: 'ACTIVE', Created_At: nowIso(),
      });
      insert('Profile', {
        User_ID: uid, Profile_Image: null, Date_Of_Birth: `${batch - 18}-${two(dobMonth)}-${two(dobDay)}`,
        Gender: gender === 'F' ? 'Female' : 'Male',
        Bio: `SCOPE · ${prog.code === 'BTECH-CSE' ? 'B.Tech CSE' : prog.name}, Sem ${sem}. Into ${interest}.` +
          (clubNames.length ? ` Member of ${clubNames[0]}.` : ''),
      });
      insert('Student', {
        User_ID: uid, Program_ID: prog.id, Registration_Number: reg,
        Admission_Year: batch, Current_Semester: sem,
      });
      for (const c of myClubs) {
        insert('Club_Membership', { Club_ID: c.id, User_ID: uid, Membership_Role: 'MEMBER', Joined_At: nowIso(), Membership_Status: 'ACTIVE' });
      }
      for (const c of myComms) {
        insert('Community_Membership', { Community_ID: c, User_ID: uid, Membership_Role: 'MEMBER', Joined_At: nowIso(), Membership_Status: 'ACTIVE' });
      }
      if (team) {
        insert('Project_Membership', { Project_Team_ID: team, User_ID: uid, Team_Role: 'MEMBER', Joined_At: nowIso(), Membership_Status: 'ACTIVE' });
      }
      if (writesPost) {
        const t = isoPlusHours(-postHours);
        insert('Post', { User_ID: uid, Title: null, Content: postText, Visibility: 'CAMPUS', Created_At: t, Updated_At: t });
      }
      // school / department / programme / batch / semester-course groups
      syncMembershipsForUser(loadUser(uid));
      // slot -> course -> faculty registration, as the registration page would give them
      allotRandomly(uid, rand);
      return uid;
    });
    if (userId) added++;
  });
  return { added, skipped };
}

module.exports = { addSampleStudents };
