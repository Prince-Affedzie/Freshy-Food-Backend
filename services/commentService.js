// services/commentService.js
const Comment = require('../model/Comment');
const FeedPost = require('../model/FeedPost');
const mongoose = require('mongoose');

// ─── Create a comment (top-level or reply) ────────────────────────────────
const createComment = async ({ postId, authorId, text, parentCommentId = null, media = null }) => {
  const post = await FeedPost.findById(postId);
  if (!post || post.status !== 'approved') {
    const err = new Error('Post not found');
    err.statusCode = 404;
    throw err;
  }

  let rootCommentId = null;
  if (parentCommentId) {
    const parentComment = await Comment.findById(parentCommentId);
    if (!parentComment || parentComment.isDeleted) {
      const err = new Error('Parent comment not found');
      err.statusCode = 404;
      throw err;
    }
    // Ensure parent belongs to same post
    if (parentComment.post.toString() !== postId) {
      const err = new Error('Invalid parent comment');
      err.statusCode = 400;
      throw err;
    }
    rootCommentId = parentComment.rootComment || parentComment._id;
    
    // Increment reply count on parent
    await Comment.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });
  }

  const comment = await Comment.create({
    post: postId,
    author: authorId,
    parentComment: parentCommentId,
    rootComment: rootCommentId,
    text,
    media: media || undefined,
  });

  // Increment post comment count
  await FeedPost.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

  await comment.populate('author', 'firstName lastName profileImage');
  
  return comment;
};

// ─── Get comments for a post (with replies) ────────────────────────────────
const getComments = async ({ postId, page = 1, limit = 20, sort = 'newest' }) => {
console.log("postId",postId)
  const sortOption = sort === 'oldest' 
    ? { createdAt: 1 } 
    : sort === 'top' 
      ? { likeCount: -1, createdAt: -1 } 
      : { createdAt: -1 };


  const comments = await Comment.find({
    post: postId,
    parentComment: null, // Only top-level comments
    status: 'visible',
    isDeleted: false,
  })
    .sort(sortOption)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('author', 'firstName lastName profileImage')
    .populate({
      path: 'replies',
      match: { status: 'visible', isDeleted: false },
      populate: { path: 'author', select: 'firstName lastName profileImage' },
    })
    .lean();

  const total = await Comment.countDocuments({
    post: postId,
    parentComment: null,
    status: 'visible',
    isDeleted: false,
  });

  return {
    comments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── Get replies for a specific comment ────────────────────────────────────
const getReplies = async ({ commentId, page = 1, limit = 10 }) => {
  const replies = await Comment.find({
    parentComment: commentId,
    status: 'visible',
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('author', 'firstName lastName profileImage')
    .lean();

  const total = await Comment.countDocuments({
    parentComment: commentId,
    status: 'visible',
    isDeleted: false,
  });

  return {
    replies,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── Like/Unlike a comment ─────────────────────────────────────────────────
const toggleCommentLike = async ({ commentId, userId }) => {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.isDeleted) {
    const err = new Error('Comment not found');
    err.statusCode = 404;
    throw err;
  }

  const hasLiked = comment.likes.includes(userId);
  const update = hasLiked
    ? { $pull: { likes: userId }, $inc: { likeCount: -1 } }
    : { $addToSet: { likes: userId }, $inc: { likeCount: 1 } };

  await Comment.findByIdAndUpdate(commentId, update);
  
  return { isLiked: !hasLiked, likeCount: Math.max(0, comment.likeCount + (hasLiked ? -1 : 1)) };
};

// ─── Update a comment (only author) ────────────────────────────────────────
const updateComment = async ({ commentId, userId, text }) => {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.isDeleted) {
    const err = new Error('Comment not found');
    err.statusCode = 404;
    throw err;
  }

  if (comment.author.toString() !== userId) {
    const err = new Error('You can only edit your own comments');
    err.statusCode = 403;
    throw err;
  }

  comment.text = text;
  comment.isEdited = true;
  comment.editedAt = new Date();
  await comment.save();

  return comment;
};

// ─── Delete a comment (author or moderator) ────────────────────────────────
const deleteComment = async ({ commentId, userId, isModerator = false }) => {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.isDeleted) {
    const err = new Error('Comment not found');
    err.statusCode = 404;
    throw err;
  }

  if (!isModerator && comment.author.toString() !== userId) {
    const err = new Error('You can only delete your own comments');
    err.statusCode = 403;
    throw err;
  }

  // Soft delete
  comment.isDeleted = true;
  comment.deletedAt = new Date();
  comment.deletedBy = userId;
  comment.status = 'deleted';
  await comment.save();

  // Decrement post comment count
  await FeedPost.findByIdAndUpdate(comment.post, { $inc: { commentCount: -1 } });

  // If this was a reply, decrement parent reply count
  if (comment.parentComment) {
    await Comment.findByIdAndUpdate(comment.parentComment, { $inc: { replyCount: -1 } });
  }

  return { success: true };
};

// ─── Report a comment ──────────────────────────────────────────────────────
const reportComment = async ({ commentId, reporterId, reason, description }) => {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.isDeleted) {
    const err = new Error('Comment not found');
    err.statusCode = 404;
    throw err;
  }

  if (comment.author.toString() === reporterId) {
    const err = new Error("You can't report your own comment");
    err.statusCode = 400;
    throw err;
  }

  // Use the moderation service
  const moderationService = require('./moderation');
  return moderationService.submitReport({
    reporterId,
    contentType: 'Comment',
    contentId: commentId,
    reason,
    description,
  });
};

module.exports = {
  createComment,
  getComments,
  getReplies,
  toggleCommentLike,
  updateComment,
  deleteComment,
  reportComment,
};