// models/Comment.js
const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  // The parent feed post this comment belongs to
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeedPost',
    required: true,
    index: true,
  },
  
  // The author of this comment
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // For replies - points to parent comment (null for top-level comments)
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  },
  
  // For replies - points to the top-level ancestor (useful for threading)
  rootComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  },
  
  text: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true,
  },
  
  // Optional media attachment (image)
  media: {
    url: { type: String, default: null },
    type: { type: String, enum: ['image'], default: 'image' },
  },
  
  // Mentions of other users
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  
  // Engagement
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likeCount: { type: Number, default: 0 },
  
  // Reply count for quick display
  replyCount: { type: Number, default: 0 },
  
  // Moderation
  status: {
    type: String,
    enum: ['visible', 'hidden', 'under_review', 'deleted'],
    default: 'visible',
    index: true,
  },
  isFlagged: { type: Boolean, default: false },
  flagCount: { type: Number, default: 0 },
  
  // Deletion (soft delete)
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  
  // Editing
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ post: 1, parentComment: 1, createdAt: -1 });
commentSchema.index({ post: 1, rootComment: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ status: 1, post: 1 });

// Virtual for reply preview (for UI)
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment',
  options: { sort: { createdAt: 1 }, limit: 3 },
});

module.exports = mongoose.model("Comment", commentSchema);