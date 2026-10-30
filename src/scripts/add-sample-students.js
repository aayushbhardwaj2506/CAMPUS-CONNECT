'use strict';
// Adds the 30 sample student accounts to the current database (skips any that exist).
const { addSampleStudents } = require('../lib/sample-students');
const r = addSampleStudents();
console.log(r.note || `Sample students: ${r.added} added, ${r.skipped} already existed.`);
console.log('Login: <first>.<last>@campus.edu / campus123   e.g. aditya.<surname>@campus.edu');
