// models/FeedPost.js
const mongoose = require("mongoose")
const feedPostSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  type: {
    type: String,
    enum: ['product_reel', 'service_reel', 'lifestyle', 'campus_event', 'achievement', 'campus_hack', 'funny_moment'],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
 media: [{
  url: { type: String, default: null },
  type: { 
    type: String, 
    enum: ['image', 'video', 'pending', 'error'],
    default: 'pending'
  },
  thumbnailUrl: { type: String, default: null },
  status: {
    type: String,
    enum: ['processing', 'ready', 'failed'],
    default: 'processing'
  },
  bunnyVideoId: { type: String, default: null },  // Bunny GUID
  uploadSource: { 
    type: String, 
    enum: ['supabase', 'bunny'], 
    default: 'supabase' 
  },
}],

mediaStatus: { type: String, enum: ['ready', 'processing', 'failed'], default: 'ready' },
  // For product/service reels - link to actual product
  linkedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  
  tags: [String],
  campus: {
    type: String,
    enum: ['UG', 'KNUST', 'UCC', 'UPSA', 'GIMPA', 'ASHESI', 'UEW', 'ATU', 'ALL'],
    default: 'ALL'
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  commentCount: { type: Number, default: 0 },
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  saves: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  views: { type: Number, default: 0 },
  isTrending: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

// Indexes for feed performance
feedPostSchema.index({ campus: 1, createdAt: -1 });
feedPostSchema.index({ type: 1, campus: 1 });
feedPostSchema.index({ isTrending: -1, createdAt: -1 });
feedPostSchema.index({ tags: 1 });
feedPostSchema.index({ vendorId: 1 });

module.exports = mongoose.model("FeedPost",feedPostSchema)