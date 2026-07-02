const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Cached ref to the most recent message — used for inbox previews
    // so we never have to aggregate across the Message collection just to render a list
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // Separate unread counters per role.
    // Increment when a message is sent, reset to 0 when that party opens the thread.
    buyerUnread: {
      type: Number,
      default: 0,
      min: 0,
    },
    sellerUnread: {
      type: Number,
      default: 0,
      min: 0,
    },

    // archived = soft-deleted from inbox (e.g. after product is sold).
    // Neither party can send new messages in an archived conversation.
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Core uniqueness guarantee: one conversation per buyer–seller–product trio.
// A buyer can message multiple sellers about the same product,
// and a seller can receive messages from multiple buyers about the same product —
// but the same pair can only ever have one thread per product.
conversationSchema.index(
  { product: 1, buyer: 1, seller: 1 },
  { unique: true }
);

// Fast inbox queries: "all conversations this user is part of, newest first"
conversationSchema.index({ buyer: 1, updatedAt: -1 });
conversationSchema.index({ seller: 1, updatedAt: -1 });

// ── Statics ───────────────────────────────────────────────────────────────────

// Find or create a conversation between a buyer and seller about a product.
// This is the only safe way to open a new thread — prevents race-condition duplicates.
conversationSchema.statics.findOrCreate = async function ({ productId, buyerId, sellerId }) {
  // Prevent a seller from opening a conversation with themselves
  if (buyerId.toString() === sellerId.toString()) {
    throw new Error('Buyer and seller cannot be the same user');
  }

  const existing = await this.findOne({
    product: productId,
    buyer: buyerId,
    seller: sellerId,
  });

  if (existing) return { conversation: existing, created: false };

  const conversation = await this.create({
    product: productId,
    buyer: buyerId,
    seller: sellerId,
  });

  return { conversation, created: true };
};

// ── Methods ───────────────────────────────────────────────────────────────────

// Determine the unread count and which counter field to reset
// based on who is currently viewing the conversation.
conversationSchema.methods.getUnreadFieldForUser = function (userId) {
  if (this.buyer.toString() === userId.toString()) return 'buyerUnread';
  if (this.seller.toString() === userId.toString()) return 'sellerUnread';
  return null; // user is not a participant
};

// Mark the conversation as read for a given user (resets their counter to 0)
conversationSchema.methods.markReadFor = async function (userId) {
  const field = this.getUnreadFieldForUser(userId);
  if (!field) throw new Error('User is not a participant in this conversation');
  this[field] = 0;
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);