'use strict';
const { seed } = require('../db/seed');
const counts = seed();
console.log('Seed complete. Row counts:');
for (const [t, n] of Object.entries(counts)) {
  console.log('  ' + t.padEnd(22) + n);
}
console.log('\nDemo login:  aarav@campus.edu  /  campus123   (student)');
console.log('             suresh.rao@campus.edu / campus123  (faculty / HOD)');
console.log('             admin@campus.edu / campus123        (staff / moderation)');
