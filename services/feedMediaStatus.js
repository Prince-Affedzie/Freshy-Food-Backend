// services/feedMediaStatus.js

const FeedPost = require('../model/FeedPost');

/**
 * After any media status change, recompute whether the whole post
 * has all media ready. This is used by the frontend to know when
 * to show all media vs. some still processing.
 */
const recomputePostMediaStatus = async (postId) => {
  const post = await FeedPost.findById(postId);
  if (!post) return;

  const allReady = post.media.every(m => m.status === 'ready');
  const hasFailed = post.media.some(m => m.status === 'failed');

  if (hasFailed && post.media.every(m => m.status === 'failed')) {
    // All media failed — mark the whole post
    post.mediaStatus = 'failed';
  } else if (allReady) {
    post.mediaStatus = 'ready';
  } else if (post.media.some(m => m.status === 'ready')) {
    post.mediaStatus = 'partial';
  } else {
    post.mediaStatus = 'processing';
  }

  await post.save();
  return post;
};

module.exports = { recomputePostMediaStatus };