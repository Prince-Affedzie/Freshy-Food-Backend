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
  addComment, // Legacy comment creation (kept for backward compatibility)
  incrementView,
  deleteFeedPost,
  moderatePost,
  getMyFeedPosts,
  updateMyFeedPost,
  // New comment functions
  getComments,
  getReplies,
  toggleCommentLike,
  updateComment,
  deleteComment,
  reportComment,
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
feedRoutes.post('/feed/:id/view', auth, incrementView);

// ─── Comments (NEW - using separate Comment model) ────────────────────────
// Get comments for a post
feedRoutes.get('/feed/:id/comments', auth, getComments);

// Create a comment on a post (top-level or reply)
feedRoutes.post('/feed/:id/comments', auth, addComment);

// Get replies for a specific comment
feedRoutes.get('/comments/:commentId/replies', auth, getReplies);

// Like/Unlike a comment
feedRoutes.post('/comments/:commentId/like', auth, toggleCommentLike);

// Update a comment (only author)
feedRoutes.put('/comments/:commentId', auth, updateComment);

// Delete a comment (author or moderator)
feedRoutes.delete('/comments/:commentId', auth, deleteComment);

// Report a comment
feedRoutes.post('/comments/:commentId/report', auth, reportComment);

// ─── Legacy comment route (backward compatibility) ────────────────────────
// TODO: Remove this once frontend is fully migrated to new comment endpoints
feedRoutes.post('/feed/:id/comment', auth, addComment);

// ─── Delete (author or admin) ─────────────────────────────────────────────
feedRoutes.delete('/feed/:id', auth, deleteFeedPost);

// ─── Admin moderation ─────────────────────────────────────────────────────
feedRoutes.patch('/feed/:id/moderate', auth, adminAuth, moderatePost);

module.exports = feedRoutes;