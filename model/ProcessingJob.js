// models/ProcessingJob.js
const mongoose = require('mongoose');

const processingJobSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeedPost',
    required:false,
    index: true,
  },
  filePath: { type: String, required: true },
  originalUrl: { type: String, required: true },
  optimizedUrl: { type: String, default: null },
  thumbnailUrl: { type: String, default: null },
  mediaIndex:{type:Number},
  type: {
    type: String,
    enum: ['video_optimize', 'thumbnail_generate', 'image_optimize'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'stuck'],
    default: 'pending',
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  errorMessage: String,
  startedAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now, expires: '7d' }, // Auto-delete after 7 days
});

// Index for the worker to find pending jobs
processingJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('ProcessingJob', processingJobSchema);