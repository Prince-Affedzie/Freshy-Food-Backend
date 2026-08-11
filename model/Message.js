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

    // ── Reply-to (WhatsApp-style quoting) ─────────────────────────────────
    // Reference to the message this one is replying to. Kept alongside a
    // denormalized snapshot (replyPreview) rather than relying solely on
    // populate() — the quoted preview needs to keep rendering correctly
    // even if the original message is later deleted/flagged, exactly like
    // WhatsApp still shows "This message was deleted" style quotes.
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    replyPreview: {
      text: { type: String, default: null }, // truncated snapshot, or a label like "💰 Offer · GH₵200" for non-text
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      type: { type: String, default: null }, // the ORIGINAL message's type — lets the client render a distinct quote style (photo/offer/system) the way WhatsApp does
    },

    // Null until the recipient opens the conversation.
    // Set by the server when the other party fetches or views messages.
    readAt: {
      type: Date,
      default: null,
    },
    isFlagged: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
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

// ── Reply preview builder ───────────────────────────────────────────────────

const REPLY_PREVIEW_MAX_LEN = 120;

// Builds the denormalized snapshot stored on the replying message. Kept as
// a plain function (not a schema method) since it operates on the ORIGINAL
// message being quoted, not the message being created.
const buildReplyPreview = (original) => {
  if (original.type === 'offer_link') {
    return {
      text: `💰 Offer · GH₵${original.offerMeta?.offerPrice ?? '—'}`,
      senderId: original.sender,
      type: original.type,
    };
  }

  if (original.type === 'system') {
    return {
      text: original.text || 'System message',
      senderId: null,
      type: original.type,
    };
  }

  const raw = original.text || '';
  return {
    text: raw.length > REPLY_PREVIEW_MAX_LEN ? `${raw.slice(0, REPLY_PREVIEW_MAX_LEN)}…` : raw,
    senderId: original.sender,
    type: original.type,
  };
};

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
  replyTo = null,
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

  // Resolve the reply snapshot, if replying. Validated against the SAME
  // conversation so a client can't quote a message from a thread it isn't
  // even part of.
  let replyPreview = null;
  let resolvedReplyTo = null;

  if (replyTo) {
    const original = await this.findById(replyTo);
    if (!original) {
      throw new Error('The message you are replying to no longer exists');
    }
    if (original.conversation.toString() !== conversationId.toString()) {
      throw new Error('Cannot reply to a message from a different conversation');
    }
    resolvedReplyTo = original._id;
    replyPreview = buildReplyPreview(original);
  }

  // Create the message
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    text,
    type,
    offerMeta,
    replyTo: resolvedReplyTo,
    replyPreview,
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