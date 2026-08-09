// routes/feedRoutes.js
const express = require('express');
const feedRoutes = express.Router();
const { auth } = require('../middleware/auth');
const { adminAuth } = require('../middleware/auth'); // If you have a separate admin middleware
const { feedUpload } = require('../Utils/mutlerConfig');
const {
  createFeedPost,
  getFeed,
  getTrendingPosts,
  getPostDetail,
  getSavedPosts,
  toggleLike,
  toggleSave,
  addComment,
  incrementView,
  deleteFeedPost,
  moderatePost,
  getMyFeedPosts,
  updateMyFeedPost,
} = require('../controllers/feedController');

// ─── Public/Feed routes (auth required) ───────────────────────────────────
feedRoutes.get('/feed', getFeed);
feedRoutes.get('/feed/trending', auth, getTrendingPosts);
feedRoutes.get('/feed/saved', auth, getSavedPosts);
feedRoutes.get('/feed/:id', auth, getPostDetail);

// ─── Create post (with media upload) ──────────────────────────────────────
feedRoutes.post('/create_feed', auth, feedUpload.array('media', 5), createFeedPost);
feedRoutes.get('/me/feed/my-posts', auth, getMyFeedPosts);
feedRoutes.put('/feed/:id', auth, feedUpload.array('media', 5), updateMyFeedPost);

// ─── Interactions ─────────────────────────────────────────────────────────
feedRoutes.post('/feed/:id/like', auth, toggleLike);
feedRoutes.post('/feed/:id/save', auth, toggleSave);
feedRoutes.post('/feed/:id/comment', auth, addComment);
feedRoutes.post('/feed/:id/view', auth, incrementView);


// ─── Delete (author or admin) ─────────────────────────────────────────────
feedRoutes.delete('/feed/:id', auth, deleteFeedPost);

// ─── Admin moderation ─────────────────────────────────────────────────────
feedRoutes.patch('/feed/:id/moderate', auth, adminAuth, moderatePost);

module.exports = feedRoutes;