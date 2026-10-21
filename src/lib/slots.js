'use strict';
/**
 * Slot chart -> weekly meetings.
 *
 * A class has a slot code such as "D2+TD2" (theory) or "L7+L8" (lab). The
 * slot chart says which day and time each slot token falls on, so a class's
 * timetable rows can be generated from its slot code.
 *
 * The grids below are transcribed from the Fall 2026-27 slot chart supplied by
 * the user (theory periods and lab periods have different clock times).
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// null = lunch break column
const THEORY_TIMES = [
  ['08:00', '08:50'], ['08:55', '09:45'], ['09:50', '10:40'], ['10:45', '11:35'],
  ['11:40', '12:30'], ['12:35', '13:25'], null,
  ['14:00', '14:50'], ['14:55', '15:45'], ['15:50', '16:40'], ['16:45', '17:35'],
  ['17:40', '18:30'], ['18:35', '19:25'],
];
const LAB_TIMES = [
  ['08:00', '08:50'], ['08:50', '09:40'], ['09:50', '10:40'], ['10:40', '11:30'],
  ['11:40', '12:30'], ['12:30', '13:20'], null,
  ['14:00', '14:50'], ['14:50', '15:40'], ['15:50', '16:40'], ['16:40', '17:30'],
  ['17:40', '18:30'], ['18:30', '19:20'],
];

// theory slots per day: 6 morning periods, then 6 afternoon periods ('-' = none)
const THEORY = {
  Monday:    'A1 F1 D1 TB1 TG1 S11   A2 F2 D2 TB2 TG2 S3',
  Tuesday:   'B1 G1 E1 TC1 TAA1 -    B2 G2 E2 TC2 TAA2 S1',
  Wednesday: 'C1 A1 F1 TD1 TBB1 -    C2 A2 F2 TD2 TBB2 S4',
  Thursday:  'D1 B1 G1 TE1 TCC1 -    D2 B2 G2 TE2 TCC2 S2',
  Friday:    'E1 C1 TA1 TF1 TDD1 S15 E2 C2 TA2 TF2 TDD2 -',
  Saturday:  'X11 X12 Y11 Y12 S8 S8  X21 Z21 Y21 W21 W22 Z22',
  Sunday:    'Y11 Y12 X11 X12 S10 S10 Y21 Z21 X21 W21 W22 Z22',
};
const LAB = {
  Monday:    'L1 L2 L3 L4 L5 L6       L31 L32 L33 L34 L35 L36',
  Tuesday:   'L7 L8 L9 L10 L11 L12    L37 L38 L39 L40 L41 L42',
  Wednesday: 'L13 L14 L15 L16 L17 L18 L43 L44 L45 L46 L47 L48',
  Thursday:  'L19 L20 L21 L22 L23 L24 L49 L50 L51 L52 L53 L54',
  Friday:    'L25 L26 L27 L28 L29 L30 L55 L56 L57 L58 L59 L60',
  Saturday:  'L71 L72 L73 L74 L75 L76 L77 L78 L79 L80 L81 L82',
  Sunday:    'L83 L84 L85 L86 L87 L88 L89 L90 L91 L92 L93 L94',
};

/** token -> [{day, start, end, lab}] */
const TOKEN_MEETINGS = {};
function addGrid(grid, times, lab) {
  for (const day of DAYS) {
    const cells = grid[day].trim().split(/\s+/); // 12 cells: 6 + 6 (lunch column is skipped)
    const periodTimes = times.filter(Boolean);
    cells.forEach((tok, i) => {
      if (tok === '-') return;
      (TOKEN_MEETINGS[tok] = TOKEN_MEETINGS[tok] || []).push({
        day, start: periodTimes[i][0], end: periodTimes[i][1], lab,
      });
    });
  }
}
addGrid(THEORY, THEORY_TIMES, false);
addGrid(LAB, LAB_TIMES, true);

const toMin = (t) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);

/**
 * "D2+TD2" -> [{day:'Monday', start:'15:50', end:'16:40'}, ...] sorted by day/time.
 * Back-to-back lab periods (e.g. L7+L8) are merged into one block.
 */
function meetingsFor(slotCode) {
  const out = [];
  for (const tok of String(slotCode || '').split('+')) {
    for (const m of TOKEN_MEETINGS[tok.trim()] || []) out.push({ ...m });
  }
  out.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || toMin(a.start) - toMin(b.start));
  const merged = [];
  for (const m of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.lab && m.lab && prev.day === m.day && toMin(m.start) - toMin(prev.end) <= 10) {
      prev.end = m.end;
    } else {
      merged.push(m);
    }
  }
  return merged.map(({ day, start, end }) => ({ day, start, end }));
}

/** Do two lists of meetings overlap in time on any day? */
function overlaps(a, b) {
  return a.some((x) => b.some((y) =>
    x.day === y.day && toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end)));
}

const isLabSlot = (slotCode) => String(slotCode || '').split('+')[0].trim().startsWith('L');

const SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
/** "Mon 15:50 · Wed 16:45 · Thu 14:00" */
function describe(meetings) {
  return meetings.map((m) => `${SHORT[m.day]} ${m.start}`).join(' · ');
}

module.exports = { DAYS, meetingsFor, overlaps, isLabSlot, describe };
