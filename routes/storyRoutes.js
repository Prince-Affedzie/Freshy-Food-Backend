// routes/storyRoutes.js
const express = require('express');
const storyRoutes = express.Router();
const { auth } = require('../middleware/auth');
const { storyUpload } = require('../Utils/mutlerConfig');
const {
  createStory,
  getActiveStories,
  getVendorStories,
  getMyStories,
  getStoryStats,
  viewStory,
  reactToStory,
  deleteStory,
} = require('../controllers/storyController');

// ─── Public story routes (auth required) ──────────────────────────────────

// Get active stories from followed vendors (for stories bar)
storyRoutes.get('/stories/active', auth, getActiveStories);

// Get stories by specific vendor (only if following)
storyRoutes.get('/stories/vendor/:vendorId', auth, getVendorStories);

// Create story (with media upload - image via multer, video via Bunny Stream)
storyRoutes.post('/stories', auth, storyUpload.single('media'), createStory);

// Record story view
storyRoutes.post('/stories/:storyId/view', auth, viewStory);

// React to story
storyRoutes.post('/stories/:storyId/react', auth, reactToStory);

// Delete story (author only)
storyRoutes.delete('/stories/:storyId', auth, deleteStory);

// Get my own stories with stats (for vendor dashboard)
storyRoutes.get('/stories/mine', auth, getMyStories);

// Get detailed stats for a specific story
storyRoutes.get('/stories/:storyId/stats', auth, getStoryStats);

module.exports = storyRoutes;