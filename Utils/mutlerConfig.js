// Utils/mutlerConfig.js
const multer = require('multer');

// Store files in memory (so we can stream to Supabase)
const storage = multer.memoryStorage();

// ─── File filter ────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
  const allAllowed = [...allowedImageTypes, ...allowedVideoTypes];

  if (allAllowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

// ─── Image-only filter ─────────────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// ─── Generic upload (10MB - for products) ──────────────────────────────────
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFilter,
});

// ─── Feed upload (60MB - allows images + videos) ───────────────────────────
const feedUpload = multer({
  storage,
  limits: {
    fileSize: 60 * 1024 * 1024,  // 60MB max per file
    files: 5,                     // Max 5 files
  },
  fileFilter,
});

// ─── Single image upload (5MB) ─────────────────────────────────────────────
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
});

module.exports = { upload, feedUpload, imageUpload };