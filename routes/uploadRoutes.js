// routes/uploadRoutes.js
const uploadRouter = require('express').Router();
const { auth } = require('../middleware/auth');
const { getSignedUploadUrl, confirmUpload } = require('../controllers/uploadController');
const { initVideoUpload } = require('../controllers/videoUploadController');

uploadRouter.post('/upload/signed-url', auth, getSignedUploadUrl);
uploadRouter.post('/upload/confirm', auth, confirmUpload);
uploadRouter.post('/upload/init-video', auth, initVideoUpload);

module.exports = uploadRouter;