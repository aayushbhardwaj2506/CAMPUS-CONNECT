'use strict';
const express = require('express');
const router = express.Router();

// Public "About Campus Connect" page — works signed-in or signed-out.
router.get('/', (req, res) => {
  res.render('about', { title: 'About Campus Connect', bare: true });
});

module.exports = router;
