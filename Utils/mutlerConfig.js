const multer = require('multer');

// Store files in memory (so we can stream to Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
});

module.exports = {upload};