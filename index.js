const functions = require('firebase-functions');
const app = require('./server');

// Expose the Express app as a single Firebase Cloud Function named "api"
exports.api = functions.https.onRequest(app);
