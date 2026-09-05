// models/VendorStory.js
const mongoose = require('mongoose');

const vendorStorySchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Single media item (photo or video)
  media: {
    url: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['image', 'video'], 
      required: true 
    },
    thumbnailUrl: { type: String, default: null }, // For video thumbnails
    duration: { type: Number, default: null }, // For videos (seconds)
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    uploadSource: {
      type: String,
      enum: ['supabase', 'bunny'],
      required: true,
    },
    bunnyVideoId: { type: String, default: null }, // For Bunny Stream videos
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'ready',
    },
  },
  caption: { 
    type: String, 
    maxlength: 200,
    default: '',
  },
  sticker: {
    type: String,
    enum: ['new-arrival', 'flash-sale', 'restock', 'limited-time', 'back-in-stock', null],
    default: null,
  },
  linkedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  },
  views: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now },
  }],
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    createdAt: { type: Date, default: Date.now },
  }],
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true,
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for view count
vendorStorySchema.virtual('viewCount').get(function() {
  return this.views?.length || 0;
});

// Virtual for reaction count
vendorStorySchema.virtual('reactionCount').get(function() {
  return this.reactions?.length || 0;
});

// Index for efficient querying
vendorStorySchema.index({ status: 'active', expiresAt: 1 });
vendorStorySchema.index({ vendor: 1, status: 'active' });
vendorStorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VendorStory', vendorStorySchema);