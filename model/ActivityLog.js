// models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // Who performed the action
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // null for guest/unauthenticated actions
  },
  userType: {
    type: String,
    enum: ['customer', 'vendor', 'admin', 'guest', 'system'],
    default: 'guest',
  },
  userName: {
    type: String,
    trim: true,
  },
  userPhone: {
    type: String,
    trim: true,
  },
  userEmail: {
    type: String,
    trim: true,
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      // Auth activities
      'user_registered', 'user_logged_in', 'user_logged_out',
      'vendor_registered', 'vendor_logged_in', 'vendor_logged_out',
      'otp_sent', 'otp_verified', 'password_reset_requested', 'password_changed',
      
      // Product activities
      'product_viewed', 'product_created', 'product_updated', 'product_deleted',
      'product_image_uploaded', 'product_image_deleted',
      'product_searched', 'product_filtered',
      
      // Cart activities
      'cart_item_added', 'cart_item_removed', 'cart_item_updated',
      'cart_viewed', 'cart_cleared',
      
      // Order activities
      'order_created', 'order_updated', 'order_cancelled',
      'order_status_changed', 'order_viewed',
      'guest_order_placed',
      
      // Chat activities
      'chat_started', 'message_sent', 'message_received',
      'chat_viewed', 'conversation_deleted',
      
      // AI activities
      'ai_search_performed', 'ai_product_details_generated',
      'ai_recommendation_viewed',
      
      // Profile activities
      'profile_viewed', 'profile_updated', 'profile_image_updated',
      'store_created', 'store_updated',
      
      // Favorite/Save activities
      'product_saved', 'product_unsaved', 'favorites_viewed',
      
      // Share activities
      'product_shared',
      
      // Browse activities
      'page_viewed', 'category_browsed', 'campus_filtered',
      
      // Review activities
      'review_submitted', 'review_updated', 'review_deleted',
      
      // Payment activities
      'payment_initiated', 'payment_completed', 'payment_failed',
      
      // Error activities
      'error_occurred', 'api_error',
      
      // Admin activities
      'user_verified', 'product_approved', 'product_rejected',
      'vendor_verified',
      
      // Other
      'app_opened', 'notification_opened', 'deep_link_clicked',
      'download_clicked', 'external_link_clicked',
    ],
  },

  // What was the target of the action
  target: {
    type: {
      type: String,
      enum: ['product', 'order', 'user', 'vendor', 'chat', 'cart', 'review', 'payment', 'category', 'campus', 'image', 'other'],
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    name: String, // Human-readable name of the target
  },

  // Where did the action happen
  source: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web', 'api', 'system'],
      default: 'web',
    },
    page: String, // e.g., '/product/123', '/listings', '/vendor/dashboard'
    screen: String, // e.g., 'HomeScreen', 'ProductDetailScreen'
    ip: String,
    userAgent: String,
    deviceInfo: String,
  },

  // Additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Performance metrics
  duration: {
    type: Number, // in milliseconds
    default: null,
  },

  // Status
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success',
  },
  errorMessage: String,

  // Session tracking
  sessionId: {
    type: String,
    
  },

  // Location data (if available)
  location: {
    campus: String,
    area: String,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ 'target.type': 1, 'target.id': 1 });
activityLogSchema.index({ sessionId: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userType: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);