'use strict';
const { initSchema, DB_PATH } = require('../db');
initSchema();
console.log('Schema ensured at', DB_PATH);
