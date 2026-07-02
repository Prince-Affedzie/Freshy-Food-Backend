const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // The visible text body. Required for type 'text', optional for 'offer_link' and 'system'
    // since those render from metadata instead.
    text: {
      type: String,
      maxlength: [500, 'Message cannot exceed 500 characters'],
      trim: true,
    },

    // Controls how the client renders the message bubble:
    //   text       — a regular chat message typed by the user
    //   offer_link — auto-generated when an offer is made/countered/accepted/declined.
    //                Renders as a tappable card linking into the offer flow.
    //   system     — platform-generated notices (e.g. "This listing has been sold").
    //                Renders centred and greyed out, no sender avatar.
    type: {
      type: String,
      enum: ['text', 'offer_link', 'system'],
      default: 'text',
    },

    // Populated only when type === 'offer_link'.
    // Gives the client everything it needs to render the offer card inline
    // without a separate API call.
    offerMeta: {
      offerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer',
      },
      // Snapshot of the offer state at the time this message was created.
      // Stored here so the card still makes sense even if the offer is later
      // accepted, declined, or the price changes.
      offerPrice: Number,
      offerStatus: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'expired'],
      },
      // Human-readable label: "made an offer", "countered with", "accepted", "declined"
      action: String,
    },

    // Null until the recipient opens the conversation.
    // Set by the server when the other party fetches or views messages.
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt is the canonical send time
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary query: load all messages in a thread, oldest first.
// Also used for pagination (cursor-based: messages older than a given createdAt).
messageSchema.index({ conversation: 1, createdAt: 1 });

// Fast lookup of unread messages for a user across all their conversations
// (used for a global unread badge, if you add one later).
messageSchema.index({ conversation: 1, readAt: 1 });

// ── Validation ────────────────────────────────────────────────────────────────

messageSchema.pre('validate', function (next) {
  // Plain text messages must have a body
  if (this.type === 'text' && (!this.text || this.text.trim().length === 0)) {
    return next(new Error('Text messages must have a non-empty body'));
  }

  // offer_link messages must carry offer metadata
  if (this.type === 'offer_link' && !this.offerMeta?.offerId) {
    return next(new Error('offer_link messages must include offerMeta.offerId'));
  }

  next();
});

// ── Statics ───────────────────────────────────────────────────────────────────

// Create a message and update the parent conversation's lastMessage pointer
// and the recipient's unread counter in a single operation.
// Always use this instead of Message.create() directly.
messageSchema.statics.createAndUpdateConversation = async function ({
  conversationId,
  senderId,
  text,
  type = 'text',
  offerMeta = null,
}) {
  const Conversation = mongoose.model('Conversation');

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new Error('Conversation not found');
  if (conversation.status === 'archived') {
    throw new Error('This conversation has been archived and no longer accepts messages');
  }

  // Determine which unread counter to increment (the recipient's, not the sender's)
  const isBuyer = conversation.buyer.toString() === senderId.toString();
  const isSeller = conversation.seller.toString() === senderId.toString();

  if (!isBuyer && !isSeller) {
    throw new Error('Sender is not a participant in this conversation');
  }

  const unreadField = isBuyer ? 'sellerUnread' : 'buyerUnread';

  // Create the message
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    text,
    type,
    offerMeta,
  });

  // Update the conversation atomically:
  // point lastMessage at the new message and bump the recipient's unread counter
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: message._id,
    $inc: { [unreadField]: 1 },
    updatedAt: new Date(), // force updatedAt refresh for inbox sort ordering
  });

  return message;
};

// Load a paginated page of messages for a thread, newest-first (for infinite scroll).
// `before` is an optional ISO timestamp — returns messages older than that cursor.
messageSchema.statics.getForConversation = async function (conversationId, { before, limit = 30 } = {}) {
  const query = { conversation: conversationId };
  if (before) query.createdAt = { $lt: new Date(before) };

  const messages = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name avatar');

  // Return in ascending order so the client can append to the top
  return messages.reverse();
};

// Mark all messages in a conversation as read for a given recipient.
// Called when a user opens a thread.
messageSchema.statics.markAllReadFor = async function (conversationId, userId) {
  return this.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: userId },  // only mark messages you received, not ones you sent
      readAt: null,
    },
    { $set: { readAt: new Date() } }
  );
};

module.exports = mongoose.model('Message', messageSchema);